"use client";
import { useEffect, useState } from "react";
import { Sparkles, Volume2, ScanFace, Lock } from "lucide-react";
import { DEFAULT_NAME, setAgentName, setAgentVoice, setAgentFace, lockIdentity, completeOnboarding, isOnboarded } from "@/lib/identity";

// Gerbang — the gate. First-run onboarding: NAME the agent, choose its VOICE and FACE.
// On finish these are LOCKED (change only via admin). The agent then knows itself by
// the name the user gave it.
export function Gerbang({ onDone }: { onDone: () => void }) {
  const [show, setShow] = useState(false);
  const [step, setStep] = useState(0);
  const [name, setName] = useState(DEFAULT_NAME);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voice, setVoice] = useState("");
  const [faceData, setFaceData] = useState("");

  useEffect(() => {
    if (!isOnboarded()) setShow(true);
    const load = () => setVoices(window.speechSynthesis?.getVoices() ?? []);
    load(); if (typeof window !== "undefined") window.speechSynthesis.onvoiceschanged = load;
  }, []);
  if (!show) return null;

  function preview() {
    const u = new SpeechSynthesisUtterance(`Halo, saya ${name}.`); u.lang = "id-ID";
    const v = voices.find((x) => x.name === voice); if (v) u.voice = v;
    window.speechSynthesis.cancel(); window.speechSynthesis.speak(u);
  }
  function onFace(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    const ok = window.confirm("Wasiat — Anda berhak atas foto ini & setuju menjadikannya wajah agent. Untuk wajah seseorang (termasuk kenangan kerabat), ini representasi/penghormatan. Setelah selesai, wajah TERKUNCI (ubah lewat admin).");
    if (!ok) return;
    const r = new FileReader(); r.onload = () => setFaceData(String(r.result)); r.readAsDataURL(f);
  }
  function finish() {
    setAgentName(name); setAgentVoice(voice); if (faceData) setAgentFace(faceData);
    lockIdentity(); completeOnboarding(); setShow(false); onDone();
  }

  const idVoices = voices.filter((v) => v.lang.startsWith("id") || v.lang.startsWith("en"));
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 70, background: "rgba(3,17,26,0.92)", display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(6px)" }}>
      <div className="pusaka mx-4 w-full max-w-lg p-6">
        <p className="pusaka-hd mb-1">Pengaturan awal · langkah {step + 1}/4</p>
        {step === 0 && (
          <div>
            <h3 className="font-display text-lg text-glow glow-text"><Sparkles size={16} className="mr-2 inline" />Beri nama agent Anda</h3>
            <p className="mt-1 text-[12px] text-[#9fc7cf]">Dia akan mengenali dirinya dari nama ini.</p>
            <input value={name} onChange={(e) => setName(e.target.value)} className="mt-3 w-full rounded-input border border-[rgba(0,230,255,0.25)] bg-[rgba(8,16,26,0.6)] px-3 py-2 text-sm text-[#dff4f7]" placeholder="MiganPro" />
          </div>
        )}
        {step === 1 && (
          <div>
            <h3 className="font-display text-lg text-glow glow-text"><Volume2 size={16} className="mr-2 inline" />Pilih suara {name}</h3>
            <select value={voice} onChange={(e) => setVoice(e.target.value)} className="mt-3 w-full rounded-input border border-[rgba(0,230,255,0.25)] bg-[rgba(8,16,26,0.6)] px-2 py-2 text-[12px] text-[#cfeef2]">
              <option value="">Suara default (id-ID)</option>
              {idVoices.map((v) => <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>)}
            </select>
            <button onClick={preview} className="mt-2 rounded-btn border border-[rgba(0,230,255,0.25)] px-3 py-1 text-[11px] text-glow">Coba suara</button>
            <p className="mt-2 text-[10px] text-[#577f86]">Rekam suara khusus (clone) bisa diatur admin setelah ini.</p>
          </div>
        )}
        {step === 2 && (
          <div>
            <h3 className="font-display text-lg text-glow glow-text"><ScanFace size={16} className="mr-2 inline" />Wajah {name}</h3>
            <p className="mt-1 text-[12px] text-[#9fc7cf]">Unggah foto (opsional) — jadi wajah hologram. Kosongkan untuk wajah default.</p>
            <input type="file" accept="image/*" onChange={onFace} className="mt-3 w-full text-[11px] text-[#9fc7cf]" />
            {faceData && <img src={faceData} alt="pratinjau" className="mt-2 h-20 w-20 rounded-card object-cover opacity-80" />}
          </div>
        )}
        {step === 3 && (
          <div>
            <h3 className="font-display text-lg text-glow glow-text"><Lock size={16} className="mr-2 inline" />Kunci & mulai</h3>
            <p className="mt-2 text-[12px] text-[#9fc7cf]">Nama: <b className="text-[#dff4f7]">{name}</b><br />Suara: <b className="text-[#dff4f7]">{voice || "default"}</b><br />Wajah: <b className="text-[#dff4f7]">{faceData ? "foto khusus" : "default"}</b></p>
            <p className="mt-3 rounded-card border border-[rgba(255,178,74,0.3)] bg-[rgba(255,178,74,0.06)] p-2 text-[11px] text-[#ffb24a]">Setelah live, suara & wajah TERKUNCI. Perubahan hanya lewat admin.</p>
          </div>
        )}
        <div className="mt-5 flex items-center justify-between">
          <button onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0} className="text-[12px] text-[#9fc7cf] disabled:opacity-30">Kembali</button>
          {/* Jalan keluar. Wizard 4 langkah yang MENUTUPI seluruh layar tanpa
              cara melewatinya bisa menyandera aplikasi kalau satu langkah macet
              (langkah suara & wajah bergantung speechSynthesis/kamera yang tidak
              selalu tersedia). Melewati = pakai nilai default, bukan merusak
              apa pun; identitas tetap bisa diatur belakangan lewat admin. */}
          <button
            onClick={() => { completeOnboarding(); setShow(false); onDone(); }}
            className="ml-auto mr-3 text-[12px] text-[#6f9aa2] underline underline-offset-2 hover:text-[#9fc7cf]"
            title="Pakai pengaturan bawaan, atur nanti"
          >Lewati</button>
          {step < 3
            ? <button onClick={() => setStep(step + 1)} className="rounded-btn border border-[rgba(0,230,255,0.3)] px-4 py-1.5 text-[12px] text-glow">Lanjut</button>
            : <button onClick={finish} className="rounded-btn border border-glow px-4 py-1.5 text-[12px] text-glow shadow-glow">Kunci & mulai</button>}
        </div>
      </div>
    </div>
  );
}
