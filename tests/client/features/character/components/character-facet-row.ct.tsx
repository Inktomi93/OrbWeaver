// CT: `CharacterFacetRow`'s two-line button is VALID HTML and keeps its accessible tree (#235).
//
// The row is a two-line ghost `Button` whose lines are `<Text>` — and `<Text>` defaults to `as="p"`, so
// both lines rendered a `<p>` inside a `<button>`. `<button>` takes phrasing content only; a `<p>` there is
// invalid nesting. React-DOM builds the tree anyway (it is not the HTML parser), which is exactly why this
// survived: it is invisible to every runtime assertion that looks at what RENDERED. It stops being
// invisible the moment the markup is parsed rather than constructed — SSR/hydration, an ariaSnapshot
// corpus, or any tool that round-trips outerHTML — where the parser closes the `<button>` at the `<p>` and
// re-parents the rest of the row.
//
// So the pin is structural (zero `p` inside any button) PLUS the a11y contract the row already owed: the
// name is the facet label alone and an EMPTY row's subtitle is its description (the 2026-08-18 P1-2 fix) —
// PLUS, since #254, that a filled row and an empty one do not announce identically.
// Driven through the editor surface story because the row is a feature-internal leaf — the front door
// exports the surface, and the rows a user actually sees are the ones worth asserting.

import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { chatListResponder } from "../../chat/fixtures.ts";
import { CharacterEditorSurfaceStory } from "../_ct-stories.tsx";
import { CHARACTER_EDITOR_AMBIENT_ROUTES, makeCharacterDetail } from "../fixtures.ts";

/** Hoisted out of the fixture because its LENGTH is what a filled row announces (#254) — reading it back
 *  off `CARD` would be `string | null` and the count assertions would go vacuous on a `?? ""`. */
const DESCRIPTION = "A wandering cartographer with a sharp tongue.";

// Description FILLED (its row renders the preview line), Personality left empty (its row renders the
// subtitle line as the button's description) — one mount covers both of the row's two arms.
const CARD = makeCharacterDetail({
  name: "Aria Nightshade",
  description: DESCRIPTION,
});

async function routeEditor(page: Page): Promise<void> {
  await routeTrpc(page, {
    // The editor tree's ambient reads (#649) — the attachment/suggestion/viewer-settings pipelines ran INERT
    // on `routeTrpc`'s null in every test in this file; the row's a11y contract is the subject, not these.
    ...CHARACTER_EDITOR_AMBIENT_ROUTES,
    "character.get": () => CARD,
    "chat.listChats": chatListResponder([]),
    "character.update": () => CARD,
  });
}

test("no facet row nests a <p> inside its button (invalid phrasing content)", async ({ mount, page }) => {
  await routeEditor(page);
  const component = await mount(<CharacterEditorSurfaceStory />);

  // The rows are up: the facet master list has rendered before the structural count means anything.
  await expect(component.getByRole("button", { name: "Description" })).toBeVisible();
  await expect(component.locator("button p")).toHaveCount(0);
});

test("the facet row still announces the label as its name and the subtitle as an empty row's description", async ({ mount, page }) => {
  await routeEditor(page);
  const component = await mount(<CharacterEditorSurfaceStory />);

  // FILLED row: the name is the label alone — the 1283-character preview must never be the name.
  const filled = component.getByRole("button", { name: "Description", exact: true });
  await expect(filled).toBeVisible();

  // EMPTY row: the gloss is the DESCRIPTION, still resolved through aria-describedby — now behind the
  // fill state, which LEADS the description (#254).
  const empty = component.getByRole("button", { name: "Personality", exact: true });
  await expect(empty).toHaveAccessibleDescription("Empty A summary of traits and temperament.");
});

/** The empty row's description must LEAD with the state, before the facet's gloss. */
const LEADS_WITH_EMPTY = /^Empty\b/;
/** The filled row's description must never carry the authored prose back in (`DESCRIPTION`'s noun). */
const CARD_PROSE = /cartographer/;

// #254 — the a11y half of the decorative-preview fix. Making the filled row's preview line `aria-hidden`
// (it was a 1283-character accessible NAME) took the last announced difference between a filled row and an
// empty one with it: both read "Description, button". The visible difference — preview text vs the muted
// "Add…" — is invisible to a screen reader on BOTH sides. So the two states must differ in the accessible
// DESCRIPTION, in a terse state + magnitude that never restores the wall.
test("a filled facet row and an empty one announce distinguishable descriptions", async ({ mount, page }) => {
  await routeEditor(page);
  const component = await mount(<CharacterEditorSurfaceStory />);

  // FILLED: state + magnitude, never the body. `DESCRIPTION` is 45 characters.
  const filled = component.getByRole("button", { name: "Description", exact: true });
  await expect(filled).toHaveAccessibleDescription(`Filled, ${DESCRIPTION.length} characters`);
  // …and the description is NOT the prose — the whole point of the decorative preview.
  await expect(filled).not.toHaveAccessibleDescription(CARD_PROSE);

  // EMPTY: says so, in front of the gloss that says what the facet is for.
  const empty = component.getByRole("button", { name: "Personality", exact: true });
  await expect(empty).toHaveAccessibleDescription(LEADS_WITH_EMPTY);
});

// #502 (side-eye 2026-08-22 rail-characters P3-1) — ONE VOCABULARY FOR "nothing here". The empty row used to
// print "Add…", an ACTION word standing in a VALUE slot (and the third word this one editor used for the
// state, beside the tags row's "No tags" and the context card's "None"). The visible word is the state word
// now, and it is the SAME node the screen reader already heard — so the eye and the ear stop disagreeing.
test("an empty facet row shows the house EMPTY word, not an action word", async ({ mount, page }) => {
  await routeEditor(page);
  const component = await mount(<CharacterEditorSurfaceStory />);

  const emptyRow = component.getByRole("button", { name: "Personality", exact: true }).locator("xpath=..");
  await expect(emptyRow).toBeVisible();
  await expect(emptyRow.getByText("Empty", { exact: true })).toBeVisible();
  // The action word is gone from the whole surface — the row IS the affordance.
  await expect(component.getByText("Add…")).toHaveCount(0);
  // …and a FILLED row shows its preview, never the state word (the magnitude stays sr-only).
  const filledRow = component.getByRole("button", { name: "Description", exact: true }).locator("xpath=..");
  await expect(filledRow.getByText("Empty", { exact: true })).toHaveCount(0);
});

// The aria-snapshot receipt: the two ROWS as an assistive tech reads them, side by side, so a change that
// flattens them back into one announcement is a visible diff rather than a silent regression. Scoped to the
// two rows — an `ariaSnapshot` of the whole surface would churn on every editor edit. The snapshot is taken
// of the row (the button's parent) rather than the button, because the state text is a SIBLING of the
// button: `aria-describedby` is a name-computation relationship, not a tree containment one, so it does not
// show up under the button node.
test("aria snapshot: filled vs empty facet rows read differently", async ({ mount, page }) => {
  await routeEditor(page);
  const component = await mount(<CharacterEditorSurfaceStory />);

  const filledRow = component.getByRole("button", { name: "Description", exact: true }).locator("xpath=..");
  const emptyRow = component.getByRole("button", { name: "Personality", exact: true }).locator("xpath=..");
  await expect(filledRow).toBeVisible();

  expect(await filledRow.ariaSnapshot()).toContain(`Filled, ${DESCRIPTION.length} characters`);
  expect(await emptyRow.ariaSnapshot()).toContain("Empty");
});
