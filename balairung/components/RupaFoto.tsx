"use client";
import { useEffect, useRef, useState } from "react";
import { ScanFace, Upload } from "lucide-react";
import { Particle, sampleImageToParticles, buildDefaultFace, easeOutCubic } from "@/lib/particleEngine";
import { agentFace, setAgentFace, isLocked } from "@/lib/identity";

// RupaFoto — the hologram avatar: a face built from a point-cloud of knowledge nodes
// (Obsidian-style links), assembled from a default silhouette OR a CLIENT PHOTO.
// Photo gated by Wasiat consent. Reacts to assistant mode (idle/listening/thinking).
// Engine reused from UI REFERENCE/kirana-ai_g (Canvas 2D, zero-vendor).
const W = 480, H = 600;
type Mode = "idle" | "listening" | "thinking" | "responding";
const MODE: Record<Mode, { drift: number; alpha: number }> = {
  idle: { drift: 1, alpha: 0.85 }, listening: { drift: 1.5, alpha: 1 },
  thinking: { drift: 2.4, alpha: 0.95 }, responding: { drift: 1.8, alpha: 1 },
};

function buildKnowledge(parts: Particle[]) {
  const nodes: { x: number; y: number; ph: number }[] = [];
  const step = Math.max(1, Math.floor(parts.length / 48));
  for (let i = 0; i < parts.length; i += step) nodes.push({ x: parts[i].bx, y: parts[i].by, ph: Math.random() * 6.28 });
  for (let i = 0; i < 22; i++) { const a = (i / 22) * 6.28; nodes.push({ x: W / 2 + Math.cos(a) * W * 0.46, y: H * 0.42 + Math.sin(a) * H * 0.46, ph: Math.random() * 6.28 }); }
  const links: [number, number][] = [];
  for (let i = 0; i < nodes.length; i++) {
    const d = nodes.map((n, j) => [j, (n.x - nodes[i].x) ** 2 + (n.y - nodes[i].y) ** 2] as [number, number]).filter(([j]) => j !== i).sort((a, b) => a[1] - b[1]);
    for (let k = 0; k < 2; k++) if (d[k]) links.push([i, d[k][0]]);
  }
  return { nodes, links };
}

export function RupaFoto() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const parts = useRef<Particle[]>([]);
  const kg = useRef(buildKnowledge([]));
  const mode = useRef<Mode>("idle");
  const start = useRef(0);
  const [hint, setHint] = useState("Wajah default · unggah foto untuk personalisasi");

  function setParticles(p: Particle[]) { parts.current = p; kg.current = buildKnowledge(p); start.current = performance.now(); }

  useEffect(() => {
    setParticles(buildDefaultFace(W, H));
    const saved = agentFace(); // restore the face chosen at onboarding (locked)
    if (saved) { const im = new Image(); im.onload = () => { setParticles(sampleImageToParticles(im, { width: W, height: H, gap: 5, threshold: 0.22, mask: true, maxParticles: 3800 })); setHint("Wajah agent (terkunci)"); }; im.src = saved; }
    const cv = canvas.current!, ctx = cv.getContext("2d")!;
    const fit = () => { cv.width = cv.clientWidth; cv.height = cv.clientHeight; };
    fit(); const ro = new ResizeObserver(fit); ro.observe(cv);
    let raf = 0, alive = true;

    const draw = () => {
      if (!alive) return;
      const t = performance.now(), prog = easeOutCubic(Math.min(1, (t - start.current) / 1400));
      const m = MODE[mode.current], cw = cv.width, ch = cv.height, sx = cw / W, sy = ch / H;
      ctx.clearRect(0, 0, cw, ch);
      // knowledge links
      ctx.strokeStyle = `rgba(0,230,255,${0.10 * m.alpha})`; ctx.lineWidth = 0.5; ctx.beginPath();
      for (const [a, b] of kg.current.links) { const n1 = kg.current.nodes[a], n2 = kg.current.nodes[b]; ctx.moveTo(n1.x * sx, n1.y * sy); ctx.lineTo(n2.x * sx, n2.y * sy); }
      ctx.stroke();
      // face particles
      ctx.globalCompositeOperation = "lighter";
      for (const p of parts.current) {
        const dx = Math.sin(t * 0.001 * p.sp * m.drift + p.ph) * p.amp;
        const dy = Math.cos(t * 0.0011 * p.sp * m.drift + p.ph) * p.amp * 0.6;
        const x = (p.ox + (p.bx - p.ox) * prog + dx) * sx;
        const y = (p.oy + (p.by - p.oy) * prog + dy) * sy;
        const a = (0.4 + p.lum * 0.6) * m.alpha;
        ctx.fillStyle = p.lum > 0.85 ? `rgba(200,250,255,${a})` : `rgba(95,225,255,${a})`;
        ctx.beginPath(); ctx.arc(x, y, p.size, 0, 6.283); ctx.fill();
      }
      // knowledge nodes (pulse)
      for (const n of kg.current.nodes) {
        const pulse = 0.6 + Math.sin(t * 0.002 + n.ph) * 0.4;
        ctx.fillStyle = `rgba(120,235,255,${0.5 * m.alpha * pulse})`;
        ctx.beginPath(); ctx.arc(n.x * sx, n.y * sy, 1.6 * prog, 0, 6.283); ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
      raf = requestAnimationFrame(draw);
    };
    draw();

    const onListen = () => (mode.current = "listening");
    const onStop = () => (mode.current = "idle");
    const onAsk = () => { mode.current = "thinking"; setTimeout(() => { if (mode.current === "thinking") mode.current = "idle"; }, 6000); };
    window.addEventListener("balairung:listen", onListen);
    window.addEventListener("balairung:stop", onStop);
    window.addEventListener("balairung:ask", onAsk);
    return () => { alive = false; cancelAnimationFrame(raf); ro.disconnect(); window.removeEventListener("balairung:listen", onListen); window.removeEventListener("balairung:stop", onStop); window.removeEventListener("balairung:ask", onAsk); };
  }, []);

  function chooseFile() {
    // Wasiat — consent gate (esp. for a real person's / tribute photo).
    const ok = window.confirm("Wasiat — Konfirmasi: Anda berhak atas foto ini dan menyetujui menjadikannya wajah avatar. Untuk wajah seseorang (termasuk kenangan kerabat), ini representasi/penghormatan, bukan orang aslinya.");
    if (ok) file.current?.click();
  }
  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      const data = String(r.result);
      const img = new Image();
      img.onload = () => { setParticles(sampleImageToParticles(img, { width: W, height: H, gap: 5, threshold: 0.22, mask: true, maxParticles: 3800 })); setAgentFace(data); setHint(`Wajah dari: ${f.name.slice(0, 24)}`); };
      img.src = data;
    };
    r.readAsDataURL(f);
  }

  return (
    <>
      <canvas ref={canvas} className="absolute inset-0 z-[1] h-full w-full" aria-label="Rupa — avatar hologram dari node knowledge" />
      <div className="absolute left-1/2 top-2 z-10 flex -translate-x-1/2 items-center gap-2">
        {isLocked() ? (
          <span className="rounded-pill border border-[rgba(0,230,255,0.18)] bg-[rgba(8,16,26,0.6)] px-3 py-1.5 text-[9px] text-[#577f86]"><ScanFace size={11} className="mr-1 inline" />Wajah terkunci · ubah lewat admin</span>
        ) : (
          <>
            <button onClick={chooseFile} className="flex items-center gap-2 rounded-pill border border-[rgba(0,230,255,0.25)] bg-[rgba(8,16,26,0.6)] px-3 py-1.5 text-[10px] tracking-wide text-glow hover:shadow-glow">
              <Upload size={13} /> Wajah dari foto
            </button>
            <span className="hidden text-[9px] text-[#577f86] sm:inline">{hint}</span>
          </>
        )}
        <input ref={file} type="file" accept="image/*" className="hidden" onChange={onFile} />
      </div>
    </>
  );
}
