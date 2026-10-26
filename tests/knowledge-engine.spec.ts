import { expect, test as base, type Page } from '@playwright/test';
import type { KnowledgeController } from '../src/dashboards/knowledge-engine/model';

declare global {
  interface Window {
    knowledgeEngine?: KnowledgeController;
    __knowledgeFrames?: Set<number>;
    __stepKnowledge?: (time: number) => void;
    __retiredKnowledge?: KnowledgeController;
  }
}

const test = base.extend({
  page: async ({ page }, use) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await use(page);
    expect(errors, 'Knowledge graph interactions must not throw browser exceptions').toEqual([]);
  },
});
const state = (page: Page) => page.evaluate(() => window.knowledgeEngine!.getSnapshot());
async function open(page: Page) {
  await page.goto('/#/screens/knowledge-engine');
  await page.waitForFunction(() => !!window.knowledgeEngine, undefined, { polling: 50 });
  await expect(page.getByRole('heading', { name: /KNOWLEDGE ENGINE/ })).toBeVisible();
}
async function controlFrames(page: Page) {
  await page.addInitScript(() => {
    let next = 0;
    const callbacks = new Map<number, FrameRequestCallback>();
    const active = new Set<number>();
    window.__knowledgeFrames = active;
    window.requestAnimationFrame = callback => {
      const id = ++next;
      callbacks.set(id, callback); active.add(id);
      return id;
    };
    window.cancelAnimationFrame = id => { callbacks.delete(id); active.delete(id); };
    window.__stepKnowledge = time => {
      const current = [...callbacks.entries()];
      callbacks.clear();
      current.forEach(([id, callback]) => { active.delete(id); callback(time); });
    };
  });
}

test('Knowledge Engine deep links and playback controls remain usable', async ({ page }) => {
  await open(page);
  await page.reload();
  await page.waitForFunction(() => !!window.knowledgeEngine);
  await page.getByRole('button', { name: '暂停动画', exact: true }).click();
  const stopped = await state(page);
  expect(stopped.paused).toBe(true);
  await page.waitForTimeout(150);
  expect((await state(page)).time).toBe(stopped.time);
  await page.getByRole('button', { name: /^播放速度/ }).click();
  expect((await state(page)).speed).toBeGreaterThan(stopped.speed);
  await page.getByRole('button', { name: '播放动画', exact: true }).click();
  await expect.poll(async () => (await state(page)).time).toBeGreaterThan(stopped.time);
  await page.getByRole('button', { name: '暂停动画', exact: true }).click();
  await page.getByRole('button', { name: '重播演示', exact: true }).click();
  expect((await state(page)).time).toBeLessThan(.2);
  expect((await state(page)).phase).toBe('READER');
});

test('Knowledge graph progresses from read-only ingestion through writing, answering and conflict checks', async ({ page }) => {
  await controlFrames(page);
  await open(page);
  const result = await page.evaluate(() => {
    const controller = window.knowledgeEngine!;
    controller.restart();
    controller.setPaused(false);
    const start = performance.now();
    window.__stepKnowledge!(start);
    const initial = controller.getSnapshot();
    const observations = [initial];
    for (let step = 1; step <= 235; step++) {
      window.__stepKnowledge!(start + step * 100);
      observations.push(controller.getSnapshot());
    }
    controller.setPaused(true);
    const stopped = controller.getSnapshot();
    window.__stepKnowledge!(start + 30000);
    return { initial, observations, stopped, afterPause: controller.getSnapshot() };
  });
  expect(result.initial.phase).toBe('READER');
  expect(result.initial.committed).toBe(0);
  expect(result.initial.conflicts).toBe(0);
  expect(result.initial.command).toContain('--read-only');
  expect([...new Set(result.observations.map(item => item.phase))]).toEqual(['READER', 'LIBRARIAN', 'ANSWER', 'CHECKER']);
  const writing = result.observations.filter(item => item.phase === 'LIBRARIAN');
  expect(new Set(writing.map(item => item.activePage)).size).toBe(12);
  expect(writing.some(item => item.committed > 0 && item.committed < 12)).toBe(true);
  const answer = result.observations.find(item => item.phase === 'ANSWER')!;
  expect(answer.committed).toBe(12);
  expect(answer.nodeCount).toBeGreaterThan(result.initial.nodeCount);
  expect(answer.linkCount).toBeGreaterThan(result.initial.linkCount);
  expect(answer.command).toContain('answer');
  const checking = result.observations.filter(item => item.phase === 'CHECKER');
  expect(checking.at(-1)!.scanned).toBeGreaterThan(checking[0]!.scanned);
  expect(checking.some(item => item.conflicts > 0)).toBe(true);
  expect(result.stopped.time).toBeGreaterThan(23);
  expect(result.afterPause.time).toBe(result.stopped.time);
  expect(result.afterPause.conflicts).toBe(result.stopped.conflicts);
});

test('Knowledge graph contains XYZ depth and paused camera interaction produces parallax', async ({ page }) => {
  await open(page);
  await page.evaluate(() => window.knowledgeEngine!.setPaused(true));
  const before = await page.evaluate(() => window.knowledgeEngine!.debug());
  const stopped = await state(page);
  expect(before.renderer).toBe('webgl');
  expect(before.nodeCount).toBeGreaterThan(2000);
  expect(before.linkCount).toBeGreaterThan(5000);
  expect(before.depthRange.max - before.depthRange.min).toBeGreaterThan(1);
  expect(new Set(before.probes.map(item => item.world[2])).size).toBeGreaterThan(1);
  expect(before.probes.every(item => item.world.every(Number.isFinite) && item.screen.every(Number.isFinite))).toBe(true);
  await page.locator('canvas').first().press('ArrowRight');
  const after = await page.evaluate(() => window.knowledgeEngine!.debug());
  expect(after.rotation.yaw).not.toBe(before.rotation.yaw);
  expect(after.probes.map(item => item.world)).toEqual(before.probes.map(item => item.world));
  const shifts = after.probes.map((item, i) => [item.screen[0] - before.probes[i]!.screen[0], item.screen[1] - before.probes[i]!.screen[1]]);
  expect(shifts.some((item, i) => shifts.slice(i + 1).some(other => Math.hypot(item[0]! - other[0]!, item[1]! - other[1]!) > .5))).toBe(true);
  expect((await state(page)).time).toBe(stopped.time);
  await page.getByRole('button', { name: '重置视角', exact: true }).click();
  expect((await page.evaluate(() => window.knowledgeEngine!.debug())).rotation).toEqual(before.rotation);
});

test('Selecting a document updates its inspector without advancing a paused timeline', async ({ page }) => {
  await open(page);
  await page.evaluate(() => window.knowledgeEngine!.setPaused(true));
  const stopped = await state(page);
  await page.getByRole('button', { name: '检查 routines.md', exact: true }).first().click();
  expect((await state(page)).activePage).toBe(3);
  expect((await state(page)).time).toBe(stopped.time);
  await expect(page.locator('.ke-inspector')).toContainText('routines.md');
  await expect(page.locator('.ke-inspector')).toContainText('Review runs daily at 02:00');
  await page.getByRole('button', { name: '检查 capture.md', exact: true }).first().click();
  expect((await state(page)).activePage).toBe(7);
  await expect(page.locator('.ke-inspector')).toContainText('Keep every original untouched');
});

for (const scenario of [
  { seconds: 12, phase: 'ANSWER', document: 'answer-013.md', conflicts: 0 },
  { seconds: 21, phase: 'CHECKER', document: 'routines.md', conflicts: 1 },
]) {
  test(`Manual inspection during ${scenario.phase} preserves the pipeline target and shows the selected document`, async ({ page }) => {
    await controlFrames(page);
    await open(page);
    const pipeline = await page.evaluate(seconds => {
      const controller = window.knowledgeEngine!;
      controller.restart(); controller.setPaused(false);
      const start = performance.now();
      window.__stepKnowledge!(start);
      window.__stepKnowledge!(start + seconds * 1000);
      controller.setPaused(true);
      return controller.getSnapshot();
    }, scenario.seconds);
    expect(pipeline.phase).toBe(scenario.phase);
    expect(pipeline.activePage).toBe(3);
    expect(pipeline.workPage).toBe(3);
    expect(pipeline.inspecting).toBe(false);
    expect(pipeline.conflicts).toBe(scenario.conflicts);
    await page.getByRole('button', { name: '检查 capture.md', exact: true }).click();
    const selected = await state(page);
    expect(selected.activePage).toBe(7);
    expect(selected.inspecting).toBe(true);
    expect(selected.claim).toBe('Keep every original untouched');
    expect(selected.workPage).toBe(3);
    expect(selected.time).toBe(pipeline.time);
    expect(selected.command).toBe(pipeline.command);
    expect(selected.conflicts).toBe(scenario.conflicts);
    if (scenario.phase === 'CHECKER') expect(selected.command).toContain('flag routines.md');
    await expect(page.locator('.ke-inspector h3')).toHaveText('wiki/capture.md');
    await expect(page.locator('.ke-floating-inspector strong')).toHaveText('wiki/capture.md');
    await expect(page.locator('.ke-inspector')).toContainText('Keep every original untouched');
    await expect(page.locator('.ke-floating-inspector')).toContainText('Keep every original untouched');
    await expect(page.locator('.ke-floating-inspector')).not.toHaveClass(/conflict/);
    await expect(page.locator('.ke-floating-inspector')).not.toContainText('source-017.pdf');
    await page.getByRole('button', { name: '重置视角', exact: true }).click();
    const reset = await state(page);
    expect(reset.inspecting).toBe(false);
    expect(reset.activePage).toBe(reset.workPage);
    expect(reset.workPage).toBe(3);
    expect(reset.time).toBe(pipeline.time);
    expect(reset.command).toBe(pipeline.command);
    expect(reset.conflicts).toBe(scenario.conflicts);
    await expect(page.locator('.ke-inspector h3')).toHaveText(`wiki/${scenario.document}`);
    await expect(page.locator('.ke-floating-inspector strong')).toHaveText(`wiki/${scenario.document}`);
  });
}

test('Knowledge Engine cancels its rendering loop and releases its controller on SPA exits', async ({ page }) => {
  await controlFrames(page);
  await page.goto('/#/');
  for (let visit = 0; visit < 3; visit++) {
    await page.locator('.open-screen[href="#/screens/knowledge-engine"]').press('Enter');
    await page.waitForFunction(() => !!window.knowledgeEngine, undefined, { polling: 50 });
    const result = await page.evaluate(() => {
      window.__retiredKnowledge = window.knowledgeEngine;
      const before = window.knowledgeEngine!.debug().frameCount;
      window.__stepKnowledge!(performance.now() + 100);
      return { rendered: window.knowledgeEngine!.debug().frameCount - before, frames: window.__knowledgeFrames!.size };
    });
    expect(result).toEqual({ rendered: 1, frames: 1 });
    await page.getByRole('link', { name: '返回大屏索引' }).press('Enter');
    await expect(page.locator('#screen-grid .open-screen')).toHaveCount(6);
    const disposed = await page.evaluate(() => ({ controller: typeof window.knowledgeEngine, frames: window.__knowledgeFrames!.size, disposed: window.__retiredKnowledge!.debug().disposed }));
    expect(disposed).toEqual({ controller: 'undefined', frames: 0, disposed: true });
    await expect(page.locator('canvas')).toHaveCount(0);
  }
});

test('Knowledge Engine respects reduced motion and remains usable without WebGL at narrow widths', async ({ page }) => {
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
    expect((await page.evaluate(() => window.knowledgeEngine!.debug())).renderer).toBe('canvas2d');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await expect(page.getByRole('button', { name: '播放动画', exact: true })).toBeVisible();
    expect(await page.evaluate(() => window.knowledgeEngine!.debug().probes.every(item => item.screen.every(Number.isFinite)))).toBe(true);
  }
});

test('Knowledge Engine recovers from shader initialization failure', async ({ page }) => {
  await page.addInitScript(() => { WebGLRenderingContext.prototype.getShaderParameter = () => false; });
  await open(page);
  expect((await page.evaluate(() => window.knowledgeEngine!.debug())).renderer).toBe('canvas2d');
  const before = await state(page);
  await expect.poll(async () => (await state(page)).time).toBeGreaterThan(before.time);
  await page.getByRole('button', { name: '暂停动画', exact: true }).click();
  expect((await state(page)).paused).toBe(true);
});

test('Knowledge Engine handles GPU context loss and disposes the fallback', async ({ page }) => {
  await open(page);
  expect((await page.evaluate(() => window.knowledgeEngine!.debug())).renderer).toBe('webgl');
  await page.evaluate(() => {
    const gl = document.querySelector('canvas')!.getContext('webgl')!;
    const extension = gl.getExtension('WEBGL_lose_context');
    if (!extension) throw new Error('Context loss extension is unavailable');
    extension.loseContext();
  });
  await expect.poll(() => page.evaluate(() => window.knowledgeEngine!.debug().renderer)).toBe('canvas2d');
  const before = await state(page);
  await expect.poll(async () => (await state(page)).time).toBeGreaterThan(before.time);
  await page.getByRole('button', { name: '暂停动画', exact: true }).click();
  expect((await state(page)).paused).toBe(true);
  await page.getByRole('link', { name: '返回大屏索引' }).click();
  await expect(page.locator('canvas')).toHaveCount(0);
  expect(await page.evaluate(() => typeof window.knowledgeEngine)).toBe('undefined');
});

test('Clicking a document smoothly zooms and centers it while paused, then returns to the overview', async ({ page }) => {
  await controlFrames(page);
  await open(page);
  await page.evaluate(() => window.knowledgeEngine!.setPaused(true));
  const before = await state(page);
  await page.locator('[data-page="page-1"]').click();
  const selected = await state(page);
  expect(selected.activePage).toBe(1);
  expect(selected.zoom).toBeCloseTo(before.zoom);
  const movement = await page.evaluate(() => {
    const controller = window.knowledgeEngine!;
    const start = performance.now();
    window.__stepKnowledge!(start + 200);
    const middle = controller.getSnapshot();
    window.__stepKnowledge!(start + 800);
    const after = controller.getSnapshot();
    const debug = controller.debug();
    const bounds = document.querySelector('.ke-scene')!.getBoundingClientRect();
    return { middle, after, focus: debug.focus, activeFrame: debug.activeFrame, width: bounds.width, height: bounds.height };
  });
  expect(movement.middle.zoom).toBeGreaterThan(before.zoom);
  expect(movement.middle.zoom).toBeLessThan(movement.after.zoom);
  expect(movement.after.zoom).toBeGreaterThan(before.zoom * 1.7);
  expect(movement.after.time).toBe(before.time);
  expect(movement.after.workPage).toBe(before.workPage);
  expect(movement.focus!.progress).toBe(1);
  expect(movement.focus!.screen[0]).toBeCloseTo(movement.width * .42, 0);
  expect(movement.focus!.screen[1]).toBeCloseTo(movement.height * .52, 0);
  expect(movement.activeFrame).toBe(false);
  await expect(page.locator('.ke-floating-inspector')).toHaveClass(/expanded/);
  await expect(page.locator('.ke-floating-inspector')).toContainText('Route context across sessions');
  await page.getByRole('button', { name: '返回全景' }).click();
  expect((await state(page)).inspecting).toBe(false);
  expect((await state(page)).zoom).toBeCloseTo(movement.after.zoom);
  await page.evaluate(() => window.__stepKnowledge!(performance.now() + 1000));
  expect((await state(page)).zoom).toBeCloseTo(before.zoom);
  expect(await page.evaluate(() => window.knowledgeEngine!.debug().focus)).toBeNull();
});

test('Canvas node picking opens its source details and pending focus frames are disposed on navigation', async ({ page }) => {
  await controlFrames(page);
  await open(page);
  await page.evaluate(() => window.knowledgeEngine!.setPaused(true));
  const source = await page.evaluate(() => window.knowledgeEngine!.debug().probes[2]!.screen);
  const canvas = page.locator('.ke-scene > canvas').first();
  const bounds = (await canvas.boundingBox())!;
  await page.mouse.click(bounds.x + source[0], bounds.y + source[1]);
  expect((await state(page)).inspectedRecord).toBe('raw/source-042.pdf');
  await expect(page.locator('.ke-floating-inspector strong')).toHaveText('raw/source-042.pdf');
  expect(await page.evaluate(() => window.knowledgeEngine!.debug().activeFrame)).toBe(true);
  await page.getByRole('link', { name: '返回大屏索引' }).press('Enter');
  await expect(page.locator('#screen-grid .open-screen')).toHaveCount(6);
  expect(await page.evaluate(() => window.__knowledgeFrames!.size)).toBe(0);
  expect(await page.evaluate(() => typeof window.knowledgeEngine)).toBe('undefined');
});

test('Reduced-motion mobile inspection jumps to a readable focused view without starting animation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page);
  const before = await state(page);
  await page.getByRole('button', { name: '检查 capture.md', exact: true }).click();
  const after = await state(page);
  expect(after.paused).toBe(true);
  expect(after.time).toBe(before.time);
  expect(after.zoom).toBeGreaterThan(before.zoom * 1.7);
  expect(await page.evaluate(() => window.knowledgeEngine!.debug().activeFrame)).toBe(false);
  await expect(page.locator('.ke-floating-inspector')).toBeVisible();
  const layout = await page.locator('.ke-floating-inspector').evaluate(element => {
    const rect = element.getBoundingClientRect();
    const scene = element.closest('.ke-scene')!.getBoundingClientRect();
    return { inside: rect.left >= scene.left && rect.right <= scene.right && rect.top >= scene.top && rect.bottom <= scene.bottom, size: parseFloat(getComputedStyle(element.querySelector('p')!).fontSize) };
  });
  expect(layout.inside).toBe(true);
  expect(layout.size).toBeGreaterThanOrEqual(12);
  await page.getByRole('button', { name: '返回全景' }).click();
  expect((await state(page)).zoom).toBeCloseTo(before.zoom);
  expect(await page.evaluate(() => window.knowledgeEngine!.debug().activeFrame)).toBe(false);
});


test('Retargeting focus is continuous and stays on the inspected node across workflow phases', async ({ page }) => {
  await controlFrames(page);
  await open(page);
  const result = await page.evaluate(() => {
    const c = window.knowledgeEngine!;
    c.selectPage(1);
    window.__stepKnowledge!(performance.now() + 180);
    const before = c.getSnapshot();
    c.selectPage(7);
    const retargeted = c.getSnapshot();
    const start = performance.now();
    window.__stepKnowledge!(start + 800);
    const focused = c.getSnapshot();
    window.__stepKnowledge!(start + 21000);
    return { before, retargeted, focused, later: c.getSnapshot(), focus: c.debug().focus };
  });
  expect(result.retargeted.zoom).toBeCloseTo(result.before.zoom);
  expect(result.focused.zoom).toBeGreaterThan(result.before.zoom);
  expect(result.later.phase).toBe('CHECKER');
  expect(result.later.workPage).toBe(3);
  expect(result.later.activePage).toBe(7);
  expect(result.later.claim).toBe('Keep every original untouched');
  expect(result.later.zoom).toBeCloseTo(result.focused.zoom);
  expect(result.focus!.progress).toBe(1);
});

test('Mobile raw-source details fit the scene and the inspected source survives the workflow loop', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 667 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await controlFrames(page);
  await open(page);
  await page.evaluate(() => {
    const c = window.knowledgeEngine!;
    c.restart(); c.setPaused(false);
    const start = performance.now();
    window.__stepKnowledge!(start);
    window.__stepKnowledge!(start + 21000);
    c.setPaused(true);
  });
  const source = await page.getByText('017 / WEEKLY', { exact: true }).evaluate(element => {
    const matrix = new DOMMatrixReadOnly(getComputedStyle(element).transform);
    const scene = element.closest('.ke-scene')!.getBoundingClientRect();
    return { x: scene.x + matrix.m41 - 10, y: scene.y + matrix.m42 - 5 };
  });
  await page.mouse.click(source.x, source.y);
  expect((await state(page)).inspectedRecord).toBe('raw/source-017.pdf');
  await expect.poll(() => page.locator('.ke-floating-inspector').evaluate(element => {
    const card = element.getBoundingClientRect();
    const scene = element.closest('.ke-scene')!.getBoundingClientRect();
    const button = element.querySelector('button')!.getBoundingClientRect();
    return card.bottom <= scene.bottom && button.bottom <= scene.bottom && card.top >= scene.top;
  })).toBe(true);
  await page.evaluate(() => {
    const c = window.knowledgeEngine!;
    c.setPaused(false);
    window.__stepKnowledge!(performance.now() + 4000);
    c.setPaused(true);
  });
  expect((await state(page)).phase).toBe('READER');
  expect((await state(page)).inspectedRecord).toBe('raw/source-017.pdf');
  await expect(page.getByText('017 / WEEKLY', { exact: true })).toBeVisible();
  await expect(page.locator('.ke-floating-inspector strong')).toHaveText('raw/source-017.pdf');
  await page.screenshot({ path: '../knowledge-engine-focus-mobile-source.png' });
  await page.getByRole('button', { name: '返回全景' }).click();
  expect((await state(page)).inspecting).toBe(false);
  await expect(page.getByText('017 / WEEKLY', { exact: true })).toHaveCount(0);
});

test('Returning to overview eases out from the current camera even while paused and can be interrupted', async ({ page }) => {
  await controlFrames(page);
  await open(page);
  await page.evaluate(() => {
    const c = window.knowledgeEngine!;
    c.setPaused(true); c.selectPage(1);
    window.__stepKnowledge!(performance.now() + 800);
  });
  const before = await page.evaluate(() => ({ state: window.knowledgeEngine!.getSnapshot(), debug: window.knowledgeEngine!.debug() }));
  await page.getByRole('button', { name: '返回全景' }).click();
  const returning = await page.evaluate(() => ({ state: window.knowledgeEngine!.getSnapshot(), debug: window.knowledgeEngine!.debug() }));
  expect(returning.state.zoom).toBeCloseTo(before.state.zoom);
  expect(returning.debug.probes.map(p => p.screen)).toEqual(before.debug.probes.map(p => p.screen));
  expect(returning.debug.activeFrame).toBe(true);
  expect(returning.state.inspecting).toBe(false);
  const result = await page.evaluate(() => {
    const c = window.knowledgeEngine!;
    const start = performance.now();
    window.__stepKnowledge!(start + 300);
    const middle = c.getSnapshot();
    c.selectPage(7);
    const interrupted = c.getSnapshot();
    window.__stepKnowledge!(performance.now() + 800);
    c.resetView();
    window.__stepKnowledge!(performance.now() + 1000);
    return { middle, interrupted, end: c.getSnapshot(), activeFrame: c.debug().activeFrame };
  });
  expect(result.middle.zoom).toBeLessThan(before.state.zoom);
  expect(result.middle.zoom).toBeGreaterThan(result.end.zoom);
  expect(result.interrupted.zoom).toBeCloseTo(result.middle.zoom);
  expect(result.end.zoom).toBeLessThan(1.4);
  expect(result.end.time).toBe(before.state.time);
  expect(result.activeFrame).toBe(false);
});
