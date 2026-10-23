"use client";

import { useEffect, useRef } from "react";

const GLYPHS = ["{ }", "</>", "fn", "=>", "#", "$", ".env", "README", "diff", "AST", "PR", "::="];

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  glyph: string;
  size: number;
  alpha: number;
}

/**
 * Constellation of drifting code glyphs with proximity links.
 * Respects prefers-reduced-motion and pauses when the tab is hidden.
 */
export function HeroCanvas({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let w = 0;
    let h = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const mouse = { x: -9999, y: -9999 };
    let particles: Particle[] = [];

    function seed() {
      const count = Math.min(46, Math.max(20, Math.floor((w * h) / 34000)));
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.22,
        vy: (Math.random() - 0.5) * 0.22,
        glyph: GLYPHS[Math.floor(Math.random() * GLYPHS.length)],
        size: 10 + Math.random() * 8,
        alpha: 0.14 + Math.random() * 0.3,
      }));
    }

    function resize() {
      const rect = canvas!.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas!.width = w * dpr;
      canvas!.height = h * dpr;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
    }

    function step() {
      ctx!.clearRect(0, 0, w, h);

      // links
      for (let i = 0; i < particles.length; i++) {
        const a = particles[i];
        for (let j = i + 1; j < particles.length; j++) {
          const b = particles[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < 150 * 150) {
            const o = (1 - Math.sqrt(d2) / 150) * 0.09;
            ctx!.strokeStyle = `rgba(255,90,31,${o})`;
            ctx!.lineWidth = 1;
            ctx!.beginPath();
            ctx!.moveTo(a.x, a.y);
            ctx!.lineTo(b.x, b.y);
            ctx!.stroke();
          }
        }
      }

      // glyphs
      for (const p of particles) {
        if (!reduced) {
          p.x += p.vx;
          p.y += p.vy;

          // gentle pointer repulsion
          const dx = p.x - mouse.x;
          const dy = p.y - mouse.y;
          const dist = Math.hypot(dx, dy);
          if (dist < 130 && dist > 0.01) {
            const f = ((130 - dist) / 130) * 0.35;
            p.x += (dx / dist) * f;
            p.y += (dy / dist) * f;
          }

          if (p.x < -40) p.x = w + 40;
          if (p.x > w + 40) p.x = -40;
          if (p.y < -40) p.y = h + 40;
          if (p.y > h + 40) p.y = -40;
        }

        ctx!.font = `${p.size}px var(--font-plex-mono), monospace`;
        ctx!.fillStyle = `rgba(139,151,179,${p.alpha})`;
        ctx!.fillText(p.glyph, p.x, p.y);
      }

      raf = requestAnimationFrame(step);
    }

    function onPointer(e: PointerEvent) {
      const rect = canvas!.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
    }
    function onLeave() {
      mouse.x = -9999;
      mouse.y = -9999;
    }
    function onVisibility() {
      if (document.hidden) cancelAnimationFrame(raf);
      else raf = requestAnimationFrame(step);
    }

    resize();
    step();

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    window.addEventListener("pointermove", onPointer, { passive: true });
    canvas.addEventListener("pointerleave", onLeave);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("pointermove", onPointer);
      canvas.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return <canvas ref={canvasRef} className={className} aria-hidden />;
}
