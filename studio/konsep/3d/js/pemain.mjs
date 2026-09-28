export function buatInput() {
  const aktif = new Set();
  const tombolGerak = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "ShiftLeft", "ShiftRight"]);
  const isForm = (target) => target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target?.isContentEditable;

  function down(event) {
    if (isForm(event.target)) return;
    if (tombolGerak.has(event.code)) {
      aktif.add(event.code);
      event.preventDefault();
    }
  }
  function up(event) { aktif.delete(event.code); }
  function reset() { aktif.clear(); }
  window.addEventListener("keydown", down);
  window.addEventListener("keyup", up);
  window.addEventListener("blur", reset);
  document.addEventListener("visibilitychange", () => { if (document.hidden) reset(); });

  return {
    aktif,
    arah() {
      const x = Number(aktif.has("KeyD") || aktif.has("ArrowRight")) - Number(aktif.has("KeyA") || aktif.has("ArrowLeft"));
      const z = Number(aktif.has("KeyS") || aktif.has("ArrowDown")) - Number(aktif.has("KeyW") || aktif.has("ArrowUp"));
      return { x, z, lari: aktif.has("ShiftLeft") || aktif.has("ShiftRight") };
    },
    dispose() { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); window.removeEventListener("blur", reset); },
  };
}

function bertabrakan(x, z, colliders, radius = 0.55) {
  if (Math.hypot(x, z) > 71.5 - radius) return true;
  return colliders.some((c) => c.type === "circle" && Math.hypot(x - c.x, z - c.z) < radius + c.radius);
}

export function buatPemain(THREE, scene, tinggiTanah, colliders) {
  const group = new THREE.Group();
  group.name = "peziarah-utama";
  const gelap = new THREE.MeshLambertMaterial({ color: 0x172a24, flatShading: true });
  const kain = new THREE.MeshLambertMaterial({ color: 0x315e49, flatShading: true });
  const emas = new THREE.MeshLambertMaterial({ color: 0xff8a24, emissive: 0x512300, emissiveIntensity: 0.25, flatShading: true });
  const jubah = new THREE.Mesh(new THREE.ConeGeometry(0.72, 1.8, 7), kain);
  jubah.position.y = 0.9;
  const kepala = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8), gelap);
  kepala.position.y = 1.95;
  const lingkar = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.04, 5, 12), emas);
  lingkar.position.set(0, 1.12, -0.66);
  const arah = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.45, 4), emas);
  arah.position.set(0, 1.35, -0.58);
  arah.rotation.x = -Math.PI / 2;
  group.add(jubah, kepala, lingkar, arah);
  group.position.set(0, tinggiTanah(0, -8), -8);
  group.traverse((object) => { if (object.isMesh) object.castShadow = true; });
  scene.add(group);

  const simulasi = group.position.clone();
  const sebelumnya = simulasi.clone();
  const renderPos = simulasi.clone();
  let waktuGerak = 0;
  let jarak = 0;

  function step(input, dt, cameraYaw) {
    sebelumnya.copy(simulasi);
    const arahInput = input.arah();
    const panjang = Math.hypot(arahInput.x, arahInput.z);
    if (!panjang) return;
    const localX = arahInput.x / panjang;
    const localZ = arahInput.z / panjang;
    const sin = Math.sin(cameraYaw);
    const cos = Math.cos(cameraYaw);
    const duniaX = localX * cos - localZ * sin;
    const duniaZ = localX * sin + localZ * cos;
    const speed = arahInput.lari ? 9 : 5.4;
    const dx = duniaX * speed * dt;
    const dz = duniaZ * speed * dt;
    const oldX = simulasi.x;
    const oldZ = simulasi.z;

    if (!bertabrakan(simulasi.x + dx, simulasi.z, colliders)) simulasi.x += dx;
    if (!bertabrakan(simulasi.x, simulasi.z + dz, colliders)) simulasi.z += dz;
    simulasi.y = tinggiTanah(simulasi.x, simulasi.z);
    jarak += Math.hypot(simulasi.x - oldX, simulasi.z - oldZ);
    waktuGerak += dt;
    if (Math.abs(dx) + Math.abs(dz) > 1e-7) group.rotation.y = Math.atan2(duniaX, duniaZ);
  }

  function render(alpha, time, reducedMotion = false) {
    renderPos.lerpVectors(sebelumnya, group.position, alpha);
    group.position.copy(renderPos);
    if (!reducedMotion) {
      jubah.position.y = 0.9 + Math.abs(Math.sin(time * 7)) * 0.045;
      lingkar.rotation.z = Math.sin(time * 2) * 0.08;
    }
  }

  function teleport(x, z) {
    simulasi.set(x, tinggiTanah(x, z), z);
    sebelumnya.copy(simulasi);
    renderPos.copy(simulasi);
    group.position.copy(simulasi);
  }

  return { group, step, render, teleport, get position() { return simulasi; }, get renderPosition() { return group.position; }, metrik: () => ({ jarak, waktuGerak }) };
}
