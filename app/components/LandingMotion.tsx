"use client";
import { useEffect, type ReactNode } from "react";
import Lenis from "lenis";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
export function LandingMotion({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    gsap.registerPlugin(ScrollTrigger);
    const lenis = new Lenis({ lerp: .075, smoothWheel: true, anchors: { offset: 0 } });
    const update = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(update); gsap.ticker.lagSmoothing(0); lenis.on("scroll", ScrollTrigger.update);
    const ctx = gsap.context(() => {
      gsap.from(".hero-copy .reveal", { y: 42, opacity: 0, duration: 1.05, stagger: .11, ease: "power3.out", delay: .15 });
      gsap.from(".hero-grid", { scale: .82, opacity: 0, duration: 1.5, ease: "power3.out" });
      gsap.to(".orbit-one", { rotate: 360, duration: 42, repeat: -1, ease: "none" });
      gsap.to(".orbit-two", { rotate: -360, duration: 58, repeat: -1, ease: "none" });
      gsap.utils.toArray<HTMLElement>(".section-pad .reveal").forEach((el) => gsap.from(el, { y: 46, opacity: 0, duration: .9, ease: "power3.out", scrollTrigger: { trigger: el, start: "top 86%", once: true } }));
      gsap.to(".cta-orb", { yPercent: -12, scrollTrigger: { trigger: ".final-cta", start: "top bottom", end: "bottom top", scrub: 1.2 } });
    });
    return () => { ctx.revert(); lenis.destroy(); gsap.ticker.remove(update); };
  }, []);
  return children;
}
