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
import type { TrpcRoutes } from "../../../../support/ct/route-trpc.ts";
import { routeTrpc } from "../../../../support/ct/route-trpc.ts";
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

function routes(roster: readonly unknown[]): TrpcRoutes {
  return {
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
  // ONESHOT-OK: the readout above only paints after the flow resolved (it is the flow's own last write),
  // so the recording is closed by the time this reads.
  expect(trpc.count("refinery.startSession")).toBe(1);
  // ONESHOT-OK: same settled barrier.
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
  // ONESHOT-OK: the settled readout above is the barrier (see the sibling test).
  expect(trpc.count("refinery.startSession")).toBe(0);
});
