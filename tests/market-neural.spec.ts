import { expect, test as base, type Page } from '@playwright/test';
import type { NeuralController } from '../src/dashboards/market-neural/model';

declare global {
  interface Window {
    marketNeural?: NeuralController;
    __neuralFrames?: Set<number>;
    __neuralNavigationSentinel?: string;
  }
}

const test = base.extend({
  page: async ({ page }, use) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await use(page);
    expect(errors, 'Market Neural must remain free of browser exceptions').toEqual([]);
  },
});

async function openNeural(page: Page) {
  await page.goto('/#/screens/market-neural');
  await page.waitForFunction(() => typeof window.marketNeural?.getDiagnostics === 'function'
    && window.marketNeural.getDiagnostics().renderedFrames > 0);
  await expect(page.locator('.market-neural')).toBeVisible();
}

const snapshot = (page: Page) => page.evaluate(() => window.marketNeural!.getDiagnostics());

const streamSnapshot = (page: Page) => page.evaluate(() => {
  const ticker = document.querySelector<HTMLElement>('.mn-ticker-track');
  const cursor = document.querySelector<SVGLineElement>('.mn-z-cursor');
  if (!ticker || !cursor) throw new Error('Market stream or chart cursor is missing');
  return {
    time: window.marketNeural!.getDiagnostics().time,
    tickerX: ticker.getBoundingClientRect().x,
    rows: [...document.querySelectorAll<HTMLElement>('.mn-wire-track [data-order-id]')].map(row => ({
      id: row.dataset.orderId,
      text: row.textContent,
      y: row.getBoundingClientRect().y,
      height: row.getBoundingClientRect().height,
    })),
    traces: [...document.querySelectorAll<SVGPolylineElement>('.mn-z-trace')].map(trace => (trace.getAttribute('points') || '').trim().split(/\s+/)),
    cursorX: Number(cursor.getAttribute('x1')),
  };
});

test('Market live feed and WIRE orders scroll quickly, freeze on pause and reset on replay', async ({ page }) => {
  await openNeural(page);
  await page.evaluate(() => {
    const controller = window.marketNeural!;
    controller.setPaused(true);
    controller.setSpeed(1);
    controller.restart();
  });
  await expect.poll(async () => (await streamSnapshot(page)).time).toBe(0);
  const initial = await streamSnapshot(page);
  expect(initial.rows.length).toBeGreaterThan(8);
  const trackedRow = initial.rows[Math.floor(initial.rows.length / 2)];
  expect(trackedRow.id).toBeTruthy();
  expect(trackedRow.height).toBeGreaterThan(0);
  await page.getByRole('button', { name: '播放动画', exact: true }).click();
  await expect.poll(async () => (await snapshot(page)).time, { intervals: [50, 80] }).toBeGreaterThan(.5);
  await page.getByRole('button', { name: '暂停动画', exact: true }).click();
  const moved = await streamSnapshot(page);
  const retainedRow = moved.rows.find(row => row.id === trackedRow.id);
  expect(retainedRow, 'An order must retain its identity while travelling upward').toBeDefined();
  expect(retainedRow!.text).toBe(trackedRow.text);
  const seconds = moved.time - initial.time;
  const tickerPixelsPerSecond = (initial.tickerX - moved.tickerX) / seconds;
  const wireRowsPerSecond = (trackedRow.y - retainedRow!.y) / trackedRow.height / seconds;
  expect(tickerPixelsPerSecond).toBeGreaterThan(120);
  expect(tickerPixelsPerSecond).toBeLessThan(250);
  expect(wireRowsPerSecond).toBeGreaterThan(4);
  expect(wireRowsPerSecond).toBeLessThan(8);

  await page.waitForTimeout(300);
  expect(await streamSnapshot(page)).toEqual(moved);
  await page.getByRole('button', { name: '播放动画', exact: true }).click();
  await expect.poll(async () => (await streamSnapshot(page)).tickerX).toBeLessThan(moved.tickerX - 20);
  await page.getByRole('button', { name: '暂停动画', exact: true }).click();
  await page.getByRole('button', { name: '重播演示', exact: true }).click();
  await expect.poll(() => streamSnapshot(page)).toEqual(initial);
});

test('four market traces append stable historical points and sweep when the chart is full', async ({ page }) => {
  await openNeural(page);
  await page.evaluate(() => {
    const controller = window.marketNeural!;
    controller.setPaused(true);
    controller.setSpeed(1);
    controller.restart();
  });
  const before = await streamSnapshot(page);
  expect(before.traces).toHaveLength(4);
  expect(before.traces.every(points => points.length > 100)).toBe(true);
  expect(Number.isFinite(before.cursorX)).toBe(true);
  await page.getByRole('button', { name: '播放动画', exact: true }).click();
  await expect.poll(async () => (await streamSnapshot(page)).traces[0].length, { intervals: [50, 80] }).toBeGreaterThan(before.traces[0].length + 4);
  await page.getByRole('button', { name: '暂停动画', exact: true }).click();
  const appended = await streamSnapshot(page);
  for (let index = 0; index < 4; index++) {
    expect(appended.traces[index].slice(0, before.traces[index].length)).toEqual(before.traces[index]);
    expect(appended.traces[index].length).toBeGreaterThan(before.traces[index].length);
  }
  expect(appended.cursorX).toBeGreaterThan(before.cursorX);
  await page.waitForTimeout(200);
  expect(await streamSnapshot(page)).toEqual(appended);
  await page.evaluate(() => {
    const controller = window.marketNeural!;
    controller.setSpeed(4);
    controller.setPaused(false);
  });
  await expect.poll(async () => {
    const current = await streamSnapshot(page);
    return current.traces.length === 4
      && current.traces.every(points => points.length < 50)
      && current.cursorX < before.cursorX;
  }, { intervals: [50, 80, 100], timeout: 10000 }).toBe(true);
});

test('Market Neural deep links refresh and playback controls affect the real timeline', async ({ page }) => {
  await openNeural(page);
  await page.reload();
  await page.waitForFunction(() => typeof window.marketNeural?.getDiagnostics === 'function');
  await page.getByRole('button', { name: '暂停动画', exact: true }).click();
  const stopped = await snapshot(page);
  expect(stopped.paused).toBe(true);
  await page.waitForTimeout(150);
  expect((await snapshot(page)).time).toBe(stopped.time);
  await page.getByRole('button', { name: /^播放速度/ }).click();
  expect((await snapshot(page)).speed).not.toBe(stopped.speed);
  await page.getByRole('button', { name: '播放动画', exact: true }).click();
  await expect.poll(async () => (await snapshot(page)).time).toBeGreaterThan(stopped.time);
  await page.getByRole('button', { name: '暂停动画', exact: true }).click();
  await page.getByRole('button', { name: '重播演示', exact: true }).click();
  await expect.poll(async () => (await snapshot(page)).time).toBeLessThan(.5);
  await page.locator('a[href="#/"]').first().click();
  await expect(page.locator('#screen-grid .open-screen')).toHaveCount(3);
});

test('Market Neural has a dense XYZ mesh and its modes change geometry through the full cycle', async ({ page }) => {
  await openNeural(page);
  await page.evaluate(() => window.marketNeural!.setPaused(true));
  const initial = await snapshot(page);
  expect(initial.nodes).toBeGreaterThan(1000);
  expect(initial.edges).toBeGreaterThan(initial.nodes * 2);
  expect(initial.clusters).toBeGreaterThanOrEqual(3);
  expect(initial.depthRange.max - initial.depthRange.min).toBeGreaterThan(1);
  expect(initial.probes.length).toBeGreaterThan(3);
  for (const axis of ['x', 'y', 'z'] as const) {
    expect(initial.probes.every(probe => Number.isFinite(probe.world[axis]))).toBe(true);
    expect(new Set(initial.probes.map(probe => probe.world[axis])).size).toBeGreaterThan(2);
  }
  expect(new Set(initial.probes.map(probe => probe.screen.scale)).size).toBeGreaterThan(2);

  await page.getByRole('button', { name: '合并视图', exact: true }).click();
  await expect(page.getByRole('button', { name: '合并视图', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => {
    const state = await snapshot(page);
    return state.mode === 'merged' && state.separation < .1 && state.renderedFrames > initial.renderedFrames;
  }).toBe(true);
  const merged = await snapshot(page);
  expect(merged.phase).toBe('UNIFIED');
  expect(merged.probes.map(probe => probe.world)).not.toEqual(initial.probes.map(probe => probe.world));
  expect(merged.time).toBe(initial.time);

  await page.getByRole('button', { name: '分裂视图', exact: true }).click();
  await expect(page.getByRole('button', { name: '分裂视图', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => {
    const state = await snapshot(page);
    return state.mode === 'split' && state.separation > .9 && state.renderedFrames > merged.renderedFrames;
  }).toBe(true);
  expect((await snapshot(page)).probes.map(probe => probe.world)).not.toEqual(merged.probes.map(probe => probe.world));

  await page.getByRole('button', { name: '自动演示', exact: true }).click();
  await expect(page.getByRole('button', { name: '自动演示', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.evaluate(() => {
    const controller = window.marketNeural!;
    controller.restart();
    controller.setSpeed(4);
    controller.setPaused(false);
  });
  const phases = new Set<string>();
  let minimumSeparation = 1;
  let separatedAgain = false;
  let unifiedWorld: typeof initial.probes | undefined;
  let distributedWorld: typeof initial.probes | undefined;
  await expect.poll(async () => {
    const state = await snapshot(page);
    phases.add(state.phase);
    minimumSeparation = Math.min(minimumSeparation, state.separation);
    if (state.separation < .1) unifiedWorld = state.probes;
    // Geometry eases toward its target and can finish separating after the phase label changes.
    if (minimumSeparation < .1 && state.separation > .9) {
      separatedAgain = true;
      distributedWorld = state.probes;
    }
    return phases.size === 4 && separatedAgain;
  }, { intervals: [50, 80, 100], timeout: 20000 }).toBe(true);
  expect([...phases].sort()).toEqual(['DISTRIBUTED', 'FUSION', 'HEDGE', 'UNIFIED']);
  expect(unifiedWorld).toBeDefined();
  expect(distributedWorld).toBeDefined();
  expect(distributedWorld!.map(probe => probe.world)).not.toEqual(unifiedWorld!.map(probe => probe.world));
});

test('Market Neural fits landscape and portrait desktop viewports without clipping panels', async ({ page }) => {
  await openNeural(page);
  await page.evaluate(() => window.marketNeural!.setPaused(true));
  for (const viewport of [{ width: 1600, height: 1000 }, { width: 1080, height: 1350 }]) {
    await page.setViewportSize(viewport);
    await expect.poll(() => page.evaluate(() => {
      const panels = [...document.querySelectorAll('.market-neural .mn-panel, .market-neural .mn-footer')];
      return {
        fitsWidth: document.documentElement.scrollWidth <= innerWidth,
        fitsHeight: document.documentElement.scrollHeight <= innerHeight,
        visiblePanels: panels.length > 0 && panels.every(panel => {
          const rect = panel.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0 && rect.left >= 0 && rect.top >= 0
            && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1;
        }),
      };
    })).toEqual({ fitsWidth: true, fitsHeight: true, visiblePanels: true });
    await expect(page.getByRole('button', { name: '播放动画', exact: true })).toBeInViewport();
    await expect(page.getByRole('button', { name: '分裂视图', exact: true })).toBeInViewport();
  }
});

test('Market Neural paused dragging produces depth parallax and the view can be reset', async ({ page }) => {
  await openNeural(page);
  await page.evaluate(() => window.marketNeural!.setPaused(true));
  const before = await snapshot(page);
  const canvas = page.locator('.mn-scene canvas');
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error('Neural scene has no layout bounds');
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

test('Market Neural releases its animation loop and controller on repeated SPA exits', async ({ page }) => {
  await page.addInitScript(() => {
    const request = window.requestAnimationFrame.bind(window);
    const cancel = window.cancelAnimationFrame.bind(window);
    const active = new Set<number>();
    window.__neuralFrames = active;
    window.requestAnimationFrame = callback => {
      const id = request(time => { active.delete(id); callback(time); });
      active.add(id);
      return id;
    };
    window.cancelAnimationFrame = id => { active.delete(id); cancel(id); };
  });
  await page.goto('/#/');
  await page.evaluate(() => { window.__neuralNavigationSentinel = 'same-document'; });
  for (let visit = 0; visit < 3; visit++) {
    await page.locator('#screen-grid .open-screen[href="#/screens/market-neural"]').click();
    await page.waitForFunction(() => typeof window.marketNeural?.getDiagnostics === 'function');
    await expect(page.locator('.market-neural')).toHaveCount(1);
    await expect.poll(() => page.evaluate(() => window.__neuralFrames!.size)).toBe(1);
    expect(await page.evaluate(() => window.__neuralNavigationSentinel)).toBe('same-document');
    await page.locator('a[href="#/"]').first().click();
    await expect(page.locator('#screen-grid')).toBeVisible();
    await expect(page.locator('.market-neural')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => ({
      controller: typeof window.marketNeural,
      frames: window.__neuralFrames!.size,
    }))).toEqual({ controller: 'undefined', frames: 0 });
    expect(await page.evaluate(() => window.__neuralNavigationSentinel)).toBe('same-document');
  }
});

test('Market Neural reduced-motion mobile controls remain accessible without overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openNeural(page);
  const initial = await snapshot(page);
  expect(initial.paused).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(initial.probes.every(probe => Number.isFinite(probe.screen.x) && Number.isFinite(probe.screen.y))).toBe(true);
  for (const name of ['自动演示', '合并视图', '分裂视图', '播放动画', '重置视角']) {
    await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
  }
  await page.getByRole('button', { name: '合并视图', exact: true }).click();
  await expect.poll(async () => (await snapshot(page)).separation).toBeLessThan(.1);
  await page.getByRole('button', { name: '播放动画', exact: true }).click();
  await expect.poll(async () => (await snapshot(page)).time).toBeGreaterThan(initial.time);
  await page.getByRole('button', { name: '暂停动画', exact: true }).click();
  expect((await snapshot(page)).paused).toBe(true);
  await page.locator('a[href="#/"]').first().click();
  await expect(page.locator('#screen-grid .open-screen')).toHaveCount(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
