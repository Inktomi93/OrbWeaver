// CT: the GENERIC (unclaimed) CONTEXT panel — the six sections + every non-game chat. Post-HUD-1 it is ONE
// strip labelled "Detail", always: the two-strip bracket branch is deleted, and rail membership (`strip`) is
// a claimant's vocabulary this renderer ignores.
//
// CT: the container-responsive CONTEXT tab strip (context-tabs-panel.tsx, Context-Panel-Program CP-1 ·
// UI-Arch §4.3 rule-4 · §4b axis-1 @container). The strip compresses word labels → icon+tooltip when its
// @container can't fit every current tab's words, and restores words when it can. The shell.css
// `.ctx-tab-strip` @container rules are loaded into the CT bundle (playwright/index.css + the story module
// imports shell.css), so the collapse resolves against the story's FIXED container width — narrow ⇒
// icon-mode, wide ⇒ label-mode. Both forms are proven, and the accessible NAME (aria-label) survives in
// BOTH (icon-only-without-a-name is banned — Jordan/§9). The live-browser geometry receipt (no-clip at the
// real 291px default tablist with 5 tabs, 127px headroom) is in the executor's snap --eval report; this CT
// pins the React contract + the CSS collapse behavior.

import { expect, test } from "@playwright/experimental-ct-react";
import { ContextDefaultTabStory, ContextTabStatesStory, ContextTabStripStory } from "../_ct-stories.tsx";

const TAB_NAMES = ["Members", "Settings", "Preview", "Injections"] as const;

/** The D62 P1 coarse-pointer control floor (`--spacing-control-md` resolves to 48px there; the LAW's
 *  floor is 44). Same constant the touch-target-floor suite asserts against. */
const COARSE_TOUCH_FLOOR_PX = 44;

test("narrow container: icon-mode — labels visually collapse, but every tab keeps its accessible name", async ({ mount }) => {
  // 291px = the real default-width tablist. The 4-tab reveal threshold is 28rem (448px), so labels collapse.
  const component = await mount(<ContextTabStripStory width={291} />);

  // Every tab still resolves BY NAME (aria-label survives icon-mode — the tab is never nameless).
  await Promise.all(TAB_NAMES.map((name) => expect(component.getByRole("tab", { name })).toBeVisible()));
  // The visible WORD is collapsed: the label span is display:none in icon-mode.
  const membersLabel = component.getByRole("tab", { name: "Members" }).locator(".ctx-tab-label");
  await expect(membersLabel).toHaveCSS("display", "none");
  // The icon carries the tab (an SVG is present inside the tab).
  await expect(component.getByRole("tab", { name: "Members" }).locator("svg")).toBeVisible();
  // No horizontal clip — icon-mode fits (scrollWidth ≤ clientWidth).
  const clipped = await component.getByRole("tablist").evaluate((el) => el.scrollWidth > el.clientWidth + 1);
  expect(clipped).toBe(false);
});

test("wide container: label-mode — the word labels are shown", async ({ mount }) => {
  // 600px comfortably clears the 4-tab 28rem (448px) reveal threshold, so words return.
  const component = await mount(<ContextTabStripStory width={600} />);

  const membersLabel = component.getByRole("tab", { name: "Members" }).locator(".ctx-tab-label");
  await expect(membersLabel).not.toHaveCSS("display", "none");
  await expect(membersLabel).toHaveText("Members");
  const clipped = await component.getByRole("tablist").evaluate((el) => el.scrollWidth > el.clientWidth + 1);
  expect(clipped).toBe(false);
});

test("5 tabs at the default width (the Trackers ceiling): icon-mode, no clip", async ({ mount }) => {
  const component = await mount(<ContextTabStripStory width={291} showTrackers={true} />);

  // All 5 resolve by name…
  await Promise.all([...TAB_NAMES, "Trackers"].map((name) => expect(component.getByRole("tab", { name })).toBeVisible()));
  // …in icon-mode (5-tab reveal threshold is 35rem = 560px, unmet at 291px)…
  await expect(component.getByRole("tab", { name: "Trackers" }).locator(".ctx-tab-label")).toHaveCSS("display", "none");
  // …and the 5-icon strip does not clip (the structural headroom the word-label strip never had).
  const clipped = await component.getByRole("tablist").evaluate((el) => el.scrollWidth > el.clientWidth + 1);
  expect(clipped).toBe(false);
});

test("an icon-LESS tab keeps its word label unconditionally (never compressed to a nameless glyph)", async ({ mount }) => {
  // Narrow container ⇒ the icon tabs collapse, but the icon-less contributor tab has nothing to compress TO,
  // so its word stays (data-has-icon absent ⇒ shell.css never hides its label).
  const component = await mount(<ContextTabStripStory width={291} withIconless={true} />);

  const iconlessLabel = component.getByRole("tab", { name: "Iconless" }).locator(".ctx-tab-label");
  await expect(iconlessLabel).not.toHaveCSS("display", "none");
  await expect(iconlessLabel).toHaveText("Iconless");
  // Meanwhile an icon tab in the SAME strip is collapsed — the two coexist correctly.
  await expect(component.getByRole("tab", { name: "Members" }).locator(".ctx-tab-label")).toHaveCSS("display", "none");
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

// ── COARSE POINTER: the name must be ON SCREEN, because a touch device cannot hover a `title` ────────
// UI-Architecture §4.3 rule 4 ("appears on hover AND :focus-within, ALWAYS-VISIBLE at `pointer: coarse`")
// + §4b axis 3. Icon-mode's contract is "the icon carries the tab, tooltip/title + aria-label carry the
// name" — and at `pointer: coarse` that leaves the name in a native `title` ALONE (Base UI also suppresses
// tooltips on touch by design), which is a hover affordance the device cannot produce. The container
// thresholds above can never rescue it either: the CONTEXT panel clamps to 26rem while the 5-tab reveal
// threshold is 35rem, so a phone reaches icon-mode and STAYS there, nameless. shell.css answers at the
// shell/token layer in the app's own coarse-tab form — icon over label, exactly as the rail becomes the
// mobile bottom tab bar. `hasTouch: true` is the proven pointer emulation (tests/ui/touch-target-floor
// .suite.ct.tsx R6: `page.emulateMedia` exposes no `pointer` feature and cannot drive this).
test.describe("coarse pointer (touch)", () => {
  test.use({ hasTouch: true });

  test("the emulation actually landed — nothing below is trusted otherwise", async ({ mount }) => {
    const component = await mount(<ContextTabStripStory width={291} />);
    const coarse = await component.evaluate(() => matchMedia("(pointer: coarse)").matches);
    expect(coarse).toBe(true);
  });

  test("at the shell's own panel width every tab shows its WORD — a title-only name is unreachable by touch", async ({ mount }) => {
    // 291px = the real default tablist width, where a FINE pointer is icon-mode (proven above).
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

    // Revealing the label grows the cell to two lines, so its block size is a FLOOR now rather than a
    // fixed height — it must never fall under the D62 P1 coarse floor.
    const boxes = await Promise.all([...TAB_NAMES, "Trackers"].map((name) => component.getByRole("tab", { name }).boundingBox()));
    for (const box of boxes) {
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(COARSE_TOUCH_FLOOR_PX);
    }
    // Five word labels fit in 291px because each rides UNDER its icon (the rail's mobile-bar form), not
    // beside it — the arrangement is what buys the width; `overflow-x-auto` is only the safety net.
    const clipped = await component.getByRole("tablist").evaluate((el) => el.scrollWidth > el.clientWidth + 1);
    expect(clipped).toBe(false);
  });
});
