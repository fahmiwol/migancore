import type { AvatarConfig } from "@/types/avatar";

// 6 presets from Fahmi's PRD. Hero = "Premium Holographic Woman" (humanBust hologram).
// Setup wizard (Gerbang) picks one → locked at onboarding.
const noA11y = { reducedMotion: false, reducedBrightness: false, highContrast: false };

export const AVATAR_PRESETS: AvatarConfig[] = [
  { id: "preset_premium_holographic_woman", name: "MiganPro", mode: "humanBust", style: "holographic", realismLevel: "semiRealistic", bodyScope: "upperTorso", graphOverlay: "medium", interactionMode: "attentive", trackingMode: "headEyes", expressionLevel: "natural", motionLevel: "balanced", voiceStyle: "premium", qualityTier: "high", accessibility: noA11y },
  { id: "preset_knowledge_graph_intelligence", name: "MiganPro", mode: "knowledgeGraph", style: "scientific", realismLevel: "abstract", bodyScope: "none", graphOverlay: "strong", interactionMode: "attentive", trackingMode: "eyes", expressionLevel: "subtle", motionLevel: "balanced", voiceStyle: "professional", qualityTier: "medium", accessibility: noA11y },
  { id: "preset_neural_brain_assistant", name: "MiganPro", mode: "brain", style: "futuristic", realismLevel: "abstract", bodyScope: "none", graphOverlay: "strong", interactionMode: "reactive", trackingMode: "off", expressionLevel: "subtle", motionLevel: "balanced", voiceStyle: "calm", qualityTier: "medium", accessibility: noA11y },
  { id: "preset_full_body_concierge", name: "MiganPro", mode: "fullHuman", style: "premium", realismLevel: "realistic", bodyScope: "fullBody", graphOverlay: "minimal", interactionMode: "immersive", trackingMode: "upperBody", expressionLevel: "natural", motionLevel: "balanced", voiceStyle: "warm", qualityTier: "high", accessibility: noA11y },
  { id: "preset_minimal_orb", name: "MiganPro", mode: "orb", style: "minimal", realismLevel: "abstract", bodyScope: "none", graphOverlay: "off", interactionMode: "reactive", trackingMode: "off", expressionLevel: "subtle", motionLevel: "calm", voiceStyle: "calm", qualityTier: "low", accessibility: noA11y },
  { id: "preset_abstract_energy_entity", name: "MiganPro", mode: "abstract", style: "experimental", realismLevel: "abstract", bodyScope: "none", graphOverlay: "medium", interactionMode: "reactive", trackingMode: "off", expressionLevel: "subtle", motionLevel: "cinematic", voiceStyle: "premium", qualityTier: "medium", accessibility: noA11y },
];

export const DEFAULT_PRESET = AVATAR_PRESETS[0]; // Premium Holographic Woman
export const getPreset = (id: string) => AVATAR_PRESETS.find((p) => p.id === id) ?? DEFAULT_PRESET;
