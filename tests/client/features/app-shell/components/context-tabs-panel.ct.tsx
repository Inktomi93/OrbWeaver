// CT: the CONTEXT BRACKET as every tabs pane renders it (context-tabs-panel.tsx → context-bracket.tsx →
// context-rail.tsx). The pane is ONE column: header row (the pane's one tablist, view actions, the close ×) →
// optional identity band → optional game state rail → viewport. The owner reversed the earlier ruling that put
// the tabs in a foot toolbar (#860, #112): the strip is a real `tablist` of `tab`s in the header, there is no
// foot rail and no kicker, and the game state rail is panel content (a named toolbar), never a second tablist.
// shell.css is loaded into the CT bundle (the story module imports it), so the header height and the strip's
// scroll behaviour resolve exactly as in the shell.

import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator } from "@playwright/test";
import { CHAT_CONTEXT_TAB_LABELS } from "#client/features/chat/lib/chat-context-tab-labels.ts";
import { readPhantomScrollers } from "../../../../support/browser/scroll-containing-block.ts";
import { ContextDefaultTabStory, ContextMetaRailStory, ContextTabStatesStory, ContextTabStripStory, EmptyContextScrollStory } from "../_ct-stories.tsx";

/** Chat's own tabs, named by the product's own labels. */
const TAB_NAMES = Object.values(CHAT_CONTEXT_TAB_LABELS);
const MEMBERS_TAB = CHAT_CONTEXT_TAB_LABELS.members;
const SETTINGS_TAB = CHAT_CONTEXT_TAB_LABELS.settings;
const TRANSPARENT = "rgba(0, 0, 0, 0)";

/** The pane's ONE tab strip — the section-named tablist in the header row. */
function strip(component: Locator): Locator {
  return component.getByRole("tablist", { name: "Chat" });
}
/** The STATE rail — present only when a `strip:"game"` tab resolved. A toolbar, not a second tablist. */
function state(component: Locator): Locator {
  return component.getByRole("toolbar", { name: "Game state" });
}
/** One tab of the header strip; `exact` so the Members tab never matches a "Members — 3" chip. */
function tab(component: Locator, name: string): Locator {
  return strip(component).getByRole("tab", { name, exact: true });
}
/** One cell of the state rail — a BUTTON carrying `aria-current`. */
function stateCell(component: Locator, name: string): Locator {
  return state(component).getByRole("button", { name, exact: true });
}

/** How many captions are rendering an ELLIPSIS — the readable-caption floor stated as a measurement. */
function clippedCaptions(component: Locator): Promise<number> {
  return component.locator('[data-slot="context-cell-caption"]').evaluateAll((els) => els.filter((el) => el.scrollWidth > el.clientWidth + 1).length);
}

async function boxOf(locator: Locator): Promise<{ readonly top: number; readonly bottom: number }> {
  const box = await locator.boundingBox();
  if (box === null) {
    throw new Error("expected the element to be laid out");
  }
  return { top: box.y, bottom: box.y + box.height };
}

// A setup view (a tab declared `opaque`) sits on an opaque panel surface, so chat art behind a translucent pane
// cannot show through its dense form; every other tab keeps the pane's own surface.
test("an `opaque` tab's panel paints an opaque fill and an ordinary tab's panel paints none", async ({ mount }) => {
  const component = await mount(<ContextTabStripStory width={480} opaqueSettings={true} />);
  const panel = (name: string): Locator => component.getByRole("region", { name });
  const fillOf = (name: string): Promise<string> => panel(name).evaluate((el) => getComputedStyle(el).backgroundColor);
  const alphaOf = (fill: string): number => {
    const channels = fill.match(/[\d.]+/gu)?.map(Number) ?? [];
    return fill.startsWith("rgba") ? (channels[3] ?? 1) : 1;
  };

  await expect(panel(MEMBERS_TAB)).toBeVisible();
  expect(await fillOf(MEMBERS_TAB), "an ordinary tab's panel keeps the pane's own surface").toBe(TRANSPARENT);
  await tab(component, SETTINGS_TAB).click();
  await expect(panel(SETTINGS_TAB)).toBeVisible();
  expect(alphaOf(await fillOf(SETTINGS_TAB)), "the setup view's panel is opaque").toBe(1);
});

// ── ONE TABLIST, IN THE HEADER ROW, NO FOOT RAIL ─────────────────────────────────────────────────────────

test("a pane has exactly ONE tablist, seated in the header row, with real tab semantics", async ({ mount }) => {
  const component = await mount(<ContextTabStripStory width={291} />);

  await expect(component.getByRole("tablist")).toHaveCount(1);
  await expect(strip(component).getByRole("tab")).toHaveCount(TAB_NAMES.length);
  await expect(component.getByRole("tab")).toHaveCount(TAB_NAMES.length);
  await expect(component.getByRole("toolbar")).toHaveCount(0);
  // The strip lives INSIDE the header row — the one place the pane's navigation is.
  await expect(component.locator('[data-slot="context-bracket-header"]').getByRole("tablist")).toHaveCount(1);
  await expect(tab(component, MEMBERS_TAB)).toHaveAttribute("aria-selected", "true");
  await expect(component.locator('[aria-selected="true"]')).toHaveCount(1);
  await expect(strip(component)).toMatchAriaSnapshot(`
    - tablist "Chat":
${TAB_NAMES.map((name) => `      - tab "${name}"`).join("\n")}
  `);
});

test("no foot rail: nothing below the viewport, no kicker, no ground filler", async ({ mount }) => {
  const component = await mount(<ContextTabStripStory width={291} height={480} />);
  await expect(strip(component)).toBeVisible();
  await expect(component.locator('[data-slot="context-rail"]')).toHaveCount(0);
  await expect(component.locator('[data-slot="context-rail-kicker"]')).toHaveCount(0);
  await expect(component.locator('[data-slot="context-bracket-ground"]')).toHaveCount(0);
  // The strip is ABOVE the viewport it selects.
  const [header, viewport] = await Promise.all([
    boxOf(component.locator('[data-slot="context-bracket-header"]')),
    boxOf(component.locator('[data-slot="tabs-panel"]:visible')),
  ]);
  expect(header.bottom).toBeLessThanOrEqual(viewport.top);
});

// ── ICON + LABEL ON EVERY TAB, scrolling inside the strip with no native scrollbar ───────────────────────

test("every tab shows its ICON and its WORD — no nameless glyphs, no clipped caption", async ({ mount }) => {
  const component = await mount(<ContextTabStripStory width={480} />);
  await Promise.all(
    TAB_NAMES.map(async (name) => {
      const current = tab(component, name);
      await expect(current).toBeVisible();
      await expect(current.locator("svg")).toBeVisible();
      await expect(current.locator('[data-slot="context-cell-caption"]')).toHaveText(name);
    }),
  );
  await expect.poll(async () => clippedCaptions(component)).toBe(0);
});

test("when the tabs do not fit, the strip SCROLLS inside the header — whole words, no native scrollbar, a mark says there is more", async ({ mount }) => {
  const component = await mount(<ContextTabStripStory width={291} showTrackers={true} withIconless={true} />);
  const list = strip(component);
  await expect.poll(() => list.evaluate((el) => el.scrollWidth > el.clientWidth + 1)).toBe(true);
  await expect.poll(async () => clippedCaptions(component)).toBe(0);
  await expect(component.locator('[data-slot="context-tab-strip"]')).toHaveAttribute("data-overflow-end", "true");
  await expect(list).toHaveCSS("scrollbar-width", "none");
  // One row: every tab shares a top.
  const tops = await strip(component)
    .getByRole("tab")
    .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)));
  expect(new Set(tops).size).toBe(1);
});

test("an icon-LESS tab sits in the same strip as icon tabs and both keep their word", async ({ mount }) => {
  const component = await mount(<ContextTabStripStory width={600} withIconless={true} />);
  await expect(tab(component, "Iconless").locator('[data-slot="context-cell-caption"]')).toHaveText("Iconless");
  await expect(tab(component, MEMBERS_TAB).locator('[data-slot="context-cell-caption"]')).toHaveText(MEMBERS_TAB);
  await expect.poll(async () => clippedCaptions(component)).toBe(0);
});

// ── Keyboard: one tab stop, arrows MOVE, Enter commits; a `region` named by its tab ──────────────────────

test("the strip is ONE tab stop with roving focus and manual activation, and the viewport is a region named by the selected tab", async ({ mount, page }) => {
  const component = await mount(<ContextTabStripStory width={480} />);
  const members = tab(component, MEMBERS_TAB);
  await members.focus();
  await expect(tab(component, SETTINGS_TAB)).toHaveAttribute("tabindex", "-1");
  await page.keyboard.press("ArrowRight");
  // Focus MOVED, nothing was committed.
  await expect(tab(component, SETTINGS_TAB)).toBeFocused();
  await expect(members).toHaveAttribute("aria-selected", "true");
  await expect(tab(component, SETTINGS_TAB)).toHaveAttribute("aria-selected", "false");
  // Enter commits.
  await page.keyboard.press("Enter");
  await expect(tab(component, SETTINGS_TAB)).toHaveAttribute("aria-selected", "true");
  await expect(members).toHaveAttribute("aria-selected", "false");

  await expect(component.getByRole("tabpanel")).toHaveCount(0);
  // Base UI cross-fades panels: barrier on the one that is not on its way out.
  const panel = component.locator('[data-slot="tabs-panel"]:visible:not([inert])');
  await expect(panel).toHaveCount(1);
  await expect(panel).toHaveAttribute("role", "region");
  const labelledBy = await panel.getAttribute("aria-labelledby");
  await expect(component.locator(`[id="${labelledBy ?? ""}"]`)).toHaveAttribute("aria-selected", "true");
});

// ── The game STATE rail: panel content under the header, never a second tablist ──────────────────────────

test("a game tab lands in the state rail UNDER the header strip; the pane still has exactly one tablist", async ({ mount }) => {
  const component = await mount(<ContextTabStatesStory />);
  await expect(component.getByRole("tablist")).toHaveCount(1);
  await expect(state(component)).toBeVisible();
  await expect(stateCell(component, "Status")).toBeVisible();
  await expect(tab(component, MEMBERS_TAB)).toBeVisible();

  // Geometry: header strip → state rail → viewport.
  const [header, rail, viewport] = await Promise.all([
    boxOf(component.locator('[data-slot="context-bracket-header"]')),
    boxOf(state(component)),
    boxOf(component.locator('[data-slot="tabs-panel"]:visible')),
  ]);
  expect(header.bottom).toBeLessThanOrEqual(rail.top);
  expect(rail.bottom).toBeLessThanOrEqual(viewport.top);

  // ONE selection across both: the state rail holds it (aria-current), the strip shows none selected.
  await expect(stateCell(component, "Status")).toHaveAttribute("aria-current", "true");
  await expect(component.locator('[aria-selected="true"]')).toHaveCount(0);

  await tab(component, SETTINGS_TAB).click();
  await expect(component.getByTestId("ctx-body-settings")).toBeVisible();
  await expect(tab(component, SETTINGS_TAB)).toHaveAttribute("aria-selected", "true");
  await expect(stateCell(component, "Status")).not.toHaveAttribute("aria-current", "true");
  await expect(component.locator('[aria-selected="true"]')).toHaveCount(1);
});

test("the header's active bar belongs to header tabs only: no bar while a state cell holds the view, a bar under the selected header tab", async ({
  mount,
}) => {
  const component = await mount(<ContextTabStatesStory />);
  const indicator = component.locator('[data-slot="context-tab-strip"] [data-slot="tabs-indicator"]');

  // A state-rail cell holds the view: the header strip has no selected tab, so it paints no bar.
  await expect(stateCell(component, "Status")).toHaveAttribute("aria-current", "true");
  await expect(indicator).toBeHidden();

  // A header tab holds it: the bar sits under THAT tab.
  await tab(component, SETTINGS_TAB).click();
  await expect(tab(component, SETTINGS_TAB)).toHaveAttribute("aria-selected", "true");
  await expect(indicator).toBeVisible();
  await expect
    .poll(async () => {
      const [bar, current] = await Promise.all([indicator.boundingBox(), tab(component, SETTINGS_TAB).boundingBox()]);
      return bar !== null && current !== null && bar.x >= current.x - 1 && bar.x + bar.width <= current.x + current.width + 1;
    })
    .toBe(true);

  // Back to a state cell: the bar leaves.
  await stateCell(component, "Scene").click();
  await expect(stateCell(component, "Scene")).toHaveAttribute("aria-current", "true");
  await expect(indicator).toBeHidden();
});

test("one view is not a strip: a single resolved tab leaves a header that NAMES the pane beside its close ×, and the panel names itself", async ({ mount }) => {
  const component = await mount(<ContextTabStripStory width={291} singleTab={true} withDismiss={true} />);
  await expect(component.getByRole("tablist")).toHaveCount(0);
  await expect(component.getByRole("tab")).toHaveCount(0);
  // The header is never blank: it names the pane (the rail label), not the lone tab's label, which the panel carries.
  const heading = component.locator('[data-slot="context-bracket-header"] [data-slot="context-header-title"]');
  await expect(heading).toHaveText("Chat");
  await expect(component.locator('[data-slot="context-bracket-header"]').getByRole("button", { name: "Close Chats details" })).toBeVisible();
  await expect(component.getByRole("region", { name: MEMBERS_TAB })).toBeVisible();
});

// A section whose rail label is also its topbar title would print that word again in the pane header.
test("a single-tab header prints the pane's own name when the host supplies one", async ({ mount }) => {
  const component = await mount(<ContextTabStripStory width={291} singleTab={true} paneLabel="Chats details" />);
  await expect(component.locator('[data-slot="context-bracket-header"] [data-slot="context-header-title"]')).toHaveText("Chats details");
});

test("End on the strip scrolls to the true end: the end fade stands down and never covers the last tab", async ({ mount, page }) => {
  const component = await mount(<ContextMetaRailStory />);
  const list = strip(component);
  await expect(component.locator('[data-slot="context-tab-strip"]')).toHaveAttribute("data-overflow-end", "true");
  await tab(component, MEMBERS_TAB).focus();
  await page.keyboard.press("End");
  await expect(tab(component, "Activity")).toBeFocused();
  // The scroll leaves a gutter beside the focused tab and the track stops at its end: no fade left to cover it.
  await expect(component.locator('[data-slot="context-tab-strip"]')).toHaveAttribute("data-overflow-end", "false");
  await expect(component.locator('[data-slot="context-tab-strip"] [data-edge="end"]')).toHaveCount(0);
  await expect
    .poll(async () => {
      const [tabBox, listBox] = await Promise.all([tab(component, "Activity").boundingBox(), list.boundingBox()]);
      return tabBox !== null && listBox !== null && tabBox.x + tabBox.width <= listBox.x + listBox.width + 1;
    })
    .toBe(true);
});

test("defaultTab (§4.1): a fresh panel lands on the flagged tab, not the declared-order first", async ({ mount }) => {
  const component = await mount(<ContextDefaultTabStory />);
  await expect(stateCell(component, "Status")).toHaveAttribute("aria-current", "true");
  await expect(tab(component, MEMBERS_TAB)).toHaveAttribute("aria-selected", "false");
  await expect(component.getByTestId("ctx-body-status")).toBeVisible();
  await tab(component, MEMBERS_TAB).click();
  await expect(tab(component, MEMBERS_TAB)).toHaveAttribute("aria-selected", "true");
  await expect(stateCell(component, "Status")).not.toHaveAttribute("aria-current", "true");
});

test("the selected tab names itself: ink at the foreground and the strip's active bar rides the header's bottom edge", async ({ mount }) => {
  const component = await mount(<ContextTabStripStory width={480} />);
  const members = tab(component, MEMBERS_TAB);
  await expect(members).toHaveAttribute("aria-selected", "true");
  const indicator = component.locator('[data-slot="tabs-indicator"]');
  await expect(indicator).toBeVisible();
  const [bar, header] = await Promise.all([boxOf(indicator), boxOf(component.locator('[data-slot="context-bracket-header"]'))]);
  // The bar sits on the header's own divider (within the hairline).
  expect(Math.abs(bar.bottom - header.bottom)).toBeLessThanOrEqual(2);
});

test("the state rail's active cell wears the ember fill and a 2px primary bar on its bottom edge", async ({ mount }) => {
  const component = await mount(<ContextTabStatesStory />);
  const status = stateCell(component, "Status");
  await expect(status).toHaveAttribute("aria-current", "true");
  await expect(status).toHaveCSS("border-bottom-width", "2px");
  await expect.poll(() => status.evaluate((el) => getComputedStyle(el).borderBottomColor)).not.toBe(TRANSPARENT);
  await expect.poll(() => status.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(TRANSPARENT);
});

test("RV-7: the locked state cell wears a padlock, names the lock, dims only its ORNAMENTS — and OPENS onto its reason; never aria-disabled", async ({
  mount,
}) => {
  const component = await mount(<ContextTabStatesStory />);
  const map = stateCell(component, "Map — locked");
  await expect(map).toBeVisible();
  await expect(map).not.toHaveAttribute("aria-disabled", "true");
  await expect(map).toHaveAttribute("title", "Maps unlock with the map arc (MA-3)");
  await expect(map.locator("svg")).toHaveCount(2);
  // The dim lands on the ornaments, not the cell root, so the caption keeps its contrast.
  await expect.poll(() => map.evaluate((el) => Number.parseFloat(getComputedStyle(el).opacity))).toBe(1);
  const glyphOpacity = (index: number): Promise<number> =>
    map
      .locator("svg")
      .nth(index)
      .evaluate((el) => Number.parseFloat(getComputedStyle(el).opacity));
  await expect.poll(() => glyphOpacity(0)).toBeLessThan(1);
  await expect.poll(() => glyphOpacity(1)).toBeLessThan(1);

  await map.click();
  await expect(component.getByTestId("ctx-body-map")).toBeVisible();
  await expect(map).toHaveAttribute("aria-current", "true");
});

test("badge: a boolean dot + a count on the state rail, never on the active cell", async ({ mount }) => {
  const component = await mount(<ContextTabStatesStory />);
  await expect(stateCell(component, "Game").getByText("3")).toBeVisible();
  await expect(stateCell(component, "Scene").locator('[data-slot="badge"]')).toHaveCount(1);
  await stateCell(component, "Scene").click();
  await expect(stateCell(component, "Scene")).toHaveAttribute("aria-current", "true");
  await expect(stateCell(component, "Scene").locator('[data-slot="badge"]')).toHaveCount(0);
});

// ── The header's trailing area and the optional identity band ────────────────────────────────────────────

test("view actions sit in the header row after the strip", async ({ mount }) => {
  const component = await mount(<ContextMetaRailStory paneWidth={480} withTrail={true} />);
  const header = component.locator('[data-slot="context-bracket-header"]');
  const action = header.getByRole("button", { name: "Fake trail" });
  await expect(action).toBeVisible();
  // After the strip, on the same row: one polled read of both boxes.
  await expect
    .poll(async () => {
      const [stripBox, actionBox] = await Promise.all([strip(component).boundingBox(), action.boundingBox()]);
      return stripBox !== null && actionBox !== null && actionBox.y >= stripBox.y - 1 && actionBox.x >= stripBox.x + stripBox.width - 1;
    })
    .toBe(true);
});

test("the optional identity band renders UNDER the header row, above the viewport", async ({ mount }) => {
  const withBand = await mount(<ContextTabStripStory width={291} withBand={true} />);
  const band = withBand.locator('[data-slot="context-bracket-band"]');
  await expect(band).toBeVisible();
  await expect(band.getByTestId("ctx-band-content")).toHaveText("Example — Midnight Run");
  const [header, bandBox, viewport] = await Promise.all([
    boxOf(withBand.locator('[data-slot="context-bracket-header"]')),
    boxOf(band),
    boxOf(withBand.locator('[data-slot="tabs-panel"]:visible')),
  ]);
  expect(header.bottom).toBeLessThanOrEqual(bandBox.top);
  expect(bandBox.bottom).toBeLessThanOrEqual(viewport.top);
});

test("a pane without an identity band draws none — no placeholder word", async ({ mount }) => {
  const component = await mount(<ContextTabStripStory width={291} />);
  await expect(component.locator('[data-slot="context-bracket-band"]')).toHaveCount(0);
});

test("the pane's close × is the header row's trailing control — present only when the shell hands one in", async ({ mount }) => {
  const closable = await mount(<ContextTabStripStory width={291} withDismiss={true} />);
  const dismiss = closable.locator('[data-slot="context-bracket-header"]').getByRole("button", { name: "Close Chats details" });
  await expect(dismiss).toBeVisible();
  const [stripRight, dismissLeft] = await Promise.all([
    strip(closable).evaluate((el) => el.getBoundingClientRect().right),
    dismiss.evaluate((el) => el.getBoundingClientRect().left),
  ]);
  expect(dismissLeft).toBeGreaterThanOrEqual(stripRight - 1);
  await dismiss.click();
  await expect(closable).toHaveAttribute("data-dismissed", "1");
  await closable.unmount();

  const bare = await mount(<ContextTabStripStory width={291} />);
  await expect(bare.getByRole("button", { name: "Close Chats details" })).toHaveCount(0);
});

// ── COARSE POINTER: the same tabs, plus the touch floor ──────────────────────────────────────────────────
// `hasTouch: true` is the proven pointer emulation (tests/ui/touch-target-floor.suite.ct.tsx R6).
test.describe("coarse pointer (touch)", () => {
  test.use({ hasTouch: true });

  test("the emulation actually landed — nothing below is trusted otherwise", async ({ mount }) => {
    const component = await mount(<ContextTabStripStory width={291} />);
    await expect.poll(async () => component.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
  });

  test("every tab clears the 44px touch floor, keeps its word, and the strip stays ONE row", async ({ mount }) => {
    const component = await mount(<ContextTabStripStory width={291} showTrackers={true} />);
    const boxes = await Promise.all([...TAB_NAMES, "Trackers"].map((name) => tab(component, name).boundingBox()));
    for (const box of boxes) {
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
    expect(await clippedCaptions(component)).toBe(0);
    const tops = await strip(component)
      .getByRole("tab")
      .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)));
    expect(new Set(tops).size).toBe(1);
  });
});

test("empty context keeps absolute descendants inside its scroll container", async ({ mount, page }) => {
  const component = await mount(<EmptyContextScrollStory />);
  const scroller = component.getByTestId("empty-context-content").locator("..");
  await expect(scroller).toHaveCSS("position", "relative");
  await expect.poll(() => readPhantomScrollers(page)).toEqual([]);
  await scroller.evaluate((node) => {
    // @orb-waive no-test-fabrication(HTMLElement): baselined when the gate widened to value casts; burn-down item 906.
    (node as HTMLElement).style.position = "static";
  });
  await expect.poll(async () => (await readPhantomScrollers(page)).length).toBeGreaterThan(0);
  await scroller.evaluate((node) => {
    // @orb-waive no-test-fabrication(HTMLElement): baselined when the gate widened to value casts; burn-down item 906.
    (node as HTMLElement).style.removeProperty("position");
  });
  await expect.poll(() => readPhantomScrollers(page)).toEqual([]);
});
