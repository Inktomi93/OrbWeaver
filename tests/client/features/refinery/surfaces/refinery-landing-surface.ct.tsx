// CT: the refinery LANDING — the character pick resumes the newest open session or mints a fresh one, the picker leads and exposes the whole library, and re-entering offers the open session.
// Own file: playwright-ct collides two CT files importing one story name, and this one owns RefineryStartStory.

import type { RefinerySessionId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import type { TrpcRoutes, TrpcWireOutput } from "@orb/testkit/node/route-trpc.ts";
import { routeTrpc } from "@orb/testkit/node/route-trpc.ts";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { characterListResponder, makeCharacterSummary } from "../../character/fixtures.ts";
import { RefineryStartStory } from "../_ct-stories.tsx";
import { makeRefinerySessionSummary } from "../fixtures.ts";
import { CARD, CHARACTER_ID, FROZEN_AT, freeze, ledger, preflight, sessionView, testId } from "./_refinery-content-support.ts";

// ── THE LANDING PICK: resume-or-mint (#79) ───────────────────────────────────────────────────────────
// Measured 2026-08-14: picking a character always minted, so ordinary re-entry left 3 duplicate sessions on
// one card in five minutes while the scored one sat behind a COLLAPSED roster and read as lost work. Both
// tests drive the REAL door — teaching state → character picker → a row click — and read the verdict off the
// WIRE (`startSession`'s call count) beside the pane that painted, because "which session am I in" is only
// visible in the id the surface then asks `getSession` for.

/** A second OPEN session on the same card, older — the one resume must NOT pick. */
const OLDER_OPEN_SESSION_ID = mintTypeId(ID_PREFIX.refinerySession);
/** The newest OPEN session on the card — the resume target. */
const NEWEST_OPEN_SESSION_ID = mintTypeId(ID_PREFIX.refinerySession);
/** A FINISHED session on the card (an apply set `completed`) — resumable is `active` only, so this mints. */
const COMPLETED_SESSION_ID = mintTypeId(ID_PREFIX.refinerySession);
/** The session `startSession` hands back on the mint arm. */
const MINTED_SESSION_ID = mintTypeId(ID_PREFIX.refinerySession);

const BIG_LIBRARY_SIZE = 320;
const BIG_LIBRARY = Array.from({ length: BIG_LIBRARY_SIZE }, (_, i) =>
  makeCharacterSummary({ id: `chr_ct_lib_${String(i + 1).padStart(3, "0")}`, name: `Ward ${String(i + 1).padStart(3, "0")}` }),
);
/** The LAST card in that library — the one a fixed-limit picker can never reach. */
const DEEPEST_CARD = `Ward ${String(BIG_LIBRARY_SIZE).padStart(3, "0")}`;
/** The landing's reads: the roster the resume check consults, plus the library the picker lists. The four
 *  session-scoped reads answer for WHICHEVER session gets opened, so the id the surface asked for is the
 *  observable — a fixed-session responder would paint the same pane either way. */
function landingRoutes(
  roster: TrpcWireOutput<"refinery.listSessions">,
): TrpcRoutes<"refinery.listSessions" | "character.list" | "refinery.getSession" | "refinery.listRuns" | "refinery.preflight" | "character.get"> {
  return {
    "refinery.listSessions": () => roster,
    "character.list": characterListResponder([makeCharacterSummary({ id: CHARACTER_ID, name: "Zephyrine Vale" })]),
    "refinery.getSession": (input) => sessionView(castId<RefinerySessionId>(input.sessionId)),
    "refinery.listRuns": ledger,
    "refinery.preflight": preflight,
    "character.get": () => CARD,
  };
}

/** One roster row about THIS card, at a chosen status and freshness. */
function rosterRow(
  id: string,
  status: TrpcWireOutput<"refinery.listSessions">[number]["status"],
  updatedAt: number,
): TrpcWireOutput<"refinery.listSessions">[number] {
  return makeRefinerySessionSummary({ id, characterId: CHARACTER_ID, characterName: "Zephyrine Vale", name: null, status, createdAt: FROZEN_AT, updatedAt });
}

/**
 * Walk the landing exactly as a user does: the picker IS the landing (#157 — "the landing for that is
 * wasted"), so there is no reveal step any more; the barrier is the row itself being on screen.
 *
 * The old two-step walk waited for a "Pick a character" button to go ENABLED, and that wait was doing
 * double duty as the barrier that the roster the resume-or-mint decision reads had landed. That job moved
 * INTO the decision: `useOpenRefinery` awaits the roster (`ensureQueryData`) before it decides, so the
 * #79 guarantee no longer depends on a disabled window in the UI — which is exactly why the window could
 * be deleted rather than merely hidden.
 */
async function pickZephyrine(page: Page): Promise<void> {
  await page.getByRole("option", { name: "Zephyrine Vale" }).click();
}

test("picking a character that already has an OPEN session RESUMES the newest one — no duplicate is minted (#79)", async ({ mount, page }) => {
  await freeze(page);
  const trpc = await routeTrpc(page, {
    ...landingRoutes([rosterRow(OLDER_OPEN_SESSION_ID, "active", FROZEN_AT), rosterRow(NEWEST_OPEN_SESSION_ID, "active", FROZEN_AT + 10_000)]),
    // A mint that WOULD SUCCEED, scripted on purpose. Leaving `startSession` unlisted makes the old
    // always-mint behaviour fail on a null response instead of on the count below — a red about the stub
    // rather than about the defect. With the mint working, the only thing separating the two behaviours is
    // WHICH session the pane opens, which is exactly the claim.
    "refinery.startSession": () => sessionView(MINTED_SESSION_ID),
  });
  await mount(<RefineryStartStory />);
  await pickZephyrine(page);

  // A SETTLED session pane — the resume landed the user in real work, not a blank mint. The hero value is
  // the ledger's latest score, i.e. the pane joined its reads for the session it opened.
  await expect(page.getByTestId(testId("refineryContent"))).toBeVisible();
  await expect(page.getByTestId("refinery-hero-value")).toHaveText("8.2");

  // THE DEFECT, on the wire: nothing was created.
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the settled pane above IS the barrier. The pick is synchronous — it either mutates or selects before the surface re-renders — and the pane cannot paint until `getSession` has resolved, so by the time the hero value settled every call this interaction produces is already recorded.
  expect(trpc.count("refinery.startSession")).toBe(0);
  // …and it resumed the NEWEST open session — not the older one on the same card, and not the session the
  // scripted mint above would have handed back.
  // @orb-waive ct-no-oneshot-live-read-assert(expect): same settled barrier — the recording is closed once the pane painted (see above).
  expect(trpc.inputs("refinery.getSession")).toContainEqual({ sessionId: NEWEST_OPEN_SESSION_ID });
  // @orb-waive ct-no-oneshot-live-read-assert(expect): same settled barrier.
  expect(trpc.inputs("refinery.getSession")).not.toContainEqual({ sessionId: OLDER_OPEN_SESSION_ID });
  // @orb-waive ct-no-oneshot-live-read-assert(expect): same settled barrier.
  expect(trpc.inputs("refinery.getSession")).not.toContainEqual({ sessionId: MINTED_SESSION_ID });
});

test("picking a character whose only session is FINISHED mints a fresh one and opens it", async ({ mount, page }) => {
  await freeze(page);
  const trpc = await routeTrpc(page, {
    // The roster is NOT empty — it carries a `completed` session on this very card. Resumable is the OPEN
    // status alone: an applied session is finished work, so picking the card again starts over.
    ...landingRoutes([rosterRow(COMPLETED_SESSION_ID, "completed", FROZEN_AT + 10_000)]),
    "refinery.startSession": () => sessionView(MINTED_SESSION_ID),
  });
  await mount(<RefineryStartStory />);
  await pickZephyrine(page);

  await expect(page.getByTestId(testId("refineryContent"))).toBeVisible();
  await expect(page.getByTestId("refinery-hero-value")).toHaveText("8.2");

  // @orb-waive ct-no-oneshot-live-read-assert(expect): the pane above cannot paint until the mint resolved AND `getSession` answered for what it returned, so the recording is closed at this point (the sibling resume test states the same barrier).
  expect(trpc.count("refinery.startSession")).toBe(1);
  // @orb-waive ct-no-oneshot-live-read-assert(expect): same settled barrier.
  expect(trpc.lastInput("refinery.startSession")).toEqual({ characterId: CHARACTER_ID });
  // The MINTED session is the one that opened — the completed row was never reached for.
  // @orb-waive ct-no-oneshot-live-read-assert(expect): same settled barrier.
  expect(trpc.inputs("refinery.getSession")).toContainEqual({ sessionId: MINTED_SESSION_ID });
  // @orb-waive ct-no-oneshot-live-read-assert(expect): same settled barrier.
  expect(trpc.inputs("refinery.getSession")).not.toContainEqual({ sessionId: COMPLETED_SESSION_ID });
});

// ── THE LANDING IS THE PICKER (#157, owner-ruled) ────────────────────────────────────────────────────
// "I have to go allll the way down going over a bunch of other stuff to pick a character" / "the landing
// for that is wasted". The landing used to open on a promise sentence, a three-cell teaching row, and a
// BUTTON that revealed the picker below all of it. The picker is the landing's job; the teaching material
// follows it.

test("the LANDING leads with the picker: the search box is live at first paint, ABOVE the teaching material", async ({ mount, page }) => {
  await freeze(page);
  await routeTrpc(page, landingRoutes([]));
  await mount(<RefineryStartStory />);

  // No reveal step: the search field and the rows are on screen with nothing pressed.
  const search = page.getByPlaceholder("Search characters…");
  await expect(search).toBeVisible();
  await expect(page.getByRole("option", { name: "Zephyrine Vale" })).toBeVisible();

  // …and it is FIRST. Geometry, not DOM order: the teaching row is what the owner had to scroll past.
  const searchBox = await search.boundingBox();
  const steps = await page.getByTestId(testId("refineryTeachingSteps")).boundingBox();
  expect(searchBox, "the picker's search field is laid out").not.toBeNull();
  expect(steps, "the teaching row is laid out").not.toBeNull();
  expect(searchBox?.y ?? 0, "the picker sits above the teaching material").toBeLessThan(steps?.y ?? 0);
});

test("the landing picker exposes the WHOLE library — a card past the first page is reachable, and it is a synthetic multi-page corpus", async ({
  mount,
  page,
}) => {
  await freeze(page);
  await routeTrpc(page, {
    ...landingRoutes([]),
    "character.list": characterListResponder(BIG_LIBRARY),
  });
  await mount(<RefineryStartStory />);

  // Page one landed…
  await expect(page.getByRole("option", { name: "Ward 001" })).toBeVisible();
  // …and the tail of the library is NOT on it. Under the old fixed `limit: 100` picker this stayed true
  // forever: cards 101…320 had no affordance that could reach them.
  await expect(page.getByRole("option", { name: DEEPEST_CARD })).toHaveCount(0);

  // The picker's keyboard paging walks to the end with no dead "Load more" chrome (#334). `End` moves the
  // command highlight to the loaded tail, which asks for the next page. Unrolled and barriered so a failure
  // names WHICH page stopped arriving instead of timing out only on the final card.
  const picker = page.getByRole("combobox", { name: "Start a refinery session" });
  // The walk STATES ITSELF: how far it has got against the server's own count over the same scope. Without
  // it navigation has no idea how much more remains, which is what the 3 244px scroll offered.
  await expect(page.getByText(`Showing 100 of ${BIG_LIBRARY_SIZE}`)).toBeVisible();
  await picker.press("End");
  await expect(page.getByRole("option", { name: "Ward 101" })).toBeVisible();
  await picker.press("End");
  await expect(page.getByRole("option", { name: "Ward 201" })).toBeVisible();
  await picker.press("End");
  await expect(page.getByRole("option", { name: DEEPEST_CARD })).toBeVisible();
  // Exhausted: the progress footer retires rather than implying another page exists.
  await expect(page.getByText(new RegExp(`Showing \\d+ of ${BIG_LIBRARY_SIZE}`, "u"))).toHaveCount(0);
});

test("RE-ENTERING with an open session offers it on the landing, and the door opens that session", async ({ mount, page }) => {
  await freeze(page);
  const asked: string[] = [];
  await routeTrpc(page, {
    ...landingRoutes([rosterRow(NEWEST_OPEN_SESSION_ID, "active", FROZEN_AT + 10_000), rosterRow(COMPLETED_SESSION_ID, "completed", FROZEN_AT)]),
    "refinery.getSession": (input) => {
      const { sessionId } = input;
      asked.push(sessionId);
      return sessionView(castId<RefinerySessionId>(sessionId));
    },
    "refinery.decideRewrite": () => sessionView(),
  });
  await mount(<RefineryStartStory />);
  // Only the OPEN session is offered — a finished one is history, reachable from the list.
  const resume = page.getByRole("button", { name: /^Zephyrine Vale/u });
  await expect(resume).toHaveCount(1);
  await resume.click();
  await expect(page.getByTestId(testId("refineryMasthead"))).toBeVisible();
  expect(asked).toContain(NEWEST_OPEN_SESSION_ID);
});
