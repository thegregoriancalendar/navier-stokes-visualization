import { test, expect } from '@playwright/test';
import { advectPoint } from '../src/flow.js';

async function ready(page) {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
  await page.evaluate(() => document.fonts.ready);
}
async function seek(page, value) {
  await page.locator('#evolution').fill(String(value));
  await expect(page.locator('#play')).toHaveAttribute('aria-label', value === 1000 ? 'Replay animation' : 'Play animation');
}

test('renders the vortex and makes evolution, playback, camera, and export usable', async ({ page }, testInfo) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error' && /THREE|shader|WebGL/i.test(message.text())) errors.push(message.text()); });
  await ready(page);
  const state = () => page.evaluate(() => window.vortexStudy.getState());
  expect((await state()).playing).toBe(false);
  expect((await state()).triangles).toBeGreaterThan(200_000);
  const initial = await state();
  expect(initial.activeStrands).toBeGreaterThan(0);
  expect(initial.activeStrands).toBeLessThan(20);
  expect(initial.vectorFieldVisible).toBe(false);
  expect(initial.arrowCount).toBe(192);
  await page.screenshot({ path: testInfo.outputPath('early-desktop.png') });

  await page.getByRole('button', { name: 'Show 3D vector field' }).click();
  await expect(page.locator('#vector-field')).toHaveAttribute('aria-pressed', 'true');
  expect((await state()).vectors.every((vector) => Math.hypot(...vector.velocity) > 0)).toBe(true);

  await page.getByRole('button', { name: 'Play animation', exact: true }).click();
  await expect.poll(async () => (await state()).flow).toBeGreaterThan(0.03);
  await page.getByRole('button', { name: 'Pause animation', exact: true }).click();
  const moving = await state();
  expect(moving.geometryVersion).toBeGreaterThan(initial.geometryVersion);
  for (let i = 0; i < initial.particles.length; i++) {
    const before = initial.particles[i];
    const after = moving.particles[i];
    expect(after.id).toBe(before.id);
    const predicted = advectPoint(before.position, initial.flow, moving.flow);
    after.position.forEach((value, axis) => expect(value).toBeCloseTo(predicted[axis], 7));
    expect(Math.hypot(after.position[0], after.position[2])).toBeLessThan(Math.hypot(before.position[0], before.position[2]));
    expect(Math.abs(after.position[1])).toBeGreaterThan(Math.abs(before.position[1]));
  }
  const paused = moving.flow;
  await page.waitForTimeout(220);
  expect((await state()).flow).toBe(paused);
  expect((await state()).geometryVersion).toBe(moving.geometryVersion);

  await seek(page, 450);
  await expect(page.locator('#stage-title')).toHaveText('Vortex stretching spins it faster');
  const middle = await state();
  expect(middle.activeStrands).toBeGreaterThan(100);
  expect(middle.particles).toHaveLength(3);
  expect(middle.scale).toEqual([1, 1, 1]);
  expect(middle.sourceScale[0]).toBeLessThan(middle.sourceScale[1]);
  expect(middle.sourceScale[1]).toBeLessThan(1);
  for (const vector of middle.vectors) {
    const magnitude = Math.hypot(...vector.velocity);
    expect(Math.hypot(...vector.direction)).toBeCloseTo(1, 8);
    const alignment = vector.direction.reduce((sum, component, axis) => sum + component * vector.velocity[axis], 0) / magnitude;
    expect(alignment).toBeCloseTo(1, 8);
  }
  const middleVectors = middle.vectors;
  await page.screenshot({ path: testInfo.outputPath('middle-desktop.png') });

  await page.locator('#play').click();
  await expect.poll(async () => (await state()).flow).toBeGreaterThan(middle.flow + 0.2);
  await page.locator('#play').click();
  const advected = await state();
  for (let index = 0; index < middle.particles.length; index++) {
    const before = middle.particles[index];
    const after = advected.particles[index];
    expect(after.id).toBe(before.id);
    const predicted = advectPoint(before.position, middle.flow, advected.flow);
    after.position.forEach((value, axis) => expect(value).toBeCloseTo(predicted[axis], 7));
  }
  await seek(page, 450);
  await seek(page, 930);
  const lateField = await state();
  for (let index = 0; index < middleVectors.length; index++) {
    expect(lateField.vectors[index].position).toEqual(middleVectors[index].position);
  }
  expect(lateField.vectors.reduce((sum, vector) => sum + vector.length, 0)).toBeGreaterThan(middleVectors.reduce((sum, vector) => sum + vector.length, 0));
  expect(lateField.vectors[0].opacity).toBeGreaterThan(middleVectors[0].opacity);
  const directionChange = lateField.vectors.reduce((sum, vector, index) => sum + Math.hypot(...vector.direction.map((component, axis) => component - middleVectors[index].direction[axis])), 0);
  expect(directionChange).toBeGreaterThan(0.08);
  await page.screenshot({ path: testInfo.outputPath('late-desktop.png') });
  await seek(page, 450);
  expect((await state()).particles).toEqual(middle.particles);
  await seek(page, 930);

  const original = (await state()).camera;
  const canvas = await page.locator('canvas').boundingBox();
  await page.mouse.move(canvas.x + canvas.width * 0.62, canvas.y + canvas.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(canvas.x + canvas.width * 0.78, canvas.y + canvas.height * 0.55, { steps: 10 });
  await page.mouse.up();
  expect((await state()).camera).not.toEqual(original);
  await page.getByRole('button', { name: 'Reset camera', exact: true }).click();
  await expect.poll(async () => Math.abs((await state()).camera[0] - original[0])).toBeLessThan(0.05);

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save image', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('vortex-study-93.png');

  await seek(page, 1000);
  await page.locator('#play').click();
  expect((await state()).progress).toBeLessThan(0.1);
  await page.getByRole('button', { name: 'Playback speed: 1 times', exact: true }).click();
  expect((await state()).speed).toBe(2);
  await page.getByRole('button', { name: 'About this study' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect((await state()).playing).toBe(false);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect.poll(async () => (await state()).playing).toBe(true);
  expect(errors).toEqual([]);
});

test('fits a mobile viewport and respects reduced motion', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  await expect(page.getByRole('button', { name: 'Play animation', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await seek(page, 280);
  await page.screenshot({ path: testInfo.outputPath('mobile.png'), fullPage: true });
  await page.getByRole('button', { name: 'About this study' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Close about' }).click();
  expect(await page.evaluate(() => window.vortexStudy.getState().playing)).toBe(false);
});
