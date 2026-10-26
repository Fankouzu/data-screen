import { expect, test as base, type Page } from '@playwright/test';
import type { GridController } from '../src/dashboards/decision-grid/model';

declare global {
  interface Window {
    decisionGrid?: GridController;
    __decisionFrames?: Set<number>;
    __decisionNavigationSentinel?: string;
  }
}

const test = base.extend({
  page: async ({ page }, use) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await use(page);
    expect(errors, 'Decision Grid must remain free of browser exceptions').toEqual([]);
  },
});

async function openGrid(page: Page) {
  await page.goto('/#/screens/decision-grid');
  await page.waitForFunction(() => typeof window.decisionGrid?.getDiagnostics === 'function');
  await expect(page.locator('.decision-grid')).toBeVisible();
}

const snapshot = (page: Page) => page.evaluate(() => window.decisionGrid!.getDiagnostics());

// Observe the actual clock through every phase, then freeze at CODE before the next case begins.
async function finishCase(page: Page, index: number) {
  await page.evaluate(caseIndex => {
    const controller = window.decisionGrid!;
    controller.setPaused(true);
    controller.setCase(caseIndex);
    controller.setSpeed(2);
    controller.setPaused(false);
  }, index);
  const seen = new Set<number>();
  await expect.poll(async () => {
    const current = await snapshot(page);
    seen.add(current.phase);
    if (current.phase === 4) await page.evaluate(() => window.decisionGrid!.setPaused(true));
    return [...seen].sort();
  }, { intervals: [30, 50, 80], timeout: 15000 }).toEqual([0, 1, 2, 3, 4]);
  expect((await snapshot(page)).caseIndex).toBe(index);
  await expect(page.locator('.dg-phases li[aria-current="step"]')).toHaveText('CODE');
  await expect(page.locator('.dg-log-line')).toHaveCount(5);
}

test('Decision Grid deep links refresh and all twelve cases can be selected', async ({ page }) => {
  await openGrid(page);
  await page.reload();
  await page.waitForFunction(() => typeof window.decisionGrid?.getDiagnostics === 'function');
  await page.evaluate(() => window.decisionGrid!.setPaused(true));
  const cases = page.locator('.dg-case-buttons button');
  await expect(cases).toHaveCount(12);
  for (let index = 0; index < 12; index += 1) {
    await cases.nth(index).click();
    expect((await snapshot(page)).caseIndex).toBe(index);
    await expect(cases.nth(index)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.dg-case-buttons button[aria-pressed="true"]')).toHaveCount(1);
  }
  await page.locator('a[href="#/"]').first().click();
  await expect(page.locator('#screen-grid .open-screen')).toHaveCount(6);
});

test('Decision Grid uses XYZ depth and paused dragging preserves the timeline', async ({ page }) => {
  await openGrid(page);
  await page.evaluate(() => window.decisionGrid!.setPaused(true));
  const before = await snapshot(page);
  expect(before.cards).toBeGreaterThan(20);
  expect(before.walls).toBeGreaterThanOrEqual(3);
  expect(before.depthRange.max - before.depthRange.min).toBeGreaterThan(50);
  expect(before.probes.length).toBeGreaterThan(2);
  for (const axis of ['x', 'y', 'z'] as const) {
    expect(before.probes.every(probe => Number.isFinite(probe.world[axis]))).toBe(true);
    expect(new Set(before.probes.map(probe => probe.world[axis])).size).toBeGreaterThan(1);
  }
  expect(new Set(before.probes.map(probe => probe.screen.scale)).size).toBeGreaterThan(1);
  const canvas = page.locator('.dg-scene canvas');
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error('Decision scene has no layout bounds');
  const x = bounds.x + bounds.width * 0.5;
  const y = bounds.y + bounds.height * 0.5;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 120, y + 45, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await snapshot(page)).camera.yaw).not.toBe(before.camera.yaw);
  const after = await snapshot(page);
  expect(after.paused).toBe(true);
  expect(after.time).toBe(before.time);
  expect(after.camera.pitch).not.toBe(before.camera.pitch);
  expect(after.probes.map(probe => probe.world)).toEqual(before.probes.map(probe => probe.world));
  const shifts = after.probes.map((probe, index) => ({
    x: probe.screen.x - before.probes[index].screen.x,
    y: probe.screen.y - before.probes[index].screen.y,
  }));
  expect(shifts.some(shift => Math.hypot(shift.x, shift.y) > 1)).toBe(true);
  expect(shifts.some(shift => Math.hypot(shift.x - shifts[0].x, shift.y - shifts[0].y) > 1)).toBe(true);
});

test('five decision phases distinguish confident execution from a human gate', async ({ page }) => {
  await openGrid(page);
  await finishCase(page, 7);
  await expect(page.locator('.dg-log-line').filter({ has: page.getByText('gate', { exact: true }) })).toContainText('pass');
  await expect(page.locator('.decision-grid')).toContainText('book_call');
  expect((await snapshot(page)).confidence).toBeCloseTo(.89, 2);
  await finishCase(page, 9);
  await expect(page.locator('.dg-log-line').filter({ has: page.getByText('gate', { exact: true }) })).toContainText('HOLD');
  await expect(page.locator('.decision-grid')).toContainText('human_gate');
  expect((await snapshot(page)).confidence).toBeCloseTo(.71, 2);
  await page.getByRole('button', { name: /^播放速度/ }).click();
  expect((await snapshot(page)).speed).not.toBe(2);
  await page.getByRole('button', { name: '重播当前案例' }).click();
  await expect.poll(async () => (await snapshot(page)).phase).toBe(0);
  await page.getByRole('button', { name: '播放动画', exact: true }).click();
  await expect.poll(async () => (await snapshot(page)).time).toBeGreaterThan(0);
  await page.getByRole('button', { name: '暂停动画', exact: true }).click();
  const stopped = await snapshot(page);
  await page.waitForTimeout(150);
  expect((await snapshot(page)).time).toBe(stopped.time);
});

test('Decision Grid releases its animation loop through repeated SPA visits', async ({ page }) => {
  await page.addInitScript(() => {
    const request = window.requestAnimationFrame.bind(window);
    const cancel = window.cancelAnimationFrame.bind(window);
    const active = new Set<number>();
    window.__decisionFrames = active;
    window.requestAnimationFrame = callback => {
      const id = request(time => { active.delete(id); callback(time); });
      active.add(id);
      return id;
    };
    window.cancelAnimationFrame = id => { active.delete(id); cancel(id); };
  });
  await page.goto('/#/');
  await page.evaluate(() => { window.__decisionNavigationSentinel = 'same-document'; });
  for (let visit = 0; visit < 3; visit += 1) {
    await page.locator('#screen-grid .open-screen[href="#/screens/decision-grid"]').click();
    await page.waitForFunction(() => typeof window.decisionGrid?.getDiagnostics === 'function');
    await expect(page.locator('.decision-grid')).toHaveCount(1);
    await expect.poll(() => page.evaluate(() => window.__decisionFrames!.size)).toBe(1);
    expect(await page.evaluate(() => window.__decisionNavigationSentinel)).toBe('same-document');
    await page.locator('a[href="#/"]').first().click();
    await expect(page.locator('#screen-grid')).toBeVisible();
    await expect(page.locator('.decision-grid')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => ({
      controller: typeof window.decisionGrid,
      frames: window.__decisionFrames!.size,
    }))).toEqual({ controller: 'undefined', frames: 0 });
    expect(await page.evaluate(() => window.__decisionNavigationSentinel)).toBe('same-document');
  }
});

test('Decision Grid remains usable on mobile with reduced motion', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openGrid(page);
  const initial = await snapshot(page);
  expect(initial.paused).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(initial.probes.every(probe => Number.isFinite(probe.screen.x) && Number.isFinite(probe.screen.y))).toBe(true);
  await page.locator('.dg-case-buttons button').nth(9).click();
  expect((await snapshot(page)).caseIndex).toBe(9);
  await expect(page.getByRole('button', { name: '播放动画', exact: true })).toBeVisible();
  await page.locator('a[href="#/"]').first().click();
  await expect(page.locator('#screen-grid')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
