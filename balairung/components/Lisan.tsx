"use client";
import { useEffect, useRef, useState } from "react";
import { Mic, Send, Paperclip, X, Square, Loader2, Check, AlertCircle } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { askMigan } from "@/lib/migancore";
import { agentVoice } from "@/lib/identity";
import { emitSpeakStart, emitSpeakPulse, emitSpeakEnd } from "@/lib/avatar/signals";

// Live "what Migan is doing" chips — friendly Indonesian labels for the brain's tools.
type ToolStep = { name: string; label: string; status: "running" | "done" | "error" };
const TOOL_LABELS: Record<string, string> = {
  onamix_search: "Mencari di web", onamix_get: "Membuka halaman", web_read: "Membaca halaman",
  check_urls: "Memeriksa tautan", research_deep: "Riset mendalam", generate_image: "Membuat gambar",
  generate_chart: "Membuat grafik", run_python: "Menjalankan kode", run_nodejs: "Menjalankan kode",
  data_analyze: "Menganalisis data", memory_write: "Mencatat ingatan", memory_search: "Mengingat",
  text_to_speech: "Menyuarakan", translate_text: "Menerjemahkan", read_pdf: "Membaca PDF",
  read_file: "Membaca berkas", write_file: "Menulis berkas", summarize_text: "Meringkas",
};
const toolLabel = (name: string) => TOOL_LABELS[name] ?? `Memakai ${name.replace(/_/g, " ")}`;

// Lisan — the tongue: text + voice (STT in / TTS out) + attachments + markdown output.
// Hears via Web Speech (Chrome). Speaks with the voice chosen in Suara.
// Reacts to gestures: balairung:listen (start hearing), balairung:stop (stop talking).
export function Lisan() {
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [steps, setSteps] = useState<ToolStep[]>([]);
  const busyRef = useRef(false);
  const recog = useRef<any>(null);
  const wantListen = useRef(false);
  const speechQ = useRef<string[]>([]);   // pending sentences to speak (streamed TTS)
  const speakingRef = useRef(false);       // is an utterance currently playing
  const lastMsgRef = useRef("");           // last user msg (for "buat opsi lain" regenerate)

  async function runAsk(text: string) {
    // Local commands first (no brain round-trip): close / stop.
    const low = text.toLowerCase();
    if (/\b(tutup|close|selesai)\b/.test(low) && /(tutorial|tuntun|panel|ini|overlay)/.test(low)) {
      window.dispatchEvent(new CustomEvent("balairung:home")); setQ(""); return;
    }
    if (/\b(berhenti|stop|diam|cukup)\b/.test(low)) {
      stopSpeaking(); window.dispatchEvent(new CustomEvent("balairung:stop")); setQ(""); return;
    }
    const att = files.length ? ` [lampiran: ${files.map((f) => f.name).join(", ")}]` : "";
    const full = (text + att).trim();
    if (!full || busyRef.current) return;
    busyRef.current = true; setBusy(true); setAnswer(""); setSteps([]); stopSpeaking(); lastMsgRef.current = full;
    let acc = "", spokenUpto = 0;
    for await (const c of askMigan(full)) {
      if (c.tool?.phase === "start") {
        setSteps((cur) => [...cur, ...(c.tool!.names ?? []).map((n) => ({ name: n, label: toolLabel(n), status: "running" as const }))]);
      } else if (c.tool?.phase === "result") {
        setSteps((cur) => {
          const i = cur.findIndex((s) => s.name === c.tool!.name && s.status === "running");
          if (i < 0) return cur;
          const next = [...cur];
          next[i] = { ...next[i], status: c.tool!.ok ? "done" : "error" };
          return next;
        });
      }
      if (c.delta) {
        acc += c.delta; setAnswer(acc);
        // Streaming TTS: speak each complete sentence the moment it lands, so the voice
        // starts at the first sentence (~2-3s) instead of waiting for the whole answer.
        let cut: number;
        while ((cut = leadingSentence(acc.slice(spokenUpto))) > 0) {
          enqueueSpeech(acc.slice(spokenUpto, spokenUpto + cut));
          spokenUpto += cut;
        }
      }
    }
    enqueueSpeech(acc.slice(spokenUpto)); // flush the trailing fragment (no terminator)
    busyRef.current = false; setBusy(false); setFiles([]);
  }
  const send = () => runAsk(q);

  // --- Text-to-speech (Migan's voice), STREAMED sentence-by-sentence ---
  // Length of the leading COMPLETE sentence in s (incl. its terminator), else 0.
  function leadingSentence(s: string): number {
    const m = s.match(/[.!?…]["')\]]?(\s|$)/);
    const nl = s.indexOf("\n");
    let end = m && m.index !== undefined ? m.index + m[0].length : -1;
    if (nl >= 0 && (end < 0 || nl + 1 < end)) end = nl + 1;
    return end < 0 ? 0 : end;
  }
  function cleanForSpeech(t: string): string {
    // #4a (Adit): jangan baca "Sumber: …"/URL keras-keras + bersihin markdown.
    return t
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")        // markdown link → teks
      .replace(/^\s*\**\s*sumber\s*:.*$/gim, "")        // buang baris "Sumber: …"
      .replace(/https?:\/\/\S+/g, "")                   // buang URL mentah
      .replace(/[#*`>_~|]/g, "")
      .trim();
  }
  function enqueueSpeech(text: string) {
    const t = cleanForSpeech(text);
    if (!t || !("speechSynthesis" in window)) return;
    speechQ.current.push(t);
    if (!speakingRef.current) speakNext();
  }
  function speakNext() {
    const next = speechQ.current.shift();
    if (!next) { speakingRef.current = false; emitSpeakEnd(); return; }
    const u = new SpeechSynthesisUtterance(next.slice(0, 400));
    u.lang = "id-ID";
    const name = agentVoice();
    const v = name ? window.speechSynthesis.getVoices().find((x) => x.name === name) : null;
    if (v) u.voice = v;
    speakingRef.current = true;
    // Lip-sync (A3.1): start/boundary/end drive the hologram mouth envelope.
    u.onstart = () => emitSpeakStart();
    u.onboundary = () => emitSpeakPulse();
    u.onend = () => { emitSpeakPulse(); speakNext(); };   // chain to next sentence
    u.onerror = () => { speakingRef.current = false; speakNext(); };
    window.speechSynthesis.speak(u);
  }
  function stopSpeaking() {
    speechQ.current = [];
    speakingRef.current = false;
    window.speechSynthesis?.cancel();
    emitSpeakEnd();
  }

  // --- Speech-to-text (hear the user) ---
  function ensureRecog() {
    if (recog.current) return recog.current;
    const SR = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    if (!SR) return null;
    const r = new SR();
    r.lang = "id-ID"; r.continuous = false; r.interimResults = true;
    r.onresult = (e: any) => {
      let t = ""; for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript;
      setQ(t);
      if (e.results[e.results.length - 1].isFinal) { stopListen(); runAsk(t); }
    };
    r.onerror = (e: any) => { console.warn("STT:", e.error); if (e.error === "not-allowed") alert("Izinkan akses mikrofon untuk bicara."); stopListen(); };
    r.onend = () => { if (wantListen.current) { try { r.start(); } catch {} } else setListening(false); };
    recog.current = r; return r;
  }
  function startListen() { const r = ensureRecog(); if (!r) { alert("Browser ini belum mendukung dengar suara (pakai Chrome)."); return; } wantListen.current = true; setListening(true); try { r.start(); } catch {} }
  function stopListen() { wantListen.current = false; setListening(false); try { recog.current?.stop(); } catch {} }
  const toggleListen = () => (listening ? stopListen() : startListen());

  useEffect(() => {
    const onAsk = (e: Event) => { const t = (e as CustomEvent).detail as string; setQ(t); runAsk(t); };
    const onListen = () => startListen();
    const onStop = () => { stopSpeaking(); stopListen(); };
    window.addEventListener("balairung:ask", onAsk as EventListener);
    window.addEventListener("balairung:listen", onListen);
    window.addEventListener("balairung:stop", onStop);
    return () => { window.removeEventListener("balairung:ask", onAsk as EventListener); window.removeEventListener("balairung:listen", onListen); window.removeEventListener("balairung:stop", onStop); };
  }, []);

  return (
    <div className="w-full">
      {steps.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5" aria-live="polite">
          {steps.map((s, i) => (
            <span
              key={i}
              className={`flex items-center gap-1.5 rounded-pill border px-2.5 py-1 text-[10px] ${
                s.status === "error"
                  ? "border-[rgba(255,120,120,0.3)] text-[#ff9b9b]"
                  : s.status === "done"
                    ? "border-[rgba(70,240,192,0.3)] text-[#46f0c0]"
                    : "border-[rgba(0,230,255,0.25)] text-[#7fe9ff]"
              }`}
            >
              {s.status === "running" ? (
                <Loader2 size={11} className="animate-spin" />
              ) : s.status === "done" ? (
                <Check size={11} />
              ) : (
                <AlertCircle size={11} />
              )}
              {s.label}
              {s.status === "running" ? "…" : ""}
            </span>
          ))}
        </div>
      )}
      {answer && (
        <div className={`pusaka mb-3 p-3 text-sm leading-relaxed text-[#cfeef2] [&_a]:text-glow [&_code]:text-glow [&_h1]:text-base [&_h2]:text-sm ${/!\[|<img/i.test(answer) ? "" : "max-h-64 overflow-auto"}`} aria-live="polite">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              // #4b: gambar hasil generate → card BESAR + Download/Simpan + "buat opsi lain"
              img: ({ src }: any) => (
                <span className="my-2 block">
                  <img src={src} alt="gambar" className="w-full max-h-[60vh] rounded-xl border border-[rgba(0,230,255,0.25)] object-contain" />
                  <span className="mt-2 flex flex-wrap gap-2 text-[11px]">
                    <a href={src} download target="_blank" rel="noreferrer" className="rounded-pill border border-[rgba(0,230,255,0.35)] px-3 py-1 text-glow">⬇ Download / Simpan</a>
                    <button type="button" onClick={() => lastMsgRef.current && runAsk(lastMsgRef.current)} className="rounded-pill border border-[rgba(0,230,255,0.35)] px-3 py-1 text-glow">↻ Buat opsi lain</button>
                  </span>
                </span>
              ),
            }}
          >{answer}</ReactMarkdown>
        </div>
      )}
      {files.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {files.map((f, i) => (
            <span key={i} className="flex items-center gap-1 rounded-pill border border-[rgba(0,230,255,0.25)] px-2 py-1 text-[10px] text-[#9fc7cf]">
              {f.name.slice(0, 24)} <button onClick={() => setFiles(files.filter((_, j) => j !== i))} aria-label="hapus"><X size={11} /></button>
            </span>
          ))}
        </div>
      )}
      <div className="pusaka flex items-center gap-3 rounded-pill px-4 py-3">
        <label className="cursor-pointer text-glow" aria-label="Lampirkan">
          <Paperclip size={17} />
          <input type="file" multiple accept="image/*,application/pdf,audio/*,video/*,.txt,.md,.csv,.docx,.xlsx" className="hidden"
            onChange={(e) => setFiles([...files, ...Array.from(e.target.files ?? [])])} />
        </label>
        <button onClick={toggleListen} aria-label="Bicara" className={listening ? "text-[#46f0c0] animate-pulse" : "text-glow"}>
          {listening ? <Square size={17} /> : <Mic size={17} />}
        </button>
        <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder={listening ? "Mendengarkan…" : "Apa yang bisa saya bantu hari ini?"}
          className="flex-1 bg-transparent text-sm text-[#cfeef2] placeholder:text-[#577f86] outline-none" />
        <button onClick={send} aria-label="Kirim" disabled={busy} className="text-glow disabled:opacity-40"><Send size={17} /></button>
      </div>
    </div>
  );
}
