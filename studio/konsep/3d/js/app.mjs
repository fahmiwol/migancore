import * as THREE from "../vendor/three.module.min.js";
import { muatData, pasangCapSumber } from "./data.mjs";
import { buatDunia } from "./dunia.mjs";
import { buatPemain, buatInput } from "./pemain.mjs";
import { buatKamera } from "./kamera.mjs";
import { buatInteraksi } from "./interaksi.mjs";
import { buatMenuCepat } from "./menu-cepat.mjs";
import { bangunModeBaca, buatPanel } from "./panel-modul.mjs";
import { buatHud, updateMeter } from "./hud.mjs";
import { MODUL } from "./peta-modul.mjs";

const STEP = 1 / 60;
const MAX_STEPS = 5;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const lowHardware = (navigator.deviceMemory && navigator.deviceMemory <= 4) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);
let kualitas = lowHardware ? "rendah otomatis" : "standar";
let modeBaca = false;
let previewPikir = false;

const app = document.querySelector("#app");
const canvas = document.querySelector("#dunia");
const readView = document.querySelector("#mode-baca-isi");
const message = document.querySelector("#pesan");
let messageTimer = 0;

function beriPesan(text) {
  message.textContent = text;
  message.classList.add("tampil");
  clearTimeout(messageTimer);
  messageTimer = setTimeout(()=>message.classList.remove("tampil"), 2600);
}
window.addEventListener("kandungan:pesan", (event)=>beriPesan(event.detail));
window.addEventListener("kandungan:pikir", (event)=>{ previewPikir = event.detail; });

function buatRenderer() {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !lowHardware, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, lowHardware ? 1 : 1.5));
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.82;
  renderer.shadowMap.enabled = !lowHardware;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.info.autoReset = true;
  return renderer;
}

async function muatKalibrasiCahaya() {
  const response = await fetch("tools/kalibrasi-cahaya.json", { cache: "no-store" });
  if (!response.ok) throw new Error(`Kalibrasi cahaya tidak dapat dibaca (${response.status})`);
  return response.json();
}

async function start() {
  const [data, kalibrasiCahaya] = await Promise.all([muatData(), muatKalibrasiCahaya()]);
  const renderer = buatRenderer();
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.1, 260);
  const dunia = buatDunia(THREE, scene, { kualitasRendah: lowHardware, kalibrasiCahaya });
  const runtimeMetrics = { light: kalibrasiCahaya, phase: "kandungan-hening", fixedStep: STEP, maxSteps: MAX_STEPS, sourceCommit: data._commit };
  window.__KANDUNGAN_METRICS = runtimeMetrics;
  const pemain = buatPemain(THREE, scene, dunia.tinggiTanah, dunia.colliders);
  const input = buatInput();
  const kamera = buatKamera(THREE, camera, canvas);
  kamera.update(pemain.renderPosition, STEP, true);

  let panel;
  let quickMenu;
  let hud;
  const openModule = (id) => panel.open(id);
  panel = buatPanel(data, { onOpen: openModule });
  quickMenu = buatMenuCepat(openModule);
  hud = buatHud(data, { onOpen: openModule, onTravel: fastTravel, onReadMode: setModeBaca });
  bangunModeBaca(data, openModule);

  const interaction = buatInteraksi(THREE, { camera, canvas, clickables: dunia.clickables, pemain, dunia, onOpen: openModule, onNearby: hud.updateNearby });

  function setModeBaca(force) {
    modeBaca = typeof force === "boolean" ? force : !modeBaca;
    app.dataset.mode = modeBaca ? "baca" : "dunia";
    readView.hidden = !modeBaca;
    canvas.hidden = modeBaca;
    document.querySelector(".selubung-dunia").hidden = modeBaca;
    document.querySelector(".hud-kiri").hidden = modeBaca;
    document.querySelector(".hud-kanan").hidden = modeBaca;
    document.querySelector(".tombol-menu").hidden = modeBaca;
    document.querySelector(".meter-kinerja").hidden = modeBaca;
    hud.setReadMode(modeBaca);
    if (modeBaca) quickMenu.close();
  }

  async function fastTravel(item) {
    if (modeBaca) setModeBaca(false);
    const portal = document.querySelector("#transisi-portal");
    const duration = reducedMotion ? 0 : 330;
    portal.classList.add("aktif");
    if (duration) await new Promise((resolve)=>setTimeout(resolve, duration));
    const x = item.id === "beranda" ? 0 : item.posisi[0] * 0.82;
    const z = item.id === "beranda" ? -8 : item.posisi[2] * 0.82;
    pemain.teleport(x, z);
    kamera.update(pemain.renderPosition, STEP, true);
    interaction.update();
    if (duration) await new Promise((resolve)=>setTimeout(resolve, 360));
    portal.classList.remove("aktif");
    beriPesan(`Tiba di ${item.wilayah}`);
  }

  document.querySelector("[data-paksa-baca]")?.addEventListener("click",()=>setModeBaca(true));
  window.addEventListener("resize", () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight, false);
  });

  let accumulator = 0;
  let last = performance.now();
  let frames = 0;
  let frameWindowStart = last;
  let fps = 60;
  let meterAt = 0;
  let faseKini = "";
  let lowFpsSeconds = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const delta = Math.min((now - last) / 1000, 0.25);
    last = now;
    if (modeBaca || document.hidden) return;
    accumulator += delta;
    let steps = 0;
    const canMove = !panel.terbuka && !quickMenu.terbuka;
    while (accumulator + 1e-9 >= STEP && steps < MAX_STEPS) {
      if (canMove) pemain.step(input, STEP, kamera.yaw);
      accumulator -= STEP;
      steps += 1;
    }
    if (steps === MAX_STEPS && accumulator >= STEP) accumulator = 0;
    pemain.render(accumulator / STEP, now / 1000, reducedMotion);
    kamera.update(pemain.renderPosition, delta);
    const fase = dunia.update(now / 1000, reducedMotion);
    if (fase.id !== faseKini) {
      faseKini = fase.id;
      runtimeMetrics.phase = faseKini;
      document.querySelector("#fase-cahaya").textContent = fase.label;
    }
    const embryo = scene.getObjectByName("embrio-inti");
    // Terang embrio mengikuti kriteria kelahiran BERLAKU (28 Sep, keputusan Fahmi): Gerbang-S1 di data.kelahiran.s1.
    // EMBRIO bernapas pelan (diam bila reduced-motion) · LAHIR terang · GUGUR redup. Tanpa s1: kriteria lama A4-BARU.
    if (embryo?.material) {
      const s1 = data.kelahiran?.s1?.tingkat;
      const tingkat = s1 ?? data.kelahiran?.sistem?.tingkat;
      const napas = reducedMotion ? 0.7 : 0.7 + 0.15 * Math.sin((now / 6000) * Math.PI * 2);
      const dasar = tingkat === "LAHIR" ? 1.2 : tingkat === "GUGUR" ? 0.2 : tingkat === "EMBRIO" || tingkat === "BIBIT" ? napas : 0.45;
      embryo.material.emissiveIntensity = previewPikir ? 1.8 : dasar;
    }
    interaction.update();
    hud.updatePosition(pemain.position);
    document.querySelector("#arah-kompas").textContent = kamera.arahKompas;
    renderer.render(scene, camera);
    frames += 1;
    if (now - frameWindowStart >= 1000) {
      fps = (frames * 1000) / (now - frameWindowStart);
      if (document.hasFocus() && fps > 12 && fps < 45) lowFpsSeconds += 1;
      else lowFpsSeconds = 0;
      frames = 0;
      frameWindowStart = now;
    }
    if (now - meterAt > 500) {
      updateMeter(renderer, fps, kualitas);
      meterAt = now;
    }
    if (!lowHardware && lowFpsSeconds >= 4 && kualitas === "standar") {
      renderer.setPixelRatio(1);
      renderer.shadowMap.enabled = false;
      kualitas = "diturunkan · FPS <45";
      beriPesan("Kualitas adaptif diturunkan untuk menjaga kelancaran.");
    }
  }
  interaction.update();
  requestAnimationFrame(frame);
  const initial = location.hash.slice(1);
  if (initial && initial !== "dunia" && document.querySelector(`[data-nav="${CSS.escape(initial)}"]`)) openModule(initial);
}

async function mulaiModeBacaTanpaWebGL(error) {
  const data = await muatData();
  let panel;
  const openModule = (id) => panel.open(id);
  panel = buatPanel(data, { onOpen: openModule });
  bangunModeBaca(data, openModule);
  const nav = document.querySelector("#navigasi-utama");
  nav.innerHTML = MODUL.map((item)=>`<button class="nav-modul" type="button" data-nav="${item.id}">${item.label}</button>`).join("");
  nav.querySelectorAll("[data-nav]").forEach((button)=>button.addEventListener("click",()=>openModule(button.dataset.nav)));
  pasangCapSumber(document.querySelector("#sumber-ringkas"), data);
  document.querySelector("#mode-baca").setAttribute("aria-pressed", "true");
  document.querySelector("#mode-baca").lastChild.textContent = " Mode Baca";
  document.querySelectorAll("[data-kembali-dunia]").forEach((button) => { button.hidden = true; });
  app.dataset.mode = "baca";
  readView.hidden = false;
  canvas.hidden = true;
  document.querySelector(".selubung-dunia").hidden = true;
  document.querySelector(".hud-kiri").hidden = true;
  document.querySelector(".hud-kanan").hidden = true;
  document.querySelector(".tombol-menu").hidden = true;
  document.querySelector(".meter-kinerja").hidden = true;
  const note = readView.querySelector(".kepala-baca p");
  note.textContent = `WebGL tidak tersedia (${error.message}). Delapan belas modul tetap dapat dibaca dari data yang sama.`;
}

start().catch(async (error) => {
  console.error(error);
  try {
    await mulaiModeBacaTanpaWebGL(error);
  } catch (fallbackError) {
    console.error(fallbackError);
    document.querySelector("#galat-webgl").hidden = false;
    document.querySelector("#galat-webgl p").textContent = `Dunia 3D dan Mode Baca tidak dapat dimuat: ${fallbackError.message}.`;
  }
});
