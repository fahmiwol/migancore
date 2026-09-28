"use client";
import { useEffect, useRef, useState } from "react";
import { ScanFace } from "lucide-react";

// RupaLive — forms a REAL face from the webcam as a glowing particle cloud
// (MediaPipe FaceLandmarker, 478 landmarks). This is the "membentuk wajah" effect.
// PROD path: same pipeline run once over a client's PHOTO (gated by Wasiat consent)
// to bake a persistent avatar; live-webcam is the demo/mirror mode.
const WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm";
const MODEL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

export function RupaLive() {
  const [on, setOn] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const stop = useRef<() => void>(() => {});

  useEffect(() => {
    if (!on) { stop.current(); return; }
    let raf = 0, fm: any, stream: MediaStream | null = null, alive = true;

    (async () => {
      try {
        const vision = await import("@mediapipe/tasks-vision");
        const fileset = await vision.FilesetResolver.forVisionTasks(WASM);
        fm = await vision.FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL, delegate: "GPU" },
          runningMode: "VIDEO", numFaces: 1,
        });
        const v = document.createElement("video");
        v.autoplay = true; v.playsInline = true;
        stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
        v.srcObject = stream; await v.play();

        const cv = canvas.current!, ctx = cv.getContext("2d")!;
        const fit = () => { cv.width = cv.clientWidth; cv.height = cv.clientHeight; };
        fit(); const ro = new ResizeObserver(fit); ro.observe(cv);

        const loop = () => {
          if (!alive) return;
          if (v.readyState >= 2) {
            const res = fm.detectForVideo(v, performance.now());
            ctx.clearRect(0, 0, cv.width, cv.height);
            const lm = res?.faceLandmarks?.[0];
            if (lm) {
              // fit the normalized face into the canvas, mirrored, centered
              const W = cv.width, H = cv.height, S = Math.min(W, H) * 1.1;
              const ox = W / 2, oy = H / 2;
              ctx.fillStyle = "#7fe9ff"; ctx.shadowColor = "#00e6ff"; ctx.shadowBlur = 6;
              for (let i = 0; i < lm.length; i++) {
                const p = lm[i];
                const x = ox + (0.5 - p.x) * S;     // mirror
                const y = oy + (p.y - 0.5) * S;
                const r = 0.9 + (i % 7 === 0 ? 1.1 : 0); // vary size for life
                ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fill();
              }
            }
          }
          raf = requestAnimationFrame(loop);
        };
        loop();
        stop.current = () => {
          alive = false; cancelAnimationFrame(raf); ro.disconnect();
          stream?.getTracks().forEach((t) => t.stop());
          try { fm?.close(); } catch {}
          const c = canvas.current; if (c) c.getContext("2d")?.clearRect(0, 0, c.width, c.height);
        };
      } catch (e) {
        console.error("RupaLive gagal:", e); setOn(false);
      }
    })();

    return () => stop.current();
  }, [on]);

  return (
    <>
      <button
        onClick={() => setOn((v) => !v)}
        className={`flex items-center gap-2 rounded-pill border px-3 py-2 text-[11px] tracking-wide transition-all ${
          on ? "border-glow text-glow shadow-glow" : "border-[rgba(0,230,255,0.2)] text-[#9fc7cf]"
        }`}
        aria-pressed={on}
      >
        <ScanFace size={15} /> {on ? "Wajah live aktif" : "Bentuk wajah (kamera)"}
      </button>
      {on && <canvas ref={canvas} className="pointer-events-none absolute inset-0 z-[1] h-full w-full" aria-label="Rupa live — wajah dari kamera" />}
    </>
  );
}
