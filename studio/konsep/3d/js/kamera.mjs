export function buatKamera(THREE, camera, canvas) {
  let yaw = Math.PI;
  let pitch = 0.43;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let distance = 9.5;
  const target = new THREE.Vector3();
  const desired = new THREE.Vector3();

  function pointerDown(event) {
    if (event.button !== 0 && event.button !== 2) return;
    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
  }
  function pointerMove(event) {
    if (!dragging) return;
    yaw -= (event.clientX - lastX) * 0.006;
    pitch = THREE.MathUtils.clamp(pitch - (event.clientY - lastY) * 0.004, 0.18, 1.05);
    lastX = event.clientX;
    lastY = event.clientY;
  }
  function pointerUp(event) {
    dragging = false;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  }
  function wheel(event) {
    distance = THREE.MathUtils.clamp(distance + Math.sign(event.deltaY) * 0.8, 6, 14);
    event.preventDefault();
  }
  canvas.addEventListener("pointerdown", pointerDown);
  canvas.addEventListener("pointermove", pointerMove);
  canvas.addEventListener("pointerup", pointerUp);
  canvas.addEventListener("pointercancel", pointerUp);
  canvas.addEventListener("wheel", wheel, { passive: false });
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());

  function update(playerPosition, dt, instant = false) {
    target.set(playerPosition.x, playerPosition.y + 1.45, playerPosition.z);
    const horizontal = Math.cos(pitch) * distance;
    desired.set(
      target.x + Math.sin(yaw) * horizontal,
      target.y + Math.sin(pitch) * distance,
      target.z + Math.cos(yaw) * horizontal,
    );
    if (instant) camera.position.copy(desired);
    else camera.position.lerp(desired, 1 - Math.exp(-dt * 9));
    camera.lookAt(target);
  }

  return {
    update,
    get yaw() { return yaw; },
    get arahKompas() {
      const normalized = ((yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      return ["N", "E", "S", "W"][Math.round(normalized / (Math.PI / 2)) % 4];
    },
  };
}
