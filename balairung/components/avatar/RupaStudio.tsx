"use client";
import { useEffect, useRef, useState } from "react";
import { Sparkles, X, ScanFace } from "lucide-react";
import { setAvatarGlb } from "@/lib/avatar/avatarSource";
import { isLocked } from "@/lib/identity";

// RupaStudio (A2.1b) — "Wajah dari foto · Studio 3D". Opens the Ready Player Me
// creator (selfie → rigged GLB with ARKit blendshapes), then feeds the exported GLB
// to the Hybrid Holographic Human as the new Guide-Mesh. Zero-vendor lock-in: RPM is
// free + commercial-OK and we self-reference only the resulting .glb URL. The hologram
// shader/particle pipeline is ours. Respects identity lock (admin-only after onboarding).
const SUB = process.env.NEXT_PUBLIC_RPM_SUBDOMAIN || "demo";
const FRAME_SRC = `https://${SUB}.readyplayer.me/avatar?frameApi&clearCache&bodyType=halfbody`;

export function RupaStudio() {
  const [open, setOpen] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!open) return;
    function onMsg(e: MessageEvent) {
      let json: any;
      try {
        json = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
      } catch {
        return;
      }
      if (!json || json.source !== "readyplayerme") return;
      // Ready Player Me frame API: ack readiness, then subscribe to all v1 events.
      if (json.eventName === "v1.frame.ready") {
        frame.current?.contentWindow?.postMessage(
          JSON.stringify({ target: "readyplayerme", type: "subscribe", eventName: "v1.**" }),
          "*",
        );
      }
      if (json.eventName === "v1.avatar.exported") {
        const url: string | undefined = json.data?.url;
        if (url && setAvatarGlb(url)) setOpen(false);
      }
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [open]);

  if (isLocked()) {
    return (
      <span className="flex items-center gap-1 rounded-pill border border-[rgba(0,230,255,0.18)] bg-[rgba(8,16,26,0.6)] px-3 py-1.5 text-[9px] text-[#577f86]">
        <ScanFace size={11} /> Avatar terkunci · ubah lewat admin
      </span>
    );
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-pill border border-[rgba(0,230,255,0.25)] bg-[rgba(8,16,26,0.6)] px-3 py-1.5 text-[10px] tracking-wide text-glow hover:shadow-glow"
      >
        <Sparkles size={13} /> Wajah dari foto · Studio 3D
      </button>
      {open && (
        <div style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(3,17,26,0.97)" }}>
          <button
            onClick={() => setOpen(false)}
            aria-label="tutup"
            className="absolute right-4 top-4 z-10 rounded-pill border border-[rgba(0,230,255,0.3)] p-2 text-glow"
          >
            <X size={18} />
          </button>
          <p className="pusaka-hd absolute left-5 top-5 z-10 max-w-[70%]">
            Studio Wajah 3D · ambil swafoto atau pilih gaya, lalu tekan “Enter / Next” untuk memakainya sebagai hologram
          </p>
          <iframe
            ref={frame}
            src={FRAME_SRC}
            allow="camera *; microphone *; clipboard-write"
            title="Studio Wajah 3D"
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}
          />
        </div>
      )}
    </>
  );
}
