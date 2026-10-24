import { expect, test as base, type Page } from '@playwright/test';
import type { VortexController } from '../src/dashboards/vortex-desk/model';

declare global {
  interface Window {
    vortexDesk?: VortexController;
    __vortexFrames?: Set<number>;
    __vortexNavigationSentinel?: string;
    __advanceVortexFrame?: (timestamp: number) => void;
  }
}

const test = base.extend({
  page: async ({ page }, use) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await use(page);
    expect(errors, 'Vortex Desk must remain free of browser exceptions').toEqual([]);
  },
});

async function openVortex(page: Page) {
  await page.goto('/#/screens/vortex-desk');
  await page.waitForFunction(() => typeof window.vortexDesk?.getDiagnostics === 'function'
    && window.vortexDesk.getDiagnostics().renderedFrames > 0);
  await expect(page.locator('.vortex-desk')).toBeVisible();
}

const snapshot = (page: Page) => page.evaluate(() => window.vortexDesk!.getDiagnostics());

test('Vortex playback follows elapsed time when rendering falls to ten frames per second', async ({ page }) => {
  await page.addInitScript(() => {
    let next = 0;
    const pending = new Map<number, FrameRequestCallback>();
    window.requestAnimationFrame = callback => { pending.set(++next, callback); return next; };
    window.cancelAnimationFrame = id => { pending.delete(id); };
    window.__advanceVortexFrame = timestamp => {
      const callbacks = [...pending.values()];
      pending.clear();
      callbacks.forEach(callback => callback(timestamp));
    };
  });
  await page.goto('/#/screens/vortex-desk');
  await page.waitForFunction(() => !!window.vortexDesk);
  const elapsed = await page.evaluate(() => {
    window.__advanceVortexFrame!(1000);
    const before = window.vortexDesk!.getDiagnostics().time;
    for (let i = 1; i <= 10; i++) window.__advanceVortexFrame!(1000 + i * 100);
    return window.vortexDesk!.getDiagnostics().time - before;
  });
  expect(elapsed).toBeCloseTo(1, 5);
});

test('Vortex Desk deep links refresh and playback controls operate the real timeline', async ({ page }) => {
  await openVortex(page);
  await page.reload();
  await page.waitForFunction(() => typeof window.vortexDesk?.getDiagnostics === 'function');
  await page.getByRole('button', { name: '暂停动画', exact: true }).click();
  const stopped = await snapshot(page);
  expect(stopped.paused).toBe(true);
  await page.waitForTimeout(200);
  expect((await snapshot(page)).time).toBe(stopped.time);
  expect((await snapshot(page)).activeFrame).toBe(false);
  await page.getByRole('button', { name: /^播放速度/ }).click();
  expect((await snapshot(page)).speed).not.toBe(stopped.speed);
  await page.getByRole('button', { name: '播放动画', exact: true }).click();
  await expect.poll(async () => (await snapshot(page)).time).toBeGreaterThan(stopped.time);
  await page.getByRole('button', { name: '暂停动画', exact: true }).click();
  await page.getByRole('button', { name: '重播演示', exact: true }).click();
  await expect.poll(async () => (await snapshot(page)).time).toBe(0);
  expect((await snapshot(page)).phase).toBe('OBSERVE');
  expect((await snapshot(page)).paused).toBe(true);
  await page.locator('a[href="#/"]').first().click();
  await expect(page.locator('#screen-grid .open-screen')).toHaveCount(4);
});

test('Vortex particles occupy XYZ space and paused dragging creates depth parallax', async ({ page }) => {
  await openVortex(page);
  await page.evaluate(() => window.vortexDesk!.setPaused(true));
  const before = await snapshot(page);
  expect(before.particles).toBeGreaterThan(1000);
  expect(before.strands).toBeGreaterThan(20);
  expect(before.depthRange.max - before.depthRange.min).toBeGreaterThan(1);
  expect(before.probes.length).toBeGreaterThan(3);
  for (const axis of ['x', 'y', 'z'] as const) {
    expect(before.probes.every(probe => Number.isFinite(probe.world[axis]))).toBe(true);
    expect(new Set(before.probes.map(probe => probe.world[axis])).size).toBeGreaterThan(2);
  }
  expect(new Set(before.probes.map(probe => probe.screen.scale)).size).toBeGreaterThan(2);
  const canvas = page.locator('.vortex-desk canvas');
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error('Vortex canvas has no layout bounds');
  const x = bounds.x + bounds.width * .5;
  const y = bounds.y + bounds.height * .5;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 120, y + 40, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await snapshot(page)).renderedFrames).toBeGreaterThan(before.renderedFrames);
  const after = await snapshot(page);
  expect(after.paused).toBe(true);
  expect(after.time).toBe(before.time);
  expect(after.camera.yaw).not.toBe(before.camera.yaw);
  expect(after.camera.pitch).not.toBe(before.camera.pitch);
  expect(after.probes.map(probe => probe.world)).toEqual(before.probes.map(probe => probe.world));
  const shifts = after.probes.map((probe, index) => ({
    x: probe.screen.x - before.probes[index].screen.x,
    y: probe.screen.y - before.probes[index].screen.y,
  }));
  expect(shifts.some(shift => Math.hypot(shift.x, shift.y) > 1)).toBe(true);
  expect(shifts.some(shift => Math.hypot(shift.x - shifts[0].x, shift.y - shifts[0].y) > 1)).toBe(true);
  await canvas.focus();
  await canvas.press('+');
  await expect.poll(async () => (await snapshot(page)).camera.zoom).toBeGreaterThan(after.camera.zoom);
  await page.getByRole('button', { name: '重置视角', exact: true }).click();
  await expect.poll(async () => (await snapshot(page)).camera).toEqual({ yaw: 0, pitch: 0, zoom: 1 });
});

test('the Vortex cycle visits all five phases and enters and releases its risk hold', async ({ page }) => {
  await openVortex(page);
  await page.evaluate(() => {
    const controller = window.vortexDesk!;
    controller.setPaused(true);
    controller.restart();
    controller.setSpeed(4);
    controller.setPaused(false);
  });
  const phases = new Set<string>();
  let held = false;
  let released = false;
  const initial = await snapshot(page);
  await expect.poll(async () => {
    const current = await snapshot(page);
    phases.add(current.phase);
    if (current.riskHold) held = true;
    if (held && !current.riskHold) released = true;
    return phases.size === 5 && held && released;
  }, { intervals: [50, 80, 100], timeout: 15000 }).toBe(true);
  await page.getByRole('button', { name: '暂停动画', exact: true }).click();
  const completed = await snapshot(page);
  expect([...phases].sort()).toEqual(['ANALYZE', 'EXECUTE', 'OBSERVE', 'REPORT', 'RISK CHECK']);
  expect(completed.probes.map(probe => probe.world)).not.toEqual(initial.probes.map(probe => probe.world));
  expect(completed.events).toBeGreaterThan(initial.events);
});

test('Vortex Desk releases its controller and animation frame on repeated SPA exits', async ({ page }) => {
  await page.addInitScript(() => {
    const request = window.requestAnimationFrame.bind(window);
    const cancel = window.cancelAnimationFrame.bind(window);
    const active = new Set<number>();
    window.__vortexFrames = active;
    window.requestAnimationFrame = callback => {
      const id = request(time => { active.delete(id); callback(time); });
      active.add(id);
      return id;
    };
    window.cancelAnimationFrame = id => { active.delete(id); cancel(id); };
  });
  await page.goto('/#/');
  await page.evaluate(() => { window.__vortexNavigationSentinel = 'same-document'; });
  for (let visit = 0; visit < 3; visit++) {
    await page.locator('#screen-grid .open-screen[href="#/screens/vortex-desk"]').click();
    await page.waitForFunction(() => typeof window.vortexDesk?.getDiagnostics === 'function');
    await expect(page.locator('.vortex-desk')).toHaveCount(1);
    await expect.poll(() => page.evaluate(() => window.__vortexFrames!.size)).toBe(1);
    expect(await page.evaluate(() => window.__vortexNavigationSentinel)).toBe('same-document');
    await page.locator('a[href="#/"]').first().click();
    await expect(page.locator('#screen-grid')).toBeVisible();
    await expect(page.locator('.vortex-desk')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => ({
      controller: typeof window.vortexDesk,
      frames: window.__vortexFrames!.size,
    }))).toEqual({ controller: 'undefined', frames: 0 });
    expect(await page.evaluate(() => window.__vortexNavigationSentinel)).toBe('same-document');
  }
});

test('Vortex Desk fits desktop viewports and reduced-motion mobile controls remain usable', async ({ page }) => {
  await openVortex(page);
  await page.evaluate(() => window.vortexDesk!.setPaused(true));
  for (const viewport of [{ width: 1600, height: 1000 }, { width: 1080, height: 1350 }, { width: 713, height: 1139 }]) {
    await page.setViewportSize(viewport);
    await expect.poll(() => page.evaluate(() => ({
      width: document.documentElement.scrollWidth <= innerWidth,
      height: document.documentElement.scrollHeight <= innerHeight,
      panels: [...document.querySelectorAll('.vortex-desk canvas, .vd-panel, .vd-footer')].every(panel => {
        const rect = panel.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && rect.left >= 0 && rect.top >= 0
          && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1;
      }),
    }))).toEqual({ width: true, height: true, panels: true });
    expect(await page.evaluate(() => {
      const positions = document.querySelector('.vd-positions')!.getBoundingClientRect();
      const table = document.querySelector('.vd-positions table')!.getBoundingClientRect();
      const rate = document.querySelector('.vd-rate')!.getBoundingClientRect();
      return table.right <= positions.right && rate.top >= positions.bottom;
    }), 'Position values remain inside their panel and the rate chart does not cover the net total').toBe(true);
    await expect(page.getByRole('button', { name: '播放动画', exact: true })).toBeInViewport();
    await expect(page.getByRole('button', { name: '重置视角', exact: true })).toBeInViewport();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  await page.waitForFunction(() => typeof window.vortexDesk?.getDiagnostics === 'function'
    && window.vortexDesk.getDiagnostics().renderedFrames > 0);
  const initial = await snapshot(page);
  expect(initial.paused).toBe(true);
  expect(initial.activeFrame).toBe(false);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(initial.probes.every(probe => Number.isFinite(probe.screen.x) && Number.isFinite(probe.screen.y))).toBe(true);
  for (const name of ['播放动画', '重播演示', '重置视角']) {
    await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
  }
  await page.getByRole('button', { name: '播放动画', exact: true }).click();
  await expect.poll(async () => (await snapshot(page)).time).toBeGreaterThan(initial.time);
  await page.getByRole('button', { name: '暂停动画', exact: true }).click();
  expect((await snapshot(page)).paused).toBe(true);
  await page.locator('a[href="#/"]').first().click();
  await expect(page.locator('#screen-grid .open-screen')).toHaveCount(4);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});


test('Vortex Desk falls back to a working and disposable 2D renderer without WebGL', async ({ page }) => {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (contextId: string, ...args: unknown[]) {
      if (['webgl', 'webgl2', 'experimental-webgl'].includes(contextId)) return null;
      return Reflect.apply(getContext, this, [contextId, ...args]);
    } as typeof getContext;
    const request = window.requestAnimationFrame.bind(window);
    const cancel = window.cancelAnimationFrame.bind(window);
    const active = new Set<number>();
    window.__vortexFrames = active;
    window.requestAnimationFrame = callback => {
      const id = request(time => { active.delete(id); callback(time); });
      active.add(id);
      return id;
    };
    window.cancelAnimationFrame = id => { active.delete(id); cancel(id); };
  });
  await openVortex(page);
  const initial = await snapshot(page);
  expect(initial.renderer).toBe('canvas2d');
  expect(initial.probes.length).toBeGreaterThan(3);
  expect(initial.probes.every(probe => Number.isFinite(probe.screen.x)
    && Number.isFinite(probe.screen.y) && probe.screen.scale > 0)).toBe(true);
  await expect.poll(async () => (await snapshot(page)).renderedFrames).toBeGreaterThan(initial.renderedFrames);
  await page.getByRole('button', { name: '暂停动画', exact: true }).click();
  const stopped = await snapshot(page);
  await page.waitForTimeout(200);
  expect((await snapshot(page)).time).toBe(stopped.time);
  await expect.poll(() => page.evaluate(() => window.__vortexFrames!.size)).toBe(0);
  await page.getByRole('button', { name: '播放动画', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__vortexFrames!.size)).toBe(1);
  await page.locator('a[href="#/"]').first().click();
  await expect(page.locator('#screen-grid')).toBeVisible();
  await expect.poll(() => page.evaluate(() => ({
    controller: typeof window.vortexDesk,
    frames: window.__vortexFrames!.size,
  }))).toEqual({ controller: 'undefined', frames: 0 });
});
