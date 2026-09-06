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
import type { Rgb } from "@orb/tooling/_shared/wcag";
import { contrastRatio, relativeLuminance } from "@orb/tooling/_shared/wcag";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator, Page } from "@playwright/test";
// The design-audit exemption's own selector, run against the real carriers rather than re-spelled here —
// a re-spelling would pass while the instrument matched something else (see the module's header).
import { SELECTION_RAIL_SEL } from "../../../../../tooling/src/ui-audit/lib/selection-rail-sel.ts";
import { pixelSurface } from "../../../../support/ct/pixel-contrast.ts";
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

// ── #1823 · THE BAND PAINTS ITS `aria-current` ───────────────────────────────────────────────────────
// RED-FIRST against the unmodified source, where every band on the surface computed
// `border-left-color: rgba(0, 0, 0, 0)` and `background-color: rgba(0, 0, 0, 0)` in every state — the
// `aria-current="true"` one byte-identical to its three siblings (side-eye 2026-09-06, runs
// `main-1922535-…` and `main-1952313-…`). Every claim below reads RENDERED paint, never the new seam, so
// it compiles and fails against the pre-fix source rather than erroring.
//
// The click is DISPATCHED, not pointed: `locator.click()` leaves the pointer resting on the band, so
// `hover:bg-accent` paints and a reader measures the hover instead of the state — the exact retraction
// that review had to file about its own first screenshot. A dispatched click moves no pointer.

/** One band's paint channels, as the browser resolves them. */
function paintOf(band: Locator): Promise<{ readonly rail: string; readonly fill: string }> {
  return band.evaluate((el: Element) => {
    const style = getComputedStyle(el);
    return { rail: style.borderLeftColor, fill: style.backgroundColor };
  });
}

const TRANSPARENT = "rgba(0, 0, 0, 0)";
/** A collection band that is NOT the location — the control every claim below is a delta against. */
const SIBLING_BAND = `[data-config-group="regex"] ${BAND}`;

/** Enter the Tags library without moving the pointer onto anything. */
async function enterTags(component: Locator): Promise<void> {
  await component.locator(TAGS_BAND).dispatchEvent("click");
  await expect(component.locator(TAGS_BAND)).toHaveAttribute("aria-current", "true");
}

test("#1823: the band that IS the location paints the ruled rail + tint; a sibling door paints nothing", async ({ mount, page }) => {
  await stub(page);
  const component = await mount(<ConfigHostStory />);
  await enterTags(component);

  // The paint is DERIVED from the aria — one statement, so the two halves cannot get out of step.
  await expect(component.locator(TAGS_BAND)).toHaveAttribute("data-selected", "");
  await expect(component.locator(SIBLING_BAND)).not.toHaveAttribute("data-selected", /.*/);

  await expect
    .poll(async () => await paintOf(component.locator(TAGS_BAND)))
    .toEqual({ rail: expect.not.stringMatching(/^rgba\(0, 0, 0, 0\)$/), fill: expect.not.stringMatching(/^rgba\(0, 0, 0, 0\)$/) });
  // …and the delta is what the reader actually uses: a door that is not the location is still bare.
  expect(await paintOf(component.locator(SIBLING_BAND)), "a band that is not the location paints nothing").toEqual({
    rail: TRANSPARENT,
    fill: TRANSPARENT,
  });
});

test("#1823: the rail box is RESERVED on every band, so entering a library shifts no label", async ({ mount, page }) => {
  await stub(page);
  const component = await mount(<ConfigHostStory />);
  const label = component.locator(`${TAGS_BAND} [data-slot="band-label"]`);
  const before = await label.boundingBox();
  await enterTags(component);

  // The transparent RESTING rail is why this holds: a 2px border that appeared on selection would move the
  // band's own label 2px right on entry and leave its siblings' glyph column one step to the left.
  await expect
    .poll(async () => {
      const after = await label.boundingBox();
      return before === null || after === null ? Number.POSITIVE_INFINITY : Math.abs(after.x - before.x);
    })
    .toBeLessThanOrEqual(0.5);
  const sibling = await component.locator(`${SIBLING_BAND} [data-slot="band-label"]`).boundingBox();
  expect(before === null || sibling === null ? Number.POSITIVE_INFINITY : Math.abs(before.x - sibling.x)).toBeLessThanOrEqual(0.5);
});

test("#1823: a SETTINGS group's band is UNCHANGED — its child section row still carries the marker", async ({ mount, page }) => {
  await stub(page);
  const component = await mount(<ConfigHostStory />);
  const settings = component.locator(SETTINGS_BAND);
  await settings.dispatchEvent("click");

  // Appearance HAS sections, so it states `aria-expanded` and NO `aria-current` — two `aria-current` rows
  // for one location was a landed a11y defect, and the one marker lives on the child section row. The paint
  // follows the aria, which is exactly what keeps the settings bands byte-identical to before #1823.
  await expect(settings).toHaveAttribute("aria-expanded", "true");
  await expect(settings).not.toHaveAttribute("aria-current", /.*/);
  await expect(settings).not.toHaveAttribute("data-selected", /.*/);
  expect(await paintOf(settings), "an expanded settings band paints no rail").toEqual({ rail: TRANSPARENT, fill: TRANSPARENT });
});

test.describe("#1823 at a COARSE pointer", () => {
  test.use({ hasTouch: true });

  test("the current band's rail survives the pointer class", async ({ mount, page }) => {
    await stub(page);
    const component = await mount(<ConfigHostStory />);
    await enterTags(component);

    // A coarse band is a 44px box rather than 32px; nothing in the rail is pointer-conditional, and this is
    // the arm that SAYS so rather than assuming it.
    const current = await paintOf(component.locator(TAGS_BAND));
    expect(current.rail, "the rail paints at a coarse pointer too").not.toBe(TRANSPARENT);
    expect(current.fill).not.toBe(TRANSPARENT);
    expect(await paintOf(component.locator(SIBLING_BAND))).toEqual({ rail: TRANSPARENT, fill: TRANSPARENT });
  });
});

// ── #1823 · THE WIDENED design-audit EXEMPTION IS A MEASUREMENT, NOT A SHRUG ─────────────────────────
// The #485 ruling exempted the ratified rail while it had ONE carrier; #1823 gave the band the identical
// pair, so the exemption's population followed the FRAGMENT's carriers. An exemption that widened without
// a control is how a rule quietly stops biting, so this runs the instrument's OWN selector against the
// real surface plus two PLANTED negatives: an unselected band, and a rounded non-carrier box that wears
// `data-selected` and a left accent. Both must still be judged (i.e. NOT matched by the exemption).
test("#1823: the exemption matches the CURRENT band only — an unselected band and a non-carrier box stay judged", async ({ mount, page }) => {
  await stub(page);
  const component = await mount(<ConfigHostStory />);
  await enterTags(component);

  const verdict = await page.evaluate((selector: string) => {
    const planted = document.createElement("div");
    // The non-carrier control: the rule's REAL target — a rounded box with a 2px accent left edge, wearing
    // the selection attribute but none of the ratified carrier identities.
    planted.setAttribute("data-selected", "");
    planted.setAttribute("data-slot", "cbcf-planted-card");
    planted.className = "rounded-control border-l-2 border-l-primary";
    document.body.append(planted);
    const matched = [...document.querySelectorAll<HTMLElement>(selector)];
    const answer = {
      // The band that IS the location: exempt.
      current: matched.filter((el) => el.dataset["configGroup"] === "tags").length,
      // Planted negative 1 — the rule's real target.
      plantedCard: matched.includes(planted),
      // Planted negative 2 — a real band that is NOT selected (the state half of the predicate).
      unselectedBands: [...document.querySelectorAll<HTMLElement>('[data-slot="config-band"]')].filter(
        (el) => !el.hasAttribute("data-selected") && matched.includes(el),
      ).length,
    };
    planted.remove();
    return answer;
  }, SELECTION_RAIL_SEL);

  expect(verdict.current, "the band that IS the location wears the ratified rail and is exempt").toBe(1);
  expect(verdict.plantedCard, "a rounded non-carrier box with a left accent must stay JUDGED").toBe(false);
  expect(verdict.unselectedBands, "an UNSELECTED band must stay JUDGED — the state half of the predicate").toBe(0);
});

// ── #1823 · THE RAIL, DECODED FROM THE FRAMEBUFFER, IN BOTH POLARITIES ───────────────────────────────
// A computed `border-left-color` is the AUTHORED value; what a reader sees is the composited pixel, and a
// 2px non-text mark that clears 3:1 on the dark shell can fail on the warm light one. Each arm carries its
// own POLARITY ASSERTION — without it a light arm is a second dark arm wearing a label.

/** The band's own 2px rail strip, decoded out of the framebuffer. */
async function railPixel(page: Page, band: Locator): Promise<Rgb> {
  const box = await band.boundingBox();
  if (box === null) {
    throw new Error("railPixel: the band has no box");
  }
  return (await pixelSurface(page, band, { region: { x0: 0, x1: 2 / box.width, y0: 0.3, y1: 0.7 } })).rgb;
}

for (const theme of ["hearth", "light"] as const) {
  test(`#1823: the current band's rail clears the 3:1 non-text floor against a bare door (${theme})`, async ({ mount, page }) => {
    await stub(page);
    const component = await mount(<ConfigHostStory />);
    // The attribute goes on the DOCUMENT ELEMENT, not on a wrapper: the generated palettes are declared at
    // the root, so a `data-theme` div around the story renders the hearth palette while reading as a light
    // arm — measured here first (`bare door 15,12,10`, luminance 0.004, on the arm labelled light). Hearth
    // is the ABSENCE of the attribute (#875 F2); spelling it falls through to `:root` and makes the other
    // arm look verified. The polarity assertion below is what catches either mistake.
    await page.evaluate(
      (next: string | null) => {
        if (next === null) {
          document.documentElement.removeAttribute("data-theme");
          return;
        }
        document.documentElement.setAttribute("data-theme", next);
      },
      theme === "hearth" ? null : theme,
    );
    await enterTags(component);

    const rail = await railPixel(page, component.locator(TAGS_BAND));
    const bare = await railPixel(page, component.locator(SIBLING_BAND));
    const measured = `${String(bare.r)},${String(bare.g)},${String(bare.b)}`;
    // The polarity band this arm claims to be in, asserted rather than assumed (both bounds, so neither
    // arm can pass by sitting in the other's palette).
    const polarity = theme === "light" ? { floor: 0.5, ceiling: 1 } : { floor: 0, ceiling: 0.2 };
    expect(relativeLuminance(bare), `the ${theme} arm must actually BE ${theme} (bare door measured ${measured})`).toBeGreaterThanOrEqual(polarity.floor);
    expect(relativeLuminance(bare), `the ${theme} arm must actually BE ${theme} (bare door measured ${measured})`).toBeLessThanOrEqual(polarity.ceiling);
    expect(
      contrastRatio(rail, bare),
      `the rail (${String(rail.r)},${String(rail.g)},${String(rail.b)}) against a bare door (${measured})`,
    ).toBeGreaterThanOrEqual(3);
  });
}
