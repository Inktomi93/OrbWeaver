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
//
// AND THE GATE (issue #154, owner-ruled: "if we haven't run it we probably shouldn't show data"). Cluster
// membership comes from the embeddings the indexer writes on import; every LABEL on this tab comes from the
// distill pass. So with zero distilled cards the k-means still succeeds and labels nothing — the audited
// state was ten "mixed" rows over a bar chart of real sizes. The un-run arm below pins that the tab renders
// the INVITATION and literally no cluster surface: no bars, no rows, no faces, no cluster knob. Note that
// the verb is still stubbed with real clusters in that arm on purpose — the gate has to hold against DATA
// BEING THERE, or it is only testing an empty response.

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { CorpusArchetypesTabStory } from "../_ct-stories.tsx";

const SABLE_HASH = "cccc3333";

/** The invitation's door, as a locator pattern (top-level: a regex literal inside a test body is lint-RED). */
const RUN_DOOR = /Run the understanding pass/;

/** One writing archetype: a member the CAS can serve a portrait for, and TWO it cannot. The second faceless
 *  member exists for the hue arm below — the fallback seeds its colour off the member's NAME, so before #154
 *  fixed the identity read (every faceless member arrived named "Unknown") an entire cluster degraded to the
 *  SAME letter in the SAME colour, which is what the owner's screenshot showed as a wall of identical "U"s. */
const ARCHETYPES = [
  {
    label: "Brooding rogues",
    genre: "fantasy",
    tone: "dark",
    topTags: ["rogue"],
    size: 3,
    members: [
      { characterId: "character_sable", name: "Sable", avatarHash: SABLE_HASH },
      { characterId: "character_morgatha", name: "Morgatha", avatarHash: null },
      { characterId: "character_ilse", name: "Ilse", avatarHash: null },
    ],
    model: "text-embed",
  },
];

/** Any non-empty hue bucket — the fallback's colour is seeded per name, so the VALUE is not the assertion;
 *  its presence is what says "this is the hue-seeded initials fallback and not a bare box". */
const ANY_HUE = /\S/;

/** A 1x1 transparent PNG — the smallest thing a CAS blob route can serve. */
const PIXEL_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

/** A catalog whose `totalDistilled` is the tab's gate signal — the domain's own `count(*)` over
 *  `character_summaries` (`verbs/catalog.ts`), not a client heuristic. */
function catalog(totalDistilled: number): Record<string, unknown> {
  return { genres: [], tones: [], topTags: [], tagPairs: [], totalDistilled };
}

async function stub(page: Page): Promise<void> {
  // THE CAS BLOB ROUTE HAS TO ANSWER, or the two arms are indistinguishable: Base UI's Avatar swaps to its
  // initials fallback when the image ERRORS, so an unstubbed 404 makes a correctly-wired portrait look
  // exactly like a missing one and the null assertion would pass for the wrong reason.
  await page.route("**/api/blob/*", async (route) => {
    // The PATHNAME's last segment, not the raw URL's: an avatar asks for a display rung (`?w=48`) since
    // C6, and splitting the whole URL would hand this comparison "aaaa1111?w=48" and 404 a live portrait.
    const hash = new URL(route.request().url()).pathname.split("/").pop() ?? "";
    if (hash === SABLE_HASH) {
      await route.fulfill({ body: PIXEL_PNG, contentType: "image/png", status: 200 });
      return;
    }
    await route.fulfill({ status: 404 });
  });
  // The art-clustering half stays EMPTY so every face on the surface belongs to the writing cluster and the
  // counts below are exact. A distilled catalog opens the gate — this arm is about the clusters, not it.
  await routeTrpc(page, {
    // #649 — the viewer's settings row. Not this tab's subject, but unfed it resolved `routeTrpc`'s null and
    // every appearance/tier reader in this mount fell to its default branch, so the settings-driven
    // presentation path never ran here. Production defaults: no assertion below moves.
    "settings.getUserSettings": { userId: "user_ct_archetypes", schemaVersion: 1, config: DEFAULT_USER_SETTINGS, updatedAt: 0 },
    "discovery.archetypes": ARCHETYPES,
    "discovery.catalog": catalog(2),
    "discovery.visualArchetypes": [],
  });
}

test("a cluster member carrying a hash draws its blob; a null one draws hue-seeded initials", async ({ mount, page }) => {
  await stub(page);
  const component = await mount(<CorpusArchetypesTabStory />);

  // SETTLED: the cluster row has painted (both queries resolved past the skeleton arm).
  // Scoped to the VISIBLE row: this tab's BarList now also emits a visually-hidden text equivalent
  // (@orb/ui LabeledChartFrame, side-eye ANALYTICS P1e), whose row header carries the same cluster name.
  await expect(component.getByRole("paragraph").filter({ hasText: "Brooding rogues" })).toBeVisible();
  await expect(component.getByText("3 members")).toBeVisible();

  // The hash off `archetypes[].members[].avatarHash` reached an <img> on THIS surface.
  await expect(page.locator(`img[src^="/api/blob/${SABLE_HASH}"]`)).toHaveCount(1);

  // NULL hash — Morgatha's seat degrades to the initials fallback, hue-seeded and image-less.
  const morgathaSeat = page.locator('[data-slot="avatar-stack-item"]', { has: page.locator('text="M"') });
  await expect(morgathaSeat).toHaveCount(1);
  await expect(morgathaSeat.locator("img")).toHaveCount(0);
  await expect(morgathaSeat.locator('[data-slot="avatar-fallback"]')).toHaveAttribute("data-hue", ANY_HUE);

  // The names did not go away when the faces arrived — the strip is art, the roster is the text.
  // AND EVERY NAME IS A DOOR (side-eye populated arm 2026-08-23, [P2-5]). The roster was one comma-joined
  // gloss line, so this tab named 569 memberships across 18 clusters and offered no way to open any of
  // them — a read-only wall in the region §14 reserves for acting on the active artifact. Same destination
  // the Map tab uses one click away: `selectCorpusCharacter` into the CONTENT dossier.
  await Promise.all(
    ["Sable", "Morgatha", "Ilse"].map(async (name) =>
      expect(component.getByRole("button", { exact: true, name }), `${name} is a control, not a comma-separated word`).toBeVisible(),
    ),
  );

  // FACELESS SEATS VARY (issue #154's third symptom). The hue is seeded off the member's NAME, so two
  // portrait-less members with real, different names must not resolve to the same swatch — that identity is
  // exactly what "Unknown, Unknown, Unknown" produced, and the fix is only complete when the faces differ too.
  const ilseFallback = page.locator('[data-slot="avatar-stack-item"]', { has: page.locator('text="I"') }).locator('[data-slot="avatar-fallback"]');
  await expect(ilseFallback).toHaveAttribute("data-hue", ANY_HUE);
  await expect
    .poll(async () => (await ilseFallback.getAttribute("data-hue")) === (await morgathaSeat.locator('[data-slot="avatar-fallback"]').getAttribute("data-hue")))
    .toBe(false);
});

test("with the understanding pass un-run the tab shows the invitation and ZERO cluster data", async ({ mount, page }) => {
  await routeTrpc(page, {
    // Real clusters on the wire — the gate must hold against data being there, not against an empty verb.
    // #649 — the viewer's settings row. Not this tab's subject, but unfed it resolved `routeTrpc`'s null and
    // every appearance/tier reader in this mount fell to its default branch, so the settings-driven
    // presentation path never ran here. Production defaults: no assertion below moves.
    "settings.getUserSettings": { userId: "user_ct_archetypes", schemaVersion: 1, config: DEFAULT_USER_SETTINGS, updatedAt: 0 },
    "discovery.archetypes": ARCHETYPES,
    "discovery.catalog": catalog(0),
    "discovery.visualArchetypes": [],
    // The invitation's own reads (it is the door that RUNS the pass now — issue #155).
    "sessions.me": { userId: "user_me", globalRole: "user", handle: "me" },
    "workloads.list": [],
  });
  const component = await mount(<CorpusArchetypesTabStory />);

  // SETTLED: the un-run arm has painted (the invitation's heading is unique to it).
  await expect(component.getByRole("button", { name: RUN_DOOR })).toBeVisible();

  // …and none of the cluster surface exists. Each of these is a thing the audited screenshot showed.
  await expect(component.getByText("Brooding rogues")).toHaveCount(0);
  await expect(component.getByText("3 members")).toHaveCount(0);
  await expect(component.getByText("Writing archetypes")).toHaveCount(0);
  await expect(component.getByText("Art archetypes")).toHaveCount(0);
  await expect(component.getByText("Sable, Morgatha")).toHaveCount(0);
  await expect(page.locator('[data-slot="avatar-stack-item"]')).toHaveCount(0);
  // Not the cluster knob either — a control over data the surface is refusing to show.
  await expect(component.getByText("Clusters")).toHaveCount(0);
});
