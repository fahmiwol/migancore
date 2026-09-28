"use client";
import { useCallback, useEffect, useState } from "react";
import { Plug, Loader2, Check, Trash2, KeyRound } from "lucide-react";
import { Pusaka } from "@/components/Pusaka";

type Cred = { id: string; connector_type: string; label: string | null; status: string; created_at: string };

// Slice 1: API-key connectors. OAuth (Google Calendar/Gmail) = Slice 2.
const CONNECTORS = [
  { type: "serper", name: "Serper — pencarian web / berita" },
  { type: "tavily", name: "Tavily — pencarian" },
  { type: "openai", name: "OpenAI API" },
  { type: "custom", name: "Lainnya (API key)" },
];

// Koneksi — "Extensions" ala Claude: sambungkan akun/API key sendiri. Tersimpan
// TERENKRIPSI di brain (Amanah), per-user. Tools pakai kredensial ini (doc 21).
export function Koneksi() {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState("serper");
  const [secret, setSecret] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [creds, setCreds] = useState<Cred[] | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/credentials");
      const d = await r.json().catch(() => []);
      setCreds(Array.isArray(d) ? d : []);
    } catch {
      setCreds([]);
    }
  }, []);
  useEffect(() => {
    if (open) load();
  }, [open, load]);

  async function submit() {
    if (secret.trim().length < 3) {
      setMsg({ ok: false, text: "API key / secret terlalu pendek." });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connector_type: type, secret: secret.trim(), label: label.trim() || null }),
      });
      if (r.ok) {
        setMsg({ ok: true, text: "Koneksi tersimpan (terenkripsi)." });
        setSecret("");
        setLabel("");
        load();
      } else {
        const d = await r.json().catch(() => ({}));
        setMsg({ ok: false, text: d.detail || "Gagal menyimpan." });
      }
    } catch {
      setMsg({ ok: false, text: "Tidak bisa terhubung ke Migan." });
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setCreds((c) => c?.filter((x) => x.id !== id) ?? c); // optimistic
    try {
      await fetch(`/api/credentials?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    } finally {
      load();
    }
  }

  return (
    <>
      <Pusaka title="Koneksi" icon={<Plug size={13} />} delay={0.24}>
        <p className="text-[10.5px] leading-relaxed text-[#9fc7cf]">
          Sambungkan akun & API key (pencarian, dll). Tersimpan terenkripsi, privat — milikmu.
        </p>
        <button
          onClick={() => {
            setMsg(null);
            setOpen(true);
          }}
          className="mt-2 w-full rounded-md border border-[#1d3b44] bg-[#0c1e26] py-1.5 text-[10.5px] text-[#7fe9ff] transition-colors hover:border-[#2f6f7f]"
        >
          + Atur koneksi
        </button>
      </Pusaka>

      {open && (
        <div
          className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => !busy && setOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-xl border border-[#1d3b44] bg-[#08141a] p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-medium text-[#dff4f7]">
                <Plug size={15} className="text-[#46f0c0]" /> Koneksi & Kredensial
              </h2>
              <button onClick={() => !busy && setOpen(false)} className="text-[#577f86] transition-colors hover:text-[#9fc7cf]" aria-label="Tutup">
                ✕
              </button>
            </div>

            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="mb-2 w-full rounded-md border border-[#1d3b44] bg-[#0c1e26] px-3 py-2 text-[12px] text-[#dff4f7] outline-none focus:border-[#2f6f7f]"
            >
              {CONNECTORS.map((c) => (
                <option key={c.type} value={c.type}>
                  {c.name}
                </option>
              ))}
            </select>
            <input
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              type="password"
              placeholder="API key / secret"
              className="mb-2 w-full rounded-md border border-[#1d3b44] bg-[#0c1e26] px-3 py-2 text-[12px] text-[#dff4f7] outline-none placeholder:text-[#577f86] focus:border-[#2f6f7f]"
            />
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Label (opsional, mis. 'Serper kantor')"
              className="w-full rounded-md border border-[#1d3b44] bg-[#0c1e26] px-3 py-2 text-[12px] text-[#dff4f7] outline-none placeholder:text-[#577f86] focus:border-[#2f6f7f]"
            />

            <div className="mt-3 flex items-center justify-between">
              <span className="text-[10px] text-[#577f86]">🔒 Disimpan terenkripsi, nggak pernah ditampilkan lagi.</span>
              <button
                onClick={submit}
                disabled={busy}
                className="flex items-center gap-1.5 rounded-md border border-[#2f6f7f] bg-[#0e2730] px-4 py-2 text-[11.5px] font-medium text-[#7fe9ff] transition-colors hover:bg-[#103441] disabled:opacity-50"
              >
                {busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Simpan
              </button>
            </div>

            {msg && <p className={`mt-3 text-[11px] ${msg.ok ? "text-[#46f0c0]" : "text-[#ff9b9b]"}`}>{msg.text}</p>}

            <div className="mt-4 border-t border-[#13262e] pt-3">
              <p className="mb-1.5 text-[10px] uppercase tracking-wide text-[#577f86]">Tersambung</p>
              {creds === null ? (
                <p className="text-[11px] text-[#577f86]">Memuat…</p>
              ) : creds.length === 0 ? (
                <p className="text-[11px] text-[#577f86]">Belum ada koneksi.</p>
              ) : (
                <ul className="max-h-32 space-y-1 overflow-y-auto pr-1">
                  {creds.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-2 rounded-md bg-[#0c1e26] px-2.5 py-1.5">
                      <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-[#cfeaf0]">
                        <KeyRound size={12} className="shrink-0 text-[#46f0c0]" />
                        <span className="truncate">{c.label || c.connector_type}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="text-[9.5px] text-[#577f86]">{c.connector_type}</span>
                        <button onClick={() => remove(c.id)} className="text-[#577f86] transition-colors hover:text-[#ff9b9b]" aria-label="Hapus koneksi">
                          <Trash2 size={12} />
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
