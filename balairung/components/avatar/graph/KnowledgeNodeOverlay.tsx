"use client";
import { useMemo, useRef } from "react";
import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { AvatarState } from "@/types/avatar";
import type { KnowledgeNode } from "@/lib/avatar/knowledgeNodes";

// KnowledgeNodeOverlay (A2.1a) — floating, labeled knowledge nodes wired into the
// hologram face. Each node = a real Khazanah note; a glowing connector runs from a
// face anchor (eye/brow/jaw/chest) to a drifting label. Renders INSIDE the avatar
// Canvas. State-reactive: thinking pulses brighter/faster. Connectors are one
// LineSegments buffer (cheap); labels follow their animated parent group.
export function KnowledgeNodeOverlay({
  nodes,
  state,
  reducedMotion,
}: {
  nodes: KnowledgeNode[];
  state: AvatarState;
  reducedMotion?: boolean;
}) {
  const groups = useRef<(THREE.Group | null)[]>([]);

  // One LineSegments object for all connectors (2 vertices each), updated per frame.
  const lines = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(nodes.length * 6), 3));
    const mat = new THREE.LineBasicMaterial({
      color: new THREE.Color("#5fe9ff"),
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    return new THREE.LineSegments(geo, mat);
  }, [nodes.length]);

  useFrame((st) => {
    const t = reducedMotion ? 0 : st.clock.elapsedTime;
    const energy = state === "thinking" ? 1.6 : state === "listening" || state === "speaking" ? 1.25 : 1;
    const drift = reducedMotion ? 0 : 0.12 * energy;
    const pos = lines.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      const px = n.base[0] + Math.sin(t * 0.4 * n.spin + n.phase) * drift;
      const py = n.base[1] + Math.cos(t * 0.33 * n.spin + n.phase) * drift;
      const pz = n.base[2] + Math.sin(t * 0.5 * n.spin + n.phase) * drift * 0.6;
      const g = groups.current[i];
      if (g) g.position.set(px, py, pz);
      pos.setXYZ(i * 2, n.anchor[0], n.anchor[1], n.anchor[2]);
      pos.setXYZ(i * 2 + 1, px, py, pz);
    }
    pos.needsUpdate = true;
    const base = state === "thinking" ? 0.5 : 0.3;
    (lines.material as THREE.LineBasicMaterial).opacity = base + (reducedMotion ? 0 : Math.sin(t * 1.5) * 0.08);
  });

  return (
    <group>
      <primitive object={lines} />
      {nodes.map((n, i) => (
        <group key={n.id} ref={(el) => { groups.current[i] = el; }}>
          {/* glowing node dot (bright + toneMapped:false → bloom picks it up) */}
          <mesh>
            <sphereGeometry args={[0.026, 12, 12]} />
            <meshBasicMaterial color={n.color} toneMapped={false} transparent opacity={0.95} />
          </mesh>
          {/* halo */}
          <mesh>
            <sphereGeometry args={[0.05, 12, 12]} />
            <meshBasicMaterial color={n.color} toneMapped={false} transparent opacity={0.18} blending={THREE.AdditiveBlending} depthWrite={false} />
          </mesh>
          <Html center distanceFactor={8} zIndexRange={[20, 0]} style={{ pointerEvents: "none", userSelect: "none" }}>
            <div style={{ transform: "translateY(-150%)", whiteSpace: "nowrap", textAlign: "center" }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: 0.4,
                  color: n.color,
                  textShadow: `0 0 8px ${n.color}aa, 0 0 2px ${n.color}`,
                }}
              >
                {n.label}
              </div>
              <div
                style={{
                  marginTop: 1,
                  fontSize: 7.5,
                  letterSpacing: 1.6,
                  textTransform: "uppercase",
                  color: "rgba(159,199,207,0.7)",
                }}
              >
                {n.tag}
              </div>
            </div>
          </Html>
        </group>
      ))}
    </group>
  );
}
