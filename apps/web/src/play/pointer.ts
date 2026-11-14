export const clamp = (value: number): number => Math.max(0, Math.min(1, value));
export const wrap180 = (degrees: number): number => ((degrees + 180) % 360 + 360) % 360 - 180;
export interface Point { x: number; y: number }
export const smooth = (previous: Point, next: Point, k = 0.35): Point => ({
  x: previous.x + k * (next.x - previous.x), y: previous.y + k * (next.y - previous.y),
});
export const aim = (alpha: number, beta: number, alpha0: number, beta0: number): Point => ({
  x: clamp(0.5 - wrap180(alpha - alpha0) / 60), y: clamp(0.5 - (beta - beta0) / 40),
});
export function rateLimit(hz = 30): (now: number) => boolean {
  let last = -Infinity;
  return (now) => { if (now - last < 1000 / hz) return false; last = now; return true; };
}
type PermissionSensor = { requestPermission?: () => Promise<string> };
/** Invoke both permission requests synchronously within the Join gesture. */
export async function requestSensors(): Promise<boolean> {
  if (!window.isSecureContext || typeof DeviceOrientationEvent === "undefined") return false;
  try {
    const orientation = DeviceOrientationEvent as unknown as PermissionSensor;
    const motion = typeof DeviceMotionEvent === "undefined" ? undefined : DeviceMotionEvent as unknown as PermissionSensor;
    const results = await Promise.all([
      orientation.requestPermission?.() ?? Promise.resolve("granted"),
      motion?.requestPermission?.() ?? Promise.resolve("granted"),
    ]);
    return results.every((r) => r === "granted");
  } catch { return false; }
}
