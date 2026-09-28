import { FASE_CAHAYA } from "../js/siklus-cahaya.mjs";

export const TITIK_TANAH = Object.freeze([
  [-25, -16], [-20, 11], [-18, 25], [-13, -22], [-11, 16],
  [-6, -17], [-4, 24], [2, -21], [5, 18], [10, -14],
  [13, 23], [17, -20], [20, 9], [24, -9], [27, 18],
]);

const CHANNEL = { r: 0, g: 1, b: 2 };
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

export function buatKameraUkur(THREE, aspect = 16 / 9) {
  const camera = new THREE.PerspectiveCamera(48, aspect, 0.1, 260);
  camera.position.set(0, 48, 58);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return camera;
}

export function cariLampuTakTerkendali(scene, controlledLights) {
  const controlled = new Set(controlledLights);
  const found = [];
  scene.traverse((object) => {
    if (object.isLight && !controlled.has(object)) found.push({ name: object.name || object.type, type: object.type });
  });
  return found;
}

function posisiPiksel(THREE, camera, renderer, tinggiTanah, titik) {
  const [x, z] = titik;
  const projected = new THREE.Vector3(x, tinggiTanah(x, z) - 0.08, z).project(camera);
  if (Math.abs(projected.x) > 1 || Math.abs(projected.y) > 1 || projected.z < -1 || projected.z > 1) return null;
  const gl = renderer.getContext();
  return {
    x: Math.round((projected.x * 0.5 + 0.5) * (gl.drawingBufferWidth - 1)),
    y: Math.round((projected.y * 0.5 + 0.5) * (gl.drawingBufferHeight - 1)),
  };
}

function pindaiBingkai(renderer) {
  const gl = renderer.getContext();
  const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
  gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  let maxChannel = 0;
  let clippedChannels = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    for (let channel = 0; channel < 3; channel += 1) {
      maxChannel = Math.max(maxChannel, pixels[i + channel]);
      if (pixels[i + channel] >= 250) clippedChannels += 1;
    }
  }
  return { maxChannel, clippedChannels, framePixels: pixels.length / 4 };
}

export function ukurPikselDunia(THREE, { renderer, scene, camera, tinggiTanah, scanFrame = false }) {
  renderer.render(scene, camera);
  const gl = renderer.getContext();
  const pixel = new Uint8Array(4);
  const samples = [];
  for (const titik of TITIK_TANAH) {
    const posisi = posisiPiksel(THREE, camera, renderer, tinggiTanah, titik);
    if (!posisi) continue;
    gl.readPixels(posisi.x, posisi.y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    samples.push([pixel[0], pixel[1], pixel[2]]);
  }
  if (samples.length < 10) throw new Error(`Titik tanah terlihat hanya ${samples.length}; minimal 10`);
  const hasil = {
    sampleCount: samples.length,
    medianRgb: [0, 1, 2].map((channel) => median(samples.map((rgb) => rgb[channel]))),
  };
  return scanFrame ? { ...hasil, ...pindaiBingkai(renderer) } : hasil;
}

function ukurCahayaStatisAwal(THREE, { renderer, scene, camera, dunia }) {
  dunia.sun.color.set(0xffd69a);
  dunia.sun.intensity = 2.15;
  dunia.hemi.color.set(0xb7d8da);
  dunia.hemi.groundColor.set(0x263b2a);
  dunia.hemi.intensity = 1.45;
  scene.background.set(0x9db8af);
  scene.fog.color.set(0x9db8af);
  return ukurPikselDunia(THREE, { renderer, scene, camera, tinggiTanah: dunia.tinggiTanah, scanFrame: true });
}

export function kalibrasiSemuaFase(THREE, { renderer, scene, camera, dunia, iterations = 13 }) {
  const uncontrolledLights = cariLampuTakTerkendali(scene, dunia.cahaya.controlledLights);
  if (uncontrolledLights.length) throw new Error(`Lampu tak dikendalikan: ${uncontrolledLights.map((x) => x.name).join(", ")}`);
  const baselineStatic = ukurCahayaStatisAwal(THREE, { renderer, scene, camera, dunia });
  const phases = [];
  for (const fase of FASE_CAHAYA) {
    const channelIndex = CHANNEL[fase.target.channel];
    let low = 0.02;
    let high = 12;
    let best = null;
    for (let i = 0; i < iterations; i += 1) {
      const scale = (low + high) / 2;
      dunia.cahaya.terapkanFase(fase, scale);
      const measured = ukurPikselDunia(THREE, { renderer, scene, camera, tinggiTanah: dunia.tinggiTanah });
      const actual = measured.medianRgb[channelIndex];
      const candidate = { scale, actual, measured };
      if (!best || Math.abs(actual - fase.target.value) < Math.abs(best.actual - fase.target.value)) best = candidate;
      if (actual < fase.target.value) low = scale;
      else high = scale;
    }
    dunia.cahaya.terapkanFase(fase, best.scale);
    const measured = ukurPikselDunia(THREE, { renderer, scene, camera, tinggiTanah: dunia.tinggiTanah, scanFrame: true });
    const actual = measured.medianRgb[channelIndex];
    if (Math.abs(actual - fase.target.value) > fase.target.tolerance) throw new Error(`${fase.id}: kanal ${fase.target.channel} ${actual}, target ${fase.target.value}±${fase.target.tolerance}`);
    if (measured.maxChannel >= 250) throw new Error(`${fase.id}: kanal bingkai mencapai ${measured.maxChannel}; detail terpotong`);
    phases.push({ id: fase.id, target: fase.target, scale: +best.scale.toFixed(6), ...measured });
  }
  dunia.cahaya.terapkanFase(FASE_CAHAYA[0], phases[0].scale);
  return {
    _alat: "tools/ukur-piksel.mjs",
    _metode: "13 langkah pencarian biner; median 15 titik tanah terproyeksi; pemindaian RGB seluruh bingkai",
    samplePoints: TITIK_TANAH.length,
    uncontrolledLights,
    baselineStatic,
    phases,
  };
}
