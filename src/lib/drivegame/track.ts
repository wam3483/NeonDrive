// ---------------------------------------------------------------------------
// Closed-loop track definition & helpers
// ---------------------------------------------------------------------------

export interface TrackPt { x: number; y: number; }

/**
 * Generate a smooth closed-loop track in an arbitrary world-space coordinate
 * system (units don't matter — only ratios/angles are used for curvature).
 * Multi-frequency polar oval so there's a healthy variety of curves.
 */
export function generateTrack(N = 300): TrackPt[] {
  // Figure-8 (lemniscate-ish) gives equal left and right turns
  // with long straight-ish stretches between the lobes.
  const pts: TrackPt[] = [];
  for (let i = 0; i < N; i++) {
    const t = (i / N) * Math.PI * 2;
    // Base figure-8: x = sin(t), y = sin(2t)/2
    // Scaled up and gently perturbed so it's not perfectly symmetric
    const fx = Math.sin(t);
    const fy = Math.sin(2 * t) * 0.45;
    // Small wobble for variety
    const wx = 0.06 * Math.sin(3 * t + 1.2);
    const wy = 0.04 * Math.sin(5 * t + 0.7);
    pts.push({ x: (fx + wx) * 500, y: (fy + wy) * 400 });
  }
  return pts;
}

/**
 * Normalised forward tangent at fractional track position t.
 * Uses a 2-step central difference for smoothness.
 */
export function getTrackTangent(trackPoints: TrackPt[], t: number): { dx: number; dy: number } {
  const N  = trackPoints.length;
  const i0 = ((Math.floor(t) - 1 + N) % N);
  const i2 = ((Math.floor(t) + 1) % N);
  const p0 = trackPoints[i0];
  const p2 = trackPoints[i2];
  const dx = p2.x - p0.x;
  const dy = p2.y - p0.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  return { dx: dx / len, dy: dy / len };
}

/**
 * Look ahead on the track and compute the signed curvature as a
 * screen-pixel vanishing-point offset.
 *
 * Convention (screen coords, y-down):
 *   positive cross product  →  clockwise turn  →  curve right  →  curveOffset > 0
 *   negative cross product  →  counter-clockwise →  curve left  →  curveOffset < 0
 */
export function computeTargetCurveOffset(trackPoints: TrackPt[], trackT: number): number {
  const N = trackPoints.length;
  if (N < 4) return 0;
  const lookAhead = Math.max(4, Math.floor(N * 0.08));
  const tang0 = getTrackTangent(trackPoints, trackT);
  const tang1 = getTrackTangent(trackPoints, (trackT + lookAhead) % N);
  const cross  = tang0.dx * tang1.dy - tang0.dy * tang1.dx;
  return Math.max(-280, Math.min(280, cross * 380));
}
