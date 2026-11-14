/** requestAnimationFrame loop that runs only while `step` returns true; `kick` restarts it. */
export function frameLoop(step: (now: number) => boolean,
  raf: (cb: (now: number) => void) => number = (cb) => requestAnimationFrame(cb),
  caf: (id: number) => void = (id) => cancelAnimationFrame(id)) {
  let frame = 0;
  const tick = (now: number) => { frame = step(now) ? raf(tick) : 0; };
  return {
    kick() { if (!frame) frame = raf(tick); },
    stop() { if (frame) caf(frame); frame = 0; },
    get running() { return frame !== 0; },
  };
}
