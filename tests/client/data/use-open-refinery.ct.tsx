// CT: `useOpenRefinery` — the ONE client seam for entering a refinery session on a card (#157, owner-ruled
// 2026-08-17: "one start-session-with-character flow, three doors").
//
// It lives in `#data` because the CHARACTERS section launches refinery sessions now and a feature may never
// import another feature — the `use-start-chat.ct.tsx` sibling pins the same shape for the same reason.
// Its three jobs are each silent when they break, so each is pinned: the resume-or-mint DECISION (#79 — the
// duplicate-session defect this rule exists to prevent), the NAVIGATION it performs, and the ORDERING that
// makes the decision safe (the roster read is AWAITED, not gated on).
//
// A CT, not a unit test: the hook composes `createEntityMutation` + the real tRPC client + `#state` module
// actions, and its whole observable surface is what a mounted component sees.

import type { CharacterId } from "@orb/kit/ids";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import type { TrpcRoutes } from "../../support/node/route-trpc.ts";
import { routeTrpc } from "../../support/node/route-trpc.ts";
import { OpenRefineryStory } from "./_ct-stories.tsx";

// MINTED, never hand-written (`typeIdSchema` validates the 26-char suffix at runtime).
const CHARACTER_ID: CharacterId = mintTypeId(ID_PREFIX.character);
const OTHER_CHARACTER_ID: CharacterId = mintTypeId(ID_PREFIX.character);
const OLDER_OPEN_SESSION = mintTypeId(ID_PREFIX.refinerySession);
const NEWEST_OPEN_SESSION = mintTypeId(ID_PREFIX.refinerySession);
const COMPLETED_SESSION = mintTypeId(ID_PREFIX.refinerySession);
const MINTED_SESSION = mintTypeId(ID_PREFIX.refinerySession);

const FROZEN_AT = 1_750_000_000_000;

/** One `refinery.listSessions` row, at a chosen card / status / freshness. */
function rosterRow(row: { id: string; characterId: CharacterId; status: string; updatedAt: number }): unknown {
  return {
    id: row.id,
    characterId: row.characterId,
    characterName: "Zephyrine Vale",
    characterAvatarHash: null,
    name: null,
    status: row.status,
    iterationCount: 0,
    latestVerdict: null,
    createdAt: FROZEN_AT,
    updatedAt: row.updatedAt,
  };
}

/** A mint that WOULD SUCCEED is scripted in every case on purpose: with the mint working, the only thing
 *  separating resume from mint is WHICH session the flow opens, which is the claim. Leaving it unlisted
 *  would make the resume tests fail on a null response instead of on the count. */
function routes(roster: readonly unknown[]): TrpcRoutes {
  return {
    "refinery.listSessions": (): readonly unknown[] => roster,
    "refinery.startSession": (): unknown => ({ id: MINTED_SESSION }),
  };
}

test("a card with NO session mints one, opens it, and lands the rail on Refinery", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, routes([]));
  const component = await mount(<OpenRefineryStory characterId={CHARACTER_ID} />);
  const state = component.getByTestId("open-refinery-state");

  // At rest the shell is on HOME (the launcher, D62 P4) — the section switch is part of what this seam does.
  await expect(state).toHaveText("session=none section=home pending=false");
  await component.getByRole("button", { name: "open refinery" }).click();

  await expect(state).toHaveText(`session=${MINTED_SESSION} section=refinery pending=false`);
  // ONESHOT-OK: the settled readout above is the flow's own LAST write, so the recording is closed here.
  expect(trpc.count("refinery.startSession")).toBe(1);
  // ONESHOT-OK: same settled barrier.
  expect(trpc.lastInput("refinery.startSession")).toEqual({ characterId: CHARACTER_ID });
});

test("a card with an OPEN session resumes the NEWEST one and mints nothing (#79)", async ({ mount, page }) => {
  const trpc = await routeTrpc(
    page,
    routes([
      rosterRow({ id: OLDER_OPEN_SESSION, characterId: CHARACTER_ID, status: "active", updatedAt: FROZEN_AT }),
      rosterRow({ id: NEWEST_OPEN_SESSION, characterId: CHARACTER_ID, status: "active", updatedAt: FROZEN_AT + 10_000 }),
      // A newer session on a DIFFERENT card — the decision is per-card, and a roster-order shortcut
      // ("take the first row") would open this one.
      rosterRow({ id: MINTED_SESSION, characterId: OTHER_CHARACTER_ID, status: "active", updatedAt: FROZEN_AT + 99_000 }),
    ]),
  );
  const component = await mount(<OpenRefineryStory characterId={CHARACTER_ID} />);
  await component.getByRole("button", { name: "open refinery" }).click();

  await expect(component.getByTestId("open-refinery-state")).toHaveText(`session=${NEWEST_OPEN_SESSION} section=refinery pending=false`);
  // THE DEFECT, on the wire: nothing was created. Measured 2026-08-14 before this rule existed — 3
  // duplicate sessions on one card in five minutes, the scored work sitting behind a collapsed roster.
  // ONESHOT-OK: the settled readout above is the barrier (see the sibling test).
  expect(trpc.count("refinery.startSession")).toBe(0);
});

test("a FINISHED session is not resumable — picking the card again starts over", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, routes([rosterRow({ id: COMPLETED_SESSION, characterId: CHARACTER_ID, status: "completed", updatedAt: FROZEN_AT })]));
  const component = await mount(<OpenRefineryStory characterId={CHARACTER_ID} />);
  await component.getByRole("button", { name: "open refinery" }).click();

  // `completed` means an apply took the snapshot; `abandoned` means it was discarded. Neither reopens.
  await expect(component.getByTestId("open-refinery-state")).toHaveText(`session=${MINTED_SESSION} section=refinery pending=false`);
  // ONESHOT-OK: same settled barrier.
  expect(trpc.count("refinery.startSession")).toBe(1);
});

test("the roster is AWAITED, not gated on — a first-ever click still resumes rather than duplicating", async ({ mount, page }) => {
  // THE ORDERING PIN. The decision's whole input is the roster, and the landing used to protect that by
  // DISABLING its pick button until `listSessions` landed — a dead-looking primary in the exact first
  // frames a cold-open user is looking at, which is the sibling of the #157 defect. The guarantee moved
  // into the flow: it awaits the read at CLICK time. The delay below makes the unlanded window real and
  // wide, and the click happens inside it — under a read-what-is-in-cache implementation this test opens
  // the scripted MINT, because the cache holds nothing yet.
  // Playwright resolves routes LIFO (last-registered wins) — the delaying route below MUST be
  // registered AFTER routeTrpc, or routeTrpc (registered second, winning the match) answers every
  // request immediately and this 400ms hold never runs at all (#643/route-trpc-lifo-order).
  const trpc = await routeTrpc(page, routes([rosterRow({ id: NEWEST_OPEN_SESSION, characterId: CHARACTER_ID, status: "active", updatedAt: FROZEN_AT })]));
  await page.route("**/api/trpc/refinery.listSessions**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 400));
    await route.fallback();
  });
  const component = await mount(<OpenRefineryStory characterId={CHARACTER_ID} />);

  // No waiting for anything to land: the door is live from the first frame, which is the ruling.
  await component.getByRole("button", { name: "open refinery" }).click();

  await expect(component.getByTestId("open-refinery-state")).toHaveText(`session=${NEWEST_OPEN_SESSION} section=refinery pending=false`);
  // ONESHOT-OK: same settled barrier.
  expect(trpc.count("refinery.startSession")).toBe(0);
});
