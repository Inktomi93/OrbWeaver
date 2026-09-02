// CT: the COLLECTION group band (features/config/components/config-list-collection-group.tsx), which became
// its own module when `config-list-group.tsx` crossed the `component-size` cap. An extracted component owes
// its own coverage decision, and this file is that decision — it pins the two claims that live ONLY in this
// module and were, until the split, asserted nowhere:
//
//  1. THE DISCLOSURE GUTTER IS RESERVED, NOT RECLAIMED (side-eye 2026-08-08 P3). A zero-member band draws no
//     chevron, and the first fix dropped the chevron's BOX with it — so that band's glyph started 20px left
//     of every sibling's and the LIST's left edge became DATA-DEPENDENT (a ragged column reads as a
//     rendering bug, not as a stood-down door). The spacer is the same `Icon` at the same size, merely
//     `invisible`: visibility:hidden keeps the box and drops the paint. Both halves are measured here.
//  2. POPULATION DOES NOT DECIDE WHAT SPECIES OF THING A BAND IS (#1099 F5). Empty or full, a band is a
//     `config-band` button that names its own group — the split must not let the two arms drift apart.
//
// What this file deliberately does NOT restate: the empty band's ROLE, focusability, `aria-current` and the
// CONTENT landing it selects into are driven end-to-end in `surfaces/config-content-surface.ct.tsx` (the
// round trip needs the whole host), and the POPULATED band's disclosure, unglued name and import door are
// driven on real rows in `features/regex/components/regex-collection-rows.ct.tsx`. Duplicating either here
// would be coverage theatre.

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator, Page } from "@playwright/test";
import { routeTrpc } from "../../../../support/ct/route-trpc.ts";
import { ConfigHostStory } from "../_ct-stories.tsx";

const USER_SETTINGS_VIEW = { userId: "user_ct_collection_band", schemaVersion: 1, config: DEFAULT_USER_SETTINGS, updatedAt: 0 };

/** Every library EMPTY — the first-run arm, which is the one that draws the zero-member band. */
const AMBIENT: Readonly<Record<string, unknown>> = {
  "sessions.me": { userId: USER_SETTINGS_VIEW.userId, handle: "ct_collection_band", globalRole: "user" },
  "settings.getUserSettings": () => USER_SETTINGS_VIEW,
  "settings.listThemes": () => [],
  "tag.listTagsWithUsage": [],
  "regex.listScripts": [],
  "worldInfo.listBooksWithUsage": [],
  "rosterPreset.list": [],
  "persona.list": [],
};

const BAND = '[data-slot="config-band"]';
/** A zero-member COLLECTION band, and a SETTINGS band in the same list — the two whose left edges must agree. */
const EMPTY_COLLECTION_BAND = `[data-config-group="regex"] ${BAND}`;
const SETTINGS_BAND = `[data-config-group="appearance"] ${BAND}`;

async function stub(page: Page): Promise<void> {
  await routeTrpc(page, AMBIENT);
}

/** A band's glyph boxes, in DOM order: [0] is the chevron (or its reserved spacer), [1] the group's own icon. */
function glyphs(band: Locator): Locator {
  return band.locator("svg");
}

test("the disclosure gutter is RESERVED: an empty band's group glyph starts at the same x as a sibling's", async ({ mount, page }) => {
  await stub(page);
  const component = await mount(<ConfigHostStory />);

  const emptyGlyph = glyphs(component.locator(EMPTY_COLLECTION_BAND)).nth(1);
  const settingsGlyph = glyphs(component.locator(SETTINGS_BAND)).nth(1);
  await expect(emptyGlyph).toBeVisible();
  await expect(settingsGlyph).toBeVisible();
  // The claim is the COLUMN, so it is measured as a delta between two real bands rather than against a
  // remembered number: whatever the gutter is worth, a zero-member band spends the same amount of it.
  await expect
    .poll(async () => {
      const empty = await emptyGlyph.boundingBox();
      const settings = await settingsGlyph.boundingBox();
      return empty === null || settings === null ? Number.POSITIVE_INFINITY : Math.abs(empty.x - settings.x);
    })
    .toBeLessThanOrEqual(0.5);
});

test("…and NOT RECLAIMED: the chevron's box is still drawn, it is only unpainted", async ({ mount, page }) => {
  await stub(page);
  const component = await mount(<ConfigHostStory />);

  const spacer = glyphs(component.locator(EMPTY_COLLECTION_BAND)).nth(0);
  // `visibility: hidden`, not `display: none` and not a removed node — the box is what holds the column.
  await expect.poll(async () => await spacer.evaluate((el: Element) => getComputedStyle(el).visibility)).toBe("hidden");
  await expect
    .poll(async () => {
      const box = await spacer.boundingBox();
      return box === null ? 0 : box.width;
    })
    .toBeGreaterThan(0);
  // The chevron a populated band paints is the same glyph at the same size — so the spacer cannot drift
  // from what it stands in for by being re-spelled as a width.
  const settingsChevron = glyphs(component.locator(SETTINGS_BAND)).nth(0);
  await expect
    .poll(async () => {
      const reserved = await spacer.boundingBox();
      const painted = await settingsChevron.boundingBox();
      return reserved === null || painted === null ? Number.POSITIVE_INFINITY : Math.abs(reserved.width - painted.width);
    })
    .toBeLessThanOrEqual(0.5);
});

test("an empty library's band is the same SPECIES of control as a populated group's — it just says zero", async ({ mount, page }) => {
  await stub(page);
  const component = await mount(<ConfigHostStory />);

  const band = component.locator(EMPTY_COLLECTION_BAND);
  await expect(band).toHaveRole("button");
  // It names its own group (a band addressable only as a descendant is a path, not an identity) and it says
  // how many — "empty" and "the count hasn't loaded" are the two things this number tells apart.
  await expect(band).toHaveAttribute("data-config-group", "regex");
  await expect(band).toHaveAccessibleName(/ 0$/);
  // Every collection in this stub is empty, so the sweep is the whole species, not the one group probed.
  await expect(component.locator(`${BAND}[data-config-group="worldInfo"]`)).toHaveRole("button");
  await expect(component.locator(`${BAND}[data-config-group="rosterPreset"]`)).toHaveRole("button");
  await expect(component.locator(`${BAND}[data-config-group="tags"]`)).toHaveRole("button");
});
