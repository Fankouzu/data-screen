import { expect, test as base, type Page } from '@playwright/test';
import type { ReaController } from '../src/dashboards/rea-lab/model';

declare global {
  interface Window {
    reaLab?: ReaController;
    __reaFrames?: Set<number>;
    __stepRea?: (time: number) => void;
    __retiredRea?: ReaController;
  }
}

const test = base.extend({
  page: async ({ page }, use) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await use(page);
    expect(errors, 'Rea Lab routes and interactions must not throw browser errors').toEqual([]);
  },
});
const state = (page: Page) => page.evaluate(() => window.reaLab!.getSnapshot());
async function open(page: Page) {
  await page.goto('/#/screens/rea-lab');
  await page.waitForFunction(() => !!window.reaLab, undefined, { polling: 50 });
  await expect(page.locator('.rea-lab')).toBeVisible();
}
async function controlFrames(page: Page) {
  await page.addInitScript(() => {
    let next = 0;
    const callbacks = new Map<number, FrameRequestCallback>();
    const active = new Set<number>();
    window.__reaFrames = active;
    window.requestAnimationFrame = callback => {
      const id = ++next;
      callbacks.set(id, callback); active.add(id);
      return id;
    };
    window.cancelAnimationFrame = id => { callbacks.delete(id); active.delete(id); };
    window.__stepRea = time => {
      const current = [...callbacks.entries()];
      callbacks.clear();
      current.forEach(([id, callback]) => { active.delete(id); callback(time); });
    };
  });
}

test('Rea Lab deep link, pause, speed and replay controls work', async ({ page }) => {
  await open(page);
  await page.reload();
  await page.waitForFunction(() => !!window.reaLab);
  await expect(page).toHaveTitle(/Rea Lab/);
  await page.getByRole('button', { name: '暂停动画', exact: true }).click();
  const paused = await state(page);
  expect(paused.paused).toBe(true);
  await page.waitForTimeout(150);
  expect((await state(page)).time).toBe(paused.time);
  expect(await page.evaluate(() => window.reaLab!.debug().activeFrame)).toBe(false);
  await page.getByRole('button', { name: /^播放速度/ }).click();
  expect((await state(page)).speed).toBeGreaterThan(paused.speed);
  await page.getByRole('button', { name: '播放动画', exact: true }).click();
  await expect.poll(async () => (await state(page)).time).toBeGreaterThan(paused.time);
  await page.getByRole('button', { name: '暂停动画', exact: true }).click();
  await page.getByRole('button', { name: '重播演示', exact: true }).click();
  expect((await state(page)).time).toBeLessThan(.2);
  expect((await state(page)).phase).toBe('LOADING');
  expect((await state(page)).lifted).toBe(0);
});

test('The reverse-engineering pipeline resolves its counters and starts a fresh cycle', async ({ page }) => {
  await controlFrames(page);
  await open(page);
  const result = await page.evaluate(() => {
    const c = window.reaLab!;
    c.restart(); c.setPaused(false);
    const start = performance.now();
    window.__stepRea!(start);
    const initial = c.getSnapshot();
    const phases = [initial];
    const cameras = [c.debug().camera];
    for (const seconds of [3.5, 7.5, 11, 16]) {
      window.__stepRea!(start + seconds * 1000);
      phases.push(c.getSnapshot()); cameras.push(c.debug().camera);
    }
    const resolved = c.getSnapshot();
    window.__stepRea!(start + 18100);
    c.setPaused(true);
    const nextCycle = c.getSnapshot();
    window.__stepRea!(start + 25000);
    return { initial, phases, cameras, resolved, nextCycle, afterPause: c.getSnapshot() };
  });
  expect(result.phases.map(s => s.phase)).toEqual(['LOADING', 'LIFTING', 'DECOMPILING', 'SYNCING', 'RESOLVED']);
  expect(result.phases[1]!.lifted).toBeGreaterThan(result.initial.lifted);
  expect(result.phases[2]!.decompiled).toBeGreaterThan(0);
  expect(result.phases[3]!.sync).toBeGreaterThan(0);
  expect(result.resolved).toMatchObject({ lifted: 1536, decompiled: 1207, flagged: 329, sync: 100, gap: 0 });
  expect(result.resolved.lifted).toBe(result.resolved.decompiled + result.resolved.flagged);
  expect(new Set(result.cameras.map(camera => camera.x.toFixed(2))).size).toBeGreaterThan(2);
  expect(result.nextCycle.phase).toBe('LOADING');
  expect(result.nextCycle.lifted).toBeLessThan(result.resolved.lifted);
  expect(result.nextCycle.decompiled).toBe(0);
  expect(result.afterPause).toEqual(result.nextCycle);
});

test('Rea Lab has real depth and paused manual camera movement reveals parallax', async ({ page }) => {
  await open(page);
  await page.evaluate(() => window.reaLab!.setPaused(true));
  const before = await page.evaluate(() => window.reaLab!.debug());
  const stopped = await state(page);
  expect(before.nodeCount).toBeGreaterThan(100);
  expect(before.linkCount).toBeGreaterThan(100);
  expect(before.depthRange.max - before.depthRange.min).toBeGreaterThan(.2);
  expect(new Set(before.probes.map(probe => probe.world[2])).size).toBeGreaterThan(1);
  expect(before.probes.every(probe => probe.screen.every(Number.isFinite))).toBe(true);
  await page.locator('.rea-lab canvas').first().press('ArrowRight');
  const after = await page.evaluate(() => window.reaLab!.debug());
  expect(after.rotation.yaw).not.toBe(before.rotation.yaw);
  expect(after.probes.map(probe => probe.world)).toEqual(before.probes.map(probe => probe.world));
  const shifts = after.probes.map((probe, index) => [probe.screen[0] - before.probes[index]!.screen[0], probe.screen[1] - before.probes[index]!.screen[1]]);
  expect(shifts.some((shift, i) => shifts.slice(i + 1).some(other => Math.hypot(shift[0]! - other[0]!, shift[1]! - other[1]!) > .5))).toBe(true);
  expect((await state(page)).time).toBe(stopped.time);
  await page.getByRole('button', { name: '重置视角', exact: true }).click();
  expect((await page.evaluate(() => window.reaLab!.debug())).rotation).toEqual(before.rotation);
});

test('Rea Lab cancels its single render loop on every SPA exit', async ({ page }) => {
  await controlFrames(page);
  await page.goto('/#/');
  for (let visit = 0; visit < 3; visit++) {
    await page.locator('.open-screen[href="#/screens/rea-lab"]').press('Enter');
    await page.waitForFunction(() => !!window.reaLab, undefined, { polling: 50 });
    const active = await page.evaluate(() => {
      const c = window.reaLab!;
      window.__retiredRea = c;
      const before = c.debug().frameCount;
      window.__stepRea!(performance.now() + 100);
      return { frames: window.__reaFrames!.size, rendered: c.debug().frameCount - before };
    });
    expect(active).toEqual({ frames: 1, rendered: 1 });
    await page.getByRole('link', { name: '返回大屏索引', exact: true }).press('Enter');
    await expect(page.locator('#screen-grid .open-screen')).toHaveCount(7);
    const disposed = await page.evaluate(() => ({ controller: typeof window.reaLab, frames: window.__reaFrames!.size, disposed: window.__retiredRea!.debug().disposed }));
    expect(disposed).toEqual({ controller: 'undefined', frames: 0, disposed: true });
    await expect(page.locator('canvas')).toHaveCount(0);
  }
});

test('Rea Lab respects reduced motion and remains usable at portrait and mobile widths', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const viewport of [{ width: 720, height: 900 }, { width: 1600, height: 1000 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await open(page);
    const paused = await state(page);
    expect(paused.paused).toBe(true);
    expect(await page.evaluate(() => window.reaLab!.debug().activeFrame)).toBe(false);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await expect(page.getByRole('button', { name: '播放动画', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: '返回大屏索引', exact: true })).toBeVisible();
    expect(await page.evaluate(() => window.reaLab!.debug().probes.every(probe => probe.screen.every(Number.isFinite)))).toBe(true);
  }
});

test('Playback speed scales simulation time without changing the phase order', async ({ page }) => {
  await controlFrames(page);
  await open(page);
  const result = await page.evaluate(() => {
    const c = window.reaLab!;
    c.restart(); c.setPaused(false); c.setSpeed(1);
    let start = performance.now();
    window.__stepRea!(start); window.__stepRea!(start + 1000);
    const normal = c.getSnapshot();
    c.restart(); c.setSpeed(2);
    start = performance.now();
    window.__stepRea!(start); window.__stepRea!(start + 1000);
    const fast = c.getSnapshot();
    c.setPaused(true);
    return { normal, fast };
  });
  expect(result.fast.time / result.normal.time).toBeCloseTo(2, 1);
  expect(result.fast.lifted).toBeGreaterThan(result.normal.lifted);
  expect(result.normal.phase).toBe('LOADING');
  expect(result.fast.phase).toBe('LOADING');
});

test('Processed outcomes never exceed the lifted input during a cycle', async ({ page }) => {
  await controlFrames(page);
  await open(page);
  const samples = await page.evaluate(() => {
    const c = window.reaLab!; c.restart(); c.setPaused(false);
    const start = performance.now(); window.__stepRea!(start);
    return Array.from({ length: 72 }, (_, i) => { window.__stepRea!(start + i * 250); return c.getSnapshot(); });
  });
  for (const sample of samples) {
    expect(sample.decompiled + sample.flagged, `outcomes at ${sample.time}s`).toBeLessThanOrEqual(sample.lifted);
    expect(sample.crossings, `crossings at ${sample.time}s`).toBeLessThanOrEqual(sample.lifted);
  }
});

test('Zooming during a paused reset continues from the visible camera without jumping backwards', async ({ page }) => {
  await controlFrames(page);
  await open(page);
  await page.evaluate(() => {
    const c = window.reaLab!; c.restart(); c.setPaused(false);
    const start = performance.now(); window.__stepRea!(start); window.__stepRea!(start + 13000); c.setPaused(true);
  });
  const canvas = page.locator('.rea-scene canvas');
  for (let i = 0; i < 5; i++) await canvas.press('+');
  const initial = await state(page);
  await page.getByRole('button', { name: '重置视角', exact: true }).click();
  expect((await state(page)).zoom).toBeCloseTo(initial.zoom);
  await page.evaluate(() => window.__stepRea!(performance.now() + 100));
  const returning = await state(page);
  expect(returning.zoom).toBeLessThan(initial.zoom);
  await canvas.press('+');
  const interrupted = await state(page);
  expect(interrupted.zoom).toBeCloseTo(returning.zoom * 1.1);
  expect(interrupted.time).toBe(initial.time);
  expect(await page.evaluate(() => window.reaLab!.debug().activeFrame)).toBe(false);
});
