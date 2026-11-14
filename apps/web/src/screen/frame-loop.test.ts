import { expect, it } from "vitest";
import { frameLoop } from "./frame-loop";

it("schedules frames only while there is work, and restarts on kick", () => {
  const queue: ((now: number) => void)[] = [];
  let work = 2;
  const loop = frameLoop(() => --work > 0, (cb) => queue.push(cb), () => { queue.length = 0; });
  expect(loop.running).toBe(false);
  loop.kick(); loop.kick();
  expect(queue).toHaveLength(1);
  queue.shift()!(16); // one particle frame left
  expect(loop.running).toBe(true);
  queue.shift()!(32); // last frame clears the canvas and stops
  expect(loop.running).toBe(false);
  expect(queue).toHaveLength(0);
  work = 2; loop.kick();
  expect(loop.running).toBe(true);
  loop.stop();
  expect(loop.running).toBe(false);
});
