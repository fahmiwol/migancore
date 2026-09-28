"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { BookOpen, Upload, Loader2, Check, Trash2, FileText } from "lucide-react";
import { Pusaka } from "@/components/Pusaka";

type Doc = { source: string; chunks: number };

// pdf.js (ESM) loaded from CDN so PDFs work with NO server dep — the text is
// extracted IN the browser (privacy: only the extracted text is sent, not the
// binary). webpackIgnore keeps it out of the app bundle (same pattern as depth).
const PDFJS = "4.7.76";
async function extractPdfText(file: File): Promise<string> {
  const lib = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS}/build/pdf.min.mjs`;
  const worker = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS}/build/pdf.worker.min.mjs`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfjs: any = await import(/* webpackIgnore: true */ lib);
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  let out = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    out += tc.items.map((it: any) => ("str" in it ? it.str : "")).join(" ") + "\n\n";
  }
  return out.trim();
}

// Pengetahuan — "teach Migan from your documents". Posts to the brain's RAG
// (/api/knowledge → /v1/memory/knowledge) so future chats answer from it, and
// lists/forgets per-agent documents (the agent's private vault). Plain Indonesian.
export function Pengetahuan() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [source, setSource] = useState("");
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadDocs = useCallback(async () => {
    try {
      const r = await fetch("/api/knowledge");
      const d = await r.json().catch(() => ({}));
      setDocs(r.ok && Array.isArray(d.documents) ? d.documents : []);
    } catch {
      setDocs([]);
    }
  }, []);

  useEffect(() => {
    if (open) loadDocs();
  }, [open, loadDocs]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!source) setSource(f.name.replace(/\.[^.]+$/, ""));
    setMsg(null);
    const isPdf = f.type === "application/pdf" || /\.pdf$/i.test(f.name);
    try {
      setReading(true);
      const t = isPdf ? await extractPdfText(f) : await f.text();
      if (!t.trim()) {
        setMsg({ ok: false, text: "Berkas kosong / tak terbaca (PDF hasil scan perlu OCR)." });
        return;
      }
      setText((prev) => (prev ? prev + "\n\n" : "") + t);
    } catch {
      setMsg({ ok: false, text: "Gagal membaca berkas. Coba tempel teksnya langsung." });
    } finally {
      setReading(false);
    }
  }

  async function submit() {
    if (text.trim().length < 20) {
      setMsg({ ok: false, text: "Teks terlalu pendek (min 20 karakter)." });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, source: source.trim() || "dokumen" }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.ok) {
        setMsg({ ok: true, text: `Tersimpan ${d.chunks_indexed} bagian. Migan sekarang tahu ini.` });
        setText("");
        setSource("");
        loadDocs();
      } else {
        setMsg({ ok: false, text: d.detail || d.error || "Gagal menyimpan." });
      }
    } catch {
      setMsg({ ok: false, text: "Tidak bisa terhubung ke Migan." });
    } finally {
      setBusy(false);
    }
  }

  async function forget(src: string) {
    setDocs((cur) => cur?.filter((d) => d.source !== src) ?? cur); // optimistic
    try {
      await fetch(`/api/knowledge?source=${encodeURIComponent(src)}`, { method: "DELETE" });
    } finally {
      loadDocs();
    }
  }

  return (
    <>
      <Pusaka title="Pengetahuan" icon={<BookOpen size={13} />} delay={0.22}>
        <p className="text-[10.5px] leading-relaxed text-[#9fc7cf]">
          Ajari Migan dari dokumen atau catatanmu — biar dia tahu hal-hal kamu.
        </p>
        <button
          onClick={() => { setMsg(null); setOpen(true); }}
          className="mt-2 w-full rounded-md border border-[#1d3b44] bg-[#0c1e26] py-1.5 text-[10.5px] text-[#7fe9ff] transition-colors hover:border-[#2f6f7f]"
        >
          + Tambah pengetahuan
        </button>
      </Pusaka>

      {open && (
        <div
          className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => !busy && !reading && setOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-xl border border-[#1d3b44] bg-[#08141a] p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-medium text-[#dff4f7]">
                <BookOpen size={15} className="text-[#46f0c0]" /> Tambah ke pengetahuan Migan
              </h2>
              <button
                onClick={() => !busy && !reading && setOpen(false)}
                className="text-[#577f86] transition-colors hover:text-[#9fc7cf]"
                aria-label="Tutup"
              >
                ✕
              </button>
            </div>

            <input
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="Judul / sumber (mis. 'Profil perusahaan')"
              className="mb-2 w-full rounded-md border border-[#1d3b44] bg-[#0c1e26] px-3 py-2 text-[12px] text-[#dff4f7] outline-none placeholder:text-[#577f86] focus:border-[#2f6f7f]"
            />
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={7}
              placeholder="Tempel teks di sini, atau unggah berkas .txt / .md / .pdf…"
              className="w-full resize-none rounded-md border border-[#1d3b44] bg-[#0c1e26] px-3 py-2 text-[12px] leading-relaxed text-[#dff4f7] outline-none placeholder:text-[#577f86] focus:border-[#2f6f7f]"
            />

            <div className="mt-3 flex items-center gap-2">
              <input
                ref={fileRef}
                type="file"
                accept=".txt,.md,.markdown,.pdf,text/plain,text/markdown,application/pdf"
                onChange={onFile}
                className="hidden"
              />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={reading}
                className="flex items-center gap-1.5 rounded-md border border-[#1d3b44] bg-[#0c1e26] px-3 py-2 text-[11px] text-[#9fc7cf] transition-colors hover:border-[#2f6f7f] disabled:opacity-50"
              >
                {reading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                {reading ? "Membaca…" : "Unggah berkas"}
              </button>
              <div className="flex-1" />
              <span className="text-[10px] text-[#577f86]">{text.length.toLocaleString("id-ID")} karakter</span>
              <button
                onClick={submit}
                disabled={busy || reading}
                className="flex items-center gap-1.5 rounded-md border border-[#2f6f7f] bg-[#0e2730] px-4 py-2 text-[11.5px] font-medium text-[#7fe9ff] transition-colors hover:bg-[#103441] disabled:opacity-50"
              >
                {busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Simpan ke ingatan
              </button>
            </div>

            {msg && (
              <p className={`mt-3 text-[11px] ${msg.ok ? "text-[#46f0c0]" : "text-[#ff9b9b]"}`}>{msg.text}</p>
            )}

            {/* per-agent vault: what Migan already knows */}
            <div className="mt-4 border-t border-[#13262e] pt-3">
              <p className="mb-1.5 text-[10px] uppercase tracking-wide text-[#577f86]">Yang Migan tahu</p>
              {docs === null ? (
                <p className="text-[11px] text-[#577f86]">Memuat…</p>
              ) : docs.length === 0 ? (
                <p className="text-[11px] text-[#577f86]">Belum ada. Tambahkan dokumen pertamamu.</p>
              ) : (
                <ul className="max-h-32 space-y-1 overflow-y-auto pr-1">
                  {docs.map((d) => (
                    <li
                      key={d.source}
                      className="flex items-center justify-between gap-2 rounded-md bg-[#0c1e26] px-2.5 py-1.5"
                    >
                      <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-[#cfeaf0]">
                        <FileText size={12} className="shrink-0 text-[#46f0c0]" />
                        <span className="truncate">{d.source}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="text-[9.5px] text-[#577f86]">{d.chunks} bagian</span>
                        <button
                          onClick={() => forget(d.source)}
                          className="text-[#577f86] transition-colors hover:text-[#ff9b9b]"
                          aria-label={`Lupakan ${d.source}`}
                        >
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
