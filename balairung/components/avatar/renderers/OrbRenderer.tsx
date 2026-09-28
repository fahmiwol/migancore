"use client";
import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { AvatarState } from "@/types/avatar";

// OrbRenderer — simplest avatar form (Strategy Pattern). A breathing sphere of
// particles that reacts to runtime state. Proves the engine end-to-end (A1).
function OrbPoints({ state }: { state: AvatarState }) {
  const ref = useRef<THREE.Points>(null);
  const geo = useMemo(() => {
    const N = 1400, pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const phi = Math.acos(1 - 2 * (i + 0.5) / N);
      const th = Math.PI * (1 + Math.sqrt(5)) * i;
      pos[i * 3] = Math.cos(th) * Math.sin(phi);
      pos[i * 3 + 1] = Math.sin(th) * Math.sin(phi);
      pos[i * 3 + 2] = Math.cos(phi);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return g;
  }, []);
  useFrame((_, d) => {
    if (!ref.current) return;
    const spin = state === "thinking" ? 1.3 : state === "listening" ? 0.6 : 0.2;
    ref.current.rotation.y += d * spin;
    const pulse = (state === "listening" || state === "speaking") ? 0.12 : 0.04;
    ref.current.scale.setScalar(1 + pulse * Math.sin(performance.now() * 0.005));
  });
  const color = state === "listening" ? "#46f0c0" : state === "thinking" ? "#7fb8ff" : "#5fe9ff";
  return (
    <points ref={ref} geometry={geo}>
      <pointsMaterial size={0.035} color={color} transparent opacity={0.92} sizeAttenuation depthWrite={false} blending={THREE.AdditiveBlending} />
    </points>
  );
}

export function OrbRenderer({ state }: { state: AvatarState }) {
  return (
    <Canvas camera={{ position: [0, 0, 3], fov: 45 }} style={{ position: "absolute", inset: 0 }} gl={{ alpha: true }}>
      <OrbPoints state={state} />
    </Canvas>
  );
}
