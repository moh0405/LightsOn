import { useEffect, useRef, useState } from "react";
export function tween(from: number, to: number, progress: number): number {
  const t = Math.max(0, Math.min(1, progress));
  return Math.round(from + (to - from) * (1 - Math.pow(1 - t, 3)));
}
export function useAnimatedNumber(value: number): number {
  const [shown, setShown] = useState(value);
  const previous = useRef(value);
  useEffect(() => {
    const from = previous.current;
    previous.current = value;
    if (from === value) return;
    const start = performance.now();
    let frame = 0;
    const update = (now: number) => {
      const progress = (now - start) / 800;
      setShown(tween(from, value, progress));
      if (progress < 1) frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return shown;
}
