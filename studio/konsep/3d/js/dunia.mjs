import { acakTetap, buatCincinGeometry, buatKristalGeometry, buatPedangGeometry, buatTanahGeometry, tinggiTanah } from "./bentuk.mjs";
import { MODUL, PORTAL } from "./peta-modul.mjs";
import { buatPengendaliCahaya } from "./siklus-cahaya.mjs";

const WARNA = {
  batu: 0x59645e,
  batuGelap: 0x2c3833,
  lumut: 0x496b43,
  hijau: 0x49b985,
  sian: 0x63aeb5,
  oranye: 0xd9823d,
  emas: 0xd9bd59,
  tanah: 0x35553e,
  air: 0x176b70,
};

function bahan(THREE, color, options = {}) {
  return new THREE.MeshLambertMaterial({ color, flatShading: true, ...options });
}

function mesh(THREE, geometry, material, position = [0, 0, 0]) {
  const object = new THREE.Mesh(geometry, material);
  object.position.set(...position);
  return object;
}

function tempatkan(group, item) {
  const [x, , z] = item.posisi;
  group.position.set(x, tinggiTanah(x, z), z);
  group.userData.modul = item.id;
  group.userData.wilayah = item.wilayah;
  group.userData.landmark = item.landmark;
  return group;
}

function instansikan(THREE, geometry, material, entries) {
  const instance = new THREE.InstancedMesh(geometry, material, entries.length);
  const dummy = new THREE.Object3D();
  entries.forEach((entry, index) => {
    dummy.position.set(...(entry.position ?? [0, 0, 0]));
    dummy.rotation.set(...(entry.rotation ?? [0, 0, 0]));
    dummy.scale.set(...(entry.scale ?? [1, 1, 1]));
    dummy.updateMatrix();
    instance.setMatrixAt(index, dummy.matrix);
    instance.setColorAt(index, new THREE.Color(entry.color));
  });
  instance.instanceMatrix.needsUpdate = true;
  if (instance.instanceColor) instance.instanceColor.needsUpdate = true;
  instance.frustumCulled = false;
  return instance;
}

function buatEmbrio(THREE, material) {
  const group = new THREE.Group();
  const kaca = new THREE.MeshPhysicalMaterial({ color: WARNA.sian, roughness: 0.18, metalness: 0, transparent: true, opacity: 0.24, transmission: 0.25, depthWrite: false });
  const bola = mesh(THREE, new THREE.IcosahedronGeometry(2.45, 2), kaca, [0, 3.8, 0]);
  bola.name = "embrio-kaca";
  const inti = mesh(THREE, new THREE.IcosahedronGeometry(0.7, 1), material.cahaya, [0, 3.75, 0]);
  inti.scale.set(0.72, 1.15, 0.68);
  inti.name = "embrio-inti";
  group.add(bola, inti);
  for (let i = 0; i < 4; i += 1) {
    const akar = mesh(THREE, new THREE.TorusKnotGeometry(2.65 + i * 0.08, 0.12, 46, 5, 2, 3), material.akar, [0, 3.8, 0]);
    akar.rotation.set(i * 0.68, i * 0.41, i * 0.82);
    akar.scale.y = 1.05;
    group.add(akar);
  }
  const alas = mesh(THREE, new THREE.CylinderGeometry(3.8, 4.6, 0.8, 10), material.batu, [0, 0.35, 0]);
  group.add(alas);
  group.userData.animasi = { bola, inti };
  return group;
}

function buatGerbangPatah(THREE, material) {
  const group = new THREE.Group();
  for (const sisi of [-1, 1]) {
    const pilar = mesh(THREE, new THREE.BoxGeometry(1.7, 7, 1.9), material.batu, [sisi * 4.2, 3.5, 0]);
    pilar.rotation.z = sisi * 0.1;
    const sayap = mesh(THREE, new THREE.BoxGeometry(3.8, 0.75, 1.1), material.batuGelap, [sisi * 5.5, 5.5, 0]);
    sayap.rotation.z = sisi * -0.28;
    const lengkung = mesh(THREE, new THREE.TorusGeometry(4.15, 0.85, 6, 22, Math.PI * 0.74), material.batu, [sisi * 0.2, 6.4, 0]);
    lengkung.rotation.z = sisi < 0 ? Math.PI * 0.63 : -Math.PI * 0.37;
    group.add(pilar, sayap, lengkung);
  }
  const kristal = mesh(THREE, buatKristalGeometry(THREE, 1.45), material.kristal, [0, 5.2, 0]);
  kristal.name = "kristal-gerbang";
  group.add(kristal);
  group.userData.animasi = { kristal };
  return group;
}

function buatObelisk(THREE, material) {
  const group = new THREE.Group();
  for (let i = 0; i < 5; i += 1) {
    const angle = (i / 5) * Math.PI * 2;
    const obelisk = mesh(THREE, buatKristalGeometry(THREE, 0.72 + (i === 0 ? 0.5 : 0)), material.kristal, [Math.cos(angle) * 3.2, 2.4 + (i === 0 ? 1 : 0), Math.sin(angle) * 3.2]);
    obelisk.scale.y = i === 0 ? 2.2 : 1.25;
    group.add(obelisk);
  }
  group.add(mesh(THREE, new THREE.CylinderGeometry(4.5, 5.2, 0.7, 10), material.batu, [0, 0.3, 0]));
  return group;
}

function buatCincin(THREE, material, besar = false) {
  const group = new THREE.Group();
  const ring = mesh(THREE, buatCincinGeometry(THREE, besar ? 5.8 : 3.5), material.batu, [0, besar ? 6 : 3.7, 0]);
  ring.rotation.y = Math.PI / 2;
  group.add(ring, mesh(THREE, new THREE.CylinderGeometry(besar ? 4 : 2.8, besar ? 5.2 : 3.5, 0.8, 10), material.batuGelap, [0, 0.3, 0]));
  return group;
}

function buatPaviliun(THREE, material) {
  const group = new THREE.Group();
  const positions = [[-3, 2.2, -2], [3, 2.2, -2], [-3, 2.2, 2], [3, 2.2, 2]];
  positions.forEach((p) => group.add(mesh(THREE, new THREE.CylinderGeometry(0.38, 0.5, 4.4, 8), material.batu, p)));
  const atap = mesh(THREE, new THREE.ConeGeometry(5.2, 1.7, 8, 1, true), material.batuGelap, [0, 5.05, 0]);
  group.add(atap, mesh(THREE, new THREE.CylinderGeometry(4.2, 4.5, 0.4, 10), material.batu, [0, 0.2, 0]));
  return group;
}

function buatPapan(THREE, material) {
  const group = new THREE.Group();
  const entries = [
    { position: [-1.8, 1.6, 0], scale: [0.35, 3.2, 0.35], color: 0x4b3324 },
    { position: [1.8, 1.6, 0], scale: [0.35, 3.2, 0.35], color: 0x4b3324 },
    { position: [0, 2.7, 0], scale: [4.5, 2.2, 0.35], color: 0x4b3324 },
    ...Array.from({ length: 4 }, (_, i) => ({ position: [0, 2 + i * 0.42, -0.21], scale: [3.6, 0.08, 0.06], color: WARNA.emas })),
  ];
  group.add(instansikan(THREE, new THREE.BoxGeometry(1, 1, 1), material.putih, entries));
  return group;
}

function buatTempa(THREE, material) {
  const group = new THREE.Group();
  group.add(mesh(THREE, new THREE.CylinderGeometry(3.2, 4.2, 1.2, 9), material.batuGelap, [0, 0.5, 0]));
  const api = mesh(THREE, new THREE.ConeGeometry(1.1, 3.2, 6), material.api, [0, 2.2, 0]);
  api.name = "api-tempa";
  group.add(api);
  group.userData.animasi = { api };
  return group;
}

function buatArena(THREE, material) {
  const group = new THREE.Group();
  group.add(mesh(THREE, new THREE.RingGeometry(3.7, 5.2, 20), material.batu, [0, 0.08, 0]));
  group.children[0].rotation.x = -Math.PI / 2;
  const blocks = [];
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2;
    blocks.push({ position: [Math.cos(a) * 4.5, 0.8, Math.sin(a) * 4.5], scale: [0.7, 1.6, 0.7], color: 0x2c3833 });
  }
  group.add(instansikan(THREE, new THREE.BoxGeometry(1, 1, 1), material.putih, blocks));
  return group;
}

function buatPustakaAkar(THREE, material) {
  const group = new THREE.Group();
  const lempeng = Array.from({ length: 7 }, (_, i) => ({
    position: [(i - 3) * 0.62, 1.1 + Math.abs(i - 3) * 0.14, (i % 2) * 0.22],
    rotation: [0, (i - 3) * 0.09, (i - 3) * 0.025],
    scale: [0.52, 2.15 - Math.abs(i - 3) * 0.13, 0.18],
    color: i === 3 ? 0xc6aa62 : 0x536a60,
  }));
  group.add(instansikan(THREE, new THREE.BoxGeometry(1, 1, 1), material.putih, lempeng));
  group.add(mesh(THREE, new THREE.CylinderGeometry(2.8, 3.4, 0.62, 9), material.batuGelap, [0, 0.25, 0]));
  return group;
}

function buatTuguGalat(THREE, material) {
  const group = new THREE.Group();
  const pecahan = [
    { position: [0, 1.1, 0], rotation: [0, 0.12, 0.08], scale: [1.25, 2.2, 1.1], color: 0x6a5b57 },
    { position: [-0.25, 3.25, 0], rotation: [0.04, -0.18, -0.13], scale: [1.12, 1.7, 1], color: 0x7a625c },
    { position: [0.32, 5.15, 0.05], rotation: [-0.05, 0.2, 0.18], scale: [0.92, 1.25, 0.86], color: 0x8c6b60 },
  ];
  group.add(instansikan(THREE, new THREE.BoxGeometry(1, 1, 1), material.putih, pecahan));
  const penjaga = mesh(THREE, new THREE.TorusGeometry(2.2, 0.16, 6, 22), material.emas, [0, 3.25, 0]);
  penjaga.rotation.x = Math.PI / 2;
  group.add(penjaga);
  return group;
}

function buatLingkarSejarah(THREE, material) {
  const group = new THREE.Group();
  const cincin = [0, 1, 2].map((i) => ({
    position: [0, 1.45 + i * 1.25, 0],
    rotation: [Math.PI / 2, i * 0.36, 0],
    scale: [2.8 - i * 0.52, 2.8 - i * 0.52, 1],
    color: [0x6c8a7b, 0xb18d5d, 0x796f88][i],
  }));
  group.add(instansikan(THREE, new THREE.TorusGeometry(1, 0.08, 5, 20), material.putih, cincin));
  const jarum = mesh(THREE, new THREE.BoxGeometry(0.18, 4.6, 0.18), material.emas, [0, 2.35, 0]);
  jarum.rotation.z = -0.42;
  group.add(jarum);
  return group;
}

function buatRawaKabut(THREE, material) {
  const group = new THREE.Group();
  const lentera = Array.from({ length: 5 }, (_, i) => {
    const angle = (i / 5) * Math.PI * 2;
    return { position: [Math.cos(angle) * 2.5, 1 + (i % 2) * 0.42, Math.sin(angle) * 2.5], rotation: [0, angle, 0], scale: [0.55, 1.8 + (i % 2) * 0.55, 0.55], color: i === 0 ? 0x9a8069 : 0x4b5560 };
  });
  group.add(instansikan(THREE, new THREE.ConeGeometry(1, 1, 5), material.putih, lentera));
  group.add(mesh(THREE, new THREE.SphereGeometry(2.6, 10, 7), material.kabut, [0, 1.35, 0]));
  return group;
}

function buatGerbangAkademi(THREE, material) {
  const group = new THREE.Group();
  const tangga = Array.from({ length: 5 }, (_, i) => ({ position: [0, 0.18 + i * 0.22, 2.4 - i * 0.78], scale: [4.4 - i * 0.42, 0.36, 1], color: i === 4 ? 0xb59a5b : 0x52675d }));
  group.add(instansikan(THREE, new THREE.BoxGeometry(1, 1, 1), material.putih, tangga));
  const gerbang = mesh(THREE, new THREE.TorusGeometry(3.2, 0.38, 7, 24, Math.PI), material.batu, [0, 4.1, -1]);
  gerbang.rotation.z = Math.PI;
  group.add(gerbang);
  return group;
}

function buatMenaraJejak(THREE, material) {
  const group = new THREE.Group();
  const ruas = [
    { position: [0, 1.1, 0], scale: [1.45, 2.2, 1.45], color: 0x425a51 },
    { position: [0, 3, 0], scale: [1.08, 1.7, 1.08], color: 0x587267 },
    { position: [0, 4.55, 0], scale: [0.76, 1.4, 0.76], color: 0x8b825e },
  ];
  group.add(instansikan(THREE, new THREE.CylinderGeometry(1, 1.18, 1, 6), material.putih, ruas));
  const mata = mesh(THREE, new THREE.TorusGeometry(1.55, 0.18, 6, 24), material.emas, [0, 5.65, 0]);
  mata.rotation.y = Math.PI / 2;
  group.add(mata, mesh(THREE, new THREE.SphereGeometry(0.42, 8, 6), material.kristal, [0, 5.65, 0]));
  return group;
}

function buatLandmarkUmum(THREE, material, item) {
  switch (item.id) {
    case "beranda": return buatEmbrio(THREE, material);
    case "riset": return buatGerbangPatah(THREE, material);
    case "silsilah": return buatObelisk(THREE, material);
    case "chat": return buatPaviliun(THREE, material);
    case "backlog": return buatPapan(THREE, material);
    case "mesin": return buatTempa(THREE, material);
    case "ajar": return buatArena(THREE, material);
    case "majelis": return buatArena(THREE, material);
    case "data": return buatCincin(THREE, material, false);
    case "retrieval": {
      const group = new THREE.Group();
      const kristal = mesh(THREE, buatKristalGeometry(THREE, 1), material.kristal, [0, 2.2, 0]);
      group.add(kristal);
      group.userData.animasi = { kristal };
      return group;
    }
    case "log": {
      const group = new THREE.Group();
      const bars = Array.from({ length: 4 }, (_, i) => ({ position: [(i - 1.5) * 1.7, 1.2, 0], scale: [0.75, 2.5 + i * 0.5, 0.75], color: 0x2c3833 }));
      group.add(instansikan(THREE, new THREE.BoxGeometry(1, 1, 1), material.putih, bars));
      return group;
    }
    case "lab": return buatCincin(THREE, material, false);
    case "buku-besar": return buatPustakaAkar(THREE, material);
    case "galat-insiden": return buatTuguGalat(THREE, material);
    case "sejarah": return buatLingkarSejarah(THREE, material);
    case "kabut": return buatRawaKabut(THREE, material);
    case "akademi": return buatGerbangAkademi(THREE, material);
    case "penjaga-jejak": return buatMenaraJejak(THREE, material);
    default: return buatCincin(THREE, material, false);
  }
}

export function buatDunia(THREE, scene, { kualitasRendah = false, kalibrasiCahaya = null } = {}) {
  const root = new THREE.Group();
  root.name = "Kandungan";
  scene.add(root);
  scene.background = new THREE.Color(0x52645e);
  scene.fog = new THREE.FogExp2(0x52645e, 0.0115);

  const material = {
    tanah: bahan(THREE, WARNA.tanah),
    batu: bahan(THREE, WARNA.batu),
    batuGelap: bahan(THREE, WARNA.batuGelap),
    akar: bahan(THREE, 0x4b3324),
    emas: bahan(THREE, WARNA.emas, { emissive: 0x4b3108, emissiveIntensity: 0.25 }),
    cahaya: bahan(THREE, WARNA.sian, { emissive: WARNA.sian, emissiveIntensity: 0.7 }),
    kristal: new THREE.MeshPhongMaterial({ color: WARNA.sian, emissive: 0x176b70, emissiveIntensity: 0.9, transparent: true, opacity: 0.82, flatShading: true }),
    api: bahan(THREE, WARNA.oranye, { emissive: WARNA.oranye, emissiveIntensity: 1 }),
    putih: bahan(THREE, 0xffffff),
    kabut: bahan(THREE, 0x707982, { transparent: true, opacity: 0.22, depthWrite: false }),
  };

  const tanah = mesh(THREE, buatTanahGeometry(THREE), material.tanah);
  tanah.receiveShadow = true;
  tanah.name = "daratan-kandungan";
  root.add(tanah);
  const air = mesh(THREE, new THREE.CircleGeometry(105, 96), new THREE.MeshPhongMaterial({ color: WARNA.air, emissive: 0x0b3033, shininess: 70, transparent: true, opacity: 0.92 }), [0, -2.1, 0]);
  air.rotation.x = -Math.PI / 2;
  root.add(air);

  const alur = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-47, 0.1, -23), new THREE.Vector3(-22, 0.15, -10), new THREE.Vector3(0, 0.2, 1),
    new THREE.Vector3(18, 0.2, 17), new THREE.Vector3(36, 0.15, 30), new THREE.Vector3(59, -0.2, 15),
  ]);
  const sungai = mesh(THREE, new THREE.TubeGeometry(alur, 80, 1.35, 6, false), new THREE.MeshBasicMaterial({ color: WARNA.sian, transparent: true, opacity: 0.6 }));
  sungai.name = "sungai-retrieval";
  root.add(sungai);

  const dummy = new THREE.Object3D();
  const rumputGeo = new THREE.ConeGeometry(0.09, 0.7, 3);
  const rumput = new THREE.InstancedMesh(rumputGeo, bahan(THREE, 0x6c8d4e), kualitasRendah ? 420 : 900);
  for (let i = 0; i < rumput.count; i += 1) {
    const angle = acakTetap(i * 7 + 1) * Math.PI * 2;
    const radius = 7 + Math.sqrt(acakTetap(i * 11 + 2)) * 66;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    dummy.position.set(x, tinggiTanah(x, z) + 0.28, z);
    dummy.rotation.set(0, acakTetap(i * 3) * Math.PI, (acakTetap(i * 13) - 0.5) * 0.25);
    dummy.scale.setScalar(0.65 + acakTetap(i * 17) * 1.2);
    dummy.updateMatrix();
    rumput.setMatrixAt(i, dummy.matrix);
  }
  rumput.instanceMatrix.needsUpdate = true;
  rumput.frustumCulled = false;
  root.add(rumput);

  const batuGeo = new THREE.DodecahedronGeometry(0.65, 0);
  const batuInst = new THREE.InstancedMesh(batuGeo, material.batuGelap, kualitasRendah ? 60 : 130);
  for (let i = 0; i < batuInst.count; i += 1) {
    const angle = acakTetap(i * 23 + 4) * Math.PI * 2;
    const radius = 12 + Math.sqrt(acakTetap(i * 29 + 9)) * 61;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    dummy.position.set(x, tinggiTanah(x, z) + 0.35, z);
    dummy.rotation.set(acakTetap(i) * 2, acakTetap(i + 8) * 4, acakTetap(i + 10));
    dummy.scale.set(0.5 + acakTetap(i + 1) * 1.5, 0.5 + acakTetap(i + 2), 0.5 + acakTetap(i + 3) * 1.4);
    dummy.updateMatrix();
    batuInst.setMatrixAt(i, dummy.matrix);
  }
  batuInst.instanceMatrix.needsUpdate = true;
  root.add(batuInst);

  const batang = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.28, 0.45, 3.6, 6), material.akar, kualitasRendah ? 28 : 58);
  const kanopi = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.65, 1), bahan(THREE, 0x31593d), batang.count);
  const colliders = [];
  for (let i = 0; i < batang.count; i += 1) {
    const angle = acakTetap(i * 31 + 2) * Math.PI * 2;
    const radius = 16 + Math.sqrt(acakTetap(i * 37 + 7)) * 43;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const y = tinggiTanah(x, z);
    dummy.position.set(x, y + 1.8, z); dummy.rotation.set(0, acakTetap(i + 1) * Math.PI, 0); dummy.scale.setScalar(0.85 + acakTetap(i + 4) * 0.5); dummy.updateMatrix(); batang.setMatrixAt(i, dummy.matrix);
    dummy.position.set(x, y + 4, z); dummy.rotation.set(0, acakTetap(i + 5) * Math.PI, 0); dummy.scale.set(1, 0.8 + acakTetap(i + 6) * 0.5, 1); dummy.updateMatrix(); kanopi.setMatrixAt(i, dummy.matrix);
    if (i < 34) colliders.push({ type: "circle", x, z, radius: 0.72 });
  }
  batang.instanceMatrix.needsUpdate = true; kanopi.instanceMatrix.needsUpdate = true;
  root.add(batang, kanopi);

  const pedangGeo = buatPedangGeometry(THREE);
  const pedang = new THREE.InstancedMesh(pedangGeo, material.batu, 48);
  for (let i = 0; i < pedang.count; i += 1) {
    const a = acakTetap(i * 41) * Math.PI * 2;
    const r = 4 + acakTetap(i * 43 + 1) * 12;
    const x = MODUL[3].posisi[0] + Math.cos(a) * r;
    const z = MODUL[3].posisi[2] + Math.sin(a) * r;
    dummy.position.set(x, tinggiTanah(x, z) - 0.15, z);
    dummy.rotation.set((acakTetap(i + 3) - 0.5) * 0.18, a, (acakTetap(i + 4) - 0.5) * 0.2);
    const s = 0.7 + acakTetap(i * 47) * 1.5; dummy.scale.setScalar(s); dummy.updateMatrix(); pedang.setMatrixAt(i, dummy.matrix);
  }
  pedang.instanceMatrix.needsUpdate = true;
  root.add(pedang);

  const landmarkObjects = [];
  const clickables = [];
  [...MODUL, PORTAL].forEach((item) => {
    const group = item.id === "portal" ? buatCincin(THREE, material, true) : buatLandmarkUmum(THREE, material, item);
    tempatkan(group, item);
    group.name = `landmark-${item.id}`;
    const proxy = mesh(THREE, new THREE.SphereGeometry(item.id === "portal" ? 6.5 : 4.2, 10, 8), new THREE.MeshBasicMaterial({ visible: false }), [0, 3, 0]);
    proxy.userData.modul = item.id === "portal" ? "beranda" : item.id;
    proxy.userData.landmark = item.landmark;
    proxy.userData.item = item;
    group.add(proxy);
    root.add(group);
    landmarkObjects.push({ item, group });
    clickables.push(proxy);
    const radius = item.id === "beranda" ? 4.7 : item.id === "portal" ? 5.2 : 2.4;
    colliders.push({ type: "circle", x: item.posisi[0], z: item.posisi[2], radius });
  });

  const cahaya = buatPengendaliCahaya(THREE, scene, { kualitasRendah, kalibrasi: kalibrasiCahaya });

  function update(time, reducedMotion = false) {
    const faseCahaya = cahaya.update(time, reducedMotion);
    if (reducedMotion) return faseCahaya;
    for (const { group } of landmarkObjects) {
      const animated = group.userData.animasi;
      if (!animated) continue;
      if (animated.kristal) {
        animated.kristal.rotation.y = time * 0.35;
      }
      if (animated.inti) {
        const pulse = 0.96 + Math.sin(time * 0.9) * 0.025;
        animated.inti.scale.set(0.72 * pulse, 1.15 * pulse, 0.68 * pulse);
      }
      if (animated.api) animated.api.scale.y = 0.92 + Math.sin(time * 5) * 0.08;
    }
    return faseCahaya;
  }

  function nearest(position) {
    let found = null;
    for (const entry of landmarkObjects) {
      const distance = Math.hypot(position.x - entry.group.position.x, position.z - entry.group.position.z);
      if (!found || distance < found.distance) found = { ...entry, distance };
    }
    return found;
  }

  return { root, landmarkObjects, clickables, colliders, update, nearest, tinggiTanah, cahaya, sun: cahaya.sun, hemi: cahaya.hemi };
}
