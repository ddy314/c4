import { useEffect, useRef } from "react";
import { useReducedEffects } from "../useReducedEffects";

export function SignalField() {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedEffects();
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let width = 0,
      height = 0,
      frame = 0,
      visible = true,
      last = 0,
      elapsed = 0;
    let pointer = { x: -1000, y: -1000 };
    const glyphs = ".:+/01";
    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      width = bounds.width;
      height = bounds.height;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    };
    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      const sx = width / 620,
        sy = height / 420;
      ctx.save();
      ctx.scale(sx, sy);
      ctx.font = '9px "IBM Plex Mono", monospace';
      const time = reduced ? 0 : elapsed * 0.00015;
      // Four dimensional gates, rendered entirely from terminal characters.
      for (let gate = 0; gate < 4; gate++) {
        const gx = 130 + gate * 104,
          gy = 205 - gate * 12;
        for (let row = 0; row < 26; row++) {
          for (let col = 0; col < 13; col++) {
            const edge = row < 2 || row > 23 || col < 2 || col > 10;
            if (!edge && (row * 7 + col * 11 + gate) % 17 > 1) continue;
            const x = gx + (col - 6) * 4.5;
            const y = gy + (row - 13) * 8.5 + (col - 6) * 3.2;
            const alpha = edge ? 0.44 + gate * 0.09 : 0.13;
            ctx.fillStyle = `rgba(57,79,98,${alpha})`;
            ctx.fillText(edge ? "+" : "·", x, y);
          }
        }
        ctx.fillStyle = "#627d95";
        ctx.font = '10px "IBM Plex Mono", monospace';
        ctx.fillText(`0${gate + 1}`, gx - 6, gy + 140);
        ctx.font = '9px "IBM Plex Mono", monospace';
      }
      const lanes = width < 420 ? 16 : 25;
      for (let row = 0; row < lanes; row++) {
        for (let column = 0; column < 58; column++) {
          const x = (column * 11 + time * 56 + row * 3) % 620;
          const envelope = Math.sin((Math.PI * x) / 620);
          let y =
            220 -
            x * 0.11 +
            (row - lanes / 2) * (3 + envelope * 1.8) +
            Math.sin(x * 0.014 + row * 0.25 + time) * 12;
          const px = pointer.x / sx,
            py = pointer.y / sy;
          const distance = Math.hypot(px - x, py - y);
          if (!reduced && distance < 70)
            y += (y - py) * (1 - distance / 70) * 0.25;
          const noise = (Math.sin(column * 19.3 + row * 7.4) + 1) / 2;
          ctx.fillStyle = `rgba(65,99,128,${envelope * (0.2 + noise * 0.52)})`;
          ctx.fillText(glyphs[(column + row * 3) % glyphs.length], x, y);
        }
      }
      ctx.restore();
    };
    const animate = (now: number) => {
      if (!visible || document.hidden || reduced) {
        frame = 0;
        return;
      }
      if (now - last > 32) {
        elapsed += Math.min(now - last, 40);
        draw();
        last = now;
      }
      frame = requestAnimationFrame(animate);
    };
    const start = () => {
      if (!frame && visible && !document.hidden && !reduced) {
        last = performance.now();
        frame = requestAnimationFrame(animate);
      }
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      start();
    });
    observer.observe(canvas);
    const dimensions = new ResizeObserver(resize);
    dimensions.observe(canvas);
    const move = (e: PointerEvent) => {
      const b = canvas.getBoundingClientRect();
      pointer = { x: e.clientX - b.left, y: e.clientY - b.top };
    };
    const leave = () => {
      pointer = { x: -1000, y: -1000 };
    };
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerleave", leave);
    document.addEventListener("visibilitychange", start);
    resize();
    start();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      dimensions.disconnect();
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerleave", leave);
      document.removeEventListener("visibilitychange", start);
    };
  }, [reduced]);
  return (
    <div className="signal-field">
      <div className="signal-coordinate mono">FIG. 01 — THE CONTROL PLANE</div>
      <canvas ref={ref} aria-hidden="true" />
      <div className="signal-caption mono">
        <span>
          <i /> FOUR BOUNDARIES. ONE CONTINUOUS TRACE.
        </span>
        <span>↗ C4</span>
      </div>
    </div>
  );
}
