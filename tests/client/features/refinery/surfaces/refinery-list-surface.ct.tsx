// CT: the sessions ROSTER. The pin is the one the side-eye's P1-4/P1-5 could not hold on its own —
// character identity is a fact the SERVER sends, not one the client reconstructs. The old surface
// joined `character.list` (a cursor page capped at 100 rows) by `characterId`, so a session whose card
// sat past page one rendered "Character unavailable" and was invisible to the roster's own search. The
// stories below put the card OUTSIDE any page the client could fetch and assert the row names itself
// anyway — and that the surface asks `character.list` nothing at all.

import { expect, test } from "@playwright/experimental-ct-react";
import type { TrpcRoutes } from "../../../../support/ct/route-trpc.ts";
import { routeTrpc } from "../../../../support/ct/route-trpc.ts";
import { RefineryRosterStory } from "../_ct-stories.tsx";
import { makeRefinerySessionSummary } from "../fixtures.ts";

/** The relative-time + iteration readout the trailing cluster prints. */
const ITERATION_READOUT = /iteration 3/;

/** An EMPTY character page — what page-two-and-beyond looks like from the first page. Typed so the
 *  responder's return type is explicit (biome `useExplicitReturnType`) and stated once. */
interface CharacterPage {
  readonly items: readonly unknown[];
  readonly nextCursor: null;
}
function emptyCharacterPage(): CharacterPage {
  return { items: [], nextCursor: null };
}

/** A roster whose one session is about a card NO client page contains. */
const PAST_THE_PAGE: TrpcRoutes = {
  "refinery.listSessions": (): unknown[] => [
    makeRefinerySessionSummary({ characterName: "Zephyrine Vale", name: null, iterationCount: 3, latestVerdict: "ACCEPT" }),
  ],
  "character.list": emptyCharacterPage,
};

test("a session whose card is past the client's page still NAMES itself — the identity rides the summary", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, PAST_THE_PAGE);
  await mount(<RefineryRosterStory />);

  // The row's title IS the character. Under the old client-side join this read "Character unavailable".
  await expect(page.getByText("Zephyrine Vale")).toBeVisible();
  // The trailing readout still reads: how it went · how far in.
  await expect(page.getByText("Accept")).toBeVisible();
  await expect(page.getByText(ITERATION_READOUT)).toBeVisible();
  // And the surface never asked for a character page at all — there is no join left to break.
  // ONESHOT-OK: the row above is rendered, and the roster is a SUSPENSE surface — it cannot paint until
  // every query it declared has resolved. A `character.list` this surface still owed would have
  // suspended the row, so a settled row IS the barrier for "it asked for nothing else".
  expect(trpc.count("character.list")).toBe(0);
});

test("search finds a session by its CHARACTER name, including one no character page carries", async ({ mount, page }) => {
  await routeTrpc(page, {
    "refinery.listSessions": () => [
      makeRefinerySessionSummary({ id: "rfs_a", characterName: "Zephyrine Vale", name: null }),
      makeRefinerySessionSummary({ id: "rfs_b", characterName: "Aria the Archivist", name: null }),
    ],
    "character.list": emptyCharacterPage,
  });
  await mount(<RefineryRosterStory />);
  await expect(page.getByText("Zephyrine Vale")).toBeVisible();
  await expect(page.getByText("Aria the Archivist")).toBeVisible();

  await page.getByRole("textbox", { name: "Search sessions by character or name" }).fill("zeph");
  await expect(page.getByText("Zephyrine Vale")).toBeVisible();
  await expect(page.getByText("Aria the Archivist")).toBeHidden();

  // A miss is a designed empty state, not a blank pane.
  await page.getByRole("textbox", { name: "Search sessions by character or name" }).fill("nobody");
  await expect(page.getByText("Nothing matches")).toBeVisible();
});

test("the roster's EMPTY arm teaches and offers the start door; the header's + is inert with nothing open", async ({ mount, page }) => {
  await routeTrpc(page, { "refinery.listSessions": () => [], "character.list": () => ({ items: [], nextCursor: null }) });
  await mount(<RefineryRosterStory />);
  await expect(page.getByText("No refinery sessions yet")).toBeVisible();
  await expect(page.getByRole("button", { name: "Pick a character" })).toBeVisible();
  // P1-6's start door exists but is disabled while nothing is selected — pressing it would be a no-op,
  // and a live-looking control that does nothing is the defect that door was built to remove.
  await expect(page.getByRole("button", { name: "Start a new session" })).toBeDisabled();
});
