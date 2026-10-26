import { expect, test as base, type Page } from '@playwright/test';
import type { SignalController } from '../src/dashboards/signal-loom/model';

declare global {
  interface Window {
    signalLoom?: SignalController;
    __loomFrames?: Set<number>;
    __stepLoom?: (time: number) => void;
  }
}
const test = base.extend({
  page: async ({ page }, use) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await use(page);
    expect(errors).toEqual([]);
  },
});
async function open(page: Page) {
  await page.goto('/#/screens/signal-loom');
  await page.waitForFunction(() => !!window.signalLoom);
  await expect(page.getByRole('heading', { name: /SIGNAL LOOM/ })).toBeVisible();
}
const state = (page: Page) => page.evaluate(() => window.signalLoom!.getSnapshot());

test('Signal Loom deep link refresh, pause, speed and replay work', async ({ page }) => {
  await open(page);
  await page.reload();
  await page.waitForFunction(() => !!window.signalLoom);
  await page.getByRole('button', { name: '暂停动画', exact: true }).click();
  const paused = await state(page);
  expect(paused.paused).toBe(true);
  await page.waitForTimeout(180);
  expect((await state(page)).time).toBe(paused.time);
  await page.getByRole('button', { name: /^播放速度/ }).click();
  expect((await state(page)).speed).not.toBe(paused.speed);
  await page.getByRole('button', { name: '播放动画', exact: true }).click();
  await expect.poll(async () => (await state(page)).time).toBeGreaterThan(paused.time);
  await page.getByRole('button', { name: '暂停动画', exact: true }).click();
  await page.getByRole('button', { name: '重播演示', exact: true }).click();
  expect((await state(page)).time).toBe(0);
  expect((await state(page)).phase).toBe('STATE');
});

test('Signal Loom has XYZ depth and paused camera interaction preserves time', async ({ page }) => {
  await open(page);
  await page.evaluate(() => window.signalLoom!.setPaused(true));
  const before = await page.evaluate(() => window.signalLoom!.debug());
  const stopped = await state(page);
  expect(before.pointCount).toBeGreaterThan(2000);
  expect(before.depthRange.max - before.depthRange.min).toBeGreaterThan(1);
  expect(before.probes[0]!.world[2]).not.toBe(before.probes[1]!.world[2]);
  expect(before.probes[0]!.screen).not.toEqual(before.probes[1]!.screen);
  const canvas = page.locator('canvas').first();
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error('Missing canvas bounds');
  await page.mouse.move(bounds.x + bounds.width * .55, bounds.y + bounds.height * .5);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * .68, bounds.y + bounds.height * .58, { steps: 6 });
  await page.mouse.up();
  const after = await page.evaluate(() => window.signalLoom!.debug());
  expect(after.rotation).not.toEqual(before.rotation);
  const shifts = after.probes.map((probe, i) => [probe.screen[0] - before.probes[i]!.screen[0], probe.screen[1] - before.probes[i]!.screen[1]]);
  expect(Math.hypot(shifts[0]![0]! - shifts[1]![0]!, shifts[0]![1]! - shifts[1]![1]!)).toBeGreaterThan(1);
  expect((await state(page)).time).toBe(stopped.time);
  await page.getByRole('button', { name: '重置视角', exact: true }).click();
  expect((await page.evaluate(() => window.signalLoom!.debug())).rotation).toEqual(before.rotation);
});

test('Signal Loom visits twelve cases, all phases and six camera poses at low frame rate', async ({ page }) => {
  await page.addInitScript(() => {
    let id = 0;
    const frames = new Map<number, FrameRequestCallback>();
    window.requestAnimationFrame = cb => { frames.set(++id, cb); return id; };
    window.cancelAnimationFrame = key => { frames.delete(key); };
    window.__stepLoom = time => {
      const callbacks = [...frames.values()];
      frames.clear();
      callbacks.forEach(cb => cb(time));
    };
  });
  await open(page);
  const result = await page.evaluate(() => {
    window.__stepLoom!(performance.now());
    const start = performance.now();
    const before = window.signalLoom!.getSnapshot().time;
    const cases = new Set<number>();
    const phases = new Set<string>();
    const cameras = new Set<string>();
    const confidence: Record<number, number> = {};
    for (let i = 1; i <= 270; i++) {
      window.__stepLoom!(start + i * 100);
      const current = window.signalLoom!.getSnapshot();
      cases.add(current.caseIndex); phases.add(current.phase); cameras.add(current.camera);
      confidence[current.caseIndex] = current.confidence;
    }
    return { cases: [...cases], phases: [...phases], cameras: [...cameras], confidence, elapsed: window.signalLoom!.getSnapshot().time - before };
  });
  expect(result.cases).toHaveLength(12);
  expect(result.phases.sort()).toEqual(['ASK', 'CODE', 'GATE', 'JEV', 'STATE']);
  expect(result.cameras).toHaveLength(6);
  expect(result.confidence[0]).toBeGreaterThan(.85);
  expect(result.confidence[9]).toBeLessThan(.85);
  expect(result.confidence[10]).toBeLessThan(.85);
  expect(result.elapsed).toBeGreaterThanOrEqual(26.9);
  expect(result.elapsed).toBeLessThan(27.2);
});

test('Signal Loom cleans animation frames on repeated SPA exits', async ({ page }) => {
  // Three real GPU context initializations need more time on software-rendered CI.
  test.setTimeout(60_000);
  await page.addInitScript(() => {
    const request = window.requestAnimationFrame.bind(window);
    const cancel = window.cancelAnimationFrame.bind(window);
    const active = new Set<number>(); window.__loomFrames = active;
    window.requestAnimationFrame = cb => {
      const id = request(t => { active.delete(id); cb(t); });
      active.add(id); return id;
    };
    window.cancelAnimationFrame = id => { active.delete(id); cancel(id); };
  });
  await page.goto('/#/');
  for (let visit = 0; visit < 3; visit++) {
    await page.locator('.open-screen[href="#/screens/signal-loom"]').click();
    await page.waitForFunction(() => !!window.signalLoom);
    await expect.poll(() => page.evaluate(() => window.__loomFrames!.size)).toBe(1);
    await page.getByRole('link', { name: '返回大屏索引' }).click();
    await expect(page.locator('.open-screen')).toHaveCount(5);
    await expect.poll(() => page.evaluate(() => ({ controller: typeof window.signalLoom, frames: window.__loomFrames!.size }))).toEqual({ controller: 'undefined', frames: 0 });
  }
});

test('Signal Loom reduced-motion layouts and Canvas fallback remain usable', async ({ page }) => {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind: string, ...args: unknown[]) {
      if (kind === 'webgl' || kind === 'webgl2' || kind === 'experimental-webgl') return null;
      return Reflect.apply(getContext, this, [kind, ...args]);
    } as typeof getContext;
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const viewport of [{ width: 720, height: 900 }, { width: 1600, height: 1000 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await open(page);
    expect((await state(page)).paused).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await expect(page.getByRole('button', { name: '播放动画', exact: true })).toBeVisible();
    expect((await page.evaluate(() => window.signalLoom!.debug())).renderer).toBe('canvas2d');
  }
});

test('Signal Loom stays interactive after shader initialization fails', async ({ page }) => {
  await page.addInitScript(() => {
    WebGLRenderingContext.prototype.getShaderParameter = () => false;
  });
  await open(page);
  expect((await page.evaluate(() => window.signalLoom!.debug())).renderer).toBe('canvas2d');
  const before = await state(page);
  await expect.poll(async () => (await state(page)).time).toBeGreaterThan(before.time);
  await page.getByRole('button', { name: '暂停动画', exact: true }).click();
  expect((await state(page)).paused).toBe(true);
});

test('Signal Loom recovers from a lost GPU context and disposes the fallback', async ({ page }) => {
  await open(page);
  expect((await page.evaluate(() => window.signalLoom!.debug())).renderer).toBe('webgl');
  await page.evaluate(() => {
    const gl = document.querySelector('canvas')!.getContext('webgl')!;
    const extension = gl.getExtension('WEBGL_lose_context');
    if (!extension) throw new Error('Missing context loss extension');
    extension.loseContext();
  });
  await expect.poll(() => page.evaluate(() => window.signalLoom!.debug().renderer)).toBe('canvas2d');
  const before = await state(page);
  await expect.poll(async () => (await state(page)).time).toBeGreaterThan(before.time);
  await page.getByRole('button', { name: '暂停动画', exact: true }).click();
  expect((await state(page)).paused).toBe(true);
  await page.getByRole('link', { name: '返回大屏索引' }).click();
  await expect(page.locator('canvas')).toHaveCount(0);
  expect(await page.evaluate(() => typeof window.signalLoom)).toBe('undefined');
});
