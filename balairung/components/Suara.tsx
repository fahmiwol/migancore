"use client";
import { useEffect, useRef, useState } from "react";
import { Volume2, Mic, Square, Play, Lock } from "lucide-react";
import { Pusaka } from "./Pusaka";
import { agentVoice, setAgentVoice, isLocked, agentName } from "@/lib/identity";

// Suara — the agent's voice. Chosen at onboarding (Gerbang) and LOCKED after.
// When locked, shows read-only; admin unlock required to change. Record = clone source.
export function Suara() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [chosen, setChosen] = useState("");
  const [recording, setRecording] = useState(false);
  const [clipUrl, setClipUrl] = useState("");
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const locked = isLocked();

  useEffect(() => {
    const load = () => setVoices(window.speechSynthesis?.getVoices() ?? []);
    load(); window.speechSynthesis.onvoiceschanged = load;
    setChosen(agentVoice());
  }, []);

  function pick(name: string) { setChosen(name); setAgentVoice(name); }
  function preview() {
    const u = new SpeechSynthesisUtterance(`Halo, saya ${agentName()}.`);
    u.lang = "id-ID"; const v = voices.find((x) => x.name === chosen); if (v) u.voice = v;
    window.speechSynthesis.cancel(); window.speechSynthesis.speak(u);
  }
  async function toggleRecord() {
    if (recording) { rec.current?.stop(); setRecording(false); return; }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    chunks.current = [];
    const mr = new MediaRecorder(stream);
    mr.ondataavailable = (e) => chunks.current.push(e.data);
    mr.onstop = () => { setClipUrl(URL.createObjectURL(new Blob(chunks.current, { type: "audio/webm" }))); stream.getTracks().forEach((t) => t.stop()); };
    rec.current = mr; mr.start(); setRecording(true);
  }

  const idVoices = voices.filter((v) => v.lang.startsWith("id") || v.lang.startsWith("en"));
  return (
    <Pusaka title={`Suara ${agentName()}`} icon={<Volume2 size={13} />} delay={0.15}>
      {locked ? (
        <p className="flex items-center gap-2 text-[11px] text-[#577f86]"><Lock size={12} /> Terkunci ({chosen || "default"}). Ubah lewat admin.</p>
      ) : (
        <>
          <select value={chosen} onChange={(e) => pick(e.target.value)} className="w-full rounded-input border border-[rgba(0,230,255,0.2)] bg-[rgba(8,16,26,0.6)] px-2 py-1 text-[11px] text-[#cfeef2]">
            <option value="">Suara default (id-ID)</option>
            {idVoices.map((v) => <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>)}
          </select>
          <div className="mt-2 flex flex-wrap gap-2">
            <button onClick={preview} className="flex items-center gap-1 rounded-btn border border-[rgba(0,230,255,0.2)] px-2 py-1 text-[10px] text-glow"><Play size={12} /> Coba</button>
            <button onClick={toggleRecord} className={`flex items-center gap-1 rounded-btn border px-2 py-1 text-[10px] ${recording ? "border-[#ff6f8b] text-[#ff6f8b]" : "border-[rgba(0,230,255,0.2)] text-glow"}`}>
              {recording ? <><Square size={12} /> Berhenti</> : <><Mic size={12} /> Rekam suara</>}
            </button>
          </div>
          {clipUrl && <audio src={clipUrl} controls className="mt-2 w-full" style={{ height: 28 }} />}
          <p className="mt-1 text-[9px] text-[#577f86]">Rekaman = bahan voice-clone (admin) — lalu dikunci.</p>
        </>
      )}
    </Pusaka>
  );
}
