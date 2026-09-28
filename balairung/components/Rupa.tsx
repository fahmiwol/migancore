"use client";
import { useEffect, useRef } from "react";
import * as THREE from "three";

// Rupa — the particle-face hologram avatar.
// Scaffold: procedural female face from sampled strokes. PRODUCTION: replace the
// offscreen draw with MediaPipe FaceMesh landmarks sampled from the client's photo
// (gated by the Wasiat consent flow). See PRIMBON_LEXICON.md + 04_FLOWS.md.
export function Rupa() {
  const mount = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = mount.current;
    if (!el) return;
    const FW = 260, FH = 320, oc = document.createElement("canvas");
    oc.width = FW; oc.height = FH;
    const x = oc.getContext("2d")!;
    x.strokeStyle = "#fff"; x.fillStyle = "#fff"; x.lineWidth = 2.3; x.lineCap = "round";
    const cx = FW / 2, cy = 148;
    x.beginPath(); x.moveTo(cx - 86, 150); x.bezierCurveTo(cx - 118, 40, cx + 118, 40, cx + 86, 150); x.stroke();
    x.beginPath(); x.moveTo(cx - 72, 128); x.bezierCurveTo(cx - 78, 210, cx - 40, 256, cx, 262); x.bezierCurveTo(cx + 40, 256, cx + 78, 210, cx + 72, 128); x.stroke();
    x.beginPath(); x.moveTo(cx - 72, 128); x.bezierCurveTo(cx - 66, 86, cx + 66, 86, cx + 72, 128); x.stroke();
    const eye = (ex: number) => { x.beginPath(); x.moveTo(ex - 22, 150); x.quadraticCurveTo(ex, 138, ex + 22, 150); x.quadraticCurveTo(ex, 164, ex - 22, 150); x.stroke(); x.beginPath(); x.arc(ex, 151, 6, 0, 7); x.fill(); };
    eye(cx - 34); eye(cx + 34);
    x.beginPath(); x.moveTo(cx, 150); x.lineTo(cx - 6, 186); x.quadraticCurveTo(cx, 194, cx + 8, 186); x.stroke();
    x.beginPath(); x.moveTo(cx - 26, 210); x.quadraticCurveTo(cx, 200, cx + 26, 210); x.quadraticCurveTo(cx, 224, cx - 26, 210); x.stroke();

    const img = x.getImageData(0, 0, FW, FH).data;
    const pos: number[] = [], col: number[] = [], base: number[] = [], mw: number[] = [];
    const cyan = new THREE.Color(0x5fe9ff), pink = new THREE.Color(0xff7fb0);
    for (let py = 0; py < FH; py += 3) for (let px = 0; px < FW; px += 3) {
      if (img[(py * FW + px) * 4 + 3] > 40 && Math.random() <= 0.6) {
        const X = (px - FW / 2) / 120, Y = -(py - cy) / 120, Z = (Math.random() - 0.5) * 0.13;
        pos.push(X, Y, Z); base.push(X, Y, Z);
        const c = py > 198 && py < 228 && px > cx - 30 && px < cx + 30 ? pink : cyan;
        col.push(c.r, c.g, c.b); mw.push(py > 196 ? Math.max(0, 1 - Math.abs(py - 212) / 40) : 0);
      }
    }
    const N = mw.length, geo = new THREE.BufferGeometry();
    const pa = new Float32Array(pos);
    geo.setAttribute("position", new THREE.BufferAttribute(pa, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(col), 3));
    const s = document.createElement("canvas"); s.width = s.height = 64;
    const sx = s.getContext("2d")!; const g = sx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.3, "rgba(170,255,255,.7)"); g.addColorStop(1, "rgba(0,0,0,0)");
    sx.fillStyle = g; sx.fillRect(0, 0, 64, 64);
    const mat = new THREE.PointsMaterial({ size: 0.05, map: new THREE.CanvasTexture(s), vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const pts = new THREE.Points(geo, mat);
    const scene = new THREE.Scene(); scene.add(pts);
    const cam = new THREE.PerspectiveCamera(42, 1, 0.1, 100); cam.position.z = 3.7;
    const rnd = new THREE.WebGLRenderer({ alpha: true, antialias: true }); rnd.setClearColor(0, 0);
    el.appendChild(rnd.domElement);
    const size = () => { const w = el.clientWidth, h = el.clientHeight; rnd.setPixelRatio(Math.min(2, devicePixelRatio)); rnd.setSize(w, h, false); rnd.domElement.style.width = "100%"; rnd.domElement.style.height = "100%"; cam.aspect = w / h; cam.updateProjectionMatrix(); };
    size(); const ro = new ResizeObserver(size); ro.observe(el);
    let mx = 0.5, my = 0.5;
    const onMove = (e: MouseEvent) => { const r = el.getBoundingClientRect(); mx = (e.clientX - r.left) / r.width; my = (e.clientY - r.top) / r.height; };
    window.addEventListener("mousemove", onMove);
    let t = 0, raf = 0;
    const loop = () => {
      t += 0.016; const env = (Math.sin(t * 7) * 0.5 + 0.5) * (Math.sin(t * 0.9) > 0.2 ? 1 : 0.15);
      const p = geo.attributes.position.array as Float32Array;
      for (let i = 0; i < N; i++) { const ix = i * 3, by = base[ix + 1], w = mw[i];
        p[ix] = base[ix]; p[ix + 1] = by + Math.sin(t * 1.4 + by * 2) * 0.012; p[ix + 2] = base[ix + 2] + Math.sin(t * 2.2 - by * 3) * 0.02 + w * env * 0.16; }
      geo.attributes.position.needsUpdate = true;
      pts.rotation.y += ((mx - 0.5) * 0.6 - pts.rotation.y) * 0.05;
      pts.rotation.x += ((my - 0.5) * 0.35 - pts.rotation.x) * 0.05;
      rnd.render(scene, cam); raf = requestAnimationFrame(loop);
    };
    loop();
    return () => { cancelAnimationFrame(raf); ro.disconnect(); window.removeEventListener("mousemove", onMove); rnd.dispose(); el.removeChild(rnd.domElement); };
  }, []);

  return <div ref={mount} className="absolute inset-0" aria-label="Rupa — avatar hologram MiganCore" />;
}
