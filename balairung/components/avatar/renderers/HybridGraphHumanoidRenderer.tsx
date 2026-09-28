"use client";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { AvatarState, QualityTier, TrackingData } from "@/types/avatar";
import { loadVault, buildGraph } from "@/lib/khazanah";
import { toKnowledgeNodes, type KnowledgeNode } from "@/lib/avatar/knowledgeNodes";
import { KnowledgeNodeOverlay } from "@/components/avatar/graph/KnowledgeNodeOverlay";
import { avatarGlb, DEFAULT_GLB } from "@/lib/avatar/avatarSource";
import { AVATAR_EVENTS } from "@/lib/avatar/signals";
import { lerp } from "@/lib/avatar/smoothing";

// Hybrid Holographic Human (A2 + A2.1 + A3). Guide-Mesh: load a rigged head/bust GLB
// and sample its surface into a glowing particle cloud (face stays RECOGNIZABLE).
// A2.1 = knowledge overlay + swappable GLB + bloom. A3 = lip-sync (TTS-driven mouth)
// + gaze/presence tracking (the head turns toward the user). See 07_AVATAR_ENGINE_SPEC.

const MAX_PTS: Record<QualityTier, number> = { low: 8000, medium: 15000, high: 26000 };
const PT_SIZE: Record<QualityTier, number> = { low: 0.026, medium: 0.02, high: 0.016 };
const MAX_NODES: Record<QualityTier, number> = { low: 5, medium: 7, high: 10 };

function concat(arrs: Float32Array[]): Float32Array {
  let len = 0;
  for (const a of arrs) len += a.length;
  const out = new Float32Array(len);
  let o = 0;
  for (const a of arrs) {
    out.set(a, o);
    o += a.length;
  }
  return out;
}

// Sparse meshes (e.g. the facecap head) get densified with edge midpoints for a
// fuller cloud; dense meshes (RPM half-body) are left alone and capped instead.
function densify(src: Float32Array): Float32Array {
  const out: number[] = [];
  for (let i = 0; i < src.length; i += 9) {
    for (let k = 0; k < 9 && i + k < src.length; k++) out.push(src[i + k]);
    if (i + 8 < src.length) {
      const a = [src[i], src[i + 1], src[i + 2]];
      const b = [src[i + 3], src[i + 4], src[i + 5]];
      const c = [src[i + 6], src[i + 7], src[i + 8]];
      out.push((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
      out.push((b[0] + c[0]) / 2, (b[1] + c[1]) / 2, (b[2] + c[2]) / 2);
      out.push((a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2);
    }
  }
  return new Float32Array(out);
}

function cap(src: Float32Array, maxPts: number): Float32Array {
  const pts = src.length / 3;
  if (pts <= maxPts) return src;
  const stride = Math.ceil(pts / maxPts);
  const out: number[] = [];
  for (let i = 0; i < pts; i += stride) out.push(src[i * 3], src[i * 3 + 1], src[i * 3 + 2]);
  return new Float32Array(out);
}

// Some GLBs (incl. our facecap face.glb, and many Ready Player Me exports) ship
// KTX2-compressed textures. GLTFLoader throws unless a KTX2Loader is attached — even
// though we only sample vertex positions. Attach one (CDN transcoder) so loading
// never fails. See FINDINGS F-022.
const KTX2_TRANSCODER = "https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/libs/basis/";
const DRACO_DECODER = "https://www.gstatic.com/draco/v1/decoders/";

function FaceParticles({ state, src, quality }: { state: AvatarState; src: string; quality: QualityTier }) {
  const gl = useThree((s) => s.gl);
  const ref = useRef<THREE.Points>(null);
  const matRef = useRef<THREE.PointsMaterial>(null);

  // Load the GLB MANUALLY (async, error-handled in a callback) rather than via drei's
  // useGLTF. Two reasons: (1) we fully control KTX2 + DRACO setup so KTX2-textured GLBs
  // (face.glb, many RPM exports) actually load; (2) a load failure resolves to null
  // instead of THROWING DURING RENDER — which previously white-screened the whole app
  // because R3F runs its own reconciler and the outer error boundary can't catch it.
  // See FINDINGS F-022.
  const [scene, setScene] = useState<THREE.Object3D | null>(null);
  useEffect(() => {
    let cancelled = false;
    const loader = new GLTFLoader();
    const ktx2 = new KTX2Loader().setTranscoderPath(KTX2_TRANSCODER);
    try { ktx2.detectSupport(gl); } catch (e) { console.warn("ktx2 detectSupport:", e); }
    loader.setKTX2Loader(ktx2);
    loader.setDRACOLoader(new DRACOLoader().setDecoderPath(DRACO_DECODER));
    // face.glb is gltfpack/meshopt-compressed (EXT_meshopt_compression) → REQUIRED to
    // parse geometry. Missing this was why the face never rendered. See FINDINGS F-027.
    loader.setMeshoptDecoder(MeshoptDecoder);
    loader.load(
      src,
      (g) => { if (!cancelled) setScene(g.scene); },
      undefined,
      (err) => console.error("Avatar GLB load failed:", src, err),
    );
    return () => { cancelled = true; try { ktx2.dispose(); } catch {} };
  }, [src, gl]);

  // Build the point cloud + a base copy (for lip-sync reset) + a per-point mouth weight.
  const built = useMemo(() => {
    const empty = { geometry: new THREE.BufferGeometry(), base: new Float32Array(), mouth: new Float32Array() };
    if (!scene) return empty;
    const arrays: Float32Array[] = [];
    scene.updateWorldMatrix(true, true);
    scene.traverse((o: any) => {
      if (o.isMesh && o.geometry?.attributes?.position) {
        const p = o.geometry.attributes.position.array as Float32Array;
        const m: THREE.Matrix4 = o.matrixWorld;
        const v = new THREE.Vector3();
        const w = new Float32Array(p.length);
        for (let i = 0; i < p.length; i += 3) {
          v.set(p[i], p[i + 1], p[i + 2]).applyMatrix4(m);
          w[i] = v.x;
          w[i + 1] = v.y;
          w[i + 2] = v.z;
        }
        arrays.push(w);
      }
    });
    const g = new THREE.BufferGeometry();
    if (!arrays.length) return { geometry: g, base: new Float32Array(), mouth: new Float32Array() };
    let raw = concat(arrays);
    if (raw.length / 3 < 4000) raw = densify(raw);
    raw = cap(raw, MAX_PTS[quality]);
    const box = new THREE.Box3();
    const v = new THREE.Vector3();
    for (let i = 0; i < raw.length; i += 3) box.expandByPoint(v.set(raw[i], raw[i + 1], raw[i + 2]));
    const c = box.getCenter(new THREE.Vector3());
    const sz = box.getSize(new THREE.Vector3());
    // Guard: a corrupt GLB (e.g. bad meshopt decode) yields NaN bounds → would render
    // an invisible NaN cloud. Bail to empty instead. See FINDINGS F-027.
    if (!Number.isFinite(sz.x) || !Number.isFinite(sz.y) || !Number.isFinite(sz.z) || sz.length() === 0) {
      console.error("Avatar GLB produced invalid (NaN/empty) bounds — skipping render");
      return { geometry: g, base: new Float32Array(), mouth: new Float32Array() };
    }
    const s = 2.6 / Math.max(sz.x, sz.y, sz.z || 1);
    const pos = new Float32Array(raw.length);
    const mouth = new Float32Array(raw.length / 3);
    for (let i = 0, j = 0; i < raw.length; i += 3, j++) {
      const x = (raw[i] - c.x) * s;
      const y = (raw[i + 1] - c.y) * s;
      const z = (raw[i + 2] - c.z) * s;
      pos[i] = x;
      pos[i + 1] = y;
      pos[i + 2] = z;
      // Mouth mask: smooth gaussian around the lower-front face. Front-facing only.
      const d = ((y + 0.35) / 0.3) ** 2 + (x / 0.5) ** 2 + ((z - 0.45) / 0.55) ** 2;
      mouth[j] = z > 0 ? Math.exp(-d) : 0;
    }
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return { geometry: g, base: pos.slice(), mouth };
  }, [scene, quality]);

  // Mutable runtime signals (avoid React re-renders in the animation loop).
  const spk = useRef({ active: false, pulse: 0, amp: 0 });
  const gaze = useRef({ yaw: 0, pitch: 0, present: 0, tYaw: 0, tPitch: 0, tPresent: 0 });
  const dirty = useRef(false);

  useEffect(() => {
    const onStart = () => (spk.current.active = true);
    const onPulse = () => (spk.current.pulse = 1);
    const onEnd = () => (spk.current.active = false);
    const onTrack = (e: Event) => {
      const t = (e as CustomEvent).detail as TrackingData;
      gaze.current.tYaw = THREE.MathUtils.clamp(t.gazeTarget?.[0] ?? 0, -1, 1) * 0.5;
      gaze.current.tPitch = THREE.MathUtils.clamp(t.gazeTarget?.[1] ?? 0, -1, 1) * 0.3;
      gaze.current.tPresent = t.userPresent ? 1 : 0;
    };
    window.addEventListener(AVATAR_EVENTS.speakStart, onStart);
    window.addEventListener(AVATAR_EVENTS.speakPulse, onPulse);
    window.addEventListener(AVATAR_EVENTS.speakEnd, onEnd);
    window.addEventListener(AVATAR_EVENTS.tracking, onTrack as EventListener);
    return () => {
      window.removeEventListener(AVATAR_EVENTS.speakStart, onStart);
      window.removeEventListener(AVATAR_EVENTS.speakPulse, onPulse);
      window.removeEventListener(AVATAR_EVENTS.speakEnd, onEnd);
      window.removeEventListener(AVATAR_EVENTS.tracking, onTrack as EventListener);
    };
  }, []);

  useFrame((st) => {
    if (!ref.current) return;
    const t = st.clock.elapsedTime;

    // --- TTS speaking envelope (A3.1) ---
    const s = spk.current;
    s.pulse *= 0.88;
    const target = s.active ? 0.35 + 0.4 * Math.abs(Math.sin(t * 9)) + s.pulse * 0.5 : 0;
    s.amp += (target - s.amp) * 0.25;

    // --- gaze smoothing (A3.2, k≈0.12) ---
    const g = gaze.current;
    g.yaw = lerp(g.yaw, g.tYaw, 0.12);
    g.pitch = lerp(g.pitch, g.tPitch, 0.12);
    g.present = lerp(g.present, g.tPresent, 0.08);

    // head pose: idle sway dampened when a user is present, plus gaze offset
    const sway = state === "thinking" ? 0.45 : 0.22;
    ref.current.rotation.y = Math.sin(t * 0.3) * sway * (1 - g.present * 0.6) + g.yaw;
    ref.current.rotation.x = g.pitch;
    const breathe = state === "listening" || s.amp > 0.05 ? 0.02 : 0.008;
    ref.current.scale.setScalar(1 + Math.sin(t * 1.3) * breathe + g.present * 0.03);

    // --- mouth lip-sync: displace mouth-region points by the envelope ---
    if ((s.amp > 0.002 || dirty.current) && built.base.length > 0) {
      const posAttr = built.geometry.attributes.position as THREE.BufferAttribute;
      const arr = posAttr.array as Float32Array;
      const base = built.base;
      const mouth = built.mouth;
      const open = s.amp < 0.003 ? 0 : s.amp;
      for (let i = 0, j = 0; i < arr.length; i += 3, j++) {
        const w = mouth[j];
        if (w < 0.01) continue;
        arr[i + 1] = base[i + 1] - w * open * 0.18; // jaw drop
        arr[i + 2] = base[i + 2] + w * open * 0.05; // slight forward
      }
      posAttr.needsUpdate = true;
      dirty.current = s.amp > 0.002;
    }

    if (matRef.current) {
      const c =
        s.amp > 0.05 ? "#8effe0" : state === "listening" ? "#46f0c0" : state === "thinking" ? "#7fb8ff" : "#5fe9ff";
      matRef.current.color.set(c);
      matRef.current.opacity = 0.82 + g.present * 0.12 + s.amp * 0.06;
    }
  });

  return (
    <points ref={ref} geometry={built.geometry}>
      <pointsMaterial
        ref={matRef}
        size={PT_SIZE[quality]}
        color="#5fe9ff"
        transparent
        opacity={0.85}
        sizeAttenuation
        depthWrite={false}
        toneMapped={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}
// NOTE: do NOT useGLTF.preload(DEFAULT_GLB) — preload loads without our KTX2Loader
// and caches a failed load (face.glb has KTX2 textures), so the component's
// KTX2-configured load would reuse the broken cache. See FINDINGS F-022.

export function HybridGraphHumanoidRenderer({ state, quality = "high" }: { state: AvatarState; quality?: QualityTier }) {
  const [src, setSrc] = useState(DEFAULT_GLB);
  const [nodes, setNodes] = useState<KnowledgeNode[]>([]);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    setSrc(avatarGlb());
    const onChange = () => setSrc(avatarGlb());
    window.addEventListener("balairung:avatar-changed", onChange);

    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onMq = () => setReduced(mq.matches);
    setReduced(mq.matches);
    mq.addEventListener?.("change", onMq);

    const narrow = window.innerWidth < 640;
    const max = narrow ? Math.min(5, MAX_NODES[quality]) : MAX_NODES[quality];
    loadVault().then((n) => setNodes(toKnowledgeNodes(buildGraph(n), max)));

    return () => {
      window.removeEventListener("balairung:avatar-changed", onChange);
      mq.removeEventListener?.("change", onMq);
    };
  }, [quality]);

  const bloom = quality !== "low";
  return (
    <Canvas
      camera={{ position: [0, 0, 3.4], fov: 38 }}
      style={{ position: "absolute", inset: 0 }}
      gl={{ alpha: true, antialias: true }}
      dpr={[1, quality === "low" ? 1.25 : 2]}
    >
      <Suspense fallback={null}>
        <FaceParticles key={src} state={state} src={src} quality={quality} />
        {nodes.length > 0 && <KnowledgeNodeOverlay nodes={nodes} state={state} reducedMotion={reduced} />}
      </Suspense>
      {bloom && (
        <EffectComposer>
          <Bloom
            intensity={quality === "high" ? 1.15 : 0.85}
            luminanceThreshold={0.12}
            luminanceSmoothing={0.5}
            radius={0.75}
            mipmapBlur
          />
        </EffectComposer>
      )}
    </Canvas>
  );
}
