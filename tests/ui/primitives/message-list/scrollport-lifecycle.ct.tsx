import { SCROLL_MODES } from "@orb/kit/scroll-mode";
import { expect, test } from "@playwright/test";
import { UNNAMED_LOG_NAME } from "#ui/primitives/log-viewer/log-viewer-names.ts";
import type { LogViewerScrollportStory, MessageListScrollportStory } from "./_scrollport-stories.tsx";

const OBSERVERS = "data-scrollport-observers";

test("content growth retains its scrollport observers and tail resize synchronization", async ({ mount, page }) => {
  await page.addInitScript((attribute) => {
    const nativeObserve = ResizeObserver.prototype.observe;
    const observers = new WeakMap<Element, Set<ResizeObserver>>();
    ResizeObserver.prototype.observe = function (target, options): void {
      if (target.getAttribute("data-slot") === "message-list-scroll") {
        const instances = observers.get(target) ?? new Set<ResizeObserver>();
        instances.add(this);
        observers.set(target, instances);
        target.setAttribute(attribute, String(instances.size));
      }
      nativeObserve.call(this, target, options);
    };
  }, OBSERVERS);
  await mount<typeof MessageListScrollportStory>("tests/ui/primitives/message-list/_scrollport-stories/MessageListScrollportStory");
  const log = page.getByRole("log", { name: "Scrollport lifecycle", exact: true });
  await expect(log).toHaveAttribute(OBSERVERS, /[1-9]\d*/);
  await expect(log).not.toHaveAttribute("data-fade-bottom", "");
  const observers = await log.getAttribute(OBSERVERS);
  await page.getByRole("button", { name: "Append rows", exact: true }).click();
  await expect(log.getByText("Row 19", { exact: true })).toBeVisible();
  await expect.poll(async () => await log.evaluate((node) => node.scrollHeight - node.scrollTop - node.clientHeight)).toBeLessThanOrEqual(1);
  const before = await log.evaluate((node) => node.scrollHeight);
  await page.getByRole("button", { name: "Grow tail", exact: true }).click();
  await expect.poll(async () => await log.evaluate((node) => node.scrollHeight)).toBeGreaterThan(before);
  await expect.poll(async () => await log.evaluate((node) => node.scrollHeight - node.scrollTop - node.clientHeight)).toBeLessThanOrEqual(1);
  await page.getByRole("button", { name: "Shrink scrollport", exact: true }).click();
  await expect.poll(async () => await log.evaluate((node) => node.clientHeight)).toBe(160);
  await expect.poll(async () => await log.evaluate((node) => node.scrollHeight - node.scrollTop - node.clientHeight)).toBeLessThanOrEqual(1);
  await expect(log).toHaveAttribute(OBSERVERS, observers ?? "");
});

test("measured tail growth preserves the reader's earlier scroll position", async ({ mount, page }) => {
  await mount<typeof MessageListScrollportStory>("tests/ui/primitives/message-list/_scrollport-stories/MessageListScrollportStory", { initialCount: 20 });
  const log = page.getByRole("log", { name: "Scrollport lifecycle", exact: true });
  await expect(log.getByText("Row 19", { exact: true })).toBeVisible();
  await expect.poll(async () => await log.evaluate((node) => node.scrollHeight - node.scrollTop - node.clientHeight)).toBeLessThanOrEqual(1);
  const tail = await log.evaluate((node) => node.scrollTop);
  await log.hover();
  await page.mouse.wheel(0, -240);
  await expect.poll(async () => await log.evaluate((node) => node.scrollTop)).toBeLessThan(tail);
  const before = await log.evaluate((node) => ({ top: node.scrollTop, height: node.scrollHeight }));
  await page.getByRole("button", { name: "Grow tail", exact: true }).click();
  await expect.poll(async () => await log.evaluate((node) => node.scrollHeight)).toBeGreaterThan(before.height);
  await expect.poll(async () => await log.evaluate((node) => node.scrollTop)).toBe(before.top);
});

test("pin-prompt holds the prompt and releases its spacer when the measured reply fills the scrollport", async ({ mount, page }) => {
  await mount<typeof MessageListScrollportStory>("tests/ui/primitives/message-list/_scrollport-stories/MessageListScrollportStory", {
    scrollMode: "pin-prompt",
  });
  const log = page.getByRole("log", { name: "Scrollport lifecycle", exact: true });
  await page.getByRole("button", { name: "Append rows", exact: true }).click();
  const tail = log.getByText("Row 19", { exact: true });
  await expect(tail).toBeVisible();
  await page.getByRole("button", { name: "Pin last row", exact: true }).click();
  await expect
    .poll(async () => await tail.evaluate((node) => node.getBoundingClientRect().top - (node.closest('[role="log"]')?.getBoundingClientRect().top ?? 0)))
    .toBe(0);
  const paddedHeight = await log.evaluate((node) => node.scrollHeight);
  await page.getByRole("button", { name: "Grow tail", exact: true }).click();
  await expect.poll(async () => await tail.evaluate((node) => node.getBoundingClientRect().height)).toBe(240);
  await expect.poll(async () => await log.evaluate((node) => node.scrollHeight)).toBeLessThan(paddedHeight);
  await expect
    .poll(async () => await tail.evaluate((node) => node.getBoundingClientRect().top - (node.closest('[role="log"]')?.getBoundingClientRect().top ?? 0)))
    .toBe(0);
});

test("the virtualized log caller keeps its own reader anchor and follows a pinned capped append", async ({ mount, page }) => {
  await mount<typeof LogViewerScrollportStory>("tests/ui/primitives/message-list/_scrollport-stories/LogViewerScrollportStory");
  const log = page.getByRole("log", { name: UNNAMED_LOG_NAME, exact: true });
  await expect(log).toHaveAttribute("data-slot", "message-list-scroll");
  await expect(log.getByText("Log line 259", { exact: true })).toBeVisible();
  const tail = await log.evaluate((node) => node.scrollTop);
  await log.hover();
  await page.mouse.wheel(0, -240);
  await expect.poll(async () => await log.evaluate((node) => node.scrollTop)).toBeLessThan(tail);
  const anchor = await log.evaluate((node) => {
    const clip = node.getBoundingClientRect();
    return [...node.querySelectorAll('[data-slot="log-viewer-line"]')].find((line) => {
      const box = line.getBoundingClientRect();
      return box.top >= clip.top && box.bottom <= clip.bottom;
    })?.textContent;
  });
  if (anchor === undefined) {
    throw new Error("The actual virtualized log has no visible reader anchor");
  }
  const reading = log.getByText(anchor, { exact: true });
  const readingRow = reading.locator('xpath=ancestor::*[@data-slot="message-list-row"][1]');
  const ordinal = await readingRow.getAttribute("aria-posinset");
  const before = await reading.evaluate((node) => node.getBoundingClientRect().top);
  await page.getByRole("button", { name: "Append log line", exact: true }).click();
  await expect(readingRow).not.toHaveAttribute("aria-posinset", ordinal ?? "");
  await expect.poll(async () => await reading.evaluate((node) => node.getBoundingClientRect().top)).toBe(before);
  await log.hover();
  await page.mouse.wheel(0, await log.evaluate((node) => node.scrollHeight));
  await expect(log.getByText("Log line 260", { exact: true })).toBeVisible();
  await expect.poll(async () => await log.evaluate((node) => node.scrollHeight - node.scrollTop - node.clientHeight)).toBeLessThanOrEqual(1);
  await page.getByRole("button", { name: "Append log line", exact: true }).click();
  await expect(log.getByText("Log line 261", { exact: true })).toBeVisible();
  await expect.poll(async () => await log.evaluate((node) => node.scrollHeight - node.scrollTop - node.clientHeight)).toBeLessThanOrEqual(1);
});

for (const scrollMode of SCROLL_MODES) {
  test(`a Tab from above the rows lands on the first row on screen under ${scrollMode}`, async ({ mount, page }) => {
    await mount<typeof MessageListScrollportStory>("tests/ui/primitives/message-list/_scrollport-stories/MessageListScrollportStory", {
      initialCount: 40,
      roving: true,
      scrollMode,
    });
    const log = page.getByRole("log", { name: "Scrollport lifecycle", exact: true });
    await expect(log.getByText("Row 39", { exact: true })).toBeVisible();
    await log.evaluate((node) => {
      node.scrollTop = node.scrollHeight / 2;
    });
    await expect(log.getByText("Row 20", { exact: true })).toBeInViewport();
    await page.getByRole("button", { name: "Restore target row", exact: true }).focus();
    await page.keyboard.press("Tab");
    const focused = log.locator('[data-slot="message-list-row"]:focus');
    await expect(focused).toBeInViewport();
    await expect(focused).not.toHaveAttribute("data-index", "39");
  });
}

const ROW = '[data-slot="message-list-row"]';
const SCROLLPORT_STORY = "tests/ui/primitives/message-list/_scrollport-stories/MessageListScrollportStory";
// 60px rows in a 240px scrollport: this offset puts row 20 exactly at the reader's top edge.
const PARKED_TOP = 1200;
const PARKED_ROW = 20;

for (const [name, change, focusFirst] of [
  ["deleted", "Delete target row", false],
  ["given a new key", "Swap target row key", false],
  ["deleted while it holds focus", "Delete target row", true],
] as const) {
  test(`a Tab lands on a row on screen without moving a parked reader whose resting row is ${name}`, async ({ mount, page }) => {
    await mount<typeof MessageListScrollportStory>(SCROLLPORT_STORY, { initialCount: 40, roving: true, target: PARKED_ROW });
    const log = page.getByRole("log", { name: "Scrollport lifecycle", exact: true });
    await expect(log.getByText("Row 39", { exact: true })).toBeVisible();
    await log.evaluate((node, top) => {
      node.scrollTop = top;
    }, PARKED_TOP);
    await expect(log.locator(`${ROW}[data-index="${String(PARKED_ROW)}"]`)).toHaveAttribute("tabindex", "0");
    if (focusFirst) {
      await log.getByText(`Row ${String(PARKED_ROW)}`, { exact: true }).click();
    }
    await page.getByRole("button", { name: change, exact: true }).click();
    await expect(log.getByText(`Row ${String(PARKED_ROW)}`, { exact: true })).toHaveCount(0);
    const parkedAt = await log.evaluate((node) => node.scrollTop);
    await page.getByRole("button", { name: "Restore target row", exact: true }).focus();
    await page.keyboard.press("Tab");
    await expect(log.locator(`${ROW}:focus`)).toBeInViewport();
    expect(await log.evaluate((node) => node.scrollTop)).toBe(parkedAt);
  });
}

test("a step whose row is removed in its own commit cannot take focus when that row returns", async ({ mount, page }) => {
  await mount<typeof MessageListScrollportStory>(SCROLLPORT_STORY, { initialCount: 40, roving: true, target: PARKED_ROW + 1 });
  const log = page.getByRole("log", { name: "Scrollport lifecycle", exact: true });
  await expect(log.getByText("Row 39", { exact: true })).toBeVisible();
  await log.evaluate((node, top) => {
    node.scrollTop = top;
  }, PARKED_TOP);
  await expect(log.locator(`${ROW}[data-index="${String(PARKED_ROW)}"]`)).toHaveAttribute("tabindex", "0");
  const walker = log.locator(`${ROW}[data-index="${String(PARKED_ROW + 2)}"]`);
  await walker.click();
  await expect(walker).toBeFocused();
  const removal = await page.getByRole("button", { name: "Delete target row", exact: true }).elementHandle();
  // One tick: ArrowUp names the row the same commit removes, the one way a step's row can leave before it lands.
  await walker.evaluate((from, remove) => {
    from.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
    if (remove instanceof HTMLElement) {
      remove.click();
    }
  }, removal);
  await expect(log.getByText(`Row ${String(PARKED_ROW + 1)}`, { exact: true })).toHaveCount(0);
  await expect(log.locator(`${ROW}:focus`)).toContainText(`Row ${String(PARKED_ROW + 2)}`);
  const restore = page.getByRole("button", { name: "Restore target row", exact: true });
  await restore.focus();
  await restore.press("Enter");
  await expect(log.getByText(`Row ${String(PARKED_ROW + 1)}`, { exact: true })).toBeVisible();
  await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
  await expect(restore).toBeFocused();
});
