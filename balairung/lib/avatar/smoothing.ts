// Smoothing (A3) — critically-damped lerp for perception data so the avatar's gaze
// glides instead of jittering with raw MediaPipe noise. k≈0.12 per 07_AVATAR_ENGINE_SPEC.
export const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;

/** Smooth a [x,y,z]-ish tuple toward a target in place-ish (returns new tuple). */
export function lerp3(a: [number, number, number], b: [number, number, number], k: number): [number, number, number] {
  return [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
}
