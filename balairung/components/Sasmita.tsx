"use client";
import { useEffect, useState } from "react";
import { Radio } from "lucide-react";
import { Pusaka } from "./Pusaka";
import { getSasmita } from "@/lib/migancore";

type S = Awaited<ReturnType<typeof getSasmita>>;
const bar = (pct: number, color: string) => (
  <div className="h-1 rounded-pill bg-[rgba(0,230,255,.14)] my-1 overflow-hidden">
    <div style={{ width: `${pct}%`, background: color }} className="h-full rounded-pill" />
  </div>
);

// Sasmita — reading the public's subtle signs (social listening + sentiment/intent).
export function Sasmita({ topic = "kebijakan" }: { topic?: string }) {
  const [d, setD] = useState<S | null>(null);
  useEffect(() => { getSasmita(topic).then(setD); }, [topic]);
  if (!d) return null;
  const row = (label: string, v: { pct: number; count: number }, color: string) => (
    <div>
      <div className="flex justify-between text-[11px] text-[#9fc7cf]"><span>{label}</span><b className="font-medium text-[#dff4f7]">{v.pct}% · {v.count.toLocaleString("id")}</b></div>
      {bar(v.pct, color)}
    </div>
  );
  return (
    <Pusaka title={`Sentimen Publik · ${d.window}`} icon={<Radio size={13} />} delay={0.1}>
      {row("Positif", d.positive, "#46f0c0")}
      {row("Negatif", d.negative, "#ff6f8b")}
      {row("Keluhan", d.complaint, "#ffb24a")}
      {row("Saran", d.suggestion, "#5fb8ff")}
      <p className="mt-2 text-[10px] text-[#577f86]">Keluhan teratas: {d.topComplaints[0]}</p>
    </Pusaka>
  );
}
