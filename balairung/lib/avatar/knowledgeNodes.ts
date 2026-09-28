// Knowledge-node overlay data (A2.1a). Maps the Khazanah graph (per-tenant private
// vault) into floating, categorized nodes that anchor to the hologram face. This is
// the "memory trace / context node / neural pathway / core belief" overlay from
// Fahmi's blue-hologram reference — every label is a REAL Khazanah note, so the face
// visibly shows what the agent knows. Pure & deterministic (SSR-safe: no Math.random).
import * as THREE from "three";
import type { GraphData } from "@/lib/khazanah";

export type NodeCategory = "belief" | "neural" | "context" | "memory";

export interface KnowledgeNode {
  id: string;
  label: string;            // the Khazanah note title
  category: NodeCategory;
  tag: string;              // plain-Indonesian category caption (UI = plain, per naming rule)
  color: string;            // category hue
  anchor: [number, number, number]; // point on the face the connector starts from
  base: [number, number, number];   // resting float position (around the face)
  phase: number;            // deterministic animation phase
  spin: number;             // drift speed factor
}

// Category → PLAIN everyday Indonesian caption + hue (UI = plain words an executive
// reads at a glance, not jargon; the metaphor stays backend-only, Primbon rule).
const CATS: Record<NodeCategory, { tag: string; color: string }> = {
  belief:  { tag: "utama",   color: "#ffd27f" }, // warm gold — strongest links
  neural:  { tag: "terkait", color: "#46f0c0" }, // teal
  context: { tag: "konteks", color: "#5fe9ff" }, // cyan
  memory:  { tag: "ingatan", color: "#9fb8ff" }, // soft blue
};

// Face-region anchor points (model space; the face is normalized to span ~±1.3).
// Eyes / brow / temples / lips / jaw / chest / crown — gives the connectors a
// "wired into the face" look instead of a random dot cloud.
const ANCHORS: [number, number, number][] = [
  [-0.42, 0.26, 0.48], [0.42, 0.26, 0.48],  // eyes
  [0.0, 0.58, 0.46],                         // brow / forehead
  [-0.72, 0.42, 0.18], [0.72, 0.42, 0.18],   // temples
  [0.0, -0.34, 0.56],                        // lips
  [-0.5, -0.66, 0.32], [0.5, -0.66, 0.32],   // jaw
  [0.0, -1.06, 0.26], [0.0, 0.95, 0.30],     // chest, crown
];

const categorize = (degree: number): NodeCategory =>
  degree >= 3 ? "belief" : degree === 2 ? "neural" : degree === 1 ? "context" : "memory";

// Deterministic pseudo-random in [0,1) from an integer seed (no Math.random → SSR-safe,
// stable between server and client renders).
const rnd = (seed: number): number => {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/** Turn the Khazanah graph into up to `max` floating face nodes (highest-degree first). */
export function toKnowledgeNodes(graph: GraphData, max = 10): KnowledgeNode[] {
  const sorted = [...graph.nodes].sort((a, b) => b.degree - a.degree).slice(0, Math.max(0, max));
  return sorted.map((n, i) => {
    const cat = categorize(n.degree);
    const meta = CATS[cat];
    const anchor = ANCHORS[i % ANCHORS.length];
    // Float outward from the origin through the anchor, nudged by a stable seed so
    // labels fan out around the head rather than overlapping.
    const jitterX = (rnd(i + 1) - 0.5) * 0.55;
    const jitterY = (rnd(i + 7) - 0.5) * 0.55;
    const dir = new THREE.Vector3(anchor[0] + jitterX, anchor[1] + jitterY, 0.1 + rnd(i + 3) * 0.5);
    if (dir.lengthSq() < 1e-4) dir.set(0, 1, 0.2);
    dir.normalize().multiplyScalar(1.75 + rnd(i + 5) * 0.7);
    return {
      id: n.id,
      label: n.title,
      category: cat,
      tag: meta.tag,
      color: meta.color,
      anchor,
      base: [dir.x, dir.y, dir.z],
      phase: rnd(i + 2) * Math.PI * 2,
      spin: 0.5 + rnd(i + 9) * 0.6,
    };
  });
}
