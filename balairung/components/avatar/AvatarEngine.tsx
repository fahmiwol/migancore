"use client";
import { useEffect, useState } from "react";
import { DEFAULT_PRESET, getPreset } from "@/lib/avatar/presets";
import type { AvatarState } from "@/types/avatar";
import { RupaFoto } from "@/components/RupaFoto";
import { OrbRenderer } from "@/components/avatar/renderers/OrbRenderer";
import { ParticleFaceRenderer } from "@/components/avatar/renderers/ParticleFaceRenderer";
import { AvatarBoundary } from "@/components/avatar/AvatarBoundary";
import { AVATAR_EVENTS } from "@/lib/avatar/signals";

// AvatarEngine — Strategy Pattern dispatcher (A1). Reads the active preset/config,
// maps MiganPro runtime events → AvatarState, and renders the matching renderer.
// orb → OrbRenderer. humanBust/default → RupaFoto (particle face) until the
// Hybrid Holographic Human (Guide-Mesh GLB) lands in A2. See 07_AVATAR_ENGINE_SPEC.
export function AvatarEngine({ presetId }: { presetId?: string }) {
  const preset = presetId ? getPreset(presetId) : DEFAULT_PRESET;
  const [state, setState] = useState<AvatarState>("idle");

  useEffect(() => {
    const listen = () => setState("listening");
    const stop = () => setState("idle");
    // "thinking" persists until the answer starts speaking (speakStart) — so the avatar
    // visibly shows it's working during a slow reply. 120s safety so it never sticks.
    const ask = () => { setState("thinking"); setTimeout(() => setState((s) => (s === "thinking" ? "idle" : s)), 120000); };
    const speakStart = () => setState("speaking");
    const speakEnd = () => setState((s) => (s === "speaking" ? "idle" : s));
    window.addEventListener("balairung:listen", listen);
    window.addEventListener("balairung:stop", stop);
    window.addEventListener("balairung:ask", ask);
    window.addEventListener(AVATAR_EVENTS.speakStart, speakStart);
    window.addEventListener(AVATAR_EVENTS.speakEnd, speakEnd);
    return () => {
      window.removeEventListener("balairung:listen", listen);
      window.removeEventListener("balairung:stop", stop);
      window.removeEventListener("balairung:ask", ask);
      window.removeEventListener(AVATAR_EVENTS.speakStart, speakStart);
      window.removeEventListener(AVATAR_EVENTS.speakEnd, speakEnd);
    };
  }, []);

  if (preset.mode === "orb") return <OrbRenderer state={state} />;
  if (preset.mode === "humanBust" || preset.mode === "fullHuman")
    return (
      <AvatarBoundary>
        <ParticleFaceRenderer state={state} quality={preset.qualityTier} />
      </AvatarBoundary>
    );
  // knowledgeGraph / brain / abstract → particle face fallback (dedicated renderers next)
  return <RupaFoto />;
}
