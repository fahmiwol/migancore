"use client";
import { Component, type ReactNode } from "react";
import { RupaFoto } from "@/components/RupaFoto";

// AvatarBoundary — a hard safety net around the WebGL avatar. A failing GLB / WebGL /
// postprocessing must NEVER white-screen the whole dashboard (root cause of the
// 2026-06-15 "client-side exception": face.glb uses KTX2 textures → useGLTF threw →
// no boundary → app died). On error we degrade gracefully to the Canvas-2D RupaFoto
// face so the assistant still has a face. See FINDINGS F-022.
export class AvatarBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: unknown) {
    console.error("Avatar renderer failed → falling back to RupaFoto:", err);
  }
  render() {
    if (this.state.failed) return <RupaFoto />;
    return this.props.children;
  }
}
