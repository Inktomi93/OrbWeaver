// CT: the GENERIC (unclaimed) CONTEXT panel — the six sections + every non-game chat. Post-HUD-1 it is ONE
// strip labelled "Detail", always: the two-strip bracket branch is deleted, and rail membership (`strip`) is
// a claimant's vocabulary this renderer ignores.
//
// CT: the CONTEXT tab strip (context-tabs-panel.tsx). ICON + LABEL ON EVERY TAB, AT EVERY WIDTH AND EVERY
// POINTER (owner ruling 2026-08-18, #208) — which SUPERSEDES the container-responsive icon-mode this file
// pinned until today (labels hidden by default on any tab with an icon; a per-count `@container` threshold
// restored them). That mode never fired in the product: the panel clamps to 26rem and the 4-tab threshold
// was 28rem, so the shell's only fine-pointer form was nameless glyphs, while the SAME resolved chat tabs
// rendered glyph+caption under the rpg HUD's claim. The tests below are the inverse of the four they
// replace, and the strip's degradation is now a SCROLL (`minmax(max-content, 1fr)` tracks + overflow-x-auto),
// never a clipped word — so the no-clip assertions moved from the STRIP's scroll bounds to each CAPTION's.
// The shell.css rules are loaded into the CT bundle (playwright/index.css + the story module imports
// shell.css), so the cell form resolves against the story's FIXED container width exactly as in the shell.

import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator } from "@playwright/test";
import { ContextDefaultTabStory, ContextTabStatesStory, ContextTabStripStory } from "../_ct-stories.tsx";

const TAB_NAMES = ["Members", "Settings", "Preview", "Injections"] as const;

/** The D62 P1 coarse-pointer control floor (`--spacing-control-md` resolves to 48px there; the LAW's
 *  floor is 44). Same constant the touch-target-floor suite asserts against. */
const COARSE_TOUCH_FLOOR_PX = 44;

/** How many of the strip's captions are rendering an ELLIPSIS — the readable-caption floor (#102) stated as
 *  a measurement rather than a mode. `+1` absorbs sub-pixel text metrics. */
function clippedCaptions(component: Locator): Promise<number> {
  return component.locator(".ctx-tab-label").evaluateAll((els) => els.filter((el) => el.scrollWidth > el.clientWidth + 1).length);
}

test("the shell's own panel width: every tab shows its ICON and its WORD — no nameless glyphs", async ({ mount }) => {
  // 291px = the real default-width tablist, the width at which the superseded design was PERMANENTLY
  // icon-only (the 4-tab reveal threshold was 448px, and the panel clamps to 416px).
  const component = await mount(<ContextTabStripStory width={291} />);

  await Promise.all(
    TAB_NAMES.map(async (name) => {
      const tab = component.getByRole("tab", { name });
      await expect(tab).toBeVisible();
      // The icon carries half the cell…
      await expect(tab.locator("svg")).toBeVisible();
      // …and the WORD is on screen, rendered (a display:none or a 0px box is the same missing word).
      const label = tab.locator(".ctx-tab-label");
      await expect(label).toHaveText(name);
      await expect(label).not.toHaveCSS("display", "none");
      await expect.poll(async () => ((await label.boundingBox())?.width ?? 0) > 0).toBe(true);
    }),
  );
  // And not one of them is an ellipsis: the tracks are `minmax(max-content, 1fr)`, so a cell cannot be
  // squeezed below its own word.
  await expect.poll(async () => clippedCaptions(component)).toBe(0);
});

test("a wide host changes nothing but the slack — same icon+label cell, still no clip", async ({ mount }) => {
  const component = await mount(<ContextTabStripStory width={600} />);

  const membersLabel = component.getByRole("tab", { name: "Members" }).locator(".ctx-tab-label");
  await expect(membersLabel).toHaveText("Members");
  await expect(membersLabel).not.toHaveCSS("display", "none");
  await expect.poll(async () => clippedCaptions(component)).toBe(0);
  // With slack the `1fr` MAX still fills the strip as equal cells (the 2026-07-28 bracket ruling): the
  // strip has no horizontal overflow to scroll.
  await expect.poll(async () => component.getByRole("tablist").evaluate((el) => el.scrollWidth > el.clientWidth + 1)).toBe(false);
});

test("5 tabs at the default width (the Trackers ceiling): every word survives — the strip SCROLLS, it does not clip", async ({ mount }) => {
  const component = await mount(<ContextTabStripStory width={291} showTrackers={true} />);

  // All 5 resolve by name and print their word…
  await Promise.all(
    [...TAB_NAMES, "Trackers"].map(async (name) => {
      await expect(component.getByRole("tab", { name })).toBeVisible();
      await expect(component.getByRole("tab", { name }).locator(".ctx-tab-label")).toHaveText(name);
    }),
  );
  // …and the degradation, where five words no longer share 291px, is the strip's own scroll — never an
  // ellipsis. This is the ONE assertion that separates the fix from the defect it replaces.
  await expect.poll(async () => clippedCaptions(component)).toBe(0);
});

test("an icon-LESS tab sits in the same strip as icon tabs and both keep their word", async ({ mount }) => {
  // The mixing the owner ruled against is icon-only BESIDE icon+label. An icon-less contributor tab is
  // label-only by construction (it has no glyph to print), and it must read as the same cell.
  const component = await mount(<ContextTabStripStory width={291} withIconless={true} />);

  const iconlessLabel = component.getByRole("tab", { name: "Iconless" }).locator(".ctx-tab-label");
  await expect(iconlessLabel).toHaveText("Iconless");
  await expect(iconlessLabel).not.toHaveCSS("display", "none");
  const membersLabel = component.getByRole("tab", { name: "Members" }).locator(".ctx-tab-label");
  await expect(membersLabel).toHaveText("Members");
  await expect(membersLabel).not.toHaveCSS("display", "none");
  await expect.poll(async () => clippedCaptions(component)).toBe(0);
});

test("#208: the strip is a REAL tablist — role, selected state and panel wiring, not an orange fill", async ({ mount }) => {
  // The ruled a11y bar for the context tabs, pinned on the renderer that serves every non-game chat and all
  // six generic sections. (The rpg-CLAIMED pane deliberately announces two named TOOLBARS instead — #112,
  // measured: two rails share ONE selection, and a tablist whose selected tab lives in the other rail
  // announces a chooser with nothing chosen. That ruling is stated in rpg-hud-rail.tsx and is NOT reversed.)
  const component = await mount(<ContextTabStripStory width={291} />);

  // The announced tree, stated whole — this is the receipt the ruling is about, and an inline snapshot is
  // the only assertion that catches a role or a NAME quietly changing shape.
  await expect(component.getByRole("tablist")).toMatchAriaSnapshot(`
    - tablist "Detail":
      - tab "Members" [selected]
      - tab "Settings"
      - tab "Preview"
      - tab "Injections"
  `);
  await expect(component.getByRole("tablist")).toHaveAttribute("aria-label", "Detail");
  await expect(component.getByRole("tab")).toHaveCount(TAB_NAMES.length);
  await expect(component.getByRole("tab", { selected: true })).toHaveCount(1);
  const members = component.getByRole("tab", { name: "Members" });
  await expect(members).toHaveAttribute("aria-selected", "true");
  // The selected tab NAMES its panel, and the panel is a real tabpanel (not a bare div).
  await expect.poll(async () => members.getAttribute("aria-controls")).not.toBeNull();
  const controls = await members.getAttribute("aria-controls");
  await expect(component.getByRole("tabpanel")).toHaveAttribute("id", controls ?? "");

  // Roving tabindex + arrow keys: the strip is ONE tab stop, and an arrow moves the selection within it.
  await members.focus();
  await expect(component.getByRole("tab", { name: "Settings" })).toHaveAttribute("tabindex", "-1");
  await members.press("ArrowRight");
  await expect(component.getByRole("tab", { name: "Settings" })).toHaveAttribute("aria-selected", "true");
  await expect(members).toHaveAttribute("aria-selected", "false");
});

// ── ONE strip, always (HUD-1 §5.1 — the bracket branch is deleted) ───────────────────────────────────

test("the generic panel renders ONE strip labelled Detail — the pre-HUD contract, now permanent", async ({ mount }) => {
  const component = await mount(<ContextTabStripStory width={291} />);
  await expect(component.getByRole("tablist")).toHaveCount(1);
  await expect(component.getByRole("tablist")).toHaveAttribute("aria-label", "Detail");
});

test("rail membership is a CLAIMANT's vocabulary: the generic panel ignores `strip` and renders one strip", async ({ mount }) => {
  // A mixed game/meta set is exactly what used to summon the bracket. With no claim there is no bracket —
  // every visible tab lives in the single "Detail" strip, one selection, and no "Game"/"Chat" group exists.
  const component = await mount(<ContextTabStatesStory />);

  await expect(component.getByRole("tablist")).toHaveCount(1);
  await expect(component.getByRole("tablist")).toHaveAttribute("aria-label", "Detail");
  await expect(component.getByRole("tablist", { name: "Game" })).toHaveCount(0);
  const strip = component.getByRole("tablist");
  await expect(strip.getByRole("tab", { name: "Status" })).toBeVisible();
  await expect(strip.getByRole("tab", { name: "Members" })).toBeVisible();

  // ONE selection across the whole set, and the viewport follows it.
  await strip.getByRole("tab", { name: "Status" }).click();
  await expect(component.getByTestId("ctx-body-status")).toBeVisible();
  await strip.getByRole("tab", { name: "Settings" }).click();
  await expect(component.getByTestId("ctx-body-settings")).toBeVisible();
  await expect(strip.getByRole("tab", { name: "Status" })).toHaveAttribute("aria-selected", "false");
  await expect(component.getByRole("tab", { selected: true })).toHaveCount(1);
});

test("defaultTab (§4.1): a fresh panel lands on the flagged tab, not the declared-order first", async ({ mount }) => {
  // `members` is first in declared order, but `rpg.status` flags `defaultTab` — a game chat must land on
  // Status (the game-state centerpiece), not the roster's Members. No stored contextTab ⇒ the flag decides.
  const component = await mount(<ContextDefaultTabStory />);
  await expect(component.getByRole("tab", { name: "Status" })).toHaveAttribute("aria-selected", "true");
  await expect(component.getByRole("tab", { name: "Members" })).toHaveAttribute("aria-selected", "false");
  await expect(component.getByTestId("ctx-body-status")).toBeVisible();

  // Continuity holds: an explicit selection of a DIFFERENT visible tab still wins over the default.
  await component.getByRole("tab", { name: "Members" }).click();
  await expect(component.getByRole("tab", { name: "Members" })).toHaveAttribute("aria-selected", "true");
  await expect(component.getByRole("tab", { name: "Status" })).toHaveAttribute("aria-selected", "false");
});

test("indicator: the per-tab active bar sits on the strip's INWARD (bottom) edge — no sliding twin", async ({ mount }) => {
  // The active marker sits on the edge NEAREST the content: a per-tab 2px `--color-primary` border,
  // transparent on inactive tabs so selection costs zero layout shift, replacing the sliding
  // <TabsIndicator/> (which could clip inside the strip's overflow scroll container).
  const transparent = "rgba(0, 0, 0, 0)";
  const component = await mount(<ContextTabStatesStory />);
  const strip = component.getByRole("tablist");
  await expect(component.locator('[data-slot="tabs-indicator"]')).toHaveCount(0);

  const status = strip.getByRole("tab", { name: "Status" });
  await status.click();
  await expect(status).toHaveCSS("border-bottom-width", "2px");
  await expect.poll(() => status.evaluate((el) => getComputedStyle(el).borderBottomColor)).not.toBe(transparent);

  // Selecting elsewhere clears it — exactly one tab ever carries the bar.
  const settings = strip.getByRole("tab", { name: "Settings" });
  await settings.click();
  await expect(settings).toHaveCSS("border-bottom-width", "2px");
  await expect.poll(() => settings.evaluate((el) => getComputedStyle(el).borderBottomColor)).not.toBe(transparent);
  await expect.poll(() => status.evaluate((el) => getComputedStyle(el).borderBottomColor)).toBe(transparent);
});

test("PHASE disabled: aria-disabled + reason on title, focusable-discoverable (not `disabled`)", async ({ mount }) => {
  const component = await mount(<ContextTabStatesStory />);
  const map = component.getByRole("tab", { name: "Map" });
  await expect(map).toHaveAttribute("aria-disabled", "true");
  await expect(map).toHaveAttribute("title", "Maps unlock with the map arc (MA-3)");
  // Discoverable, not removed from the a11y tree — the reason stays reachable (the OSRS locked-tab pattern).
  await expect(map).toBeVisible();
});

test("badge: a boolean dot + a count, never on the active tab", async ({ mount }) => {
  const component = await mount(<ContextTabStatesStory />);
  // The count badge (badge:3 on Game) renders its number.
  await expect(component.getByRole("tab", { name: "Game" }).getByText("3")).toBeVisible();
  // The boolean-badge tab (Scene) shows the corner dot.
  await expect(component.getByRole("tab", { name: "Scene" }).locator("span.rounded-full")).toBeVisible();

  // Activating a badged tab drops its badge (never on the active tab).
  await component.getByRole("tab", { name: "Scene" }).click();
  await expect(component.getByRole("tab", { name: "Scene" })).toHaveAttribute("aria-selected", "true");
  await expect(component.getByRole("tab", { name: "Scene" }).locator("span.rounded-full")).toHaveCount(0);
});

// ── COARSE POINTER: the same cell, plus the touch floor ──────────────────────────────────────────────
// The coarse arm used to be the ONLY place the word was on screen (a touch device cannot hover the `title`
// that icon-mode left the name in — UI-Architecture §4.3 rule 4 + §4b axis 3). #208 made that arm the only
// arm, so what is left to prove HERE is what is genuinely pointer-specific: the two-line cell still clears
// the D62 P1 ≥44px floor once `--spacing-control-md` steps up to 48px. `hasTouch: true` is the proven
// pointer emulation (tests/ui/touch-target-floor.suite.ct.tsx R6: `page.emulateMedia` exposes no `pointer`
// feature and cannot drive this).
test.describe("coarse pointer (touch)", () => {
  test.use({ hasTouch: true });

  test("the emulation actually landed — nothing below is trusted otherwise", async ({ mount }) => {
    const component = await mount(<ContextTabStripStory width={291} />);
    await expect.poll(async () => component.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
  });

  test("at the shell's own panel width every tab shows its WORD — a title-only name is unreachable by touch", async ({ mount }) => {
    // 291px = the real default tablist width. Same expectation as the fine-pointer test above, kept as its
    // own statement because the floor it protects (a name a touch user can actually perceive) is the one
    // this arm exists for.
    const component = await mount(<ContextTabStripStory width={291} showTrackers={true} />);

    await Promise.all(
      [...TAB_NAMES, "Trackers"].map(async (name) => {
        const label = component.getByRole("tab", { name }).locator(".ctx-tab-label");
        await expect(label).not.toHaveCSS("display", "none");
        // Rendered, not merely un-hidden: a 0px box is the same unreachable name in different clothes.
        await expect.poll(async () => ((await label.boundingBox())?.width ?? 0) > 0).toBe(true);
      }),
    );
  });

  test("the two-line cell still clears the ≥44px touch floor and the strip does not clip", async ({ mount }) => {
    const component = await mount(<ContextTabStripStory width={291} showTrackers={true} />);

    // The label rides UNDER the icon, so the cell is two lines and its block size is a FLOOR rather than a
    // fixed height — it must never fall under the D62 P1 coarse floor.
    const boxes = await Promise.all([...TAB_NAMES, "Trackers"].map((name) => component.getByRole("tab", { name }).boundingBox()));
    for (const box of boxes) {
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(COARSE_TOUCH_FLOOR_PX);
    }
    // …and no word is an ellipsis at the touch width either (the strip scrolls instead).
    expect(await clippedCaptions(component)).toBe(0);
  });
});
