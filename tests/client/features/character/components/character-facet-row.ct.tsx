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
// name is the facet label alone and an EMPTY row's subtitle is its description (the 2026-08-18 P1-2 fix).
// Driven through the editor surface story because the row is a feature-internal leaf — the front door
// exports the surface, and the rows a user actually sees are the ones worth asserting.

import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { routeTrpc } from "../../../../support/ct/route-trpc.ts";
import { chatListResponder } from "../../chat/fixtures.ts";
import { CharacterEditorSurfaceStory } from "../_ct-stories.tsx";
import { makeCharacterDetail } from "../fixtures.ts";

// Description FILLED (its row renders the preview line), Personality left empty (its row renders the
// subtitle line as the button's description) — one mount covers both of the row's two arms.
const CARD = makeCharacterDetail({
  name: "Aria Nightshade",
  description: "A wandering cartographer with a sharp tongue.",
});

async function routeEditor(page: Page): Promise<void> {
  await routeTrpc(page, {
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

  // EMPTY row: the gloss is the DESCRIPTION, still resolved through aria-describedby.
  const empty = component.getByRole("button", { name: "Personality", exact: true });
  await expect(empty).toHaveAccessibleDescription("A summary of traits and temperament.");
});
