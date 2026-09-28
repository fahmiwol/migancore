export function buatInteraksi(THREE, { camera, canvas, clickables, pemain, dunia, onOpen, onNearby }) {
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let down = null;
  let nearby = null;

  function onPointerDown(event) { down = { x: event.clientX, y: event.clientY }; }
  function onPointerUp(event) {
    if (!down || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 5) return;
    const rect = canvas.getBoundingClientRect();
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(clickables, false)[0];
    if (hit?.object.userData.modul) onOpen(hit.object.userData.modul);
  }
  function keydown(event) {
    if (event.code !== "KeyE" || event.repeat) return;
    const tag = event.target?.tagName;
    if (["INPUT", "TEXTAREA", "SELECT"].includes(tag)) return;
    if (nearby && nearby.distance <= 5.8) onOpen(nearby.item.id === "portal" ? "beranda" : nearby.item.id);
  }
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointerup", onPointerUp);
  window.addEventListener("keydown", keydown);

  function update() {
    const next = dunia.nearest(pemain.position);
    const changed = next?.item.id !== nearby?.item.id || Math.abs((next?.distance ?? 0) - (nearby?.distance ?? 0)) > 0.2;
    nearby = next;
    if (changed) onNearby(nearby);
  }
  return { update, get nearby() { return nearby; } };
}
