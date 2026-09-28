"use client";
import { useCallback, useEffect, useState } from "react";
import { CalendarClock, Check, Plus, Bell, Loader2 } from "lucide-react";
import { Pusaka } from "@/components/Pusaka";

// Pengeling — reminders/agenda panel (UI label "Pengingat"). Reads the live
// brain reminders (/api/reminders → MiganCore /v1/reminders) and polls so a
// reminder that the scheduler fires "rings" on screen without a refresh.
type Reminder = {
  id: string;
  title: string;
  notes: string | null;
  due_at: string;
  status: string; // pending | fired | done
  created_at: string;
  fired_at: string | null;
};

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("id-ID", {
      day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function Pengeling() {
  const [items, setItems] = useState<Reminder[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/reminders");
      const d = await r.json().catch(() => []);
      setItems(Array.isArray(d) ? d : []);
    } catch {
      setItems([]);
    }
  }, []);

  // Poll every 30s so fired reminders surface without a manual refresh.
  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  async function add() {
    if (!title.trim() || !due) return;
    setBusy(true);
    try {
      // datetime-local is local wall-time → convert to UTC ISO for the brain.
      const iso = new Date(due).toISOString();
      const r = await fetch("/api/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), due_at: iso }),
      });
      if (r.ok) {
        setTitle("");
        setDue("");
        setAdding(false);
        load();
      }
    } finally {
      setBusy(false);
    }
  }

  async function markDone(id: string) {
    setItems((cur) => cur?.filter((x) => x.id !== id) ?? cur); // optimistic
    try {
      await fetch("/api/reminders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
    } finally {
      load();
    }
  }

  const firedCount = items?.filter((r) => r.status === "fired").length ?? 0;

  return (
    <Pusaka title="Pengingat · hari ini" icon={<CalendarClock size={13} />} delay={0.25}>
      {firedCount > 0 && (
        <p className="mb-1.5 flex items-center gap-1 text-[10px] text-[#ffd27f]">
          <Bell size={11} className="animate-pulse" /> {firedCount} pengingat berbunyi
        </p>
      )}

      {items === null ? (
        <p className="text-[10px] text-[#577f86]">Memuat…</p>
      ) : items.length === 0 ? (
        <p className="text-[10px] text-[#577f86]">Belum ada pengingat.</p>
      ) : (
        <ul className="space-y-1">
          {items.map((r) => {
            const fired = r.status === "fired";
            return (
              <li key={r.id} className="flex items-center justify-between gap-2 text-[11px]">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${fired ? "animate-pulse bg-[#ffd27f]" : "bg-[#2f6f7f]"}`}
                  />
                  <span className="min-w-0">
                    <b className="font-medium text-[#dff4f7]">{r.title}</b>
                    <span className="block text-[9.5px] text-[#577f86]">{fmtTime(r.due_at)}</span>
                  </span>
                </span>
                <button
                  onClick={() => markDone(r.id)}
                  className="shrink-0 text-[#577f86] transition-colors hover:text-[#46f0c0]"
                  aria-label="Tandai selesai"
                >
                  <Check size={13} />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {adding ? (
        <div className="mt-2 space-y-1.5">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ingatkan saya…"
            className="w-full rounded-md border border-[#1d3b44] bg-[#0c1e26] px-2 py-1 text-[11px] text-[#dff4f7] outline-none placeholder:text-[#577f86] focus:border-[#2f6f7f]"
          />
          <input
            type="datetime-local"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            className="w-full rounded-md border border-[#1d3b44] bg-[#0c1e26] px-2 py-1 text-[11px] text-[#dff4f7] outline-none focus:border-[#2f6f7f]"
          />
          <div className="flex gap-1.5">
            <button
              onClick={add}
              disabled={busy || !title.trim() || !due}
              className="flex flex-1 items-center justify-center gap-1 rounded-md border border-[#2f6f7f] bg-[#0e2730] py-1 text-[10.5px] text-[#7fe9ff] transition-colors hover:bg-[#103441] disabled:opacity-50"
            >
              {busy ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />} Simpan
            </button>
            <button
              onClick={() => setAdding(false)}
              className="rounded-md border border-[#1d3b44] px-2 py-1 text-[10.5px] text-[#577f86] transition-colors hover:text-[#9fc7cf]"
            >
              Batal
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="mt-2 flex w-full items-center justify-center gap-1 rounded-md border border-[#1d3b44] bg-[#0c1e26] py-1 text-[10.5px] text-[#7fe9ff] transition-colors hover:border-[#2f6f7f]"
        >
          <Plus size={11} /> Tambah pengingat
        </button>
      )}
    </Pusaka>
  );
}
