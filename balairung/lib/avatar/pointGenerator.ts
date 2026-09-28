// Particle face generator — adopted from the Codex KIRANA experiment
// (~\Documents\UI design\lib\avatarPointGenerator.ts), amati-tiru-modifikasi.
// Builds a RECOGNIZABLE front-facing hologram bust from PROCEDURAL particles (face/
// hair/neck/shoulder/torso silhouette + parametric eye/brow/nose/mouth/jaw curves) —
// NO GLB, so it's robust + looks like Fahmi's blue-hologram reference. Also samples an
// uploaded PHOTO into particles (photo→avatar). Pure/deterministic (SSR-safe seeds).

export type AvatarParticleRole = "face" | "hair" | "eye" | "nose" | "mouth" | "jaw" | "neck" | "shoulder" | "torso" | "photo";
export type AvatarParticle = { position: [number, number, number]; size: number; intensity: number; role: AvatarParticleRole };

const bounds = { minX: -1.7, maxX: 1.7, minY: -1.72, maxY: 2.18 };

export function seedFromString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) { h ^= input.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function seededRandom(seed: number): () => number {
  let value = seed;
  return () => {
    value |= 0; value = (value + 0x6d2b79f5) | 0;
    let t = Math.imul(value ^ (value >>> 15), 1 | value);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function classifyPoint(x: number, y: number): AvatarParticleRole | null {
  const head = (x / 0.72) ** 2 + ((y - 0.82) / 0.96) ** 2 <= 1;
  const hair = (x / 1.05) ** 2 + ((y - 1.02) / 1.22) ** 2 <= 1 && y > -0.02 && !(Math.abs(x) < 0.52 && y < 1.55 && y > 0.24);
  const neck = Math.abs(x) < 0.26 && y > -0.7 && y < 0.02;
  const shoulder = y > -1.5 && y < -0.55 && (x / (1.58 + (y + 1.05) * 0.15)) ** 2 + ((y + 1.4) / 0.48) ** 2 <= 1;
  const torso = y > -1.68 && y < -0.92 && Math.abs(x) < 1.08 - Math.abs(y + 1.68) * 0.28;
  if (head) return "face";
  if (hair) return "hair";
  if (neck) return "neck";
  if (shoulder) return "shoulder";
  if (torso) return "torso";
  return null;
}
function depthFor(role: AvatarParticleRole, x: number, y: number, random: () => number): number {
  if (role === "face") {
    const faceDepth = Math.max(0, 1 - (x / 0.75) ** 2 - ((y - 0.76) / 0.94) ** 2);
    return 0.16 + faceDepth * 0.78 + (random() - 0.5) * 0.08;
  }
  if (role === "hair") return -0.18 + (random() - 0.5) * 0.55;
  if (role === "neck") return 0.18 + random() * 0.22;
  if (role === "shoulder") return -0.06 + random() * 0.18;
  if (role === "torso") return -0.12 + random() * 0.16;
  return 0.2 + random() * 0.2;
}
function createParticle(x: number, y: number, role: AvatarParticleRole, random: () => number, intensity = 0.68): AvatarParticle {
  return {
    position: [x, y, depthFor(role, x, y, random)],
    size: role === "face" ? 1.22 : role === "hair" ? 1.15 : role === "photo" ? 1.45 : 1.24,
    intensity, role,
  };
}
function pushCurve(particles: AvatarParticle[], random: () => number, role: AvatarParticleRole, steps: number, repeats: number, fn: (t: number) => [number, number, number?], scatter = 0.01, intensity = 1) {
  for (let i = 0; i < steps; i += 1) {
    const t = i / Math.max(1, steps - 1);
    const [x, y, z] = fn(t);
    for (let r = 0; r < repeats; r += 1) {
      particles.push({
        position: [x + (random() - 0.5) * scatter, y + (random() - 0.5) * scatter, z ?? depthFor(role, x, y, random)],
        size: role === "eye" || role === "mouth" || role === "nose" || role === "jaw" ? 1.28 + random() * 0.58 : 1.75 + random() * 0.72,
        intensity: intensity * (0.78 + random() * 0.22),
        role,
      });
    }
  }
}
function addFaceSurfaceParticles(particles: AvatarParticle[], random: () => number, amount = 1250) {
  for (let i = 0; i < amount; i += 1) {
    const v = random() * 2 - 1;
    const faceWidth = 0.6 * Math.sqrt(Math.max(0, 1 - v * v));
    const x = (random() * 2 - 1) * faceWidth * (0.82 + random() * 0.18);
    const y = 0.78 + v * 0.88;
    const oval = Math.max(0, 1 - (x / 0.66) ** 2 - ((y - 0.78) / 0.92) ** 2);
    const cheekLeft = Math.exp(-(((x + 0.31) / 0.18) ** 2 + ((y - 0.5) / 0.22) ** 2));
    const cheekRight = Math.exp(-(((x - 0.31) / 0.18) ** 2 + ((y - 0.5) / 0.22) ** 2));
    const forehead = Math.exp(-((x / 0.36) ** 2 + ((y - 1.24) / 0.22) ** 2));
    const noseRidge = Math.exp(-((x / 0.055) ** 2 + ((y - 0.58) / 0.42) ** 2));
    const jawGlow = Math.exp(-((Math.abs(x) - 0.34) ** 2 / 0.025 + ((y - 0.2) / 0.18) ** 2));
    const eyeShadow = Math.exp(-(((Math.abs(x) - 0.24) / 0.18) ** 2 + ((y - 0.94) / 0.12) ** 2));
    const z = 0.34 + oval * 0.62 + noseRidge * 0.1 + (random() - 0.5) * 0.05;
    const featureLift = cheekLeft * 0.16 + cheekRight * 0.16 + forehead * 0.14 + noseRidge * 0.2 + jawGlow * 0.1;
    const intensity = Math.max(0.22, 0.32 + oval * 0.3 + featureLift - eyeShadow * 0.12 + random() * 0.18);
    particles.push({ position: [x, y, z], size: 0.9 + random() * 0.8, intensity, role: "face" });
  }
}
function addFacialFeatureParticles(particles: AvatarParticle[], random: () => number) {
  addFaceSurfaceParticles(particles, random);
  pushCurve(particles, random, "eye", 56, 3, (t) => [-0.39 + t * 0.31, 0.94 + Math.sin(t * Math.PI) * 0.03, 1.05], 0.012, 0.92);
  pushCurve(particles, random, "eye", 56, 3, (t) => [0.08 + t * 0.31, 0.94 + Math.sin(t * Math.PI) * 0.03, 1.05], 0.012, 0.92);
  pushCurve(particles, random, "eye", 38, 2, (t) => [-0.38 + t * 0.3, 0.9 - Math.sin(t * Math.PI) * 0.018, 1.04], 0.01, 0.72);
  pushCurve(particles, random, "eye", 38, 2, (t) => [0.08 + t * 0.3, 0.9 - Math.sin(t * Math.PI) * 0.018, 1.04], 0.01, 0.72);
  pushCurve(particles, random, "eye", 44, 2, (t) => [-0.42 + t * 0.36, 1.16 + Math.sin(t * Math.PI) * 0.035, 0.98], 0.012, 0.72);
  pushCurve(particles, random, "eye", 44, 2, (t) => [0.06 + t * 0.36, 1.16 + Math.sin(t * Math.PI) * 0.035, 0.98], 0.012, 0.72);
  pushCurve(particles, random, "nose", 68, 3, (t) => [Math.sin((t - 0.5) * Math.PI) * 0.04, 0.86 - t * 0.54, 1.06 - t * 0.12], 0.01, 0.78);
  pushCurve(particles, random, "nose", 38, 2, (t) => [-0.09 + t * 0.18, 0.34 - Math.sin(t * Math.PI) * 0.045, 0.94], 0.009, 0.62);
  pushCurve(particles, random, "mouth", 58, 3, (t) => [-0.23 + t * 0.46, 0.08 + Math.sin(t * Math.PI) * -0.032, 0.98], 0.01, 0.84);
  pushCurve(particles, random, "mouth", 38, 2, (t) => [-0.16 + t * 0.32, 0.035 + Math.sin(t * Math.PI) * 0.035, 0.95], 0.009, 0.64);
  pushCurve(particles, random, "jaw", 96, 2, (t) => [-0.58 + t * 1.16, 0.27 - Math.sin(t * Math.PI) * 0.31, 0.78], 0.01, 0.68);
  pushCurve(particles, random, "face", 124, 1, (t) => [Math.cos(t * Math.PI * 2) * 0.66, 0.78 + Math.sin(t * Math.PI * 2) * 0.94, 0.35], 0.008, 0.52);
  pushCurve(particles, random, "hair", 116, 2, (t) => [-0.84 + t * 0.6, 1.7 - Math.sin(t * Math.PI) * 1.05, -0.04], 0.018, 0.62);
  pushCurve(particles, random, "hair", 116, 2, (t) => [0.24 + t * 0.6, 1.7 - Math.sin(t * Math.PI) * 1.05, -0.04], 0.018, 0.62);
  pushCurve(particles, random, "shoulder", 104, 2, (t) => [-1.45 + t * 2.9, -1.22 + Math.sin(t * Math.PI) * 0.28, 0.05], 0.02, 0.64);
}

/** Default procedural hologram bust. */
export function generateAvatarParticles(count = 3000, seed = "miganpro"): AvatarParticle[] {
  const random = seededRandom(seedFromString(seed));
  const particles: AvatarParticle[] = [];
  let guard = 0;
  while (particles.length < count && guard < count * 100) {
    guard += 1;
    const x = bounds.minX + random() * (bounds.maxX - bounds.minX);
    const y = bounds.minY + random() * (bounds.maxY - bounds.minY);
    const role = classifyPoint(x, y);
    if (!role) continue;
    const facialBoost =
      Math.abs(y - 0.96) < 0.08 && (Math.abs(x + 0.22) < 0.2 || Math.abs(x - 0.22) < 0.2) ? 0.2
      : Math.abs(y - 0.1) < 0.06 && Math.abs(x) < 0.28 ? 0.18 : 0;
    particles.push(createParticle(x, y, role, random, 0.38 + random() * 0.46 + facialBoost));
  }
  addFacialFeatureParticles(particles, random);
  return particles;
}

/** CLEAN dense photo→particles (no procedural feature curves) — the reference look:
 * thousands of fine dots tracing a REAL face, denser where brighter. Front-facing. */
/** Which face feature a normalized image coord (fx,fy in [0,1]) belongs to — tuned for a
 * centred front-facing portrait. Lets the renderer blink the eyes + open the mouth. */
export function faceRegion(fx: number, fy: number): AvatarParticleRole {
  if (fy > 0.40 && fy < 0.485 && ((fx > 0.35 && fx < 0.47) || (fx > 0.53 && fx < 0.65))) return "eye";
  if (fy > 0.55 && fy < 0.645 && fx > 0.40 && fx < 0.60) return "mouth";
  return "photo";
}

export function samplePhotoToParticles(img: HTMLImageElement, opts: { span?: number; maxPoints?: number; seed?: string } = {}): AvatarParticle[] {
  const span = opts.span ?? 2.7;
  const maxPoints = opts.maxPoints ?? 13000;
  const W = 240; // higher sample res → finer/smoother
  const aspect = img.height && img.width ? img.height / img.width : 1.25;
  const H = Math.max(1, Math.round(W * aspect));
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d", { willReadFrequently: true });
  if (!ctx) return generateAvatarParticles();
  ctx.drawImage(img, 0, 0, W, H);
  const data = ctx.getImageData(0, 0, W, H).data;
  const random = seededRandom(seedFromString(opts.seed ?? "ref"));
  const out: AvatarParticle[] = [];
  const yspan = span * aspect;
  for (let py = 0; py < H; py += 1) {
    for (let px = 0; px < W; px += 1) {
      const i = (py * W + px) * 4;
      const luma = (data[i] + data[i + 1] + data[i + 2]) / 765;
      if (luma < 0.11) continue;
      if (random() > Math.min(0.97, luma * 1.2 + 0.12)) continue; // denser where brighter
      const x = (px / W - 0.5) * span;
      const y = (0.5 - py / H) * yspan + 0.32;
      // PSEUDO-3D depth: a convex face/bust bulge (centre forward, edges recede) + a
      // luma relief (highlights pop forward) → real dimension instead of a flat plane.
      const nx = (px / W - 0.5) * 2;
      const ny = (py / H - 0.42) * 2; // face sits a bit above centre
      const bulge = Math.max(0, 1 - (nx * nx * 0.95 + ny * ny * 0.6));
      const z = bulge * 0.95 + (luma - 0.45) * 0.45 + (random() - 0.5) * 0.05;
      out.push({ position: [x, y, z], size: 0.62 + luma * 1.0, intensity: Math.max(0.28, luma), role: faceRegion(px / W, py / H) });
    }
  }
  if (out.length > maxPoints) { const stride = Math.ceil(out.length / maxPoints); return out.filter((_, i) => i % stride === 0); }
  return out;
}

/** Lineage web — thin connections between nearby particles (the reference's fine line
 * mesh). Returns a flat [x,y,z,x,y,z,...] for LineSegments. Subset-based for perf. */
export function buildLineageWeb(particles: AvatarParticle[], maxNodes = 720, k = 2, maxDist = 0.34): Float32Array {
  const step = Math.max(1, Math.floor(particles.length / maxNodes));
  const nodes: [number, number, number][] = [];
  for (let i = 0; i < particles.length; i += step) nodes.push(particles[i].position);
  const segs: number[] = [];
  const md2 = maxDist * maxDist;
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i];
    const near: [number, number][] = [];
    for (let j = 0; j < nodes.length; j++) {
      if (i === j) continue;
      const b = nodes[j];
      const d = (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
      if (d < md2) near.push([d, j]);
    }
    near.sort((p, q) => p[0] - q[0]);
    for (let n = 0; n < Math.min(k, near.length); n++) {
      const b = nodes[near[n][1]];
      segs.push(a[0], a[1], a[2], b[0], b[1], b[2]);
    }
  }
  return new Float32Array(segs);
}

/** Photo → particles. Accepts a loaded HTMLImageElement (from a dataURL/upload). */
export function generatePhotoAvatarParticlesFromImage(img: HTMLImageElement, name = "photo", count = 3400): AvatarParticle[] {
  const sampleW = 180, sampleH = 230;
  const canvas = document.createElement("canvas");
  canvas.width = sampleW; canvas.height = sampleH;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return generateAvatarParticles();
  const scale = Math.max(sampleW / img.width, sampleH / img.height);
  const drawW = img.width * scale, drawH = img.height * scale;
  ctx.drawImage(img, (sampleW - drawW) / 2, (sampleH - drawH) / 2, drawW, drawH);
  const data = ctx.getImageData(0, 0, sampleW, sampleH).data;
  const random = seededRandom(seedFromString(name));
  const particles: AvatarParticle[] = [];
  for (let py = 0; py < sampleH; py += 3) {
    for (let px = 0; px < sampleW; px += 3) {
      const i = (py * sampleW + px) * 4;
      const luma = (data[i] + data[i + 1] + data[i + 2]) / 765;
      if (luma < 0.16 || random() > Math.min(0.94, luma + 0.2)) continue;
      const x = (px / sampleW - 0.5) * 1.62;
      const y = 1.98 - (py / sampleH) * 3.55;
      particles.push({ position: [x, y, 0.1 + luma * 0.78 + (random() - 0.5) * 0.12], size: 1.45 + luma * 1.1, intensity: Math.max(0.36, luma), role: "photo" });
    }
  }
  addFacialFeatureParticles(particles, random);
  return particles.slice(0, count);
}
