"use client";
import { useEffect, useState } from "react";
import { GraduationCap, ChevronLeft, ChevronRight, X, MessageCircleQuestion } from "lucide-react";

// Tuntun — guided wizard + tutorial. Kirana narrates each step (TTS, chosen voice).
// "Tanya Kirana" asks the live brain to explain a step in her own words.
const STEPS = [
  { t: "Selamat datang", d: "Saya Kirana, asisten pribadi Anda. Semua berjalan di server Anda sendiri — privat." },
  { t: "Bicara dengan saya", d: "Klik ikon mikrofon lalu bicara. Saya dengar dan jawab dengan suara. Lima jari di kamera juga mengaktifkan dengar." },
  { t: "Kendali tangan", d: "Aktifkan Kendali tangan: 1 jari menggerakkan kursor, 2 jari klik, 3 jari menggulir, 5 jari mendengar, 10 jari kembali ke beranda." },
  { t: "Akses cepat", d: "Tombol Email, Kalender, Tugas, dan lainnya. Klik — atau klik tanpa sentuh lewat gesture." },
  { t: "Sentimen publik", d: "Saya pantau suara publik: pujian, keluhan, kritik, saran — lalu jadikan laporan." },
  { t: "Khazanah", d: "Brankas pengetahuan privat Anda: catatan saling terhubung, jadi memori yang berpikir bersama Anda." },
  { t: "Suara & Wajah", d: "Atur atau rekam suara saya di panel Suara. Bentuk wajah saya dari kamera atau foto pilihan Anda." },
];

export function Tuntun() {
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);

  function speak(text: string) {
    if (!("speechSynthesis" in window)) return;
    const u = new SpeechSynthesisUtterance(text); u.lang = "id-ID";
    const name = (typeof window !== "undefined" && localStorage.getItem("migan_voice")) || "";
    const v = name ? window.speechSynthesis.getVoices().find((x) => x.name === name) : null;
    if (v) u.voice = v; window.speechSynthesis.cancel(); window.speechSynthesis.speak(u);
  }
  useEffect(() => { if (open) speak(`${STEPS[i].t}. ${STEPS[i].d}`); }, [open, i]);

  function close() { setOpen(false); window.speechSynthesis?.cancel(); }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    const onHome = () => close();
    window.addEventListener("keydown", onKey);
    window.addEventListener("balairung:home", onHome);
    window.addEventListener("balairung:close", onHome);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("balairung:home", onHome); window.removeEventListener("balairung:close", onHome); };
  }, []);

  return (
    <>
      <button onClick={() => { setI(0); setOpen(true); }}
        className="flex items-center gap-2 rounded-pill border border-[rgba(0,230,255,0.2)] px-3 py-2 text-[11px] tracking-wide text-[#9fc7cf] hover:border-glow hover:text-glow">
        <GraduationCap size={15} /> Tutorial
      </button>
      {open && (
        <div onClick={close} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(3,17,26,0.78)", display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(4px)" }}>
          <div onClick={(e) => e.stopPropagation()} className="pusaka mx-4 w-full max-w-md p-5">
            <div className="mb-3 flex items-center justify-between">
              <span className="pusaka-hd">Tutorial · {i + 1}/{STEPS.length}</span>
              <button onClick={close} aria-label="tutup" className="rounded-pill border border-[rgba(0,230,255,0.3)] p-1 text-[#9fc7cf] hover:text-glow"><X size={16} /></button>
            </div>
            <h3 className="font-display text-base text-glow glow-text">{STEPS[i].t}</h3>
            <p className="mt-2 text-sm leading-relaxed text-[#cfeef2]">{STEPS[i].d}</p>
            <div className="mt-4 flex items-center justify-between">
              <button onClick={() => setI(Math.max(0, i - 1))} disabled={i === 0} className="flex items-center gap-1 text-[12px] text-[#9fc7cf] disabled:opacity-30"><ChevronLeft size={14} /> Sebelumnya</button>
              <button onClick={() => window.dispatchEvent(new CustomEvent("balairung:ask", { detail: `Jelaskan fitur "${STEPS[i].t}" dengan ramah dan singkat.` }))}
                className="flex items-center gap-1 rounded-btn border border-[rgba(0,230,255,0.25)] px-2 py-1 text-[11px] text-glow"><MessageCircleQuestion size={13} /> Tanya Kirana</button>
              {i < STEPS.length - 1
                ? <button onClick={() => setI(i + 1)} className="flex items-center gap-1 text-[12px] text-glow">Lanjut <ChevronRight size={14} /></button>
                : <button onClick={close} className="text-[12px] text-glow">Selesai</button>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
