"use client";
import { useEffect } from "react";
import Lenis from "lenis";

// Denyut — the pulse that makes Balairung feel alive: smooth momentum scroll.
// Wire GSAP ScrollTrigger into this loop later for scroll-pinned HUD reveals.
export function Denyut({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const lenis = new Lenis({ duration: 1.1, smoothWheel: true });
    let raf = 0;
    const loop = (t: number) => { lenis.raf(t); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); lenis.destroy(); };
  }, []);
  return <>{children}</>;
}
