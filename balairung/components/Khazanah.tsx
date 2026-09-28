"use client";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Library } from "lucide-react";
import { Pusaka } from "./Pusaka";
import { buildGraph, loadVault, type GraphData } from "@/lib/khazanah";

// Graph renderer is client-only (WebGL/canvas) → load without SSR.
const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false });

// Khazanah — the knowledge vault, shown as a living graph of linked notes.
export function Khazanah() {
  const [g, setG] = useState<GraphData | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(190);

  useEffect(() => { loadVault().then((notes) => setG(buildGraph(notes))); }, []);
  useEffect(() => {
    if (!wrap.current) return;
    const ro = new ResizeObserver(() => setW(wrap.current!.clientWidth));
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);

  return (
    <Pusaka title="Khazanah" icon={<Library size={13} />} delay={0.2}>
      <div ref={wrap} className="h-[150px] -mx-1">
        {g && (
          <ForceGraph2D
            graphData={g as any}
            width={w}
            height={150}
            backgroundColor="rgba(0,0,0,0)"
            nodeRelSize={3}
            nodeColor={() => "#5fe9ff"}
            linkColor={() => "rgba(0,230,255,0.25)"}
            linkWidth={0.5}
            nodeLabel={(n: any) => n.title}
            enableNodeDrag={false}
            cooldownTicks={60}
          />
        )}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-[#9fc7cf]">
        <span>Node <b className="font-medium text-[#dff4f7]">{g?.nodes.length ?? 0}</b></span>
        <span>Relasi <b className="font-medium text-[#dff4f7]">{g?.links.length ?? 0}</b></span>
        <span className="text-[#46f0c0]">privat</span>
      </div>
    </Pusaka>
  );
}
