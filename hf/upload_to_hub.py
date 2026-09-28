"""Upload the MiganCore Hugging Face artifacts as the account that owns them (Tiranyx).

The token comes from the local `hf auth login` cache and is never printed or written anywhere.
Run from the repository root after `node site/build.mjs` and `node tools/build-hf.mjs`:

    python hf/upload_to_hub.py            # dataset, Space, model 0.14, collection
    python hf/upload_to_hub.py --legacy   # also replace the cards of the earlier public repos

Paths to the model weights are machine-specific. Set MIGANCORE_GGUF and MIGANCORE_ADAPTERS to point at them.
"""
import hashlib
import os
import sys

from huggingface_hub import CommitOperationAdd, HfApi

OWNER = "Tiranyx"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GGUF = os.environ.get("MIGANCORE_GGUF", "")
GGUF_SHA256 = "bae4f84ed377192fd3d1fa61a5e057590c9c20ea98c0eea5bf257f2bec9e0163"
ADAPTERS = os.environ.get("MIGANCORE_ADAPTERS", "")
LEGACY = ["migancore-7b-soul-v0.1", "migancore-7b-soul-v0.1-gguf", "migancore-7b-soul-v0.2",
          "migancore-7b-soul-v0.7", "migancore-7b-soul-v0.7b", "migancore-7b-soul-v0.7c",
          "migancore-7b-soul-v0.7e", "sidix-lora", "sidix-dora-persona-v1"]

api = HfApi()
who = api.whoami().get("name")
if who != OWNER:
    sys.exit(f"Logged in as {who!r}, not {OWNER!r}. Run `hf auth login` with the {OWNER} account first.")


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(8 << 20), b""):
            h.update(block)
    return h.hexdigest()


# 1. Research record dataset
ds = f"{OWNER}/migancore-research-record"
api.create_repo(ds, repo_type="dataset", exist_ok=True)
api.upload_folder(repo_id=ds, repo_type="dataset", folder_path=os.path.join(ROOT, "hf", "dataset"),
                  commit_message="MiganCore research record (open release)")
print("dataset:", ds)

# 2. Static Space with the explorer
sp = f"{OWNER}/migancore-explorer"
api.create_repo(sp, repo_type="space", space_sdk="static", exist_ok=True)
api.upload_folder(repo_id=sp, repo_type="space", folder_path=os.path.join(ROOT, "hf", "space"),
                  commit_message="MiganCore explorer (static)")
print("space:", sp)

# 3. Model 0.14 (weights verified against the digest the served model was pinned to)
if not (GGUF and ADAPTERS):
    sys.exit("Set MIGANCORE_GGUF and MIGANCORE_ADAPTERS to upload the model.")
if sha256(GGUF) != GGUF_SHA256:
    sys.exit("GGUF digest does not match the served model; refusing to upload.")
md = f"{OWNER}/migancore-0.14"
api.create_repo(md, repo_type="model", exist_ok=True)
ops = [
    CommitOperationAdd("README.md", os.path.join(ROOT, "hf", "model-cards", "migancore-0.14.md")),
    CommitOperationAdd("Modelfile", os.path.join(ROOT, "hf", "model-repos", "migancore-0.14", "Modelfile")),
    CommitOperationAdd("kemas_merge14.py", os.path.join(ROOT, "flywheel", "vast", "kemas_merge14.py")),
    CommitOperationAdd("adapters/lora-hitung-promptragam.tgz", os.path.join(ADAPTERS, "lora-hitung-promptragam.tgz")),
    CommitOperationAdd("adapters/lora-gaya.tgz", os.path.join(ADAPTERS, "lora-gaya.tgz")),
    CommitOperationAdd("migancore-0.14-q4_k_m.gguf", GGUF),
]
api.create_commit(md, operations=ops, commit_message="MiganCore 0.14 (archived research model)")
print("model:", md)

# 4. Earlier public repos: replace their cards (only with --legacy)
if "--legacy" in sys.argv:
    for name in LEGACY:
        api.upload_file(path_or_fileobj=os.path.join(ROOT, "hf", "model-cards", "legacy", f"{name}.md"),
                        path_in_repo="README.md", repo_id=f"{OWNER}/{name}",
                        commit_message="Model card: data provenance and archive status")
        print("card:", name)

# 5. Collection
col = api.create_collection(title="MiganCore: open-source Indonesian LLM research (2026)", namespace=OWNER,
                            description="Model, research record and explorer of MiganCore, an open-source Indonesian LLM project on hallucination and abstention. Closed Sep 2026.",
                            exists_ok=True)
for item, kind in [(md, "model"), (ds, "dataset"), (sp, "space")]:
    api.add_collection_item(col.slug, item_id=item, item_type=kind, exists_ok=True)
print("collection:", col.slug)
