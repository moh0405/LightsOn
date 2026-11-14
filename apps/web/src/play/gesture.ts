/** Vertical acceleration including gravity, in m/s²; timestamps are monotonic ms. */
export function createFlickDetector() {
  let belowAt: number | null = null;
  let lastAccepted = -Infinity;
  return (vertical: number | null, at: number): boolean => {
    if (vertical === null || !Number.isFinite(vertical) || !Number.isFinite(at)) return false;
    if (vertical < 9) belowAt = at;
    if (vertical <= 14 || belowAt === null) return false;
    const elapsed = at - belowAt;
    belowAt = null;
    if (elapsed < 0 || elapsed > 300 || at - lastAccepted < 600) return false;
    lastAccepted = at;
    return true;
  };
}
