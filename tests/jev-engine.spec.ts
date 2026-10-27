import { expect, test as base, type Page } from '@playwright/test';
import type { JevController } from '../src/dashboards/jev-engine/model';

declare global {
  interface Window {
    jevEngine?: JevController;
    __jevFrames?: Set<number>;
    __stepJev?: (time: number) => void;
    __retiredJev?: JevController;
  }
}

const test = base.extend({
  page: async ({ page }, use) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await use(page);
    expect(errors, 'Jev Engine routes and interactions must not throw browser errors').toEqual([]);
  },
});
const state = (page: Page) => page.evaluate(() => window.jevEngine!.getSnapshot());
const geometry = (page: Page) => page.evaluate(() => window.jevEngine!.debug());
async function open(page: Page) {
  await page.goto('/#/screens/jev-engine');
  await page.waitForFunction(() => !!window.jevEngine, undefined, { polling: 50 });
  await expect(page.locator('.jev-engine')).toBeVisible();
}
async function controlFrames(page: Page) {
  await page.addInitScript(() => {
    let next = 0;
    const callbacks = new Map<number, FrameRequestCallback>();
    const active = new Set<number>();
    window.__jevFrames = active;
    window.requestAnimationFrame = callback => {
      const id = ++next;
      callbacks.set(id, callback); active.add(id);
      return id;
    };
    window.cancelAnimationFrame = id => { callbacks.delete(id); active.delete(id); };
    window.__stepJev = time => {
      const current = [...callbacks.entries()];
      callbacks.clear();
      current.forEach(([id, callback]) => { active.delete(id); callback(time); });
    };
  });
}

test('Jev Engine supports deep link refresh and its playback controls', async ({ page }) => {
  await open(page);
  await page.reload();
  await page.waitForFunction(() => !!window.jevEngine, undefined, { polling: 50 });
  await expect(page).toHaveTitle(/Jev Engine/);
  await page.getByRole('button', { name: '暂停动画', exact: true }).click();
  const paused = await state(page);
  expect(paused.paused).toBe(true);
  await page.waitForTimeout(150);
  expect((await state(page)).time).toBe(paused.time);
  expect((await geometry(page)).activeFrame).toBe(false);
  await page.getByRole('button', { name: /^播放速度/ }).click();
  expect((await state(page)).speed).toBeGreaterThan(paused.speed);
  await page.getByRole('button', { name: '播放动画', exact: true }).click();
  await expect.poll(async () => (await state(page)).time).toBeGreaterThan(paused.time);
  await page.getByRole('button', { name: '暂停动画', exact: true }).click();
  await page.getByRole('button', { name: '重播演示', exact: true }).click();
  expect((await state(page)).time).toBeLessThan(.3);
});

test('The dense ring has real XYZ depth and reveals parallax while paused', async ({ page }) => {
  await open(page);
  await page.evaluate(() => window.jevEngine!.setPaused(true));
  const before = await geometry(page);
  const stopped = await state(page);
  expect(before.strandCount).toBe(2600);
  expect(before.particleCount).toBeGreaterThan(before.strandCount);
  expect(before.depthRange.max - before.depthRange.min).toBeGreaterThan(.2);
  for (const axis of [0, 1, 2]) {
    expect(new Set(before.probes.map(probe => probe.world[axis])).size).toBeGreaterThan(1);
  }
  expect(before.probes.every(probe => probe.screen.every(Number.isFinite))).toBe(true);
  await page.locator('.jev-engine canvas').first().press('ArrowRight');
  const after = await geometry(page);
  expect(after.rotation.yaw).not.toBe(before.rotation.yaw);
  expect(after.probes.map(probe => probe.world)).toEqual(before.probes.map(probe => probe.world));
  const shifts = after.probes.map((probe, i) => [probe.screen[0] - before.probes[i]!.screen[0], probe.screen[1] - before.probes[i]!.screen[1]]);
  expect(shifts.some((shift, i) => shifts.slice(i + 1).some(other => Math.hypot(shift[0]! - other[0]!, shift[1]! - other[1]!) > .5))).toBe(true);
  expect((await state(page)).time).toBe(stopped.time);
});

test('Dragging and wheel zoom alter the camera, reset returns to the original view', async ({ page }) => {
  await open(page);
  await page.evaluate(() => window.jevEngine!.setPaused(true));
  const before = await geometry(page);
  const canvas = page.locator('.jev-engine canvas').first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Jev canvas has no layout bounds');
  const x = box.x + box.width * .5, y = box.y + box.height * .5;
  await page.mouse.move(x, y); await page.mouse.down();
  await page.mouse.move(x + 70, y + 25, { steps: 5 }); await page.mouse.up();
  const dragged = await geometry(page);
  expect(dragged.rotation.yaw).not.toBe(before.rotation.yaw);
  expect(dragged.rotation.pitch).not.toBe(before.rotation.pitch);
  await canvas.hover(); await page.mouse.wheel(0, -150);
  await expect.poll(async () => (await geometry(page)).rotation.zoom).toBeGreaterThan(before.rotation.zoom);
  await page.getByRole('button', { name: '重置视角', exact: true }).click();
  await expect.poll(async () => (await geometry(page)).rotation.zoom).toBeCloseTo(before.rotation.zoom, 2);
  await expect.poll(async () => (await geometry(page)).rotation.yaw).toBeCloseTo(before.rotation.yaw, 2);
  await expect.poll(async () => (await geometry(page)).rotation.pitch).toBeCloseTo(before.rotation.pitch, 2);
});

test('The radial sweep advances with the shared simulation clock and freezes on pause', async ({ page }) => {
  await controlFrames(page); await open(page);
  const result = await page.evaluate(() => {
    const c = window.jevEngine!; c.restart(); c.setPaused(false);
    const start = performance.now(); window.__stepJev!(start);
    const initial = { snapshot: c.getSnapshot(), geometry: c.debug() };
    window.__stepJev!(start + 1600);
    const moving = { snapshot: c.getSnapshot(), geometry: c.debug() };
    c.setPaused(true); window.__stepJev!(start + 5000);
    return { initial, moving, paused: { snapshot: c.getSnapshot(), geometry: c.debug() } };
  });
  expect(result.moving.snapshot.time).toBeGreaterThan(result.initial.snapshot.time);
  expect(result.moving.geometry.sweepAngle).not.toBe(result.initial.geometry.sweepAngle);
  expect(result.moving.geometry.probes.map(probe => probe.screen)).not.toEqual(result.initial.geometry.probes.map(probe => probe.screen));
  expect(result.paused.snapshot.time).toBe(result.moving.snapshot.time);
  expect(result.paused.geometry.sweepAngle).toBe(result.moving.geometry.sweepAngle);
  expect(result.paused.geometry.probes).toEqual(result.moving.geometry.probes);
  expect(result.paused.geometry.activeFrame).toBe(false);
});

test('Playback speed scales elapsed time rather than just changing the label', async ({ page }) => {
  await controlFrames(page); await open(page);
  const result = await page.evaluate(() => {
    const c = window.jevEngine!;
    c.restart(); c.setPaused(false); c.setSpeed(1);
    let start = performance.now(); window.__stepJev!(start); window.__stepJev!(start + 1000);
    const normal = c.getSnapshot().time;
    c.restart(); c.setSpeed(2);
    start = performance.now(); window.__stepJev!(start); window.__stepJev!(start + 1000);
    const fast = c.getSnapshot().time;
    c.setPaused(true);
    return { normal, fast };
  });
  expect(result.normal).toBeGreaterThan(0);
  expect(result.fast / result.normal).toBeCloseTo(2, 1);
});

test('Repeated SPA exits dispose the single render loop and controller', async ({ page }) => {
  await controlFrames(page); await page.goto('/#/');
  for (let visit = 0; visit < 3; visit++) {
    await page.locator('.open-screen[href="#/screens/jev-engine"]').press('Enter');
    await page.waitForFunction(() => !!window.jevEngine, undefined, { polling: 50 });
    const active = await page.evaluate(() => {
      const c = window.jevEngine!; window.__retiredJev = c;
      const before = c.debug().frameCount;
      window.__stepJev!(performance.now() + 100);
      return { frames: window.__jevFrames!.size, rendered: c.debug().frameCount - before };
    });
    expect(active).toEqual({ frames: 1, rendered: 1 });
    await page.getByRole('link', { name: '返回大屏索引', exact: true }).press('Enter');
    await expect(page.locator('#screen-grid .open-screen')).toHaveCount(8);
    const disposed = await page.evaluate(() => ({ controller: typeof window.jevEngine, frames: window.__jevFrames!.size, disposed: window.__retiredJev!.debug().disposed }));
    expect(disposed).toEqual({ controller: 'undefined', frames: 0, disposed: true });
    await expect(page.locator('canvas')).toHaveCount(0);
  }
});

test('Reduced motion and desktop, portrait and mobile layouts retain usable controls', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const viewport of [{ width: 720, height: 900 }, { width: 1600, height: 1000 }, { width: 1280, height: 800 }, { width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport); await open(page);
    expect((await state(page)).paused).toBe(true);
    expect((await geometry(page)).activeFrame).toBe(false);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await expect(page.getByRole('button', { name: '播放动画', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: '返回大屏索引', exact: true })).toBeVisible();
    const box = await page.locator('.jev-engine canvas').first().boundingBox();
    expect(box!.width).toBeGreaterThan(100); expect(box!.height).toBeGreaterThan(180);
    const sidebar = await page.locator('.jev-telemetry').boundingBox();
    const stream = await page.locator('.jev-stream').boundingBox();
    const key = await page.locator('.jev-key').boundingBox();
    expect(sidebar!.y + sidebar!.height).toBeLessThanOrEqual(stream!.y + 1);
    if (key) expect(key.y + key.height).toBeLessThanOrEqual(stream!.y + 1);
    if (viewport.width > 560) expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true);
    expect((await geometry(page)).probes.every(probe => probe.screen.every(Number.isFinite))).toBe(true);
  }
});

test('Flame tracks continuously cover a wide viewport after long runs and across loop seams', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await controlFrames(page); await open(page);
  const result = await page.evaluate(async () => {
    const c = window.jevEngine!;
    c.restart(); c.setPaused(false);
    const start = performance.now(); window.__stepJev!(start);
    const failures: string[] = [];
    for (const seconds of [38, 39.2, 90, 180, 600]) {
      window.__stepJev!(start + seconds * 1000);
      await new Promise(resolve => setTimeout(resolve, 0));
      const viewport = document.querySelector('.jev-flame-window')!.getBoundingClientRect();
      document.querySelectorAll('.jev-flame-row').forEach((row, index) => {
        const rect = row.getBoundingClientRect();
        if (rect.left > viewport.left + 1 || rect.right < viewport.right - 1) failures.push(`${seconds}s row ${index} blank edge`);
        const copies = [...row.children].map(child => child.getBoundingClientRect());
        for (let i = 1; i < copies.length; i++) if (Math.abs(copies[i]!.left - copies[i - 1]!.right) > 1) failures.push(`${seconds}s row ${index} seam gap`);
      });
    }
    c.setPaused(true);
    return failures;
  });
  expect(result).toEqual([]);
});

test('Flame tracks move on every frame at a faster pace and respect pause, speed and replay', async ({ page }) => {
  await controlFrames(page); await open(page);
  const result = await page.evaluate(() => {
    const c = window.jevEngine!;
    const positions = () => [...document.querySelectorAll('.jev-flame-row')].map(row => new DOMMatrixReadOnly(getComputedStyle(row).transform).m41);
    c.restart(); c.setSpeed(1); c.setPaused(false);
    const start = performance.now(); window.__stepJev!(start);
    const samples = [positions()];
    for (let frame = 1; frame <= 12; frame++) {
      window.__stepJev!(start + frame * 1000 / 60);
      samples.push(positions());
    }
    c.setPaused(true); const paused = positions(); window.__stepJev!(start + 1500);
    const frozen = positions(); c.restart(); const replay = positions();
    c.setSpeed(2); c.setPaused(false);
    const fastStart = performance.now(); window.__stepJev!(fastStart); const fastBefore = positions(); window.__stepJev!(fastStart + 200);
    const fastAfter = positions(); c.setPaused(true);
    return { samples, paused, frozen, replay, fastBefore, fastAfter };
  });
  for (let row = 0; row < 3; row++) {
    const steps = result.samples.slice(1).map((sample, i) => result.samples[i]![row]! - sample[row]!);
    expect(steps.every(step => step > .5), `row ${row} must advance on every 60Hz frame`).toBe(true);
    expect(Math.max(...steps) - Math.min(...steps)).toBeLessThan(.02);
    const distance = result.samples[0]![row]! - result.samples[12]![row]!;
    expect(distance).toBeGreaterThan([10, 24, 26][row]!);
    expect((result.fastBefore[row]! - result.fastAfter[row]!) / distance).toBeCloseTo(2, 2);
  }
  expect(result.frozen).toEqual(result.paused);
  expect(result.replay.every(value => Math.abs(value) < .001)).toBe(true);
});
