// Real per-pixel 3D depth (F-032) — runs Depth Anything v2 IN THE BROWSER (transformers.js
// from CDN, no GPU server, privacy-first) to turn a photo into a TRUE 3D particle face
// (accurate nose/eye/jaw relief), not the flat/pseudo-bulge fallback. Loaded lazily; the
// pseudo-3D sample shows instantly while this upgrades in the background. See doc 10.
import { seededRandom, seedFromString, faceRegion, type AvatarParticle } from "@/lib/avatar/pointGenerator";

const TRANSFORMERS_CDN = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.3/dist/transformers.min.js";
let _pipe: Promise<any> | null = null;

function getPipe(): Promise<any> {
  if (_pipe) return _pipe;
  _pipe = (async () => {
    // runtime ESM import from CDN; not bundled (webpackIgnore) — keeps transformers.js
    // (large) out of the app bundle and loads it only when real-depth is requested.
    const mod = await import(/* webpackIgnore: true */ TRANSFORMERS_CDN);
    return mod.pipeline("depth-estimation", "onnx-community/depth-anything-v2-small", { dtype: "q8" });
  })();
  return _pipe;
}

/** Sample `src` into particles using a real depth map for z. Returns null on any failure
 * (caller keeps the instant pseudo-3D sample). */
export async function samplePhotoWithDepth(
  src: string,
  img: HTMLImageElement,
  opts: { span?: number; maxPoints?: number } = {},
): Promise<AvatarParticle[] | null> {
  try {
    const pipe = await getPipe();
    const out = await pipe(src);
    const dmap = out?.depth;
    if (!dmap?.data) return null;
    const dw: number = dmap.width, dh: number = dmap.height, dch: number = dmap.channels || 1;
    const dd: Uint8Array = dmap.data;

    const span = opts.span ?? 2.7;
    const maxPoints = opts.maxPoints ?? 13000;
    const W = 240;
    const aspect = img.height && img.width ? img.height / img.width : 1.25;
    const H = Math.max(1, Math.round(W * aspect));
    const cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    const ctx = cv.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, W, H);
    const cdata = ctx.getImageData(0, 0, W, H).data;
    const depthAt = (px: number, py: number) =>
      dd[(Math.min(dh - 1, Math.floor((py / H) * dh)) * dw + Math.min(dw - 1, Math.floor((px / W) * dw))) * dch] / 255;

    // normalize depth to robust 2–98 percentiles (Depth Anything: higher = closer)
    const zs: number[] = [];
    for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
      const i = (py * W + px) * 4;
      const luma = (cdata[i] + cdata[i + 1] + cdata[i + 2]) / 765;
      if (luma < 0.11) continue;
      zs.push(depthAt(px, py));
    }
    if (!zs.length) return null;
    zs.sort((a, b) => a - b);
    const lo = zs[Math.floor(zs.length * 0.02)] ?? 0;
    const hi = zs[Math.floor(zs.length * 0.98)] ?? 1;
    const rng = Math.max(0.001, hi - lo);

    const random = seededRandom(seedFromString(src));
    const yspan = span * aspect;
    const ptl: AvatarParticle[] = [];
    for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
      const i = (py * W + px) * 4;
      const luma = (cdata[i] + cdata[i + 1] + cdata[i + 2]) / 765;
      if (luma < 0.11) continue;
      if (random() > Math.min(0.97, luma * 1.2 + 0.12)) continue;
      const x = (px / W - 0.5) * span;
      const y = (0.5 - py / H) * yspan + 0.32;
      const dN = Math.max(0, Math.min(1, (depthAt(px, py) - lo) / rng));
      const z = (dN - 0.5) * 1.8; // REAL per-pixel depth, exaggerated for the hologram
      ptl.push({ position: [x, y, z], size: 0.62 + luma * 1.0, intensity: Math.max(0.28, luma), role: faceRegion(px / W, py / H) });
    }
    if (ptl.length > maxPoints) { const st = Math.ceil(ptl.length / maxPoints); return ptl.filter((_, i) => i % st === 0); }
    return ptl;
  } catch (e) {
    console.error("depth sample failed:", e);
    return null;
  }
}
