// CT: the COLLECTION band in the Settings LIST (features/config/components/config-list-collection-group.tsx).
//
// ═══ ITS SUBJECT SHRANK AT #1725, AND THAT IS WHAT THIS FILE NOW PINS ═════════════════════════════════
// The owner moved every collection's member rows out of the LIST and into CONTENT (ruling 2026-09-05: "tag
// list under in list is kinda a no go … right now its mixed and looks weird"). So this module went from
// "band + host filter + the contribution's rows + a zero-member sentence" to "the band", and the claims
// worth pinning here changed with it:
//
//  1. THE LIST HOLDS NO MEMBER ROWS AT ALL — the ruling's own words, asserted as a number. RED-FIRST
//     against the unmodified source, where an expanded band mounted the contribution's rows right here.
//  2. THE DISCLOSURE GUTTER IS RESERVED, NOT RECLAIMED (side-eye 2026-08-08 P3). It used to be the ZERO-
//     MEMBER arm's rule; with one band kind it is now every collection band's, and the claim got stronger
//     rather than moving: whatever the gutter is worth, a collection band spends the same amount of it as
//     the settings band above it, so the LIST's left edge is never species- or data-dependent.
//  3. THERE IS ONE BAND KIND (#1099 F5's successor). Population used to decide which of two components
//     drew — a disclosure or a bare selection — and F5's rule was that it must not decide whether a band is
//     a CONTROL. With no rows to disclose, both arms collapsed into one component, so the rule is now
//     structural and the sweep says so across all four libraries at once.
//
// What this file deliberately does NOT restate: the CONTENT library the band opens (its control row, its
// rows, its empty arm) is `surfaces/config-content-surface.ct.tsx`'s — the round trip needs the whole host.

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator, Page } from "@playwright/test";
import { routeTrpc } from "../../../../support/ct/route-trpc.ts";
import { ConfigHostStory } from "../_ct-stories.tsx";

const USER_SETTINGS_VIEW = { userId: "user_ct_collection_band", schemaVersion: 1, config: DEFAULT_USER_SETTINGS, updatedAt: 0 };

/** One POPULATED library beside three empty ones — the mix that used to draw two different bands, and the
 *  one a "no member rows in the LIST" sweep has to be taken over: a stub where every library is empty could
 *  pass the row count for the wrong reason. */
const AMBIENT: Readonly<Record<string, unknown>> = {
  "sessions.me": { userId: USER_SETTINGS_VIEW.userId, handle: "ct_collection_band", globalRole: "user" },
  "settings.getUserSettings": () => USER_SETTINGS_VIEW,
  "settings.listThemes": () => [],
  "tag.listTagsWithUsage": [
    {
      id: "tag_a",
      name: "fantasy",
      color: null,
      color2: null,
      source: null,
      folderType: "NONE",
      sortOrder: 0,
      isHiddenOnCard: false,
      usage: { characters: 2, chats: 0, worldBooks: 0, personas: 0, presets: 0, total: 2 },
    },
    {
      id: "tag_b",
      name: "slow burn",
      color: null,
      color2: null,
      source: null,
      folderType: "NONE",
      sortOrder: 1,
      isHiddenOnCard: false,
      usage: { characters: 1, chats: 0, worldBooks: 0, personas: 0, presets: 0, total: 1 },
    },
  ],
  "regex.listScripts": [],
  "worldInfo.listBooksWithUsage": [],
  "rosterPreset.list": [],
  "persona.list": [],
};

const BAND = '[data-slot="config-band"]';
const LIST_REGION = '[data-slot="config-list"]';
/** The POPULATED library's band — the one whose click used to unfold rows into this pane. */
const TAGS_BAND = `[data-config-group="tags"] ${BAND}`;
/** A SETTINGS band in the same list — the left edge a collection band's must agree with. */
const SETTINGS_BAND = `[data-config-group="appearance"] ${BAND}`;
/** Every collection group id the registry ships, so the sweeps are the species and not one probe. */
const COLLECTIONS = ["tags", "regex", "worldInfo", "rosterPreset"] as const;

async function stub(page: Page): Promise<void> {
  await routeTrpc(page, AMBIENT);
}

/** A band's glyph boxes, in DOM order: [0] is the chevron (or its reserved spacer), [1] the group's own icon. */
function glyphs(band: Locator): Locator {
  return band.locator("svg");
}

// ── #1725 · THE LIST HOLDS NO MEMBER ROWS ────────────────────────────────────────────────────────────
// RED-FIRST: on the unmodified source this fails, because clicking a populated band expanded it and mounted
// `tag-collection-rows.tsx` inside the LIST pane. The count is taken AFTER a click on purpose — a sweep of
// the resting pane would pass on the old source too, since the group starts collapsed.
test("#1725: clicking a collection band mounts NO member rows in the LIST", async ({ mount, page }) => {
  await stub(page);
  const component = await mount(<ConfigHostStory />);
  const list = component.locator(LIST_REGION);

  await component.locator(TAGS_BAND).click();
  // The band itself is a `Button`, never a `ListRow`, so the whole pane's row census is the claim — and the
  // settings sections' own rows are excluded by scoping to the collection's group frame.
  for (const id of COLLECTIONS) {
    await expect(list.locator(`[data-collection="${id}"] [data-slot="list-row-root"]`), `no ${id} member rows in the LIST`).toHaveCount(0);
  }
  // …and the band is still the door it was: the click made it the location.
  await expect(component.locator(TAGS_BAND)).toHaveAttribute("aria-current", "true");
});

test("#1725: a collection band never claims to unfold anything", async ({ mount, page }) => {
  await stub(page);
  const component = await mount(<ConfigHostStory />);

  // `aria-expanded` on a control with nothing to expand is a promise the band cannot keep. It carried one
  // while its rows lived here; with the rows in CONTENT the attribute is absent on every library, populated
  // or not — which is also the structural half of "two band kinds do not exist".
  for (const id of COLLECTIONS) {
    await expect(component.locator(`[data-config-group="${id}"] ${BAND}`)).not.toHaveAttribute("aria-expanded", /.*/);
  }
});

test("the disclosure gutter is RESERVED: a collection band's group glyph starts at the same x as a settings band's", async ({ mount, page }) => {
  await stub(page);
  const component = await mount(<ConfigHostStory />);

  const collectionGlyph = glyphs(component.locator(TAGS_BAND)).nth(1);
  const settingsGlyph = glyphs(component.locator(SETTINGS_BAND)).nth(1);
  await expect(collectionGlyph).toBeVisible();
  await expect(settingsGlyph).toBeVisible();
  // The claim is the COLUMN, so it is measured as a delta between two real bands rather than against a
  // remembered number: whatever the gutter is worth, a collection band spends the same amount of it.
  await expect
    .poll(async () => {
      const collection = await collectionGlyph.boundingBox();
      const settings = await settingsGlyph.boundingBox();
      return collection === null || settings === null ? Number.POSITIVE_INFINITY : Math.abs(collection.x - settings.x);
    })
    .toBeLessThanOrEqual(0.5);
});

test("…and NOT RECLAIMED: the chevron's box is still drawn, it is only unpainted", async ({ mount, page }) => {
  await stub(page);
  const component = await mount(<ConfigHostStory />);

  const spacer = glyphs(component.locator(TAGS_BAND)).nth(0);
  // `visibility: hidden`, not `display: none` and not a removed node — the box is what holds the column.
  await expect.poll(async () => await spacer.evaluate((el: Element) => getComputedStyle(el).visibility)).toBe("hidden");
  await expect
    .poll(async () => {
      const box = await spacer.boundingBox();
      return box === null ? 0 : box.width;
    })
    .toBeGreaterThan(0);
  // The chevron a settings band paints is the same glyph at the same size — so the spacer cannot drift from
  // what it stands in for by being re-spelled as a width.
  const settingsChevron = glyphs(component.locator(SETTINGS_BAND)).nth(0);
  await expect
    .poll(async () => {
      const reserved = await spacer.boundingBox();
      const painted = await settingsChevron.boundingBox();
      return reserved === null || painted === null ? Number.POSITIVE_INFINITY : Math.abs(reserved.width - painted.width);
    })
    .toBeLessThanOrEqual(0.5);
});

test("there is ONE band kind: population changes the number, never the control", async ({ mount, page }) => {
  await stub(page);
  const component = await mount(<ConfigHostStory />);

  // Tags has members and the other three have none, in the same stub — so this sweep is the mixed case the
  // old two-component split existed for, and every band answers identically.
  for (const id of COLLECTIONS) {
    const band = component.locator(`[data-config-group="${id}"] ${BAND}`);
    await expect(band, `${id} band is a control`).toHaveRole("button");
    // It names its own group (a band addressable only as a descendant is a path, not an identity) and it
    // says how many — "empty" and "the count hasn't loaded" are the two things this number tells apart.
    await expect(band).toHaveAttribute("data-config-group", id);
    await expect(band).toHaveAccessibleName(/\d$/);
  }
  // The populated one says its real census; the empty ones say the honest zero.
  await expect(component.locator(TAGS_BAND)).toHaveAccessibleName(/ 2$/);
  await expect(component.locator(`[data-config-group="regex"] ${BAND}`)).toHaveAccessibleName(/ 0$/);
});
