import { expect, test as base, type Page } from '@playwright/test';

type Point = { x: number; y: number; z: number };
type DemoState = {
  renderer: string;
  paused: boolean;
  elapsed: number;
  playbackRate: number;
  particles: number;
  particleDepthRange: { min: number; max: number };
  clusters: Point[];
  camera: { yaw: number; pitch: number };
  stage: string;
};

declare global {
  interface Window {
    demoState?: () => DemoState;
    demo3D?: () => { probes: Array<{ world: Point; screen: { x: number; y: number; k: number; depth: number } }> };
    __navigationSentinel?: string;
    __activeFrames?: Set<number>;
    __backdatedFrameState?: { elapsed: number; stage: string };
  }
}

const test = base.extend({
  page: async ({ page }, use) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await use(page);
    expect(errors, 'Every route and interaction must remain free of browser exceptions').toEqual([]);
  },
});

async function openDashboard(page: Page) {
  await page.goto('/#/screens/prompt-crawler');
  await page.waitForFunction(() => typeof window.demoState === 'function' && typeof window.demo3D === 'function');
  await expect(page.locator('.dashboard')).toBeVisible();
}

const state = (page: Page) => page.evaluate(() => window.demoState!());
const probes = (page: Page) => page.evaluate(() => window.demo3D!().probes);

test('an initial animation timestamp before mount cannot move the timeline below zero', async ({ page }) => {
  await page.addInitScript(() => {
    const request = window.requestAnimationFrame.bind(window);
    let firstFrame = true;
    window.requestAnimationFrame = callback => request(timestamp => {
      if (!firstFrame) {
        callback(timestamp);
        return;
      }
      firstFrame = false;
      callback(timestamp - 1000);
      const snapshot = window.demoState?.();
      if (snapshot) {
        window.__backdatedFrameState = { elapsed: snapshot.elapsed, stage: snapshot.stage };
      }
    });
  });
  await openDashboard(page);
  await page.waitForFunction(() => window.__backdatedFrameState !== undefined, undefined, { timeout: 5000 });
  const initialFrame = await page.evaluate(() => window.__backdatedFrameState!);
  expect(initialFrame.elapsed).toBeGreaterThanOrEqual(0);
  expect(initialFrame.stage).toBe('role');
  expect((await state(page)).elapsed).toBeGreaterThanOrEqual(0);
});

test('catalog search, categories, sorting and clear filters', async ({ page }) => {
  await page.goto('/#/');
  await expect(page.locator('#screen-grid .open-screen')).toHaveCount(3);
  await expect(page.locator('#screen-grid .open-screen').first()).toHaveAttribute('href', '#/screens/market-neural');
  await page.locator('#search').fill('找不到的大屏-404');
  await expect(page.locator('#screen-grid .open-screen')).toHaveCount(0);
  await expect(page.locator('#empty-state')).toBeVisible();
  await page.locator('#clear-search').click();
  await expect(page.locator('#search')).toHaveValue('');
  await expect(page.locator('#screen-grid .open-screen')).toHaveCount(3);
  await page.locator('#search').fill('语义');
  await expect(page.locator('#screen-grid .open-screen')).toHaveCount(1);
  const category = page.locator('#categories button').filter({ hasText: '三维可视化' });
  await category.click();
  await expect(category).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#sort').selectOption('name');
  await expect(page.locator('#screen-grid .open-screen')).toHaveCount(1);
  await page.locator('#categories button').filter({ hasText: '全部' }).click();
  await expect(page.locator('#empty-state')).toBeHidden();
  await page.locator('#search').fill('');
  await expect(page.locator('#screen-grid .open-screen')).toHaveCount(3);
  await expect(page.locator('#screen-grid .open-screen').first()).toHaveAttribute('href', '#/screens/decision-grid');
  await expect(page.locator('#screen-grid .open-screen').nth(1)).toHaveAttribute('href', '#/screens/market-neural');
  await expect(page.locator('#screen-grid .open-screen').nth(2)).toHaveAttribute('href', '#/screens/prompt-crawler');
  await page.locator('#categories button').filter({ hasText: '决策可视化' }).click();
  await expect(page.locator('#screen-grid .open-screen')).toHaveCount(1);
  await expect(page.locator('#screen-grid .open-screen')).toHaveAttribute('href', '#/screens/decision-grid');
  await page.locator('#categories button').filter({ hasText: '金融可视化' }).click();
  await expect(page.locator('#screen-grid .open-screen')).toHaveCount(1);
  await expect(page.locator('#screen-grid .open-screen')).toHaveAttribute('href', '#/screens/market-neural');
});

test('SPA navigation disposes the dashboard and its animation loop on every exit', async ({ page }) => {
  await page.addInitScript(() => {
    const request = window.requestAnimationFrame.bind(window);
    const cancel = window.cancelAnimationFrame.bind(window);
    const active = new Set<number>();
    window.__activeFrames = active;
    window.requestAnimationFrame = callback => {
      const id = request(time => {
        active.delete(id);
        callback(time);
      });
      active.add(id);
      return id;
    };
    window.cancelAnimationFrame = id => {
      active.delete(id);
      cancel(id);
    };
  });
  await page.goto('/#/');
  await page.evaluate(() => { window.__navigationSentinel = 'same-document'; });
  for (let visit = 0; visit < 3; visit += 1) {
    await page.locator('#screen-grid .open-screen[href="#/screens/prompt-crawler"]').click();
    await expect(page).toHaveURL(/#\/screens\/prompt-crawler$/);
    await page.waitForFunction(() => typeof window.demoState === 'function');
    await expect(page.locator('.dashboard')).toHaveCount(1);
    await expect.poll(() => page.evaluate(() => window.__activeFrames!.size)).toBe(1);
    expect(await page.evaluate(() => window.__navigationSentinel)).toBe('same-document');
    await page.locator('a[href="#/"]').first().click();
    await expect(page.locator('#screen-grid')).toBeVisible();
    await expect(page.locator('.dashboard')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => ({
      state: typeof window.demoState,
      geometry: typeof window.demo3D,
      frames: window.__activeFrames!.size,
    }))).toEqual({ state: 'undefined', geometry: 'undefined', frames: 0 });
    expect(await page.evaluate(() => window.__navigationSentinel)).toBe('same-document');
  }
});

test('real XYZ depth, paused camera parallax, playback speed and eight stages survive migration', async ({ page }) => {
  await openDashboard(page);
  const initial = await state(page);
  expect(initial.renderer).toBe('webgl');
  expect(initial.playbackRate).toBe(2.5);
  expect(initial.particles).toBeGreaterThan(100);
  expect(initial.particleDepthRange.max - initial.particleDepthRange.min).toBeGreaterThan(1);
  expect(initial.clusters.length).toBeGreaterThanOrEqual(7);
  for (const axis of ['x', 'y', 'z'] as const) {
    expect(initial.clusters.every(point => Number.isFinite(point[axis]))).toBe(true);
    expect(new Set(initial.clusters.map(point => point[axis])).size).toBeGreaterThan(1);
  }
  if (!initial.paused) await page.locator('#play').click();
  const paused = await state(page);
  const before = await probes(page);
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;
  const first = before.findIndex((a, i) => before.some((b, j) => j > i && near(a.world.x, b.world.x) && near(a.world.y, b.world.y) && !near(a.world.z, b.world.z)));
  expect(first).toBeGreaterThanOrEqual(0);
  const second = before.findIndex((b, j) => j > first && near(before[first].world.x, b.world.x) && near(before[first].world.y, b.world.y) && !near(before[first].world.z, b.world.z));
  expect(Math.abs(before[first].screen.k / before[second].screen.k - 1)).toBeGreaterThan(0.01);
  expect(before[first].screen.depth).not.toBe(before[second].screen.depth);
  const bounds = await page.locator('#network').boundingBox();
  if (!bounds) throw new Error('Network canvas has no layout bounds');
  const x = bounds.x + bounds.width * 0.48;
  const y = bounds.y + bounds.height * 0.5;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 150, y + 50, { steps: 8 });
  await page.mouse.up();
  const rotated = await state(page);
  const after = await probes(page);
  expect(rotated.paused).toBe(true);
  expect(rotated.elapsed).toBe(paused.elapsed);
  expect(rotated.camera.yaw).not.toBe(paused.camera.yaw);
  expect(rotated.camera.pitch).not.toBe(paused.camera.pitch);
  const delta = [first, second].map(index => ({
    x: after[index].screen.x - before[index].screen.x,
    y: after[index].screen.y - before[index].screen.y,
  }));
  expect(Math.hypot(delta[0].x - delta[1].x, delta[0].y - delta[1].y)).toBeGreaterThan(1);
  const names = ['role', 'objective', 'context', 'roles', 'rules', 'review', 'start', 'ship'];
  for (const [index, name] of names.entries()) {
    await page.locator('.tabs .tab').nth(index).click();
    expect((await state(page)).stage).toBe(name);
    await expect(page.locator('.tabs .tab.active')).toHaveCount(1);
  }
  await expect(page.locator('#words')).toHaveText('181/181');
  await expect(page.locator('#score')).toHaveText('82');
  await expect(page.locator('#flags')).toHaveText('12');
  await page.locator('#rate').click();
  expect((await state(page)).playbackRate).toBe(4);
  await page.locator('#replay').click();
  expect((await state(page)).paused).toBe(false);
  await page.waitForFunction(() => window.demoState!().stage !== 'role', undefined, { timeout: 8000 });
  await page.locator('#play').click();
  const stopped = await state(page);
  await page.waitForTimeout(200);
  expect((await state(page)).elapsed).toBe(stopped.elapsed);
});

test('dashboard deep link refresh and unknown routes', async ({ page }) => {
  await openDashboard(page);
  await page.reload();
  await page.waitForFunction(() => typeof window.demo3D === 'function');
  await expect(page.locator('.dashboard')).toHaveCount(1);
  await page.goto('/#/not-a-screen');
  await expect(page.getByText('404', { exact: true })).toBeVisible();
  await page.locator('a[href="#/"]').first().click();
  await expect(page.locator('#screen-grid')).toBeVisible();
});

test('mobile layout and reduced motion remain usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/#/');
  await expect(page.locator('#search')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('#screen-grid .open-screen[href="#/screens/prompt-crawler"]').click();
  await page.waitForFunction(() => typeof window.demoState === 'function');
  expect((await state(page)).paused).toBe(true);
  const layout = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth <= innerWidth,
    height: document.documentElement.scrollHeight <= innerHeight,
    panels: [...document.querySelectorAll('.dashboard .panel')].map(panel => {
      const rect = panel.getBoundingClientRect();
      return rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1;
    }),
  }));
  expect(layout.width).toBe(true);
  expect(layout.height).toBe(true);
  expect(layout.panels.length).toBeGreaterThan(0);
  expect(layout.panels.every(Boolean)).toBe(true);
  expect((await probes(page)).every(probe => Number.isFinite(probe.screen.x) && Number.isFinite(probe.screen.y))).toBe(true);
});
