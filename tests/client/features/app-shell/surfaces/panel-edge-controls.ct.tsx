// Each side panel is opened and closed from one control at its own edge: it sits in the panel's header, a collapsed panel
// leaves it in the same screen position, the centre topbar carries neither toggle, and an open sheet keeps one dismiss.

import { contextToggleLabel } from "@orb/client/lib";
import { boxOf, seedShellState } from "@orb/testkit/browser/spec";
import { SECTION_PROCEDURES } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Locator, Page } from "@playwright/test";
import { channelName } from "../../../lib/appearance-channel-names.ts";
import type { AppShellRoomStory, AppShellStory } from "./_app-shell-stories.tsx";
import { namedGroupRoom, routeRoom, routeShell, SHELL_STORIES } from "./app-shell-ct.ts";

const STORY = `${SHELL_STORIES}/AppShellStory`;
const WIDE = { width: 1440, height: 900 } as const;
const NARROW_DESKTOP = { width: 900, height: 900 } as const;
const PHONE = { width: 390, height: 844 } as const;
const FONT_SCALE_PROPERTY = channelName("fontScale");
const EDGE = '[data-slot="panel-edge-control"]';
const PANELS = [
  { side: "list", control: /^(?:Show|Hide) list panel$/u, hide: "Hide list panel", show: "Show list panel" },
  { side: "context", control: /^(?:Show|Hide) details$/u, hide: contextToggleLabel(false), show: contextToggleLabel(true) },
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

  for (const { side, control, hide, show } of PANELS) {
    test(`the ${side} control stays put while its panel floats as a sheet, is that sheet's one dismiss, and nothing under it steps`, async ({
      mount,
      page,
    }) => {
      await mount<typeof AppShellStory>(STORY, {});
      const pane = panel(page, side);
      const edge = page.getByRole("button", { name: control });
      await expect(pane).toHaveAttribute("data-panel-mode", "collapsed");
      const lead = page.locator(".shell-topbar-lead");
      const closed = await boxOf(edge);
      const leadClosed = await boxOf(lead);
      await edge.click();
      await expect(pane).toHaveAttribute("data-panel-mode", "overlay");
      await expect(page.getByRole("button", { name: show })).toHaveCount(0);
      await expect(edge).toHaveAttribute("aria-expanded", "true");
      const open = await boxOf(edge);
      expect(Math.abs(open.x - closed.x)).toBeLessThanOrEqual(SUBPIXEL);
      expect(Math.abs(open.y - closed.y)).toBeLessThanOrEqual(SUBPIXEL);
      expect(Math.abs((await boxOf(lead)).x - leadClosed.x)).toBeLessThanOrEqual(SUBPIXEL);
      await expect(page.getByRole("button", { name: /^Close .+ (?:list|details)$/u })).toHaveCount(0);
      await page.getByRole("button", { name: hide, exact: true }).click();
      await expect(pane).toHaveAttribute("data-panel-mode", "collapsed");
      expect(Math.abs((await boxOf(edge)).x - closed.x)).toBeLessThanOrEqual(SUBPIXEL);
      await expect(edge).toBeFocused();
    });
  }
});

test.describe("on a wide desktop, the edge controls in the page", () => {
  test.use({ viewport: WIDE });

  test.beforeEach(async ({ page }) => {
    await seedShellState(page, { activeSection: "chats", panelOverrides: { chats: { list: "docked", context: "docked" } } });
  });

  test("a rail tooltip never covers the list control", async ({ mount, page }) => {
    await mount<typeof AppShellStory>(STORY, {});
    const edge = page.getByRole("button", { name: "Hide list panel", exact: true });
    await expect(edge).toBeVisible();
    await page.locator(".shell-rail").getByRole("button", { name: "Home", exact: true }).first().hover();
    const tip = page.locator('[data-slot="tooltip-popup"]');
    await expect(tip).toBeVisible();
    const box = await boxOf(edge);
    const reachable = await edge.evaluate((element, [x, y]) => element.contains(document.elementFromPoint(x, y)), [
      box.x + box.width / 2,
      box.y + box.height / 2,
    ] as const);
    expect(reachable).toBe(true);
  });

  test("each control comes before its panel's body in the document and in the tab order", async ({ mount, page }) => {
    await mount<typeof AppShellStory>(STORY, {});
    for (const { side, control } of PANELS) {
      const edge = page.getByRole("button", { name: control });
      await expect(edge).toBeVisible();
      const before = await edge.evaluate((element, selector) => {
        const body = document.querySelector(`${selector} .shell-panel-body`);
        return body !== null && element.compareDocumentPosition(body) === Node.DOCUMENT_POSITION_FOLLOWING;
      }, `.shell-panel[data-panel-side="${side}"]`);
      expect(before).toBe(true);
    }
    // From the list control one Tab enters the list pane, never the far end of the page.
    await page.getByRole("button", { name: "Hide list panel", exact: true }).focus();
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => document.activeElement?.closest('.shell-panel[data-panel-side="list"]') !== null)).toBe(true);
  });

  test("the count beside a list title keeps its width and the title is what gives", async ({ mount, page }) => {
    await mount<typeof AppShellStory>(STORY, {});
    const title = page.locator('[data-slot="list-pane-title"]');
    await expect(title).toBeVisible();
    const parts = await title.evaluate((heading) => {
      const [name, count] = [...heading.children].map((child) => getComputedStyle(child));
      return { nameOverflow: name?.textOverflow, nameShrink: name?.flexShrink, countShrink: count?.flexShrink };
    });
    expect(parts.countShrink).toBe("0");
    expect(parts.nameOverflow).toBe("ellipsis");
    expect(parts.nameShrink).not.toBe("0");
  });
});

test.describe("at 300% text", () => {
  test.use({ viewport: WIDE });

  test("no topbar control sits under the Details control: the overflow menu takes it first", async ({ corpus, mount, page }) => {
    const caller = await root.internalCallerFor(root.ownerId);
    const room = namedGroupRoom((await caller.chat.listChats({ limit: 100 })).items);
    await routeRoom(page, corpus, caller);
    await seedShellState(page, { activeSection: "chats", panelOverrides: { chats: { list: "docked", context: "collapsed" } } });
    await mount<typeof AppShellRoomStory>(`${SHELL_STORIES}/AppShellRoomStory`, { chatId: room.id });
    await page.evaluate((property) => {
      const style = document.head.appendChild(document.createElement("style"));
      style.textContent = `:root { ${property}: 3 !important; }`;
    }, FONT_SCALE_PROPERTY);
    const edge = page.getByRole("button", { name: contextToggleLabel(true), exact: true });
    await expect(edge).toBeVisible();
    await expect
      .poll(async () => {
        const box = await boxOf(edge);
        return page.locator(".shell-topbar").evaluate(
          (bar, rect) =>
            [...bar.querySelectorAll("button")]
              .filter((button) => button.checkVisibility({ visibilityProperty: true }))
              .filter((button) => {
                const other = button.getBoundingClientRect();
                return other.right > rect.x && other.left < rect.x + rect.width && other.bottom > rect.y && other.top < rect.y + rect.height;
              })
              .map((button) => button.getAttribute("aria-label")),
          box,
        );
      })
      .toEqual([]);
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
    const door = page.locator(".shell-topbar-trail").getByRole("button", { name: contextToggleLabel(true), exact: true });
    await expect(door).toBeVisible();
    await door.tap();
    await expect(panel(page, "context")).toHaveAttribute("data-panel-mode", "overlay");
    await expect(page.getByRole("button", { name: /^(?:Close .+ details|Hide details)$/u })).toHaveCount(1);
  });
});
