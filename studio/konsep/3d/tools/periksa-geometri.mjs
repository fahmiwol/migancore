import assert from "node:assert/strict";
import * as THREE from "../vendor/three.module.min.js";
import { buatCincinGeometry, buatKristalGeometry, buatPedangGeometry, buatTanahGeometry, hitungSegitiga } from "../js/bentuk.mjs";
import { buatDunia } from "../js/dunia.mjs";
import { buatPemain } from "../js/pemain.mjs";
import { MODUL } from "../js/peta-modul.mjs";

function assertFiniteGeometry(name, geometry) {
  const values = geometry.attributes.position.array;
  for (const value of values) assert.ok(Number.isFinite(value), `${name}: non-finite vertex`);
  geometry.computeBoundingBox();
  const { min, max } = geometry.boundingBox;
  for (const value of [...min.toArray(), ...max.toArray()]) assert.ok(Number.isFinite(value), `${name}: non-finite bounds`);
}

const geometries = {
  tanah: buatTanahGeometry(THREE),
  pedang: buatPedangGeometry(THREE),
  kristal: buatKristalGeometry(THREE),
  cincin: buatCincinGeometry(THREE),
};
for (const [name, geometry] of Object.entries(geometries)) assertFiniteGeometry(name, geometry);
assert.equal(hitungSegitiga(geometries.pedang), 14, "Sword triangle invariant drifted");
assert.ok(geometries.cincin.boundingSphere.radius < 6, "Portal ring exceeded authored radius");

const repeat = buatTanahGeometry(THREE);
assert.deepEqual([...repeat.attributes.position.array], [...geometries.tanah.attributes.position.array], "Terrain must be deterministic");

const scene = new THREE.Scene();
const world = buatDunia(THREE, scene, { kualitasRendah: false });
buatPemain(THREE, scene, world.tinggiTanah, world.colliders);
let mainCalls = 0;
let shadowCalls = 0;
let shadowCasters = 0;
let triangles = 0;
let pointLights = 0;
scene.traverse((object) => {
  if (object.isPointLight) pointLights += 1;
  if (!object.isMesh || object.visible === false) return;
  if (!Array.isArray(object.material) && object.material?.visible === false) return;
  mainCalls += Array.isArray(object.material) ? object.material.length : 1;
  if (object.castShadow) {
    shadowCasters += 1;
    shadowCalls += Array.isArray(object.material) ? object.material.length : 1;
  }
  const base = hitungSegitiga(object.geometry);
  triangles += base * (object.isInstancedMesh ? object.count : 1);
});
const totalCalls = mainCalls + shadowCalls;
assert.ok(mainCalls <= 110, `Main-pass draw-call budget exceeded: ${mainCalls} > 110`);
assert.ok(triangles <= 90_000, `Triangle budget exceeded: ${triangles} > 90000`);
assert.ok(pointLights <= 3, `PointLight budget exceeded: ${pointLights} > 3`);
assert.equal(MODUL.length, 18, "Expected all 18 PRD modules");
assert.equal(world.landmarkObjects.length, MODUL.length + 1, "Expected 18 modules plus one portal landmark");
assert.ok(world.colliders.length >= 53, "Six new landmark colliders are missing");

console.log(JSON.stringify({ ok: true, mainCalls, shadowCalls, shadowCasters, totalCalls, triangles, pointLights, landmarks: world.landmarkObjects.length, colliders: world.colliders.length }, null, 2));
