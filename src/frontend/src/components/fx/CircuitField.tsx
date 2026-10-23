"use client";

import { useEffect, useRef } from "react";

/**
 * CircuitField — the Studio's "tech vibe" background.
 *
 * A quiet PCB: orthogonal traces etched on a grid, solder nodes at the
 * junctions, and light pulses (ember / mint / amber) traveling along the
 * traces. Seeded and deterministic; pauses when the tab is hidden; renders
 * one static frame under prefers-reduced-motion.
 */
export function CircuitField() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function mulberry32(seed: number): () => number {
      let s = seed | 0;
      return () => {
        s = (s + 0x6d2b79f5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }

    interface Pt {
      x: number;
      y: number;
    }
    interface Trace {
      pts: Pt[];
      lens: number[];
      total: number;
    }
    interface Pulse {
      trace: number;
      t: number;
      speed: number;
      color: string;
    }

    const EMBER = "255, 90, 31";
    const MINT = "46, 229, 157";
    const AMBER = "255, 176, 58";

    let traces: Trace[] = [];
    let pulses: Pulse[] = [];
    let raf = 0;
    let running = true;
    let last = performance.now();

    const build = (w: number, h: number) => {
      const rnd = mulberry32(90210);
      const cell = 58;
      const cols = Math.max(4, Math.ceil(w / cell));
      const rows = Math.max(4, Math.ceil(h / cell));
      traces = [];
      const count = Math.min(26, Math.max(10, Math.round((w * h) / 34000)));

      for (let i = 0; i < count; i++) {
        const pts: Pt[] = [];
        let cx = Math.floor(rnd() * cols);
        let cy = Math.floor(rnd() * rows);
        pts.push({ x: cx * cell, y: cy * cell });
        const segs = 2 + Math.floor(rnd() * 3);
        for (let s = 0; s < segs; s++) {
          const horizontal = s % 2 === 0;
          const step = (2 + Math.floor(rnd() * 5)) * (rnd() > 0.5 ? 1 : -1);
          if (horizontal) cx = Math.min(cols, Math.max(0, cx + step));
          else cy = Math.min(rows, Math.max(0, cy + step));
          pts.push({ x: cx * cell, y: cy * cell });
        }
        const lens: number[] = [];
        let total = 0;
        for (let p = 1; p < pts.length; p++) {
          const l =
            Math.abs(pts[p].x - pts[p - 1].x) + Math.abs(pts[p].y - pts[p - 1].y);
          lens.push(l);
          total += l;
        }
        if (total > cell) traces.push({ pts, lens, total });
      }

      pulses = [];
      const colors = [EMBER, EMBER, EMBER, MINT, MINT, AMBER];
      for (let i = 0; i < Math.min(9, traces.length * 2); i++) {
        pulses.push({
          trace: Math.floor(rnd() * traces.length),
          t: rnd(),
          speed: 0.05 + rnd() * 0.09,
          color: colors[i % colors.length],
        });
      }
    };

    const pointAt = (tr: Trace, dist: number): Pt => {
      let d = dist;
      for (let p = 1; p < tr.pts.length; p++) {
        if (d <= tr.lens[p - 1]) {
          const a = tr.pts[p - 1];
          const b = tr.pts[p];
          const k = tr.lens[p - 1] === 0 ? 0 : d / tr.lens[p - 1];
          return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
        }
        d -= tr.lens[p - 1];
      }
      return tr.pts[tr.pts.length - 1];
    };

    const drawScene = (w: number, h: number, withPulses: boolean, dt: number) => {
      ctx.clearRect(0, 0, w, h);

      // etched traces + solder nodes
      ctx.lineWidth = 1;
      for (const tr of traces) {
        ctx.strokeStyle = "rgba(163, 157, 146, 0.10)";
        ctx.beginPath();
        ctx.moveTo(tr.pts[0].x, tr.pts[0].y);
        for (let p = 1; p < tr.pts.length; p++) ctx.lineTo(tr.pts[p].x, tr.pts[p].y);
        ctx.stroke();
        for (const pt of tr.pts) {
          ctx.fillStyle = "rgba(163, 157, 146, 0.16)";
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      if (!withPulses) return;
      for (const pu of pulses) {
        pu.t += pu.speed * dt;
        if (pu.t > 1.15) pu.t = -0.15;
        const tr = traces[pu.trace];
        const d = pu.t * tr.total;
        if (d < 0 || d > tr.total) continue;
        const pt = pointAt(tr, d);
        const fade =
          pu.t < 0.08 ? pu.t / 0.08 : pu.t > 0.85 ? Math.max(0, (1.15 - pu.t) / 0.3) : 1;
        const glow = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, 11);
        glow.addColorStop(0, `rgba(${pu.color}, ${0.5 * fade})`);
        glow.addColorStop(1, `rgba(${pu.color}, 0)`);
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(${pu.color}, ${0.85 * fade})`;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const w = parent.clientWidth;
      const h = parent.clientHeight;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      build(w, h);
      if (reduced) drawScene(w, h, false, 0);
    };

    const frame = (now: number) => {
      if (!running) return;
      const dt = Math.min(64, now - last) / 1000;
      last = now;
      drawScene(canvas.clientWidth, canvas.clientHeight, true, dt);
      raf = requestAnimationFrame(frame);
    };

    resize();
    const ro = new ResizeObserver(resize);
    if (canvas.parentElement) ro.observe(canvas.parentElement);

    if (!reduced) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
      const onVis = () => {
        if (document.hidden) {
          running = false;
          cancelAnimationFrame(raf);
        } else {
          running = true;
          last = performance.now();
          raf = requestAnimationFrame(frame);
        }
      };
      document.addEventListener("visibilitychange", onVis);
      return () => {
        running = false;
        cancelAnimationFrame(raf);
        document.removeEventListener("visibilitychange", onVis);
        ro.disconnect();
      };
    }

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return (
    <div aria-hidden className="absolute inset-0 z-0 overflow-hidden">
      <div className="dot-grid absolute inset-0 opacity-70" />
      <canvas ref={ref} className="absolute inset-0 opacity-90" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_120%_90%_at_50%_0%,transparent_40%,rgba(8,7,6,0.72)_100%)]" />
    </div>
  );
}
