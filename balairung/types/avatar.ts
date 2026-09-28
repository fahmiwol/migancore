// Adaptive Avatar Engine — core types. Adopted from Fahmi's PRD (07_AVATAR_ENGINE_SPEC.md).
// Strategy Pattern: one config drives swappable renderers (orb/humanBust/brain/graph/...).

export type AvatarMode =
  | "orb" | "sphere" | "humanBust" | "fullHuman" | "animal" | "brain" | "knowledgeGraph" | "abstract";

export type AvatarStyle =
  | "minimal" | "premium" | "futuristic" | "holographic" | "elegant" | "cute" | "corporate" | "mystical" | "scientific" | "experimental";

export type RealismLevel = "abstract" | "stylized" | "semiRealistic" | "realistic" | "hyperFuturistic";
export type BodyScope = "none" | "bust" | "upperTorso" | "fullBody";
export type GraphOverlay = "off" | "minimal" | "medium" | "strong";
export type InteractionMode = "passive" | "reactive" | "attentive" | "immersive";
export type TrackingMode = "off" | "eyes" | "headEyes" | "upperBody" | "full";
export type ExpressionLevel = "subtle" | "natural" | "expressive";
export type MotionLevel = "calm" | "balanced" | "active" | "cinematic";
export type VoiceStyle = "professional" | "warm" | "friendly" | "calm" | "premium";
export type QualityTier = "low" | "medium" | "high";

export type AvatarState =
  | "idle" | "listening" | "thinking" | "responding" | "speaking"
  | "greeting" | "attention" | "offline" | "sleep" | "error";

export type EmotionType =
  | "calm" | "happy" | "warm" | "focused" | "empathetic" | "curious" | "serious" | "analytical" | "alert" | "confused" | "apologetic";

export interface AvatarConfig {
  id: string;
  name: string; // the agent's name (user-given); engine echoes it
  mode: AvatarMode;
  style: AvatarStyle;
  realismLevel: RealismLevel;
  bodyScope: BodyScope;
  graphOverlay: GraphOverlay;
  interactionMode: InteractionMode;
  trackingMode: TrackingMode;
  expressionLevel: ExpressionLevel;
  motionLevel: MotionLevel;
  voiceStyle: VoiceStyle;
  qualityTier: QualityTier;
  accessibility: { reducedMotion: boolean; reducedBrightness: boolean; highContrast: boolean };
}

export interface TrackingData {
  userPresent: boolean;
  faceCenter: [number, number, number];
  gazeTarget: [number, number, number];
  headRotation: [number, number, number]; // yaw, pitch, roll (rad)
  proximity: number; // 0 far → 1 close
  confidence: number;
}

export interface VisemeFrame { viseme: string; amplitude: number; timestamp: number }

export interface SpeechRuntimeData { isSpeaking: boolean; amplitude: number; viseme?: string; phoneme?: string; progress?: number }

export interface AvatarRuntimeSignal {
  state: AvatarState;
  emotion?: EmotionType;
  speakingAmplitude?: number;
  viseme?: string;
  activeTopic?: string;
  attentionTarget?: { x: number; y: number; z: number };
  selectedKnowledgeNodeId?: string;
}

// Renderer interface — every avatar form implements this (Strategy Pattern).
export interface AvatarRendererProps {
  config: AvatarConfig;
  state: AvatarState;
  signal: AvatarRuntimeSignal;
  tracking?: TrackingData;
  speech?: SpeechRuntimeData;
}
