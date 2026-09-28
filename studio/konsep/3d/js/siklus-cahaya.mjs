export const DURASI_SIKLUS_CAHAYA = 160;

export const FASE_CAHAYA = Object.freeze([
  { id: "kandungan-hening", label: "Kandungan hening", mulai: 0, sun: "#b9a18c", sky: "#718887", ground: "#1d2b25", atmosphere: "#52645e", sunIntensity: 1.1, hemiIntensity: 0.82, target: { channel: "g", value: 68, tolerance: 2 } },
  { id: "pijar-pertama", label: "Pijar pertama", mulai: 42, sun: "#d9a06b", sky: "#bf8461", ground: "#302019", atmosphere: "#725748", sunIntensity: 1.25, hemiIntensity: 0.76, target: { channel: "r", value: 88, tolerance: 2 } },
  { id: "kabut-magrib", label: "Kabut magrib", mulai: 82, sun: "#a96c72", sky: "#8a5b78", ground: "#2d1b29", atmosphere: "#514153", sunIntensity: 0.9, hemiIntensity: 0.72, target: { channel: "r", value: 62, tolerance: 2 } },
  { id: "malam-dalam", label: "Malam dalam", mulai: 122, sun: "#71819b", sky: "#46566d", ground: "#141a22", atmosphere: "#29333f", sunIntensity: 0.58, hemiIntensity: 0.55, target: { channel: "b", value: 40, tolerance: 2 } },
]);

function lerp(a, b, t) { return a + (b - a) * t; }
function halus(t) { return t * t * (3 - 2 * t); }

export function fasePadaWaktu(waktu) {
  const t = ((waktu % DURASI_SIKLUS_CAHAYA) + DURASI_SIKLUS_CAHAYA) % DURASI_SIKLUS_CAHAYA;
  const index = FASE_CAHAYA.findLastIndex((fase) => fase.mulai <= t);
  const a = FASE_CAHAYA[Math.max(0, index)];
  const b = FASE_CAHAYA[(Math.max(0, index) + 1) % FASE_CAHAYA.length];
  const akhir = b.mulai > a.mulai ? b.mulai : DURASI_SIKLUS_CAHAYA;
  return { a, b, t: halus((t - a.mulai) / (akhir - a.mulai)) };
}

export function buatPengendaliCahaya(THREE, scene, { kualitasRendah = false, kalibrasi = null } = {}) {
  const sun = new THREE.DirectionalLight(FASE_CAHAYA[0].sun, 0);
  sun.position.set(-34, 58, 23);
  sun.castShadow = !kualitasRendah;
  sun.shadow.mapSize.set(kualitasRendah ? 512 : 1024, kualitasRendah ? 512 : 1024);
  Object.assign(sun.shadow.camera, { left: -50, right: 50, top: 50, bottom: -50, near: 5, far: 130 });
  sun.shadow.normalBias = 0.035;
  const hemi = new THREE.HemisphereLight(FASE_CAHAYA[0].sky, FASE_CAHAYA[0].ground, 0);
  scene.add(sun, hemi);

  const scales = new Map(FASE_CAHAYA.map((fase) => [fase.id, 1]));
  function gunakanKalibrasi(data) {
    for (const hasil of data?.phases ?? []) {
      if (Number.isFinite(hasil.scale)) scales.set(hasil.id, hasil.scale);
    }
  }
  gunakanKalibrasi(kalibrasi);

  function setAtmosphere(hex) {
    scene.background.set(hex);
    scene.fog.color.set(hex);
  }

  function terapkanFase(fase, scale = scales.get(fase.id) ?? 1) {
    sun.color.set(fase.sun);
    sun.intensity = fase.sunIntensity * scale;
    hemi.color.set(fase.sky);
    hemi.groundColor.set(fase.ground);
    hemi.intensity = fase.hemiIntensity * scale;
    setAtmosphere(fase.atmosphere);
    return fase;
  }

  const warna = new THREE.Color();
  function campurWarna(a, b, t) {
    warna.set(a).lerp(new THREE.Color(b), t);
    return warna;
  }

  function update(waktu, reducedMotion = false) {
    if (reducedMotion) return terapkanFase(FASE_CAHAYA[0]);
    const state = fasePadaWaktu(waktu);
    const scaleA = scales.get(state.a.id) ?? 1;
    const scaleB = scales.get(state.b.id) ?? 1;
    sun.color.copy(campurWarna(state.a.sun, state.b.sun, state.t));
    sun.intensity = lerp(state.a.sunIntensity * scaleA, state.b.sunIntensity * scaleB, state.t);
    hemi.color.copy(campurWarna(state.a.sky, state.b.sky, state.t));
    hemi.groundColor.copy(campurWarna(state.a.ground, state.b.ground, state.t));
    hemi.intensity = lerp(state.a.hemiIntensity * scaleA, state.b.hemiIntensity * scaleB, state.t);
    scene.background.copy(campurWarna(state.a.atmosphere, state.b.atmosphere, state.t));
    scene.fog.color.copy(scene.background);
    return state.t < 0.5 ? state.a : state.b;
  }

  terapkanFase(FASE_CAHAYA[0]);
  return { sun, hemi, controlledLights: [sun, hemi], scales, update, terapkanFase, gunakanKalibrasi };
}
