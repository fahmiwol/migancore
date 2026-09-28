"use client";
import { useEffect, useRef, useState } from "react";
import { Eye } from "lucide-react";
import type { TrackingData } from "@/types/avatar";
import { emitTracking } from "@/lib/avatar/signals";
import { lerp } from "@/lib/avatar/smoothing";

// Tatapan (A3.2) — opt-in "eye-contact" mode. Runs MediaPipe FaceLandmarker on the
// webcam, derives a smoothed TrackingData (presence + gaze + proximity) and emits it
// so the hologram head turns toward the user. UI name plain ("Kontak mata");
// the perception metaphor (Tatapan/Paras) stays backend-only (Primbon rule).
// No pixels drawn — this is sensing only (the avatar reacts), so it's light.
const WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm";
const MODEL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

export function Tatapan() {
  const [on, setOn] = useState(false);
  const stop = useRef<() => void>(() => {});

  useEffect(() => {
    if (!on) {
      stop.current();
      emitTracking({ userPresent: false, faceCenter: [0, 0, 0], gazeTarget: [0, 0, 0], headRotation: [0, 0, 0], proximity: 0, confidence: 0 });
      return;
    }
    let raf = 0, fm: any, stream: MediaStream | null = null, alive = true;
    const sm = { x: 0, y: 0, prox: 0 }; // smoothed state (k≈0.12)

    (async () => {
      try {
        const vision = await import("@mediapipe/tasks-vision");
        const fileset = await vision.FilesetResolver.forVisionTasks(WASM);
        fm = await vision.FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL, delegate: "GPU" },
          runningMode: "VIDEO",
          numFaces: 1,
        });
        const v = document.createElement("video");
        v.autoplay = true;
        v.playsInline = true;
        v.muted = true;
        stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
        v.srcObject = stream;
        await v.play();

        const loop = () => {
          if (!alive) return;
          if (v.readyState >= 2) {
            const res = fm.detectForVideo(v, performance.now());
            const lm = res?.faceLandmarks?.[0];
            if (lm && lm.length) {
              // face centroid + bounding extent in normalized [0,1] coords
              let cx = 0, cy = 0, minX = 1, maxX = 0, minY = 1, maxY = 0;
              for (const p of lm) {
                cx += p.x; cy += p.y;
                if (p.x < minX) minX = p.x;
                if (p.x > maxX) maxX = p.x;
                if (p.y < minY) minY = p.y;
                if (p.y > maxY) maxY = p.y;
              }
              cx /= lm.length; cy /= lm.length;
              // offset of the user from frame centre, mirrored (selfie view) → look-at.
              const dx = (0.5 - cx) * 2; // user to the right → +; mirror so head follows
              const dy = (cy - 0.5) * 2;
              const prox = Math.min(1, (maxX - minX + (maxY - minY)) * 1.2);
              sm.x = lerp(sm.x, dx, 0.12);
              sm.y = lerp(sm.y, dy, 0.12);
              sm.prox = lerp(sm.prox, prox, 0.12);
              const data: TrackingData = {
                userPresent: true,
                faceCenter: [cx, cy, 0],
                gazeTarget: [sm.x, sm.y, 0],
                headRotation: [sm.x * 0.5, sm.y * 0.3, 0],
                proximity: sm.prox,
                confidence: 0.9,
              };
              emitTracking(data);
            } else {
              sm.x = lerp(sm.x, 0, 0.1);
              sm.y = lerp(sm.y, 0, 0.1);
              emitTracking({ userPresent: false, faceCenter: [0, 0, 0], gazeTarget: [sm.x, sm.y, 0], headRotation: [0, 0, 0], proximity: 0, confidence: 0 });
            }
          }
          raf = requestAnimationFrame(loop);
        };
        loop();
        stop.current = () => {
          alive = false;
          cancelAnimationFrame(raf);
          stream?.getTracks().forEach((t) => t.stop());
          try { fm?.close(); } catch {}
        };
      } catch (e) {
        console.error("Tatapan gagal:", e);
        setOn(false);
      }
    })();

    return () => stop.current();
  }, [on]);

  return (
    <button
      onClick={() => setOn((v) => !v)}
      aria-pressed={on}
      className={`flex items-center gap-2 rounded-pill border px-3 py-2 text-[11px] tracking-wide transition-all ${
        on ? "border-glow text-glow shadow-glow" : "border-[rgba(0,230,255,0.2)] text-[#9fc7cf]"
      }`}
    >
      <Eye size={15} /> {on ? "Kontak mata aktif" : "Kontak mata (kamera)"}
    </button>
  );
}
