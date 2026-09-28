"use client";
import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { AvatarState, QualityTier } from "@/types/avatar";
import { generateAvatarParticles, samplePhotoToParticles, buildLineageWeb, type AvatarParticle } from "@/lib/avatar/pointGenerator";
import { samplePhotoWithDepth } from "@/lib/avatar/depthSampler";
import { agentFace } from "@/lib/identity";
import { AVATAR_EVENTS } from "@/lib/avatar/signals";
import { loadVault, buildGraph } from "@/lib/khazanah";
import { toKnowledgeNodes, type KnowledgeNode } from "@/lib/avatar/knowledgeNodes";
import { KnowledgeNodeOverlay } from "@/components/avatar/graph/KnowledgeNodeOverlay";

// ParticleFaceRenderer — hero hologram face. Faithful port of Codex's KIRANA look
// (procedural particle bust + HologramShell rim + FaceGuideScaffold + HudRings/VoiceRings)
// adapted to fiber 9 / three 0.180, wired to MiganPro state/Khazanah/lip-sync. NO GLB.
// Orbit FOLLOWS the camera/face (Tatapan tracking), not the mouse, so panels + the
// hand-gesture cursor stay clickable (Canvas is pointer-events:none). See doc 10 / F-031.

function statePulse(s: AvatarState) {
  if (s === "offline" || s === "sleep") return 0.3;
  if (s === "thinking") return 1.35;
  if (s === "speaking" || s === "responding") return 1.2;
  if (s === "listening") return 1.12;
  return 0.92;
}

function buildGeometry(particles: AvatarParticle[]) {
  const positions = new Float32Array(particles.length * 3);
  const colors = new Float32Array(particles.length * 3);
  const sizes = new Float32Array(particles.length);
  const c = new THREE.Color();
  particles.forEach((p, idx) => {
    const i = idx * 3;
    positions[i] = p.position[0]; positions[i + 1] = p.position[1]; positions[i + 2] = p.position[2];
    const hex = p.role === "photo" ? "#66f2ff" : p.role === "hair" ? "#007bff" : p.role === "eye" ? "#8af8ff"
      : p.role === "mouth" ? "#66f2ff" : "#00e5ff";
    c.set(hex);
    colors[i] = c.r * p.intensity; colors[i + 1] = c.g * p.intensity; colors[i + 2] = c.b * p.intensity;
    sizes[idx] = p.size;
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  g.setAttribute("holoSize", new THREE.BufferAttribute(sizes, 1));
  return g;
}

function FaceParticles({ particles, state, quality }: { particles: AvatarParticle[]; state: AvatarState; quality: QualityTier }) {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  // build geometry + tag which particles are eyes/mouth (for blink + lip-sync) + their
  // base positions and feature-centre Y (so the eyelid/jaw close toward the right line).
  const built = useMemo(() => {
    const geometry = buildGeometry(particles);
    const base = (geometry.attributes.position.array as Float32Array).slice();
    const eyeIdx: number[] = [], mouthIdx: number[] = [];
    let eyeSumY = 0, mouthSumY = 0;
    particles.forEach((p, i) => {
      if (p.role === "eye") { eyeIdx.push(i); eyeSumY += p.position[1]; }
      else if (p.role === "mouth") { mouthIdx.push(i); mouthSumY += p.position[1]; }
    });
    return {
      geometry, base, eyeIdx, mouthIdx,
      eyeCY: eyeIdx.length ? eyeSumY / eyeIdx.length : 0,
      mouthCY: mouthIdx.length ? mouthSumY / mouthIdx.length : 0,
    };
  }, [particles]);
  const spk = useRef({ active: false, pulse: 0, amp: 0 });
  useEffect(() => {
    const onStart = () => (spk.current.active = true);
    const onPulse = () => (spk.current.pulse = 1);
    const onEnd = () => (spk.current.active = false);
    window.addEventListener(AVATAR_EVENTS.speakStart, onStart);
    window.addEventListener(AVATAR_EVENTS.speakPulse, onPulse);
    window.addEventListener(AVATAR_EVENTS.speakEnd, onEnd);
    return () => {
      window.removeEventListener(AVATAR_EVENTS.speakStart, onStart);
      window.removeEventListener(AVATAR_EVENTS.speakPulse, onPulse);
      window.removeEventListener(AVATAR_EVENTS.speakEnd, onEnd);
    };
  }, []);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true,
        uniforms: { uTime: { value: 0 }, uPulse: { value: 1 }, uDim: { value: 1 }, uSize: { value: quality === "low" ? 18 : 24 } },
        vertexShader: `
          attribute float holoSize; varying vec3 vColor;
          uniform float uTime; uniform float uPulse; uniform float uDim; uniform float uSize;
          void main(){
            vColor = color * uDim;
            vec3 p = position;
            p.x += sin(uTime*0.75 + position.y*3.2 + position.z)*0.016*uPulse;
            p.y += cos(uTime*0.62 + position.x*2.7)*0.012*uPulse;
            p.z += sin(uTime*0.52 + position.x*2.2)*0.015*uPulse;
            vec4 mv = modelViewMatrix*vec4(p,1.0);
            gl_PointSize = holoSize*(uSize/-mv.z)*uPulse;
            gl_Position = projectionMatrix*mv;
          }`,
        fragmentShader: `
          varying vec3 vColor;
          void main(){
            float d = distance(gl_PointCoord, vec2(0.5));
            float a = smoothstep(0.5, 0.02, d);
            gl_FragColor = vec4(vColor, a);
          }`,
      }),
    [quality],
  );
  useFrame(({ clock }) => {
    const m = matRef.current; if (!m) return;
    const t = clock.elapsedTime;
    const s = spk.current; s.pulse *= 0.88;
    const speakBoost = s.active ? 0.16 + 0.16 * Math.abs(Math.sin(t * 9)) + s.pulse * 0.22 : 0;
    s.amp += ((s.active ? 1 : 0) - s.amp) * 0.2;
    m.uniforms.uTime.value = t;
    m.uniforms.uPulse.value = statePulse(state) + Math.sin(t * 1.6) * 0.05 + speakBoost;
    m.uniforms.uDim.value = state === "offline" || state === "sleep" ? 0.34 : 1 + s.amp * 0.1;

    // eyes blink + mouth lip-sync — nudge the tagged particles' Y off their base positions.
    const { geometry, base, eyeIdx, mouthIdx, eyeCY, mouthCY } = built;
    if (eyeIdx.length || mouthIdx.length) {
      const arr = geometry.attributes.position.array as Float32Array;
      // blink: a quick eyelid close roughly every 4s (faster + heavier while asleep)
      const period = state === "sleep" ? 1.8 : 4.0;
      const phase = t % period;
      const close = state === "sleep" ? 0.55 : 0.18; // how long the lid stays down
      const blink = phase > period - close ? Math.sin(((phase - (period - close)) / close) * Math.PI) : 0;
      const lid = state === "sleep" ? 0.85 : 1; // asleep = nearly shut
      for (let k = 0; k < eyeIdx.length; k++) {
        const j = eyeIdx[k] * 3 + 1;
        arr[j] = base[j] + (eyeCY - base[j]) * blink * lid;
      }
      // mouth: lower-lip/jaw particles drop while speaking (amp), shaped by a fast oscillation
      const open = s.amp * (0.4 + 0.6 * Math.abs(Math.sin(t * 9))) * 0.16;
      for (let k = 0; k < mouthIdx.length; k++) {
        const j = mouthIdx[k] * 3 + 1;
        arr[j] = base[j] < mouthCY ? base[j] - open : base[j]; // only the jaw half opens
      }
      geometry.attributes.position.needsUpdate = true;
    }
  });
  return (
    <points geometry={built.geometry}>
      <primitive ref={matRef} object={material} attach="material" />
    </points>
  );
}

function GlowTube({ points, color = "#66f2ff", radius = 0.0028, opacity = 0.3, pulse = false }: { points: [number, number, number][]; color?: string; radius?: number; opacity?: number; pulse?: boolean }) {
  const ref = useRef<THREE.MeshBasicMaterial>(null);
  const geo = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
    return new THREE.TubeGeometry(curve, Math.max(20, points.length * 8), radius, 8, false);
  }, [points, radius]);
  useFrame(({ clock }) => { if (ref.current && pulse) ref.current.opacity = Math.max(0, opacity + Math.sin(clock.elapsedTime * 2.2) * 0.05); });
  return (
    <mesh geometry={geo}><meshBasicMaterial ref={ref} color={color} transparent opacity={opacity} blending={THREE.AdditiveBlending} depthWrite={false} /></mesh>
  );
}

// Translucent rim/scan hologram shell — gives the face DEPTH (Codex HologramShell).
function HologramShell({ position, scale, opacity, color = "#00e5ff", state }: { position: [number, number, number]; scale: [number, number, number]; opacity: number; color?: string; state: AvatarState }) {
  const ref = useRef<THREE.ShaderMaterial>(null);
  const mat = useMemo(() => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uOpacity: { value: opacity }, uDim: { value: 1 }, uColor: { value: new THREE.Color(color) } },
    vertexShader: `varying vec3 vN; varying vec3 vW; void main(){ vN=normalize(normalMatrix*normal); vec4 w=modelMatrix*vec4(position,1.0); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `uniform float uTime; uniform float uOpacity; uniform float uDim; uniform vec3 uColor; varying vec3 vN; varying vec3 vW;
      void main(){ float rim=pow(1.0-abs(vN.z),1.65); float scan=smoothstep(0.84,1.0,sin((vW.y+uTime*0.08)*54.0)*0.5+0.5);
      float noise=smoothstep(0.72,1.0,sin((vW.x*28.0)+(vW.y*33.0)+uTime)*0.5+0.5);
      float a=(0.06+rim*0.42+scan*0.045+noise*0.025)*uOpacity*uDim; gl_FragColor=vec4(uColor,a); }`,
  }), [color, opacity]);
  useFrame(({ clock }) => { if (ref.current) { ref.current.uniforms.uTime.value = clock.elapsedTime; ref.current.uniforms.uDim.value = state === "offline" ? 0.35 : 1; } });
  return (<mesh position={position} scale={scale}><sphereGeometry args={[1, 64, 48]} /><primitive ref={ref} object={mat} attach="material" /></mesh>);
}

// Lineage web — fine thin lines between nearby particles (the reference's mesh). The
// dots ARE the knowledge notes; these lines are their lineage/connections.
function LineageWeb({ web, state }: { web: Float32Array; state: AvatarState }) {
  const matRef = useRef<THREE.LineBasicMaterial>(null);
  const lines = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(web, 3));
    const mat = new THREE.LineBasicMaterial({ color: new THREE.Color("#3aa0ff"), transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false });
    matRef.current = mat;
    return new THREE.LineSegments(geo, mat);
  }, [web]);
  useFrame(({ clock }) => {
    if (!matRef.current) return;
    const base = state === "thinking" ? 0.22 : state === "offline" ? 0.05 : 0.14;
    matRef.current.opacity = base + Math.sin(clock.elapsedTime * 1.4) * 0.04;
  });
  return <primitive object={lines} />;
}

// Concentric HUD/orbit rings — the "dimensional / orbit" look Fahmi liked in Codex.
function HudRings({ state }: { state: AvatarState }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const speed = state === "offline" ? 0.018 : 0.045;
    ref.current.rotation.z = clock.elapsedTime * speed;
    ref.current.rotation.y = Math.sin(clock.elapsedTime * 0.24) * 0.08;
  });
  return (
    <group ref={ref} position={[0, 0.4, -0.35]}>
      {[1.55, 1.9, 2.24, 2.56].map((r, i) => (
        <mesh key={r} rotation={[0, 0, i * 0.35]}><torusGeometry args={[r, 0.0035, 8, 180]} /><meshBasicMaterial color={i % 2 ? "#007bff" : "#00e5ff"} transparent opacity={state === "offline" ? 0.05 : 0.18 - i * 0.025} blending={THREE.AdditiveBlending} /></mesh>
      ))}
      <mesh rotation={[0, 0, Math.PI / 5]}><torusGeometry args={[2.78, 0.0025, 8, 180]} /><meshBasicMaterial color="#66f2ff" transparent opacity={state === "offline" ? 0.04 : 0.16} blending={THREE.AdditiveBlending} /></mesh>
    </group>
  );
}

function VoiceRings({ state }: { state: AvatarState }) {
  const ref = useRef<THREE.Group>(null);
  const visible = state === "listening" || state === "responding" || state === "speaking";
  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.scale.setScalar(1 + (Math.sin(clock.elapsedTime * 3.5) * 0.5 + 0.5) * 0.08);
    ref.current.rotation.z = Math.sin(clock.elapsedTime * 2) * 0.05;
  });
  if (!visible) return null;
  return (
    <group ref={ref} position={[0, state === "responding" || state === "speaking" ? 0.18 : 0.78, 0.98]}>
      {[0.28, 0.42, 0.58].map((r, i) => (
        <mesh key={r}><torusGeometry args={[r, 0.004, 8, 96]} /><meshBasicMaterial color={state === "responding" || state === "speaking" ? "#66f2ff" : "#00ffa3"} transparent opacity={0.18 - i * 0.04} blending={THREE.AdditiveBlending} /></mesh>
      ))}
    </group>
  );
}

function Scene({ particles, web, state, nodes, reduced, quality }: { particles: AvatarParticle[]; web: Float32Array; state: AvatarState; nodes: KnowledgeNode[]; reduced: boolean; quality: QualityTier }) {
  const root = useRef<THREE.Group>(null);
  // The face is a flat-ish photo sample → keep it mostly FRONT-FACING (the reference is
  // front-facing); subtle sway + gentle gaze-follow so it stays recognizable, not spun.
  const gaze = useRef({ yaw: 0, pitch: 0, tYaw: 0, tPitch: 0, present: 0, tPresent: 0 });
  useEffect(() => {
    const onTrack = (e: Event) => {
      const d = (e as CustomEvent).detail as { gazeTarget?: [number, number, number]; userPresent?: boolean };
      gaze.current.tYaw = THREE.MathUtils.clamp(d.gazeTarget?.[0] ?? 0, -1, 1) * 0.32;
      gaze.current.tPitch = THREE.MathUtils.clamp(d.gazeTarget?.[1] ?? 0, -1, 1) * 0.16;
      gaze.current.tPresent = d.userPresent ? 1 : 0;
    };
    window.addEventListener(AVATAR_EVENTS.tracking, onTrack as EventListener);
    return () => window.removeEventListener(AVATAR_EVENTS.tracking, onTrack as EventListener);
  }, []);
  useFrame(({ clock }) => {
    if (!root.current) return;
    const t = reduced ? 0 : clock.elapsedTime;
    const g = gaze.current;
    g.yaw += (g.tYaw - g.yaw) * 0.1; g.pitch += (g.tPitch - g.pitch) * 0.1; g.present += (g.tPresent - g.present) * 0.06;
    // now that the face has real depth, rotate a bit more to SHOW the dimension
    root.current.rotation.y = Math.sin(t * 0.24) * 0.18 * (1 - g.present * 0.5) + g.yaw;
    root.current.rotation.x = Math.sin(t * 0.16) * 0.02 + g.pitch;
    root.current.position.y = Math.sin(t * 0.9) * 0.012;
  });
  return (
    <group ref={root}>
      <HudRings state={state} />
      <LineageWeb web={web} state={state} />
      <FaceParticles particles={particles} state={state} quality={quality} />
      <VoiceRings state={state} />
      {nodes.length > 0 && (
        <group position={[0, 0.5, 0]} scale={0.6}>
          <KnowledgeNodeOverlay nodes={nodes} state={state} reducedMotion={reduced} />
        </group>
      )}
    </group>
  );
}

const DEFAULT_FACE = "/avatars/face.png"; // the blue-hologram reference (Fahmi's target)

export function ParticleFaceRenderer({ state, quality = "high" }: { state: AvatarState; quality?: QualityTier }) {
  const [particles, setParticles] = useState<AvatarParticle[]>([]);
  const [nodes, setNodes] = useState<KnowledgeNode[]>([]);
  const [reduced, setReduced] = useState(false);
  const web = useMemo(() => (particles.length ? buildLineageWeb(particles) : new Float32Array()), [particles]);

  useEffect(() => {
    let cancelled = false;
    const maxPts = quality === "low" ? 7000 : 13000;
    // Default avatar = the reference face; a user photo (agentFace) replaces it. Show the
    // INSTANT pseudo-3D sample, then upgrade to REAL per-pixel depth (Depth Anything in the
    // browser) in the background. Falls back to the procedural bust if the image fails.
    const loadFace = (src: string) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        if (cancelled) return;
        setParticles(samplePhotoToParticles(img, { maxPoints: maxPts, seed: src }));
        samplePhotoWithDepth(src, img, { maxPoints: maxPts }).then((p) => { if (p && !cancelled) setParticles(p); });
      };
      img.onerror = () => { if (!cancelled) setParticles(generateAvatarParticles(4000)); };
      img.src = src;
    };
    loadFace(agentFace() || DEFAULT_FACE);
    const onAvatar = () => loadFace(agentFace() || DEFAULT_FACE);
    window.addEventListener("balairung:avatar-changed", onAvatar);
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onMq = () => setReduced(mq.matches); mq.addEventListener?.("change", onMq);
    const max = quality === "low" ? 5 : quality === "medium" ? 7 : 10;
    loadVault().then((n) => setNodes(toKnowledgeNodes(buildGraph(n), max)));
    return () => { cancelled = true; window.removeEventListener("balairung:avatar-changed", onAvatar); mq.removeEventListener?.("change", onMq); };
  }, [quality]);

  return (
    // pointer-events:none — the avatar must NOT capture the mouse (panels + hand-gesture
    // cursor need it). Orbit is driven by face tracking (Scene), not mouse drag. (F-031)
    <Canvas camera={{ position: [0, 0.32, 6.6], fov: 42 }} dpr={[1, quality === "low" ? 1.25 : 1.75]} gl={{ alpha: true, antialias: true }} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      <ambientLight intensity={0.25} />
      <pointLight position={[0, 1.5, 3]} color="#00e5ff" intensity={2.2} />
      <Scene particles={particles} web={web} state={state} nodes={nodes} reduced={reduced} quality={quality} />
    </Canvas>
  );
}
