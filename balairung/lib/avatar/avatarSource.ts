// Avatar source (A2.1b) — which GLB the Hybrid Holographic Human samples. Default is
// the self-hosted facecap head; a user can swap in a Ready Player Me GLB built from a
// selfie (RupaStudio). Lock-aware: once onboarding locks identity, the avatar is
// immutable (admin-only), same governance as name/voice/face (see lib/identity).
import { isLocked } from "@/lib/identity";

export const DEFAULT_GLB = "/avatars/face.glb";
const KEY = "migan_avatar_glb";

export function avatarGlb(): string {
  if (typeof window === "undefined") return DEFAULT_GLB;
  return localStorage.getItem(KEY) || DEFAULT_GLB;
}

/** Set a custom GLB (e.g. a Ready Player Me selfie avatar). No-op when locked. */
export function setAvatarGlb(url: string): boolean {
  if (typeof window === "undefined" || isLocked() || !url) return false;
  localStorage.setItem(KEY, url);
  window.dispatchEvent(new Event("balairung:avatar-changed"));
  return true;
}

/** Revert to the default head (admin). */
export function resetAvatarGlb(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEY);
  window.dispatchEvent(new Event("balairung:avatar-changed"));
}

export const hasCustomAvatar = (): boolean =>
  typeof window !== "undefined" && !!localStorage.getItem(KEY);
