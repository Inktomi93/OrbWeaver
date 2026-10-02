// CT: the Characters LIST chrome band, INSIDE the shell chain, at real docked pane widths (#1697).
//
// WHY THIS FILE EXISTS AND `tests/client/components/list-pane-header.ct.tsx` DOES NOT COVER IT. That file
// pins the composite's own conformance (steps, tones, the zero census, the mobile shed). The finding here is
// a BUDGET one and it belongs to this section: `Characters` is the longest section title on the tree and it
// is the only band whose action cluster holds TWO controls (the Import ghost + the New primary). Nothing
// about that is visible from the generic composite.
//
// THE STATE IS THE FINDING. At rest the docked list track is 307px and the title reads `Characters` in full.
// Open a character and the CONTEXT pane docks, which fires shell.css's #242 conditional squeeze and narrows
// the list track toward 272px — and there the title, the only flex item in the band that may shrink,
// rendered `Chara…` while `+ New` (74px) and the import glyph (32px) held their widths.
//
// GEOMETRY, DRIVEN THROUGH THE REAL CHAIN. `.shell-panel-header` is the flex box that distributes the width
// and `.shell-panel` is the `container-type: inline-size` box the stand-down resolves against, so a bare
// mount of the composite would measure a layout the shell never produces.

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { CharactersBandInShellStory } from "../_ct-stories.tsx";

/** The two ends of the docked list track (shell.css #242): the resting clamp, and the squeezed width the
 *  finding was measured at. Both arms are asserted — a fix that only works at one end is not a fix, and a
 *  point measurement never proves a range property. */
const REST_WIDTH = 307;
const SQUEEZED_WIDTH = 272;

/** The band's census read is `character.list` at `{limit: 1}` (see `use-character-census.ts`); the count is
 *  what the title competes with for the lane, so it must be a REAL three-digit census — the 312-row library
 *  the finding was taken on. */
const LIBRARY_TOTAL = 312;

/** The fine-pointer control step (`--spacing-control-sm`) — the short side an icon-only band door must keep.
 *  The COARSE floor is the same token's other arm and is owned by `tests/ui/touch-target-floor.suite.ct.tsx`. */
const CONTROL_SM_FINE_PX = 32;

function routeCensus(page: Page): Promise<unknown> {
  return routeTrpc(page, {
    "character.list": () => ({ items: [], nextCursor: null, totalCount: LIBRARY_TOTAL }),
    "settings.getUserSettings": () => ({ userId: "user_ct", schemaVersion: 1, config: DEFAULT_USER_SETTINGS, updatedAt: 0, configUnreadable: null }),
  });
}

/** `truncate` clips by overflow, so the tell is scrollWidth vs clientWidth on the title TEXT itself (the
 *  heading is the flex box; the span inside it is what carries `truncate`). */
function titleIsClipped(page: Page): Promise<boolean> {
  return page
    .locator('[data-slot="list-pane-title"] span')
    .first()
    .evaluate((el: HTMLElement) => el.scrollWidth > el.clientWidth + 1);
}

/** Every part of the band's width budget, in one read — annotated onto the run so a token retune that moves
 *  the stand-down threshold reads in the report instead of only as a red. */
function bandBudget(page: Page): Promise<Record<string, number>> {
  return page.locator(".shell-panel-header").evaluate((band: HTMLElement) => {
    const width = (selector: string): number => band.querySelector(selector)?.getBoundingClientRect().width ?? -1;
    const title = band.querySelector('[data-slot="list-pane-title"] span');
    return {
      band: band.getBoundingClientRect().width,
      identity: width('[data-slot="list-pane-identity"]'),
      titleLane: title?.clientWidth ?? -1,
      titleNeeds: title?.scrollWidth ?? -1,
      importDoor: width('[aria-label="Import a character card"]'),
      // The create door has TWO arms and one of them is `display:none` at any width, so the annotation
      // reports the widest — i.e. the one actually in layout — rather than whichever comes first in DOM.
      createDoor: Math.max(width('button:not([aria-label="Import a character card"])'), width('[aria-label="New character"]')),
    };
  });
}

for (const width of [REST_WIDTH, SQUEEZED_WIDTH] as const) {
  test(`@${width}px: the section's own name renders in full — the band never ellipsises "Characters"`, async ({ mount, page }) => {
    await routeCensus(page);
    const component = await mount(<CharactersBandInShellStory width={width} />);

    // Settle on the RENDERED census before any geometry is trusted: the title lane's budget is decided
    // against the count beside it, and a band measured before `312` arrives is measuring a different band.
    await expect(component.getByText(String(LIBRARY_TOTAL), { exact: true })).toBeVisible();
    await expect(component.getByRole("heading", { level: 2 })).toContainText("Characters");

    // The band's own budget, annotated so a token retune reads in the report rather than only as a red.
    test.info().annotations.push({ description: JSON.stringify(await bandBudget(page)), type: "band-budget" });

    // MEASURED before the fix: at 307 the title lane was 127px of the 127px it needs (clean); at 272 it got
    // 95px and rendered `Chara…`. The band is the one thing on the surface whose job is to say where you
    // are, and it was the first thing to give up width — in the state the section exists for.
    await expect.poll(() => titleIsClipped(page)).toBe(false);
  });

  test(`@${width}px: neither create door loses its touch box to make room`, async ({ mount, page }) => {
    await routeCensus(page);
    const component = await mount(<CharactersBandInShellStory width={width} />);
    await expect(component.getByText(String(LIBRARY_TOTAL), { exact: true })).toBeVisible();

    // The fix may not be bought by shrinking a target: BOTH doors stay reachable and keep a square-or-wider
    // short side at the fine control step. What this pin guards is that the narrow arm did not quietly
    // become a 40×32 slab — the #842 shape, an icon-only control wearing a TEXT step's padding.
    // Matched by REGEX, not an exact string: the create door's accessible name is width-dependent by
    // design (the labelled arm is named by its visible word, the icon-only arm by its `aria-label`), and a
    // fence pinned to one spelling would go vacuous the moment the other arm renders. The `toHaveCount(1)`
    // is the other half of the display-pair contract — exactly one arm in the a11y tree per width.
    for (const [label, name] of [
      ["import", /^Import a character card$/u],
      ["create", /New/u],
    ] as const) {
      const door = component.getByRole("button", { name });
      await expect(door, `the ${label} door renders exactly once at ${String(width)}px`).toHaveCount(1);
      const box = await door.boundingBox();
      expect(box, `the ${label} door must be hit-testable at ${String(width)}px`).not.toBeNull();
      expect(Math.min(box?.width ?? 0, box?.height ?? 0), `${label} door short side at ${String(width)}px`).toBeGreaterThanOrEqual(CONTROL_SM_FINE_PX);
    }
  });
}
