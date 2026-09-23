// CT: the CONTEXT BRACKET as every tabs pane renders it (context-tabs-panel.tsx → context-bracket.tsx →
// context-rail.tsx). Owner-ruled 2026-08-30 (#860, D150): the
// panel is ONE column — head band → optional state rail → viewport → ground → META RAIL PINNED TO THE FOOT —
// in a normal room, a game room and a character alike. The generic pane used to be a different renderer
// (a `tablist "Detail"` of `tab`s at the HEAD, `aria-disabled` locked tabs, `flex-1` panels, the shell.css
// `.ctx-tab-strip`); #845 measured the fork (the same meta tabs at y=56 in a normal room and y=754 in a
// game room) and this file pins the end of it. The rail's ARIA model is #112's, universal now: a named
// TOOLBAR of buttons carrying `aria-current`, manual activation, `region` panels named by their cell.
//
// The first two tests are the RED-FIRST pins — they compile and run against the pre-#860 source and fail
// there (a `tablist "Detail"` at the head; the strip's bottom ~50px from the top of a 480px pane). The
// DOM-order pin is a FENCE: the kicker already preceded its cells on the pre-#860 tree (#861's stated
// mechanism was refuted with a live receipt — the real mechanism is pinned in the "#861" block below).
// shell.css is loaded into the CT bundle (the story module imports it), so the panel-body padding drop and
// the track sizing resolve exactly as in the shell.

import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator, Page } from "@playwright/test";
import { ContextDefaultTabStory, ContextTabStatesStory, ContextTabStripStory } from "../_ct-stories.tsx";

const TAB_NAMES = ["Members", "Settings", "Preview", "Injections"] as const;

/** The mock's phone cell floor (the mock design "cells 52px"); the token step the cell takes is `control-lg`
 *  (56px at coarse) — the first step at or above it. */
const COARSE_CELL_FLOOR_PX = 52;
const TRANSPARENT = "rgba(0, 0, 0, 0)";

/** The FOOT rail — the section-named toolbar (`railLabel: "Chat"` in these stories). */
function foot(component: Locator): Locator {
  return component.getByRole("toolbar", { name: "Chat" });
}
/** The STATE rail — present only when a `strip:"game"` tab resolved. */
function state(component: Locator): Locator {
  return component.getByRole("toolbar", { name: "Game state" });
}
/** One cell — a BUTTON inside its rail; `exact` so "Members" never matches a "Members — 3" chip. */
function cell(rail: Locator, name: string): Locator {
  return rail.getByRole("button", { name, exact: true });
}
/** The rail block (kicker + cells) that owns a named toolbar. */
function railBlock(component: Locator, page: Page, railName: string): Locator {
  return component.locator('[data-slot="context-rail"]').filter({ has: page.getByRole("toolbar", { name: railName }) });
}

/** How many captions are rendering an ELLIPSIS — the readable-caption floor (#102) stated as a
 *  measurement rather than a mode. `+1` absorbs sub-pixel text metrics. */
function clippedCaptions(component: Locator): Promise<number> {
  return component.locator('[data-slot="context-cell-caption"]').evaluateAll((els) => els.filter((el) => el.scrollWidth > el.clientWidth + 1).length);
}

async function bottomOf(locator: Locator): Promise<number> {
  const box = await locator.boundingBox();
  if (box === null) {
    throw new Error("expected the element to be laid out");
  }
  return box.y + box.height;
}

// ── #860 RED-FIRST: the meta rail is a TOOLBAR at the FOOT, not a tablist at the head ────────────────────

test("#860: a normal pane has NO tablist at its head — its meta tabs are a toolbar named by the section, cells carrying aria-current", async ({ mount }) => {
  const component = await mount(<ContextTabStripStory width={291} />);

  // THE DEFECT PIN — the pre-#860 renderer announced `tablist "Detail"` of `tab`s here. Nothing in the pane
  // announces as a tab group any more; the same set is a named toolbar (#112's model, universal).
  await expect(component.getByRole("tablist")).toHaveCount(0);
  await expect(component.getByRole("tab")).toHaveCount(0);
  await expect(foot(component)).toBeVisible();
  await expect(foot(component).getByRole("button")).toHaveCount(TAB_NAMES.length);
  await expect(cell(foot(component), "Members")).toHaveAttribute("aria-current", "true");
  await expect(component.locator('[aria-current="true"]')).toHaveCount(1);
  // The announced tree, stated whole — the receipt the ruling is about.
  await expect(foot(component)).toMatchAriaSnapshot(`
    - toolbar "Chat":
      - button "Members"
      - button "Settings"
      - button "Preview"
      - button "Injections"
  `);
});

test("#860: the meta rail is PINNED TO THE PANE'S FOOT — its bottom edge is the pane's, in a short-body pane", async ({ mount }) => {
  // A 480px pane with a one-line body: pre-#860 the strip sat at the HEAD (its bottom ~50px from the top).
  // The bracket's ground absorbs the residual span, so the rail's bottom IS the pane's bottom.
  const component = await mount(<ContextTabStripStory width={291} height={480} />);
  const pane = component;
  await expect(foot(component)).toBeVisible();
  const [railBottom, paneBottom] = await Promise.all([bottomOf(component.locator('[data-slot="context-rail"]')), bottomOf(pane)]);
  expect(Math.abs(railBottom - paneBottom)).toBeLessThanOrEqual(1);
  // …and the rail is BELOW the viewport, not above it (the OSRS bracket: administration below).
  const viewportBottom = await bottomOf(component.locator('[data-slot="tabs-panel"]:visible'));
  expect(railBottom).toBeGreaterThan(viewportBottom);
});

// ── The kicker: ON TOP of its cells, naming the group AND the selection ──────────────────────────────────

test("the kicker precedes its cells in DOM order and names the group + the selection (a fence — kicker-above held pre-#860)", async ({ mount, page }) => {
  const component = await mount(<ContextTabStripStory width={291} />);
  const block = railBlock(component, page, "Chat");
  const kicker = block.locator('[data-slot="context-rail-kicker"]');
  await expect(kicker).toHaveText("Chat · Members");
  await expect(kicker).toHaveAttribute("aria-hidden", "true");
  await expect
    .poll(() =>
      kicker
        .locator('[data-slot="text"]')
        .first()
        .evaluate((el) => getComputedStyle(el).textTransform),
    )
    .toBe("uppercase");

  // DOM order: the kicker row comes BEFORE the row holding the toolbar it names — its next sibling contains
  // the cells. (#861's stated mechanism — the kicker under the cells — was refuted on the pre-#860 tree;
  // this fences the order the mock draws, in every pane.)
  await expect
    .poll(() =>
      kicker.evaluate((el) => {
        const toolbar = el.parentElement?.querySelector('[role="toolbar"]') ?? null;
        return toolbar !== null && el.nextElementSibling !== null && el.nextElementSibling.contains(toolbar);
      }),
    )
    .toBe(true);
  // …and geometrically above them.
  const [kickerBottom, cellsTop] = await Promise.all([
    bottomOf(kicker),
    foot(component)
      .boundingBox()
      .then((box) => box?.y ?? Number.NaN),
  ]);
  expect(kickerBottom).toBeLessThanOrEqual(cellsTop);

  // The sentence follows the selection.
  await cell(foot(component), "Settings").click();
  await expect(kicker).toHaveText("Chat · Settings");
  await expect(cell(foot(component), "Settings")).toHaveAttribute("aria-current", "true");
  await expect(cell(foot(component), "Members")).not.toHaveAttribute("aria-current", "true");
});

// ── ICON + LABEL ON EVERY CELL, AT EVERY WIDTH (#208), degrading to a SCROLL, never an ellipsis ───────────

test("the shell's own panel width: every cell shows its ICON and its WORD — no nameless glyphs, no clipped caption", async ({ mount }) => {
  const component = await mount(<ContextTabStripStory width={291} />);
  await Promise.all(
    TAB_NAMES.map(async (name) => {
      const tab = cell(foot(component), name);
      await expect(tab).toBeVisible();
      await expect(tab.locator("svg")).toBeVisible();
      const label = tab.locator('[data-slot="context-cell-caption"]');
      await expect(label).toHaveText(name);
      await expect(label).not.toHaveCSS("display", "none");
      await expect.poll(async () => ((await label.boundingBox())?.width ?? 0) > 0).toBe(true);
    }),
  );
  await expect.poll(async () => clippedCaptions(component)).toBe(0);
});

test("a wide host changes nothing but the slack — same icon+label cell, equal columns, no scroll", async ({ mount }) => {
  const component = await mount(<ContextTabStripStory width={600} />);
  await expect(cell(foot(component), "Members").locator('[data-slot="context-cell-caption"]')).toHaveText("Members");
  await expect.poll(async () => clippedCaptions(component)).toBe(0);
  await expect.poll(async () => foot(component).evaluate((el) => el.scrollWidth > el.clientWidth + 1)).toBe(false);
});

test("5 cells at the default width: every word survives — the rail SCROLLS, it does not clip and it does not fold 3+2", async ({ mount }) => {
  const component = await mount(<ContextTabStripStory width={291} showTrackers={true} />);
  await Promise.all(
    [...TAB_NAMES, "Trackers"].map(async (name) => expect(cell(foot(component), name).locator('[data-slot="context-cell-caption"]')).toHaveText(name)),
  );
  await expect.poll(async () => clippedCaptions(component)).toBe(0);
  // ONE ROW (#861: a five-cell foot rail folding 3+2 left a ragged void beside the orphan pair at 1024×768).
  const tops = await foot(component)
    .getByRole("button")
    .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)));
  expect(new Set(tops).size).toBe(1);
});

test("an icon-LESS tab sits in the same rail as icon cells and both keep their word", async ({ mount }) => {
  const component = await mount(<ContextTabStripStory width={291} withIconless={true} />);
  await expect(cell(foot(component), "Iconless").locator('[data-slot="context-cell-caption"]')).toHaveText("Iconless");
  await expect(cell(foot(component), "Members").locator('[data-slot="context-cell-caption"]')).toHaveText("Members");
  await expect.poll(async () => clippedCaptions(component)).toBe(0);
});

// ── #112, universal: one tab stop, arrows MOVE, Enter commits; a `region` named by its cell ──────────────

test("#112: the rail is ONE tab stop with manual activation, and the viewport is a region named by the current cell", async ({ mount, page }) => {
  const component = await mount(<ContextTabStripStory width={291} />);
  const members = cell(foot(component), "Members");
  await members.focus();
  await expect(cell(foot(component), "Settings")).toHaveAttribute("tabindex", "-1");
  await page.keyboard.press("ArrowRight");
  // Focus MOVED, nothing was committed.
  await expect(cell(foot(component), "Settings")).toBeFocused();
  await expect(members).toHaveAttribute("aria-current", "true");
  await expect(cell(foot(component), "Settings")).not.toHaveAttribute("aria-current", "true");
  // Enter commits — the cell is a native button.
  await page.keyboard.press("Enter");
  await expect(cell(foot(component), "Settings")).toHaveAttribute("aria-current", "true");
  await expect(members).not.toHaveAttribute("aria-current", "true");

  // The viewport is a `region` whose accessible name is the current cell (no tabpanel — there is no tab).
  await expect(component.getByRole("tabpanel")).toHaveCount(0);
  // BARRIER ON THE SETTLED PANEL, not on `:visible` (flaked twice — 2026-08-30, legs 1 and 2 of #875/#878).
  // Base UI cross-fades the panels: for a few frames the OUTGOING one is still painted, marked `inert` with
  // `data-ending-style`, so `:visible` legitimately matches TWO and the strict-mode read throws. The panel
  // this test means is the one that is not on its way out, which is a state the DOM states directly.
  const panel = component.locator('[data-slot="tabs-panel"]:visible:not([inert])');
  await expect(panel).toHaveCount(1);
  await expect(panel).toHaveAttribute("role", "region");
  const labelledBy = await panel.getAttribute("aria-labelledby");
  await expect(component.locator(`[id="${labelledBy ?? ""}"]`)).toHaveAttribute("aria-current", "true");
});

// ── TWO RAILS off one selection: a `strip:"game"` tab summons the state rail ABOVE the viewport ───────────

test("rail membership is honoured everywhere: a game tab lands in the state rail above the viewport, a meta tab in the foot rail", async ({ mount, page }) => {
  const component = await mount(<ContextTabStatesStory />);
  await expect(state(component)).toBeVisible();
  await expect(foot(component)).toBeVisible();
  await expect(cell(state(component), "Status")).toBeVisible();
  await expect(cell(foot(component), "Members")).toBeVisible();
  await expect(component.getByRole("tablist")).toHaveCount(0);

  // Geometry: state rail → viewport → foot rail.
  const [stateBottom, viewportTop, viewportBottom, footTop] = await Promise.all([
    bottomOf(state(component)),
    component
      .locator('[data-slot="tabs-panel"]:visible')
      .boundingBox()
      .then((box) => box?.y ?? Number.NaN),
    bottomOf(component.locator('[data-slot="tabs-panel"]:visible')),
    foot(component)
      .boundingBox()
      .then((box) => box?.y ?? Number.NaN),
  ]);
  expect(stateBottom).toBeLessThanOrEqual(viewportTop);
  expect(viewportBottom).toBeLessThanOrEqual(footTop);

  // ONE selection across both rails — the OWNING rail names it, the other prints its bare name.
  const stateKicker = railBlock(component, page, "Game state").locator('[data-slot="context-rail-kicker"]');
  const footKicker = railBlock(component, page, "Chat").locator('[data-slot="context-rail-kicker"]');
  await expect(stateKicker).toHaveText("Game state · Status");
  await expect(footKicker).toHaveText("Chat");
  await expect(component.locator('[aria-current="true"]')).toHaveCount(1);

  await cell(foot(component), "Settings").click();
  await expect(component.getByTestId("ctx-body-settings")).toBeVisible();
  await expect(footKicker).toHaveText("Chat · Settings");
  await expect(stateKicker).toHaveText("Game state");
  await expect(cell(state(component), "Status")).not.toHaveAttribute("aria-current", "true");
  await expect(component.locator('[aria-current="true"]')).toHaveCount(1);
});

test("#861: the RECEDED rail pays a floor under its cells, and its kicker is quieter than the owning one's", async ({ mount, page }) => {
  // Side-eye measured the live foot rail while a GAME tab held the view: no fill, cells ending on the
  // viewport's own edge, and a kicker BRIGHTER than the owning rail's — a dead section header dangling at
  // the pane's foot.
  //
  // WHAT #861'S FIX IS CREDITED WITH CHANGED (#875 F2, owner-ruled 2026-08-30). The "quieter step of the
  // same fill" this pin used to assert composited to 1.001:1 against the pane — an invisible fill, green
  // here and absent on screen — so the fill is the owner-approved artboard's again (owning rail only) and
  // the receded rail is bare ground BY RULING. What rescues it is what this test now pins: the `pb-row`
  // FLOOR, the top hairline, a kicker ink that differs, and the selection half only on the owning rail.
  // The composited ORDER (band == owning > receded == pane; owning kicker louder than receded; every
  // caption ≥ 4.5:1) is decoded out of the framebuffer in `context-bracket.ct.tsx` — a computed-style
  // assertion structurally cannot see it, which is how the invisible fill passed for a day.
  const component = await mount(<ContextTabStatesStory />);
  const receded = railBlock(component, page, "Chat");
  const owning = railBlock(component, page, "Game state");
  await expect(receded).toHaveAttribute("data-owns", "false");
  await expect(owning).toHaveAttribute("data-owns", "true");
  // The OWNING rail is the painted one; the receded rail is the pane it sits on.
  await expect.poll(() => owning.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(TRANSPARENT);
  await expect.poll(() => receded.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(TRANSPARENT);
  // A floor: the cells do not end on the pane's edge.
  const [cellsBottom, paneBottom] = await Promise.all([bottomOf(foot(component)), bottomOf(component)]);
  expect(paneBottom - cellsBottom).toBeGreaterThanOrEqual(4);
  // The receded kicker is NOT the louder of the two: its name steps one alpha quieter than the owning rail's
  // name, and the owning rail alone prints the foreground selection half beside it.
  const kickerInk = (block: Locator): Promise<string> =>
    block
      .locator('[data-slot="context-rail-kicker"] [data-slot="text"]')
      .first()
      .evaluate((el) => getComputedStyle(el).color);
  await expect.poll(async () => (await kickerInk(receded)) !== (await kickerInk(owning))).toBe(true);
  await expect(receded.locator('[data-slot="context-rail-selection"]')).toHaveCount(0);
  await expect(owning.locator('[data-slot="context-rail-selection"]')).toBeVisible();
});

test("defaultTab (§4.1): a fresh panel lands on the flagged tab, not the declared-order first", async ({ mount }) => {
  const component = await mount(<ContextDefaultTabStory />);
  await expect(cell(state(component), "Status")).toHaveAttribute("aria-current", "true");
  await expect(cell(foot(component), "Members")).not.toHaveAttribute("aria-current", "true");
  await expect(component.getByTestId("ctx-body-status")).toBeVisible();
  await cell(foot(component), "Members").click();
  await expect(cell(foot(component), "Members")).toHaveAttribute("aria-current", "true");
  await expect(cell(state(component), "Status")).not.toHaveAttribute("aria-current", "true");
});

test("#850: the active cell wears the ember fill and a 2px primary bar on its bottom edge — in BOTH rails, one cell at a time", async ({ mount }) => {
  const component = await mount(<ContextTabStatesStory />);
  const status = cell(state(component), "Status");
  await expect(status).toHaveAttribute("aria-current", "true");
  await expect(status).toHaveCSS("border-bottom-width", "2px");
  await expect.poll(() => status.evaluate((el) => getComputedStyle(el).borderBottomColor)).not.toBe(TRANSPARENT);
  await expect.poll(() => status.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(TRANSPARENT);

  const settings = cell(foot(component), "Settings");
  await settings.click();
  await expect(settings).toHaveCSS("border-bottom-width", "2px");
  await expect.poll(() => settings.evaluate((el) => getComputedStyle(el).borderBottomColor)).not.toBe(TRANSPARENT);
  await expect.poll(() => status.evaluate((el) => getComputedStyle(el).borderBottomColor)).toBe(TRANSPARENT);
  await expect.poll(() => status.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(TRANSPARENT);
});

test("RV-7: the locked cell wears a padlock, names the lock, dims only its ORNAMENTS — and OPENS onto its reason; never aria-disabled", async ({ mount }) => {
  const component = await mount(<ContextTabStatesStory />);
  const map = cell(state(component), "Map — locked");
  await expect(map).toBeVisible();
  await expect(map).not.toHaveAttribute("aria-disabled", "true");
  await expect(map).toHaveAttribute("title", "Maps unlock with the map arc (MA-3)");
  // Glyph + padlock: two SVGs in the cell.
  await expect(map.locator("svg")).toHaveCount(2);
  // THE DIM MOVED OFF THE CELL ROOT (#874, side-eye 2026-08-30). This pin used to assert the ROOT was
  // dimmed — which is exactly the defect: at `opacity: .6` the caption measured 3.65:1 (dark) / 2.67:1
  // (light) on a control this build deliberately does NOT mark `aria-disabled`, so 1.4.3's disabled
  // exemption does not reach it. The lock is carried by the ORNAMENTS (the glyph and the padlock —
  // non-text content), and the word stays readable. The caption's ratio itself is pinned in pixels by
  // `context-bracket.ct.tsx`'s caption sweep; this is the structural half.
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
  await map.focus();
  await map.press("Enter");
  await expect(component.getByTestId("ctx-body-map")).toBeVisible();
});

test("badge: a boolean dot + a count, never on the active cell", async ({ mount }) => {
  const component = await mount(<ContextTabStatesStory />);
  await expect(cell(state(component), "Game").getByText("3")).toBeVisible();
  await expect(cell(state(component), "Scene").locator('[data-slot="badge"]')).toHaveCount(1);
  await cell(state(component), "Scene").click();
  await expect(cell(state(component), "Scene")).toHaveAttribute("aria-current", "true");
  await expect(cell(state(component), "Scene").locator('[data-slot="badge"]')).toHaveCount(0);
});

// ── The HEAD BAND and the floating pane's own way out ────────────────────────────────────────────────────

test("the head band renders the section's header ABOVE the rails; with no header there is no band at all", async ({ mount }) => {
  const withBand = await mount(<ContextTabStripStory width={291} withBand={true} />);
  const band = withBand.locator('[data-slot="context-bracket-band"]');
  await expect(band).toBeVisible();
  await expect(band.getByTestId("ctx-band-content")).toHaveText("Example — Midnight Run");
  const [bandBottom, viewportTop] = await Promise.all([
    bottomOf(band),
    withBand
      .locator('[data-slot="tabs-panel"]:visible')
      .boundingBox()
      .then((box) => box?.y ?? Number.NaN),
  ]);
  expect(bandBottom).toBeLessThanOrEqual(viewportTop);
  await withBand.unmount();

  const without = await mount(<ContextTabStripStory width={291} />);
  await expect(without.locator('[data-slot="context-bracket-band"]')).toHaveCount(0);
});

test("a FLOATING pane's dismiss rides inside the band's corner — present only when the shell hands one in", async ({ mount }) => {
  const floating = await mount(<ContextTabStripStory width={291} withBand={true} withDismiss={true} />);
  const dismiss = floating.locator('[data-slot="context-bracket-band"]').getByRole("button", { name: "Close Chats details" });
  await expect(dismiss).toBeVisible();
  await dismiss.click();
  await expect(floating).toHaveAttribute("data-dismissed", "1");
  await floating.unmount();

  const docked = await mount(<ContextTabStripStory width={291} withBand={true} />);
  await expect(docked.getByRole("button", { name: "Close Chats details" })).toHaveCount(0);
});

// ── COARSE POINTER: the same cell, plus the phone floor ──────────────────────────────────────────────────
// `hasTouch: true` is the proven pointer emulation (tests/ui/touch-target-floor.suite.ct.tsx R6).
test.describe("coarse pointer (touch)", () => {
  test.use({ hasTouch: true });

  test("the emulation actually landed — nothing below is trusted otherwise", async ({ mount }) => {
    const component = await mount(<ContextTabStripStory width={291} />);
    await expect.poll(async () => component.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
  });

  test("every cell clears the mock's 52px phone floor, keeps its word, and the five-cell rail stays ONE row", async ({ mount }) => {
    const component = await mount(<ContextTabStripStory width={291} showTrackers={true} />);
    const boxes = await Promise.all([...TAB_NAMES, "Trackers"].map((name) => cell(foot(component), name).boundingBox()));
    for (const box of boxes) {
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(COARSE_CELL_FLOOR_PX);
    }
    expect(await clippedCaptions(component)).toBe(0);
    const tops = await foot(component)
      .getByRole("button")
      .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)));
    expect(new Set(tops).size).toBe(1);
  });

  test("the kicker keeps BOTH halves at a coarse pointer — the mock's phone arm prints CHAT · MEMBERS", async ({ mount, page }) => {
    const component = await mount(<ContextTabStripStory width={291} />);
    await expect(railBlock(component, page, "Chat").locator('[data-slot="context-rail-kicker"]')).toHaveText("Chat · Members");
    await expect(component.locator('[data-slot="context-rail-selection"]')).toBeVisible();
  });
});
