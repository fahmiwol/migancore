// Avatar runtime signals (A3) — a tiny window-event bus between the senses (Lisan
// voice, Tatapan camera) and the avatar renderers. Keeps renderers decoupled: they
// subscribe to events instead of importing component state. SSR-safe (guards window).
import type { TrackingData } from "@/types/avatar";

export const AVATAR_EVENTS = {
  speakStart: "balairung:speakstart", // TTS began — detail: none
  speakPulse: "balairung:speakpulse", // per word/char boundary — mouth pulse
  speakEnd: "balairung:speakend",     // TTS finished/cancelled
  tracking: "balairung:tracking",     // detail: TrackingData (gaze/presence)
} as const;

const fire = (name: string, detail?: unknown) => {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(name, { detail }));
};

export const emitSpeakStart = () => fire(AVATAR_EVENTS.speakStart);
export const emitSpeakPulse = () => fire(AVATAR_EVENTS.speakPulse);
export const emitSpeakEnd = () => fire(AVATAR_EVENTS.speakEnd);
export const emitTracking = (t: TrackingData) => fire(AVATAR_EVENTS.tracking, t);
