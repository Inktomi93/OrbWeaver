// CT: the Corpus CONTEXT "Archetypes" tab draws its cluster MEMBERS AS FACES (issue #139). Both
// clustering verbs carry `ArchetypeMember.avatarHash` on the wire (issue #134) and the CONTENT family
// plates already draw it; this tab printed names only, because its local card type re-declared `members`
// as `{characterId, name}[]` — an extra wire field is assignable, so the drop typechecked and the portrait
// simply never reached a renderer.
//
// The two arms that matter are the same pair the family-map CT pins, because they are the ones a wrong
// implementation gets wrong in opposite directions: a member WITH a hash must reach an <img> carrying that
// exact blob URL (nothing else on this surface can produce it), and a member with a NULL hash must degrade
// to the hue-seeded initials seat rather than a broken image or an invented face.

import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { routeTrpc } from "../../../../support/ct/route-trpc.ts";
import { CorpusArchetypesTabStory } from "../_ct-stories.tsx";

const SABLE_HASH = "cccc3333";

/** One writing archetype: a member the CAS can serve a portrait for, and one it cannot. */
const ARCHETYPES = [
  {
    label: "Brooding rogues",
    genre: "fantasy",
    tone: "dark",
    topTags: ["rogue"],
    size: 2,
    members: [
      { characterId: "character_sable", name: "Sable", avatarHash: SABLE_HASH },
      { characterId: "character_morgatha", name: "Morgatha", avatarHash: null },
    ],
    model: "text-embed",
  },
];

/** Any non-empty hue bucket — the fallback's colour is seeded per name, so the VALUE is not the assertion;
 *  its presence is what says "this is the hue-seeded initials fallback and not a bare box". */
const ANY_HUE = /\S/;

/** A 1x1 transparent PNG — the smallest thing a CAS blob route can serve. */
const PIXEL_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

async function stub(page: Page): Promise<void> {
  // THE CAS BLOB ROUTE HAS TO ANSWER, or the two arms are indistinguishable: Base UI's Avatar swaps to its
  // initials fallback when the image ERRORS, so an unstubbed 404 makes a correctly-wired portrait look
  // exactly like a missing one and the null assertion would pass for the wrong reason.
  await page.route("**/api/blob/*", async (route) => {
    const hash = route.request().url().split("/").pop() ?? "";
    if (hash === SABLE_HASH) {
      await route.fulfill({ body: PIXEL_PNG, contentType: "image/png", status: 200 });
      return;
    }
    await route.fulfill({ status: 404 });
  });
  // The art-clustering half stays EMPTY so every face on the surface belongs to the writing cluster and the
  // counts below are exact.
  await routeTrpc(page, { "discovery.archetypes": ARCHETYPES, "discovery.visualArchetypes": [] });
}

test("a cluster member carrying a hash draws its blob; a null one draws hue-seeded initials", async ({ mount, page }) => {
  await stub(page);
  const component = await mount(<CorpusArchetypesTabStory />);

  // SETTLED: the cluster row has painted (both queries resolved past the skeleton arm).
  await expect(component.getByText("Brooding rogues")).toBeVisible();
  await expect(component.getByText("2 members")).toBeVisible();

  // The hash off `archetypes[].members[].avatarHash` reached an <img> on THIS surface.
  await expect(page.locator(`img[src="/api/blob/${SABLE_HASH}"]`)).toHaveCount(1);

  // NULL hash — Morgatha's seat degrades to the initials fallback, hue-seeded and image-less.
  const morgathaSeat = page.locator('[data-slot="avatar-stack-item"]', { has: page.locator('text="M"') });
  await expect(morgathaSeat).toHaveCount(1);
  await expect(morgathaSeat.locator("img")).toHaveCount(0);
  await expect(morgathaSeat.locator('[data-slot="avatar-fallback"]')).toHaveAttribute("data-hue", ANY_HUE);

  // The names did not go away when the faces arrived — the strip is art, the text is the roster.
  await expect(component.getByText("Sable, Morgatha")).toBeVisible();
});
