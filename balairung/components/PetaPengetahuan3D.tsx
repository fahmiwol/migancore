"use client";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Network, Maximize2, X } from "lucide-react";
import { Pusaka } from "./Pusaka";
import { buildGraph, loadVault, type GraphData } from "@/lib/khazanah";

// 3D knowledge graph (Obsidian-style) via react-force-graph-3d (Three.js, MIT).
// Rotatable/zoomable in-panel; click "perbesar" for a fullscreen explore view.
const ForceGraph3D = dynamic(() => import("react-force-graph-3d"), { ssr: false });

function Graph({ g, w, h }: { g: GraphData; w: number; h: number }) {
  return (
    <ForceGraph3D
      graphData={g as any}
      width={w}
      height={h}
      backgroundColor="rgba(0,0,0,0)"
      showNavInfo={false}
      nodeColor={() => "#5fe9ff"}
      nodeOpacity={0.92}
      nodeVal={(n: any) => 1 + (n.degree || 0) * 1.5}
      nodeLabel={(n: any) => n.title}
      linkColor={() => "rgba(0,230,255,0.28)"}
      linkOpacity={0.4}
      warmupTicks={40}
      cooldownTicks={90}
    />
  );
}

export function PetaPengetahuan3D() {
  const [g, setG] = useState<GraphData | null>(null);
  const [full, setFull] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(190);

  useEffect(() => { loadVault().then((n) => setG(buildGraph(n))); }, []);
  useEffect(() => {
    if (!wrap.current) return;
    const ro = new ResizeObserver(() => { if (wrap.current) setW(wrap.current.clientWidth); });
    ro.observe(wrap.current); return () => ro.disconnect();
  }, []);

  return (
    <Pusaka title="Peta Pengetahuan" icon={<Network size={13} />} delay={0.2}>
      <div className="relative">
        <button onClick={() => setFull(true)} aria-label="perbesar" className="absolute right-1 top-1 z-10 text-[#5fd0da] hover:text-glow"><Maximize2 size={13} /></button>
        <div ref={wrap} className="h-[160px] -mx-1">
          {g && <Graph g={g} w={w} h={160} />}
        </div>
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-[#9fc7cf]">
        <span>Node <b className="font-medium text-[#dff4f7]">{g?.nodes.length ?? 0}</b></span>
        <span>Relasi <b className="font-medium text-[#dff4f7]">{g?.links.length ?? 0}</b></span>
        <span className="text-[#46f0c0]">privat · 3D</span>
      </div>
      {full && g && (
        <div style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(3,17,26,0.96)" }}>
          <button onClick={() => setFull(false)} aria-label="tutup" className="absolute right-4 top-4 z-10 rounded-pill border border-[rgba(0,230,255,0.3)] p-2 text-glow"><X size={18} /></button>
          <p className="pusaka-hd absolute left-5 top-5 z-10">Peta Pengetahuan · seret untuk putar, scroll untuk zoom</p>
          <Graph g={g} w={typeof window !== "undefined" ? window.innerWidth : 1200} h={typeof window !== "undefined" ? window.innerHeight : 700} />
        </div>
      )}
    </Pusaka>
  );
}
