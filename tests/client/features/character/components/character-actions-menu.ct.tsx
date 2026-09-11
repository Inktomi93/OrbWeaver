// CT: the CONTEXT actions menu's CROSS-SECTION door — "Open in Refinery" (#157's third door, owner
// scope-add 2026-08-17).
//
// WHAT IT HOLDS, and why through these observables. The character feature may never import the refinery
// feature, so the jump rides the shared client seam (`#data`'s `useOpenRefinery`) and the only things a CT
// can legitimately watch are the SHELL-level outcomes that seam writes: the active section, and the open
// refinery session. Both are rendered as text by the story. The wire is the second half — whether the jump
// MINTED a session or RESUMED one is not visible in the pixels at all, and it is exactly the #79 defect
// class, so `refinery.startSession`'s call count is asserted beside the rendered landing.

import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { TrpcRoutes } from "../../../../support/node/route-trpc.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { CharacterActionsMenuStory } from "../_ct-stories.tsx";

// MINTED, never hand-written (`typeIdSchema` validates the 26-char suffix at runtime).
const CHARACTER_ID = mintTypeId(ID_PREFIX.character);
const OPEN_SESSION_ID = mintTypeId(ID_PREFIX.refinerySession);
const MINTED_SESSION_ID = mintTypeId(ID_PREFIX.refinerySession);

const FROZEN_AT = 1_750_000_000_000;

/** One roster row about this card, at a chosen status. The summary shape `refinery.listSessions` serves. */
function rosterRow(id: string, status: string): unknown {
  return {
    id,
    characterId: CHARACTER_ID,
    characterName: "Zephyrine Vale",
    characterAvatarHash: null,
    name: null,
    status,
    iterationCount: 0,
    latestVerdict: null,
    createdAt: FROZEN_AT,
    updatedAt: FROZEN_AT,
  };
}

/** The card detail the kebab reads (#838) — the archive verb needs the CURRENT state to wear the right
 *  face, and the delete confirm names the card. Fed in every test in this file, never left to
 *  routeTrpc's `null`. */
function characterDetail(archived: boolean): unknown {
  return { id: CHARACTER_ID, name: "Zephyrine Vale", archived };
}

function routes(roster: readonly unknown[]): TrpcRoutes {
  return {
    "character.get": (): unknown => characterDetail(false),
    "refinery.listSessions": (): readonly unknown[] => roster,
    // A mint that WOULD SUCCEED, scripted on purpose: with it working, the only thing separating resume
    // from mint is WHICH session the jump opens, which is the claim.
    "refinery.startSession": (): unknown => ({ id: MINTED_SESSION_ID }),
  };
}

/** Open the menu and press the door. */
async function openInRefinery(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Character actions" }).click();
  await page.getByRole("menuitem", { name: "Open in Refinery" }).click();
}

test("the CHARACTERS menu jumps straight into a refinery session on that card — the section switches and a session opens", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, routes([]));
  await mount(<CharacterActionsMenuStory menuCharacterId={CHARACTER_ID} />);

  await openInRefinery(page);

  // The SETTLED shell state: the card had no session, so one was minted and the user is standing in it.
  await expect(page.getByTestId("refinery-session")).toHaveText(`session=${MINTED_SESSION_ID}`);
  await expect(page.getByTestId("active-section")).toHaveText("section=refinery");
  // Settled snapshot: the readout above only paints after the flow resolved (it is the flow's own last write),
  // so the recording is closed by the time this reads.
  await expect.poll(async () => trpc.count("refinery.startSession")).toBe(1);
  // @orb-waive ct-no-oneshot-live-read-assert(expect): same settled barrier.
  expect(trpc.lastInput("refinery.startSession")).toEqual({ characterId: CHARACTER_ID });
});

test("the jump obeys the ONE resume-or-mint rule — a card with an open session is resumed, not duplicated (#79)", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, routes([rosterRow(OPEN_SESSION_ID, "active")]));
  await mount(<CharacterActionsMenuStory menuCharacterId={CHARACTER_ID} />);

  await openInRefinery(page);

  // The EXISTING session opened. Three doors, one flow: a launcher that minted its own way in would show
  // the scripted mint's id here, and the user's scored work would be sitting in a session nothing opens.
  await expect(page.getByTestId("refinery-session")).toHaveText(`session=${OPEN_SESSION_ID}`);
  await expect(page.getByTestId("active-section")).toHaveText("section=refinery");
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the settled readout above is the barrier (see the sibling test).
  expect(trpc.count("refinery.startSession")).toBe(0);
});

// ── The OPEN character's action vocabulary (#838) ───────────────────────────────────────────────────
//
// One artifact, ONE vocabulary. This surface used to hold its own hand-spelled item list, disjoint from the
// list row's and the bulk bar's — the three shared exactly `Delete`, and `Export card` lived only in the row
// menu of the list the user had already left, so a person with the character OPEN had no path to export her
// card at all (side-eye 2026-08-30 rail-characters-delta P1). These pins are LITERAL on purpose: an
// expectation derived from the registry would pass even if the registry itself were wrong.
//
// D121 clause D is satisfied, not bypassed: band = Import, KEBAB = Export, and its negative clause names
// "an editor surface or a chat room" — this is the CONTEXT pane's kebab, which is neither. Export renders
// here from the SAME registry entry, over the SAME `/api/export/character/:id` route and the same
// two-container submenu grammar. No second serialization path, no lifecycle chrome in the editor.

/** The base routes with the card's archived state chosen — the only axis these pins vary. */
function detailRoutes(archived: boolean): TrpcRoutes {
  return { ...routes([]), "character.get": (): unknown => characterDetail(archived) };
}

const OPEN_SCOPE_ITEMS = ["Open in Refinery", "Archive", "Duplicate", "Export card", "Convert to persona", "Set as welcome greeter", "Delete"] as const;

test("the OPEN character's kebab is the vocabulary's `open` slice, in order, destructive last", async ({ mount, page }) => {
  await routeTrpc(page, detailRoutes(false));
  await mount(<CharacterActionsMenuStory menuCharacterId={CHARACTER_ID} />);

  await page.getByRole("button", { name: "Character actions" }).click();
  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitem")).toHaveText([...OPEN_SCOPE_ITEMS]);
});

test("Export card is reachable from the OPEN character, and links BOTH containers to the owner-gated route", async ({ mount, page }) => {
  await routeTrpc(page, detailRoutes(false));
  await mount(<CharacterActionsMenuStory menuCharacterId={CHARACTER_ID} />);

  await page.getByRole("button", { name: "Character actions" }).click();
  await page.getByRole("menuitem", { name: "Export card", exact: true }).click();

  const png = page.getByRole("menuitem", { name: "With avatar (.png)", exact: true });
  await expect(png).toHaveAttribute("href", `/api/export/character/${CHARACTER_ID}`);
  await expect(png).toHaveAttribute("download", "");
  const json = page.getByRole("menuitem", { name: "Data only (.json)", exact: true });
  await expect(json).toHaveAttribute("href", `/api/export/character/${CHARACTER_ID}?format=json`);
  await expect(json).toHaveAttribute("download", "");
});

test("Archive is reachable from the OPEN character and fires the identity patch", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    ...detailRoutes(false),
    "character.update": (): unknown => ({ id: CHARACTER_ID, name: "Zephyrine Vale", archived: true }),
  });
  await mount(<CharacterActionsMenuStory menuCharacterId={CHARACTER_ID} />);

  await page.getByRole("button", { name: "Character actions" }).click();
  await page.getByRole("menuitem", { name: "Archive", exact: true }).click();

  await expect.poll(async () => trpc.count("character.update")).toBe(1);
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the settled count above is the barrier.
  expect(trpc.lastInput("character.update")).toEqual({ characterId: CHARACTER_ID, input: { archived: true } });
});

test("the archive verb wears its second face on an already-archived character", async ({ mount, page }) => {
  await routeTrpc(page, detailRoutes(true));
  await mount(<CharacterActionsMenuStory menuCharacterId={CHARACTER_ID} />);

  await page.getByRole("button", { name: "Character actions" }).click();
  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitem", { name: "Unarchive", exact: true })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Archive", exact: true })).toHaveCount(0);
});
