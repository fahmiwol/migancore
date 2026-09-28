// Pure geometry builders: Three.js is passed in so Node can verify the real meshes.

export function acakTetap(seed) {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export function tinggiTanah(x, z) {
  const pusat = Math.exp(-(x * x + z * z) / 1400) * 0.8;
  const gelombang = Math.sin(x * 0.085) * 0.36 + Math.cos(z * 0.072) * 0.3;
  const tepi = Math.max(0, (Math.hypot(x, z) - 57) / 16) * 2.2;
  return pusat + gelombang - tepi;
}

export function buatTanahGeometry(THREE, ukuran = 154, segmen = 72) {
  const geometry = new THREE.PlaneGeometry(ukuran, ukuran, segmen, segmen);
  geometry.rotateX(-Math.PI / 2);
  const p = geometry.attributes.position;
  for (let i = 0; i < p.count; i += 1) {
    const x = p.getX(i);
    const z = p.getZ(i);
    p.setY(i, tinggiTanah(x, z));
  }
  p.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function buatPedangGeometry(THREE) {
  const vertices = new Float32Array([
    -0.22, 0, -0.08, 0.22, 0, -0.08, 0.22, 0, 0.08, -0.22, 0, 0.08,
    -0.18, 2.8, -0.06, 0.18, 2.8, -0.06, 0.18, 2.8, 0.06, -0.18, 2.8, 0.06,
    0, 3.45, 0,
  ]);
  const indices = [0,1,5,0,5,4,1,2,6,1,6,5,2,3,7,2,7,6,3,0,4,3,4,7,4,5,8,5,6,8,6,7,8,7,4,8,0,3,2,0,2,1];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function buatKristalGeometry(THREE, radius = 1.5) {
  const geometry = new THREE.OctahedronGeometry(radius, 0);
  geometry.scale(0.72, 1.45, 0.72);
  geometry.computeBoundingBox();
  return geometry;
}

export function buatCincinGeometry(THREE, radius = 4.5) {
  const geometry = new THREE.TorusGeometry(radius, 0.58, 7, 28);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function hitungSegitiga(geometry) {
  return geometry.index ? geometry.index.count / 3 : geometry.attributes.position.count / 3;
}
