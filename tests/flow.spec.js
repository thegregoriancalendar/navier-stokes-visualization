import { test, expect } from '@playwright/test';
import { advectPoint, velocityAt, angularVelocity, flowClock, flowRate } from '../src/flow.js';
import { trailWindow } from '../src/vortex.js';

test('display enters shortly after rest and accelerates smoothly', () => {
  expect(flowClock(0)).toBeGreaterThan(0);
  expect(flowRate(0)).toBeGreaterThan(0);
  expect(flowClock(0.25)).toBeGreaterThan(0);
  expect(flowRate(0.25)).toBeGreaterThan(0);
  expect(flowClock(1)).toBe(42);
});

test('trails grow from a point, then advance both history bounds', () => {
  expect(trailWindow(0, 4)).toEqual([0, 0]);
  expect(trailWindow(1.5, 4)).toEqual([0, 1.5]);
  expect(trailWindow(4, 4)).toEqual([0, 4]);
  expect(trailWindow(5.25, 4)).toEqual([1.25, 5.25]);
});

test('material trajectories solve the 3D time-dependent field', () => {
  const epsilon = 1e-5;
  for (const initial of [[3.2, 0.04, 0.2], [0.6, -0.2, 0.8], [0, 0.1, 0], [-2.4, 0.12, 1.1]]) {
    for (const birth of [-5, 0, 12]) {
      for (const age of [0, 0.4, 3, 8]) {
        const time = birth + age;
        const point = advectPoint(initial, birth, time);
        const before = advectPoint(initial, birth, time - epsilon);
        const after = advectPoint(initial, birth, time + epsilon);
        const velocity = velocityAt(...point, time);
        for (let axis = 0; axis < 3; axis++) {
          expect((after[axis] - before[axis]) / (2 * epsilon)).toBeCloseTo(velocity[axis], 6);
        }
      }
    }
  }
});

test('flow is incompressible and produces inward motion, axial stretch, and differential rotation', () => {
  const epsilon = 1e-5;
  for (const point of [[3, 0.3, 1], [-0.4, -1, 0.3], [0, 0, 0]]) {
    for (const time of [0, 10, 35]) {
      let divergence = 0;
      for (let axis = 0; axis < 3; axis++) {
        const before = [...point]; before[axis] -= epsilon;
        const after = [...point]; after[axis] += epsilon;
        divergence += (velocityAt(...after, time)[axis] - velocityAt(...before, time)[axis]) / (2 * epsilon);
      }
      expect(divergence).toBeCloseTo(0, 7);
    }
  }
  for (const sign of [-1, 1]) {
    const start = [2.7, sign * 0.07, 0.3];
    const end = advectPoint(start, 0, 2);
    expect(Math.hypot(end[0], end[2])).toBeLessThan(Math.hypot(start[0], start[2]));
    expect(Math.abs(end[1])).toBeGreaterThan(Math.abs(start[1]));
  }
  expect(angularVelocity(0.3, 0, 2)).toBeGreaterThan(angularVelocity(3, 0, 2));
  const inner = advectPoint([0.6, 0.1, 0], 0, 0.25);
  const outer = advectPoint([3, 0.1, 0], 0, 0.25);
  expect(Math.atan2(inner[2], inner[0])).toBeGreaterThan(Math.atan2(outer[2], outer[0]));
});
