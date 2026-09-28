/**
 * particleEngine.ts
 * Mengubah foto menjadi "dot-dot" point cloud + generator avatar default.
 * Semua jalan client-side (Canvas 2D), tanpa API / server.
 */

export interface Particle {
  bx: number; // base x (target position di canvas)
  by: number; // base y
  x: number; // current x
  y: number; // current y
  ox: number; // origin x (untuk animasi assemble dari acak)
  oy: number; // origin y
  lum: number; // luminance sumber 0..1 -> dipakai untuk brightness titik
  ph: number; // phase drift
  sp: number; // speed drift
  amp: number; // amplitudo drift
  size: number; // ukuran titik
}

export interface SampleOptions {
  width: number; // resolusi canvas internal
  height: number;
  gap: number; // jarak sampling (kecil = padat = lebih banyak titik)
  threshold: number; // 0..1, buang pixel lebih gelap dari ini (hapus background gelap)
  mask: boolean; // crop elips ke area kepala/badan
  maxParticles: number; // batas demi performa
}

const luminance = (r: number, g: number, b: number) =>
  (0.299 * r + 0.587 * g + 0.114 * b) / 255;

function makeParticle(x: number, y: number, lum: number, w: number, h: number): Particle {
  const cx = w / 2;
  const cy = h / 2;
  return {
    bx: x,
    by: y,
    x,
    y,
    ox: cx + (Math.random() * 2 - 1) * w,
    oy: cy + (Math.random() * 2 - 1) * h,
    lum,
    ph: Math.random() * Math.PI * 2,
    sp: 0.4 + Math.random() * 0.8,
    amp: 0.6 + Math.random() * 1.2,
    size: 0.7 + lum * 1.4,
  };
}

/** Foto -> partikel. Pixel terang dipertahankan, gelap (background) dibuang. */
export function sampleImageToParticles(
  img: HTMLImageElement,
  opts: SampleOptions
): Particle[] {
  const { width, height, threshold, mask, maxParticles } = opts;
  let gap = opts.gap;

  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  const ctx = c.getContext("2d");
  if (!ctx) return [];

  // cover-fit (isi penuh canvas, jaga aspect ratio)
  const ar = img.width / img.height;
  const car = width / height;
  let dw: number, dh: number, dx: number, dy: number;
  if (ar > car) {
    dh = height;
    dw = height * ar;
    dx = (width - dw) / 2;
    dy = 0;
  } else {
    dw = width;
    dh = width / ar;
    dx = 0;
    dy = (height - dh) / 2;
  }
  ctx.drawImage(img, dx, dy, dw, dh);
  const data = ctx.getImageData(0, 0, width, height).data;

  const sample = (step: number): Particle[] => {
    const parts: Particle[] = [];
    const cx = width / 2;
    const cy = height * 0.46;
    const rx = width * 0.46;
    const ry = height * 0.5;
    for (let y = 0; y < height; y += step) {
      for (let x = 0; x < width; x += step) {
        const i = (y * width + x) * 4;
        if (data[i + 3] < 10) continue;
        const lum = luminance(data[i], data[i + 1], data[i + 2]);
        if (lum < threshold) continue;
        if (mask) {
          const m =
            ((x - cx) ** 2) / (rx * rx) + ((y - cy) ** 2) / (ry * ry);
          if (m > 1) continue;
          if (m > 0.78 && Math.random() < (m - 0.78) / 0.22) continue; // soft edge
        }
        parts.push(makeParticle(x, y, lum, width, height));
      }
    }
    return parts;
  };

  let parts = sample(gap);
  // safeguard performa: kalau kepadatan kebanyakan, naikkan gap
  while (parts.length > maxParticles && gap < 16) {
    gap += 1;
    parts = sample(gap);
  }
  return parts;
}

/** Avatar default (silhouette perempuan) saat belum ada foto di-upload. */
export function buildDefaultFace(width: number, height: number): Particle[] {
  const cx = width / 2;
  const pts: Particle[] = [];

  const headCx = cx;
  const headCy = height * 0.36;
  const hrx = width * 0.16;
  const hry = height * 0.16;
  const hairCx = cx;
  const hairCy = height * 0.33;
  const harx = width * 0.275;
  const hary = height * 0.24;

  const inEllipse = (
    x: number,
    y: number,
    ex: number,
    ey: number,
    rx: number,
    ry: number
  ) => ((x - ex) ** 2) / (rx * rx) + ((y - ey) ** 2) / (ry * ry) <= 1;

  const shoulderHalf = (y: number) => {
    const start = height * 0.58;
    if (y < start) return 0;
    const k = (y - start) / (height * 0.36);
    return Math.min(width * 0.08 + k * width * 0.42, width * 0.4);
  };

  const push = (x: number, y: number, lum: number) =>
    pts.push(makeParticle(x, y, lum, width, height));

  // hair halo
  for (let i = 0; i < 520; i++) {
    const x = hairCx + (Math.random() * 2 - 1) * harx;
    const y = hairCy + (Math.random() * 2 - 1) * hary;
    if (
      inEllipse(x, y, hairCx, hairCy, harx, hary) &&
      !inEllipse(x, y, headCx, headCy, hrx * 0.92, hry * 0.92) &&
      y < height * 0.56
    )
      push(x, y, 0.35);
  }
  // face fill
  for (let i = 0; i < 620; i++) {
    const x = headCx + (Math.random() * 2 - 1) * hrx;
    const y = headCy + (Math.random() * 2 - 1) * hry;
    if (inEllipse(x, y, headCx, headCy, hrx, hry)) push(x, y, 0.52);
  }
  // neck
  for (let i = 0; i < 90; i++) {
    const y = height * 0.46 + Math.random() * height * 0.08;
    const hw = width * 0.055 - (y - height * 0.46) * 0.06;
    push(cx + (Math.random() * 2 - 1) * hw, y, 0.48);
  }
  // shoulders / torso
  for (let i = 0; i < 560; i++) {
    const y = height * 0.54 + Math.random() * height * 0.36;
    const hw = shoulderHalf(y);
    const x = cx + (Math.random() * 2 - 1) * hw;
    if (Math.abs(x - cx) <= hw) push(x, y, 0.46);
  }
  // facial features (bright)
  const eye = (ex: number, ey: number) => {
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2;
      const rr = Math.random() * width * 0.02;
      push(ex + Math.cos(a) * rr * 1.4, ey + Math.sin(a) * rr * 0.7, 1);
    }
  };
  eye(cx - width * 0.06, height * 0.342);
  eye(cx + width * 0.06, height * 0.342);
  for (let i = 0; i < 18; i++)
    push(cx - width * 0.092 + i * width * 0.0032, height * 0.318, 0.95);
  for (let i = 0; i < 18; i++)
    push(cx + width * 0.034 + i * width * 0.0032, height * 0.318, 0.95);
  for (let i = 0; i < 14; i++)
    push(cx + (Math.random() - 0.5) * width * 0.008, height * 0.36 + i * 3, 0.9);
  for (let i = 0; i < 22; i++)
    push(
      cx - width * 0.045 + i * width * 0.004,
      height * 0.43 + Math.sin((i / 22) * Math.PI) * 5,
      0.92
    );

  return pts;
}

export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
