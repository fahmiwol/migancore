"use client";
import { useEffect, useState } from "react";
import { Mic, Activity } from "lucide-react";
import { agentName } from "@/lib/identity";
import { Gerbang } from "@/components/Gerbang";
import { Denyut } from "@/components/Denyut";
import { AvatarEngine } from "@/components/avatar/AvatarEngine";
import { Pusaka } from "@/components/Pusaka";
import { Sasmita } from "@/components/Sasmita";
import { PetaPengetahuan3D } from "@/components/PetaPengetahuan3D";
import { Lisan } from "@/components/Lisan";
import { Akses } from "@/components/Akses";
import { Isyarat } from "@/components/Isyarat";
import { RupaLive } from "@/components/RupaLive";
import { RupaStudio } from "@/components/avatar/RupaStudio";
import { Tatapan } from "@/components/avatar/perception/Tatapan";
import { Suara } from "@/components/Suara";
import { Pengetahuan } from "@/components/Pengetahuan";
import { Koneksi } from "@/components/Koneksi";
import { Pengeling } from "@/components/Pengeling";
import { Warta } from "@/components/Warta";
import { ContentCardSlider } from "@/components/content/ContentCardSlider";
import { Tuntun } from "@/components/Tuntun";

// Balairung — the command hall. Rupa (avatar) is the hero; Pusaka panels flank it.
export default function Balairung() {
  const [name, setName] = useState("MiganPro");
  useEffect(() => { setName(agentName()); }, []);
  return (
    <Denyut>
      <Gerbang onDone={() => setName(agentName())} />
      <main className="relative min-h-screen w-full max-w-content mx-auto overflow-hidden px-6 py-6">
        <AvatarEngine />
        <ContentCardSlider />{/* 10-finger gesture → floating content card slider */}

        {/* top bar */}
        <div className="relative z-10 flex items-start justify-between">
          <div>
            <h1 className="font-display text-2xl tracking-[3px] glow-text">{name.toUpperCase()}</h1>
            <p className="text-[9px] tracking-[3px] text-glow">ASISTEN PRIBADI · SELF-HOSTED</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] tracking-widest text-[#46f0c0]">● SISTEM AKTIF</p>
            <p className="text-[10px] text-[#577f86]">PRIVAT · MILIK ANDA</p>
          </div>
        </div>

        {/* touchless + live-face controls */}
        <div className="relative z-10 mt-3 flex flex-wrap justify-center gap-3">
          <Isyarat />
          <RupaLive />
          <Tatapan />
          <RupaStudio />
          <Tuntun />
        </div>

        {/* flanking panels */}
        <div className="relative z-10 mt-6 grid grid-cols-[200px_1fr_210px] gap-6">
          <div className="space-y-4">
            <Pusaka title="Interaksi suara" icon={<Mic size={13} />}>
              <p className="text-[10px] text-[#577f86]">Mendengarkan…</p>
            </Pusaka>
            <Pusaka title="Status otak" icon={<Activity size={13} />} delay={0.15}>
              <div className="space-y-1 text-[11px] text-[#9fc7cf]">
                <p className="flex justify-between"><span>Refleks 0.5B</span><b className="font-medium text-[#dff4f7]">aktif</b></p>
                <p className="flex justify-between"><span>Brain 7B</span><b className="font-medium text-[#dff4f7]">aktif</b></p>
                <p className="flex justify-between"><span>Privasi</span><b className="font-medium text-[#46f0c0]">milik Anda</b></p>
              </div>
            </Pusaka>
            <Warta />
            <Pengetahuan />
            <Koneksi />
            <Suara />
          </div>

          <div /> {/* center reserved for Rupa */}

          <div className="space-y-4">
            <Sasmita topic="kebijakan" />
            <PetaPengetahuan3D />
            <Pengeling />
          </div>
        </div>

        {/* command bar */}
        <div className="relative z-10 mt-8 mx-auto max-w-xl">
          <Lisan />
        </div>

        {/* Akses — clickable quick access + modules (also click-able by gesture/voice) */}
        <div className="relative z-10 mt-6">
          <Akses />
        </div>
      </main>
    </Denyut>
  );
}
