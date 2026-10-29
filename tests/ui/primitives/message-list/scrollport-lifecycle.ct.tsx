import { expect, test } from "@playwright/test";
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
  const log = page.getByRole("log", { name: "Log entries", exact: true });
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
