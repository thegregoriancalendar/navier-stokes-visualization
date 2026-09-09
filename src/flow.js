// Explanatory incompressible field; y is the vortex axis.
// v = (-a x - Ω z, 2a y, -a z + Ω x), Ω = ω / (1 + r²/c(s)²).
export const STRAIN = 0.21;
export const ROTATION = 6.1;
export const CORE = 0.86;
export const CORE_DECAY = 0.015;
export const AXIAL_SOURCE_DECAY = 0.004;
export const DURATION = 32;
export const MAX_FLOW_TIME = 42;
export const WARMUP_FLOW_TIME = 10.5;
export const DISPLAY_START = 0.2;

export function flowClock(progress) {
  // The construction begins from rest, but the displayed window enters at
  // the first visible filaments rather than holding on an empty frame.
  const modelProgress = DISPLAY_START + (1 - DISPLAY_START) * progress;
  return MAX_FLOW_TIME * modelProgress * modelProgress * (1.5 - 0.5 * modelProgress);
}

export function flowRate(progress) {
  const modelProgress = DISPLAY_START + (1 - DISPLAY_START) * progress;
  return MAX_FLOW_TIME / DURATION * 3 * modelProgress * (1 - 0.5 * modelProgress) * (1 - DISPLAY_START);
}

export function sourceScale(time) {
  return [Math.exp(-CORE_DECAY * time), Math.exp(-AXIAL_SOURCE_DECAY * time)];
}

export function angularVelocity(x, z, time) {
  const core = CORE * Math.exp(-CORE_DECAY * time);
  return ROTATION / (1 + (x * x + z * z) / (core * core));
}

export function velocityAt(x, y, z, time) {
  const omega = angularVelocity(x, z, time);
  return [-STRAIN * x - omega * z, 2 * STRAIN * y, -STRAIN * z + omega * x];
}

export function trajectoryParameters(birthTime, age) {
  const relativeStrain = STRAIN - CORE_DECAY;
  return {
    radial: Math.exp(-STRAIN * age),
    axial: Math.exp(2 * STRAIN * age),
    coreAtBirth: CORE * Math.exp(-CORE_DECAY * birthTime),
    angleGain: ROTATION / (2 * relativeStrain),
    angleGrowth: Math.expm1(2 * relativeStrain * age),
  };
}

export function advectCylindrical(radius, height, theta, parameters, out) {
  // Exact solution of dX/ds = v(X,s), including the shrinking swirl core.
  // Each material point gets its own radius-dependent angular displacement.
  const b = (radius / parameters.coreAtBirth) ** 2;
  const angle = theta + parameters.angleGain * Math.log1p(parameters.angleGrowth / (1 + b));
  const r = radius * parameters.radial;
  out[0] = r * Math.cos(angle);
  out[1] = height * parameters.axial;
  out[2] = r * Math.sin(angle);
  return out;
}

export function advectPoint(point, birthTime, time) {
  return advectCylindrical(Math.hypot(point[0], point[2]), point[1], Math.atan2(point[2], point[0]), trajectoryParameters(birthTime, time - birthTime), [0, 0, 0]);
}
