import { useEffect, useRef } from "react";
import { useGame } from "../lib/store";
import { frameLoop } from "./frame-loop";
export interface SparkTarget { x: number; y: number }
interface Particle { x: number; y: number; start: number; color: string; soft: boolean }
export function Sparks({ target }: { target: SparkTarget | null }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const targetRef = useRef(target); targetRef.current = target;
  useEffect(() => {
    const element = canvas.current;
    const ctx = element?.getContext("2d");
    if (!element || !ctx) return;
    let particles: Particle[] = [];
    // Idle projector: no frames (and no layout reads) until sparks are spawned.
    const loop = frameLoop((now) => paint(now));
    const spawn = (color: string, soft: boolean, count: number) => {
      const rect = element.getBoundingClientRect();
      for (let i = 0; i < count; i++) particles.push({ x: rect.width * (0.12 + i / count * 0.76), y: rect.height * (0.8 + (i % 3) * 0.06), start: performance.now() - (i % 4) * 20, color, soft });
      loop.kick();
    };
    const unsubscribe = useGame.subscribe((s, previous) => {
      if (s.charge > previous.charge && s.phase === "POWER_UP") spawn(s.revival?.color ?? "#f2c46d", false, 24);
      if (s.revival && s.revival !== previous.revival) spawn(s.revival.color, s.revival.auto_completed, s.revival.auto_completed ? 14 : 64);
    });
    const paint = (now: number): boolean => {
      const rect = element.getBoundingClientRect();
      const scale = Math.min(window.devicePixelRatio || 1, 2);
      if (element.width !== Math.round(rect.width * scale) || element.height !== Math.round(rect.height * scale)) { element.width = Math.round(rect.width * scale); element.height = Math.round(rect.height * scale); }
      ctx.setTransform(scale, 0, 0, scale, 0, 0); ctx.clearRect(0, 0, rect.width, rect.height);
      const end = targetRef.current;
      particles = particles.filter((p) => now - p.start < 800);
      if (end) for (const p of particles) {
        const t = Math.max(0, Math.min(1, (now - p.start) / 800));
        ctx.globalAlpha = (1 - t) * (p.soft ? 0.4 : 0.9); ctx.fillStyle = p.color; ctx.shadowColor = p.color; ctx.shadowBlur = 12;
        ctx.beginPath(); ctx.arc(p.x + (end.x - p.x) * t, p.y + (end.y - p.y) * t - Math.sin(t * Math.PI) * 100, p.soft ? 2 : 3, 0, Math.PI * 2); ctx.fill();
      }
      // The frame that clears the last particle is the final one.
      return particles.length > 0;
    };
    return () => { unsubscribe(); loop.stop(); };
  }, []);
  return <canvas ref={canvas} data-testid="spark-canvas" aria-hidden="true" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }} />;
}
