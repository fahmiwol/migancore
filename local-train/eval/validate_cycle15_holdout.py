#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Validate cycle-15 held-out probes and scan train files for leakage.

This is intentionally dependency-free. It does not call any model and does not
judge quality. Its job is narrower and critical: keep the frozen cycle-15 eval
prompts out of SFT/RL/few-shot data before GPU spend.

Usage:
  python eval/validate_cycle15_holdout.py
  python eval/validate_cycle15_holdout.py --train training/cycle15_train.jsonl
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any


AXES = ("reasoning_math", "coding_artifact", "tool_hallucination")
JACCARD_THRESHOLD = 0.60


def norm(text: str) -> str:
    text = (text or "").strip().lower()
    text = re.sub(r"\s+", " ", text)
    return text


def tokens(text: str) -> set[str]:
    return set(re.findall(r"[\w']+", norm(text), flags=re.UNICODE))


def jaccard(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / max(1, len(a | b))


def load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def prompt_from_train_row(row: dict[str, Any]) -> str:
    if isinstance(row.get("prompt"), str):
        return row["prompt"]
    messages = row.get("messages")
    if isinstance(messages, list):
        for msg in messages:
            if isinstance(msg, dict) and msg.get("role") == "user":
                return str(msg.get("content") or "")
    if isinstance(row.get("user"), str):
        return row["user"]
    return ""


def iter_train_prompts(path: Path):
    if not path.exists():
        raise FileNotFoundError(path)
    if path.suffix.lower() == ".jsonl":
        with path.open("r", encoding="utf-8") as f:
            for line_no, line in enumerate(f, 1):
                if not line.strip():
                    continue
                row = json.loads(line)
                yield line_no, prompt_from_train_row(row)
        return

    data = load_json(path)
    rows = data if isinstance(data, list) else [data]
    for idx, row in enumerate(rows, 1):
        if isinstance(row, dict):
            yield idx, prompt_from_train_row(row)


def collect_probes(pack: dict[str, Any]) -> list[dict[str, Any]]:
    probes: list[dict[str, Any]] = []
    for axis in AXES:
        items = pack.get(axis)
        if not isinstance(items, list):
            raise ValueError(f"{axis} must be a list")
        for item in items:
            if not isinstance(item, dict):
                raise ValueError(f"{axis} contains a non-object item")
            item = dict(item)
            item["_axis"] = axis
            probes.append(item)
    return probes


def validate_pack(pack: dict[str, Any]) -> list[str]:
    failures: list[str] = []
    probes = collect_probes(pack)
    seen_ids: set[str] = set()
    seen_prompts: set[str] = set()

    for probe in probes:
        pid = str(probe.get("id") or "")
        prompt = str(probe.get("prompt") or "")
        axis = probe["_axis"]

        if not pid:
            failures.append(f"{axis}: missing id")
        elif pid in seen_ids:
            failures.append(f"{axis}: duplicate id {pid}")
        seen_ids.add(pid)

        nprompt = norm(prompt)
        if not nprompt:
            failures.append(f"{pid or axis}: empty prompt")
        elif nprompt in seen_prompts:
            failures.append(f"{pid}: duplicate prompt")
        seen_prompts.add(nprompt)

        if axis == "reasoning_math":
            checker = probe.get("checker")
            if checker not in {"digits_contains", "digits_contains_any", "contains_any", "regex"}:
                failures.append(f"{pid}: unsupported checker {checker!r}")
            if checker == "regex" and not probe.get("pattern"):
                failures.append(f"{pid}: regex checker needs pattern")
            if checker in {"digits_contains_any", "contains_any"} and not probe.get("must_include_any"):
                failures.append(f"{pid}: {checker} needs must_include_any")
            if checker == "digits_contains" and not probe.get("expected"):
                failures.append(f"{pid}: digits_contains needs expected")

        if axis == "coding_artifact":
            if not (probe.get("must_include_all") or probe.get("must_include_any")):
                failures.append(f"{pid}: coding probe needs include criteria")
            if not probe.get("must_not_include_any"):
                failures.append(f"{pid}: coding probe needs forbidden anti-promise terms")

        if axis == "tool_hallucination":
            policy = probe.get("expected_tool_policy")
            if not policy:
                failures.append(f"{pid}: missing expected_tool_policy")
            if "must_route" in str(policy) and not probe.get("required_tool"):
                failures.append(f"{pid}: must_route policy needs required_tool")
            if str(policy).startswith("no_tool") and not probe.get("forbidden_tools"):
                failures.append(f"{pid}: no_tool policy needs forbidden_tools")

    gc = pack.get("gold_corrections")
    if not isinstance(gc, dict) or not gc.get("source"):
        failures.append("gold_corrections.source is required")

    return failures


def scan_leakage(pack: dict[str, Any], train_paths: list[Path]) -> list[str]:
    probes = collect_probes(pack)
    held = []
    for probe in probes:
        prompt = norm(str(probe.get("prompt") or ""))
        held.append((str(probe.get("id")), prompt, tokens(prompt)))

    leaks: list[str] = []
    for path in train_paths:
        for line_no, prompt in iter_train_prompts(path):
            nprompt = norm(prompt)
            if not nprompt:
                continue
            ptoks = tokens(nprompt)
            for pid, hp, htoks in held:
                if nprompt == hp or nprompt in hp or hp in nprompt:
                    leaks.append(f"{path}:{line_no}: exact/substring leak vs {pid}")
                    continue
                score = jaccard(ptoks, htoks)
                if score >= JACCARD_THRESHOLD:
                    leaks.append(f"{path}:{line_no}: near-dup leak vs {pid} jaccard={score:.2f}")
    return leaks


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pack", default=str(Path(__file__).with_name("cycle15_heldout.json")))
    ap.add_argument("--train", action="append", default=[], help="JSON/JSONL candidate train file to scan")
    args = ap.parse_args()

    pack_path = Path(args.pack)
    pack = load_json(pack_path)
    failures = validate_pack(pack)
    if failures:
        print("CYCLE15 HOLDOUT INVALID")
        for failure in failures:
            print(f"  - {failure}")
        return 1

    train_paths = [Path(p) for p in args.train]
    leaks = scan_leakage(pack, train_paths) if train_paths else []
    if leaks:
        print("CYCLE15 HOLDOUT LEAKAGE FOUND")
        for leak in leaks[:100]:
            print(f"  - {leak}")
        if len(leaks) > 100:
            print(f"  ... {len(leaks) - 100} more")
        return 1

    counts = {axis: len(pack.get(axis, [])) for axis in AXES}
    total = sum(counts.values())
    print("CYCLE15 HOLDOUT OK")
    print(f"  pack: {pack_path}")
    print(f"  probes: {total} ({counts})")
    print(f"  train files scanned: {len(train_paths)}")
    print("  rule: keep these prompts and near-duplicates out of SFT/RL/few-shot targets")
    return 0


if __name__ == "__main__":
    sys.exit(main())
