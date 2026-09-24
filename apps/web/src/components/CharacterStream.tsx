import { useEffect, useRef } from "react";
import { useReducedEffects } from "../useReducedEffects";

export type StreamState = "flow" | "review" | "block" | "project" | "context";
/** Decorative signal only. Does not encode measured throughput or runtime telemetry. */
export function CharacterStream({
  state = "flow",
  paused = false,
  large = false,
}: {
  state?: StreamState;
  paused?: boolean;
  large?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedEffects();
  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let width = 0,
      height = 0,
      frame = 0,
      visible = false,
      elapsed = 0,
      last = 0;
    const glyphs = "01.:+*▸≡";
    const color =
      state === "block"
        ? "207,143,149"
        : state === "review"
          ? "210,182,133"
          : "139,177,204";
    const draw = (time: number) => {
      if (!width || !height) return;
      ctx.clearRect(0, 0, width, height);
      ctx.font = `${large ? 12 : 10}px 'IBM Plex Mono', monospace`;
      ctx.textAlign = "center";
      const cell = large ? 17 : 13;
      const rows = Math.floor(height / cell);
      const cols = Math.floor(width / cell);
      const gate = Math.floor(cols * 0.58);
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const position = (col * cell + time * (large ? 24 : 30)) % width;
          const column = position / cell;
          const distance = Math.abs(row - rows / 2);
          const wave = Math.sin(column * 0.19 - time * 0.8 + row * 0.43);
          const envelope = 1 - distance / (rows * 0.65);
          const downstream = column > gate;
          const blocked =
            (state === "block" || state === "review") && downstream;
          const sparse = state === "project" && downstream && row % 3 !== 1;
          const compact =
            state === "context" && downstream && (distance > 2 || col % 2);
          const boundary =
            Math.abs(column - gate) < 0.45 && distance < rows * 0.4;
          const alpha = boundary
            ? 0.85
            : blocked || sparse || compact
              ? 0.045
              : Math.max(0.06, envelope * (wave + 1.4) * 0.31);
          ctx.fillStyle = `rgba(${color},${alpha})`;
          const shift = Math.floor(time * 3);
          const glyph = boundary
            ? state === "block"
              ? "×"
              : "│"
            : glyphs[(col + row * 7 + shift) % glyphs.length];
          ctx.fillText(
            glyph,
            boundary ? gate * cell + cell / 2 : position + cell / 2,
            row * cell + cell,
          );
        }
      }
    };
    const loop = (now: number) => {
      if (now - last > 48) {
        elapsed += Math.min(now - last, 60) / 1000;
        last = now;
        draw(elapsed);
      }
      frame = requestAnimationFrame(loop);
    };
    const sync = () => {
      cancelAnimationFrame(frame);
      draw(elapsed);
      if (visible && !document.hidden && !reduced && !paused) {
        last = performance.now();
        frame = requestAnimationFrame(loop);
      }
    };
    const resize = new ResizeObserver(([entry]) => {
      width = entry.contentRect.width;
      height = entry.contentRect.height;
      const dpr = Math.min(devicePixelRatio || 1, 1.5);
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      sync();
    });
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      sync();
    });
    resize.observe(canvas);
    observer.observe(canvas);
    document.addEventListener("visibilitychange", sync);
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      observer.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, [state, paused, large, reduced]);
  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className={`character-stream ${large ? "large" : ""}`}
    />
  );
}
