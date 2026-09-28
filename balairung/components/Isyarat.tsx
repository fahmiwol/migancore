"use client";
import { useEffect, useRef, useState } from "react";
import { Hand } from "lucide-react";

// Isyarat — touchless control via webcam + MediaPipe HandLandmarker (2 hands).
// Finger-count gestures (per Fahmi):
//   1 jari  → mode kursor (arahkan)
//   2 jari  → KLIK elemen di bawah kursor
//   3 jari  → gulir (scroll)
//   5 jari  → aktifkan DENGAR suara (Lisan mulai mendengar)
//  10 jari  → LAPISAN KONTEN (summon kartu konten melayang)
//   0 (kepalan) → STOP (hentikan bicara / tutup overlay)
const WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm";
const MODEL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

const ACTIONS: Record<number, string> = {
  0: "Stop", 1: "Kursor", 2: "Klik", 3: "Gulir", 5: "Dengar", 10: "Konten",
};

function countFingers(lm: any[]): number {
  let c = 0;
  for (const [tip, pip] of [[8, 6], [12, 10], [16, 14], [20, 18]]) if (lm[tip].y < lm[pip].y) c++;
  // Thumb: lateral splay scaled by hand size (distance-invariant). The old absolute
  // > 0.07 missed the thumb when the hand was small/tilted → 5 fingers read as 4.
  const palm = Math.hypot(lm[5].x - lm[17].x, lm[5].y - lm[17].y) || 0.001;
  if (Math.abs(lm[4].x - lm[2].x) > 0.45 * palm) c++; // thumb up (TUNE 0.45 if needed)
  return c;
}

// Jempol / thumbs-up: 4 fingers curled + thumb pointing up → STOP.
function isThumbsUp(lm: any[]): boolean {
  const four = [[8, 6], [12, 10], [16, 14], [20, 18]].filter(([t, p]) => lm[t].y < lm[p].y).length;
  const thumbUp = lm[4].y < lm[3].y && lm[4].y < lm[0].y - 0.05;
  return four === 0 && thumbUp;
}

export function Isyarat() {
  const [on, setOn] = useState(false);
  const [hud, setHud] = useState("");
  const cursor = useRef<HTMLDivElement | null>(null);
  const stop = useRef<() => void>(() => {});

  useEffect(() => {
    if (!on) { stop.current(); setHud(""); return; }
    let raf = 0, lmk: any, stream: MediaStream | null = null, alive = true;
    let lastAction = "", cooldown = 0;

    // Cursor lives on <body> (NOT inside the dashboard's z-10 stacking context)
    // so it paints ABOVE the z-8000 content slider. pointer-events:none → the
    // 2-finger click still reaches the card under it via elementFromPoint.
    const cur = document.createElement("div");
    cur.setAttribute("aria-hidden", "true");
    Object.assign(cur.style, {
      position: "fixed", left: "0px", top: "0px", width: "22px", height: "22px",
      opacity: "0", zIndex: "2147483647", transform: "translate(-50%,-50%)",
      borderRadius: "50%", pointerEvents: "none", border: "2px solid #00e6ff",
      boxShadow: "0 0 16px rgba(0,230,255,.8)", transition: "transform .1s",
    });
    document.body.appendChild(cur);
    cursor.current = cur;

    (async () => {
      try {
        const vision = await import("@mediapipe/tasks-vision");
        const fileset = await vision.FilesetResolver.forVisionTasks(WASM);
        lmk = await vision.HandLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL, delegate: "GPU" },
          runningMode: "VIDEO", numHands: 2,
        });
        const v = document.createElement("video");
        v.autoplay = true; v.playsInline = true;
        stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
        v.srcObject = stream; await v.play();

        const fire = (action: string, fn: () => void) => {
          const now = performance.now();
          if (action !== lastAction || now - cooldown > 1100) { fn(); lastAction = action; cooldown = now; }
        };

        const loop = () => {
          if (!alive) return;
          if (v.readyState >= 2) {
            const res = lmk.detectForVideo(v, performance.now());
            const hands = res?.landmarks ?? [];
            if (hands.length) {
              const total = hands.reduce((s: number, h: any[]) => s + countFingers(h), 0);
              const tip = hands[0][8];
              const x = (1 - tip.x) * window.innerWidth, y = tip.y * window.innerHeight;
              if (cursor.current) { cursor.current.style.left = `${x}px`; cursor.current.style.top = `${y}px`; cursor.current.style.opacity = "1"; }
              if (hands.some(isThumbsUp)) {
                setHud("jempol · Stop");
                fire("stop", () => { window.speechSynthesis?.cancel(); window.dispatchEvent(new CustomEvent("balairung:stop")); });
              } else {
                const label = ACTIONS[total] ?? `${total} jari`;
                setHud(`${total} jari · ${label}`);
                if (total === 2) fire("click", () => { (document.elementFromPoint(x, y) as HTMLElement | null)?.click(); if (cursor.current) cursor.current.style.transform = "translate(-50%,-50%) scale(0.6)"; setTimeout(() => { if (cursor.current) cursor.current.style.transform = "translate(-50%,-50%) scale(1)"; }, 150); });
                else if (total === 3) window.scrollBy({ top: (y - window.innerHeight / 2) * 0.15 });
                else if (total === 5) fire("listen", () => window.dispatchEvent(new CustomEvent("balairung:listen")));
                else if (total >= 9) fire("content", () => window.dispatchEvent(new CustomEvent("balairung:content-show")));
                else if (total === 0) fire("stop", () => window.dispatchEvent(new CustomEvent("balairung:stop")));
              }
            } else if (cursor.current) cursor.current.style.opacity = "0.2";
          }
          raf = requestAnimationFrame(loop);
        };
        loop();
      } catch (e) { console.error("Isyarat:", e); setOn(false); }
    })();

    stop.current = () => { alive = false; cancelAnimationFrame(raf); stream?.getTracks().forEach((t) => t.stop()); try { lmk?.close(); } catch {} cur.remove(); };
    return () => stop.current();
  }, [on]);

  return (
    <button
      onClick={() => setOn((v) => !v)}
      className={`flex items-center gap-2 rounded-pill border px-3 py-2 text-[11px] tracking-wide transition-all ${on ? "border-glow text-glow shadow-glow" : "border-[rgba(0,230,255,0.2)] text-[#9fc7cf]"}`}
      aria-pressed={on}
    >
      <Hand size={15} /> {on ? `Tangan: ${hud || "…"}` : "Kendali tangan"}
    </button>
  );
}
