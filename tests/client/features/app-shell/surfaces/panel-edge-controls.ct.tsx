// Each side panel is opened and closed from one control at its own edge: it sits in the panel's header, a collapsed panel
// leaves it in the same screen position, the centre topbar carries neither toggle, and an open sheet keeps one dismiss.
import { seedShellState } from "@orb/testkit/browser/spec";
import { SECTION_PROCEDURES } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Locator, Page } from "@playwright/test";
import type { AppShellStory } from "./_app-shell-stories.tsx";
import { routeShell, SHELL_STORIES } from "./app-shell-ct.ts";

const STORY = `${SHELL_STORIES}/AppShellStory`;
const WIDE = { width: 1440, height: 900 } as const;
const NARROW_DESKTOP = { width: 900, height: 900 } as const;
const PHONE = { width: 390, height: 844 } as const;
const EDGE = '[data-slot="panel-edge-control"]';
const PANELS = [
  { side: "list", control: /^(?:Show|Hide) list panel$/u, hide: "Hide list panel", show: "Show list panel" },
  { side: "context", control: /^(?:Show|Hide) details$/u, hide: "Hide details", show: "Show details" },
] as const;
const SUBPIXEL = 0.5;

type Root = Awaited<ReturnType<typeof createCorpusHarness>>;

let root: Root;

test.beforeAll(async () => {
  root = await createCorpusHarness();
});

test.beforeEach(async ({ corpus, page }) => {
  await routeShell(page, corpus, await root.internalCallerFor(root.ownerId), SECTION_PROCEDURES);
});

test.afterAll(async () => {
  await root[Symbol.asyncDispose]();
});

function panel(page: Page, side: "list" | "context"): Locator {
  return page.locator(`.shell-panel[data-panel-side="${side}"]`);
}

async function boxOf(locator: Locator): Promise<{ x: number; y: number; width: number; height: number }> {
  const box = await locator.boundingBox();
  if (box === null) {
    throw new Error("The control has no box");
  }
  return box;
}

/** Chats opens with its context pane collapsed; the edge control is the same node either way. */
async function dock(page: Page, side: "list" | "context", control: RegExp): Promise<void> {
  const pane = panel(page, side);
  if ((await pane.getAttribute("data-panel-mode")) !== "docked") {
    await page.getByRole("button", { name: control }).click();
  }
  await expect(pane).toHaveAttribute("data-panel-mode", "docked");
}

test.describe("on a wide desktop", () => {
  test.use({ viewport: WIDE });

  test.beforeEach(async ({ page }) => {
    await seedShellState(page, { activeSection: "chats" });
  });

  for (const { side, control, hide, show } of PANELS) {
    test(`the ${side} panel has one edge control in its own header, and the topbar carries none`, async ({ mount, page }) => {
      await mount<typeof AppShellStory>(STORY, {});
      const pane = panel(page, side);
      await dock(page, side, control);
      const edge = page.getByRole("button", { name: control });
      await expect(edge).toHaveCount(1);
      await expect(edge).toHaveAttribute("data-slot", "panel-edge-control");
      await expect(edge).toHaveAttribute("aria-expanded", "true");
      await expect(page.locator(EDGE)).toHaveCount(2);
      await expect(page.locator(".shell-topbar").getByRole("button", { name: control })).toHaveCount(0);
      const [paneBox, edgeBox, chromeRow] = [
        await boxOf(pane),
        await boxOf(edge),
        await pane.evaluate((element) =>
          Number.parseFloat(getComputedStyle(element.querySelector(".shell-panel-header, [data-slot='context-bracket-header']") ?? element).blockSize),
        ),
      ];
      expect(edgeBox.x).toBeGreaterThanOrEqual(paneBox.x - SUBPIXEL);
      expect(edgeBox.x + edgeBox.width).toBeLessThanOrEqual(paneBox.x + paneBox.width + SUBPIXEL);
      expect(edgeBox.y).toBeGreaterThanOrEqual(paneBox.y - SUBPIXEL);
      expect(edgeBox.y + edgeBox.height).toBeLessThanOrEqual(paneBox.y + chromeRow + SUBPIXEL);
      await page.getByRole("button", { name: hide, exact: true }).click();
      await expect(pane).toHaveAttribute("data-panel-mode", "collapsed");
      await expect(page.getByRole("button", { name: show, exact: true })).toHaveAttribute("aria-expanded", "false");
    });

    test(`the ${side} control stays at the same screen position across a hide and a show`, async ({ mount, page }) => {
      await mount<typeof AppShellStory>(STORY, {});
      const pane = panel(page, side);
      const edge = page.getByRole("button", { name: control });
      await dock(page, side, control);
      const open = await boxOf(edge);
      await edge.click();
      await expect(pane).toHaveAttribute("data-panel-mode", "collapsed");
      await expect.poll(async () => (await boxOf(edge)).x).toBeCloseTo(open.x, 0);
      const closed = await boxOf(edge);
      expect(Math.abs(closed.y - open.y)).toBeLessThanOrEqual(SUBPIXEL);
      expect(Math.abs(closed.width - open.width)).toBeLessThanOrEqual(SUBPIXEL);
      await edge.click();
      await expect(pane).toHaveAttribute("data-panel-mode", "docked");
      await expect.poll(async () => (await boxOf(edge)).x).toBeCloseTo(open.x, 0);
      expect(Math.abs((await boxOf(edge)).y - open.y)).toBeLessThanOrEqual(SUBPIXEL);
    });
  }
});

test.describe("on a narrow desktop", () => {
  test.use({ viewport: NARROW_DESKTOP });

  test.beforeEach(async ({ page }) => {
    await seedShellState(page, { activeSection: "chats" });
  });

  test("an open context sheet offers one dismiss, and the collapsed tab is the way back in", async ({ mount, page }) => {
    await mount<typeof AppShellStory>(STORY, {});
    const pane = panel(page, "context");
    await page.getByRole("button", { name: "Show details", exact: true }).click();
    await expect(pane).toHaveAttribute("data-panel-mode", "overlay");
    await expect(page.getByRole("button", { name: /^(?:Close .+ details|Hide details)$/u })).toHaveCount(1);
    await expect(pane.getByRole("button", { name: "Close Chats details", exact: true })).toHaveCount(1);
    await pane.getByRole("button", { name: "Close Chats details", exact: true }).click();
    await expect(pane).toHaveAttribute("data-panel-mode", "collapsed");
    await expect(page.getByRole("button", { name: "Show details", exact: true })).toBeFocused();
  });
});

test.describe("on a phone", () => {
  test.use({ viewport: PHONE, hasTouch: true });

  test.beforeEach(async ({ page }) => {
    await seedShellState(page, { activeSection: "chats" });
  });

  test("the topbar keeps the doors onto the list screen and the detail sheet, no edge tab is drawn, and the open sheet has one dismiss", async ({
    mount,
    page,
  }) => {
    await mount<typeof AppShellStory>(STORY, {});
    await expect(page.locator("[data-panel-edge]")).toHaveCount(0);
    await expect(page.locator(EDGE)).toHaveCount(0);
    const door = page.locator(".shell-topbar-trail").getByRole("button", { name: "Show details", exact: true });
    await expect(door).toBeVisible();
    await door.tap();
    await expect(panel(page, "context")).toHaveAttribute("data-panel-mode", "overlay");
    await expect(page.getByRole("button", { name: /^(?:Close .+ details|Hide details)$/u })).toHaveCount(1);
  });
});
