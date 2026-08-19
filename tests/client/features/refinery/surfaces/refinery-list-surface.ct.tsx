// CT: the sessions ROSTER. The pin is the one the side-eye's P1-4/P1-5 could not hold on its own —
// character identity is a fact the SERVER sends, not one the client reconstructs. The old surface
// joined `character.list` (a cursor page capped at 100 rows) by `characterId`, so a session whose card
// sat past page one rendered "Character unavailable" and was invisible to the roster's own search. The
// stories below put the card OUTSIDE any page the client could fetch and assert the row names itself
// anyway — and that the surface asks `character.list` nothing at all.

import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator } from "@playwright/test";
import type { TrpcRoutes } from "../../../../support/ct/route-trpc.ts";
import { routeTrpc } from "../../../../support/ct/route-trpc.ts";
import { characterListResponder, makeCharacterSummary } from "../../character/fixtures.ts";
import { RefineryRosterStory } from "../_ct-stories.tsx";
import { makeRefinerySessionSummary } from "../fixtures.ts";

/** The one card the header's picker offers — MINTED, never a hand-written literal (`typeIdSchema`). */
const HEADER_PICK_CHARACTER_ID = mintTypeId(ID_PREFIX.character);
/** A session for the arm where CONTENT shows the pipeline rather than the landing picker. */
const OPEN_SESSION_ID = mintTypeId(ID_PREFIX.refinerySession);

// The affordance names + the copy pins, hoisted (biome `useTopLevelRegex`).
const START_A_NEW_SESSION = /^Start a new session$/;
/** The pane the phone does not have — the sentence that used to send a user there. */
const MAIN_PANE = /in the main pane/;
const PICK_TO_START = /Pick a character to start\./;

/** The iteration readout the row's subtitle prints (now inside the row content, not a trailing sibling). */
const ITERATION_READOUT = /iteration 3/;
/** The verdict word the subtitle's lead chip prints. */
const VERDICT_ACCEPT = /Accept/;
/** What a never-analyzed session says instead of wearing a chip (side-eye 2026-08-17, finding c). */
const NOT_ANALYZED = /not analyzed/;

/** Two start stamps a day apart — a same-card pair the readout must differ (P2 a11y). */
const STARTED_EARLIER = 1_700_000_000_000;
const STARTED_LATER = STARTED_EARLIER + 86_400_000;

/** The row's accessible DESCRIPTION — what a screen reader speaks after the name, resolved from
 *  `aria-describedby`. Empty when the readout is stranded in an `actions` sibling (the old surface). */
function accessibleDescriptionOf(row: Locator): Promise<string> {
  return row.evaluate((el) => {
    const ids = (el.getAttribute("aria-describedby") ?? "").split(" ").filter((id) => id.length > 0);
    return ids
      .map((id) => el.ownerDocument.getElementById(id)?.textContent ?? "")
      .join(" ")
      .trim();
  });
}

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

/** A roster with nothing in it, plus the one card its start door offers. */
function emptyRosterRoutes(): TrpcRoutes {
  return {
    "refinery.listSessions": (): unknown[] => [],
    "character.list": characterListResponder([makeCharacterSummary({ id: HEADER_PICK_CHARACTER_ID, name: "Zephyrine Vale" })]),
  };
}

test("the roster's EMPTY arm teaches, and its CTA is a real door — it opens the picker instead of doing nothing", async ({ mount, page }) => {
  await routeTrpc(page, emptyRosterRoutes());
  await mount(<RefineryRosterStory />);
  await expect(page.getByText("No refinery sessions yet")).toBeVisible();

  // THE DEFECT, as an affordance (side-eye 2026-08-19 P1-1). "Pick a character" called
  // `clearRefinerySelection()`, and in the arm it renders in no selection can exist — so the press was an
  // unconditional no-op and the shell was byte-identical before and after it. It is the SAME dead-control
  // defect the owner ruled on for the `+` (#157), left standing in the same file. The pin is the picker
  // appearing on the press: against the old source the click produces no picker at all.
  await page.getByRole("button", { name: "Pick a character" }).click();
  await expect(page.getByRole("option", { name: "Zephyrine Vale" })).toBeVisible();
});

test("the copy names the ACT, not a pane the phone does not have", async ({ mount, page }) => {
  await routeTrpc(page, emptyRosterRoutes());
  await mount(<RefineryRosterStory mobile={true} />);
  // "Pick a character in the main pane to start" pointed at a region that does not exist on a phone (this
  // roster IS the screen there) and, on a desktop, away from the button directly beneath the sentence.
  await expect(page.getByText(MAIN_PANE)).toHaveCount(0);
  await expect(page.getByText(PICK_TO_START)).toBeVisible();
});

test("the header's + is SUPPRESSED where CONTENT already shows the landing picker, and LIVE where it does not", async ({ mount, page }) => {
  await routeTrpc(page, emptyRosterRoutes());
  await mount(<RefineryRosterStory />);
  await expect(page.getByText("No refinery sessions yet")).toBeVisible();

  // DESKTOP, nothing selected: the landing mounts the full-library picker in CONTENT, so a `+` opening a
  // second identical one is the duplicate door (side-eye 2026-08-19 P1-3). Suppressed, not `disabled` —
  // a visible dead control is the #157 defect itself.
  await expect(page.getByRole("button", { name: START_A_NEW_SESSION })).toHaveCount(0);
});

test("…and on a PHONE with nothing selected the + SURVIVES — there the roster is the whole screen and CONTENT is not rendered", async ({ mount, page }) => {
  await routeTrpc(page, emptyRosterRoutes());
  await mount(<RefineryRosterStory mobile={true} />);

  // The one-shell rule (`resolvePanelMode`'s `listIsScreen` arm): suppressing the glyph here would leave a
  // phone with a non-empty roster no start door at all. It is still a real door, not an inert glyph.
  const start = page.getByRole("button", { name: START_A_NEW_SESSION });
  await expect(start).toBeEnabled();
  await start.click();
  await expect(page.getByRole("option", { name: "Zephyrine Vale" })).toBeVisible();
});

test("…and with a SESSION open the + is back on the desktop too — the landing is replaced by the pipeline", async ({ mount, page }) => {
  await routeTrpc(page, emptyRosterRoutes());
  await mount(<RefineryRosterStory selectedSessionId={OPEN_SESSION_ID} />);
  await expect(page.getByRole("button", { name: START_A_NEW_SESSION })).toBeEnabled();
});

test("the row folds the readout into its accessible DESCRIPTION — a screen reader hears more than the name (P2 a11y)", async ({ mount, page }) => {
  await routeTrpc(page, {
    "refinery.listSessions": () => [makeRefinerySessionSummary({ characterName: "Zephyrine Vale", name: null, iterationCount: 3, latestVerdict: "ACCEPT" })],
    "character.list": emptyCharacterPage,
  });
  await mount(<RefineryRosterStory />);
  const row = page.getByRole("button", { name: "Zephyrine Vale" });
  await expect(row).toBeVisible();
  // The NAME is the character; the readout rides the DESCRIPTION (aria-describedby → subtitle), where the
  // old `actions`-slot readout never reached — so a screen reader no longer hears the bare name alone.
  await expect(row).toHaveAccessibleName("Zephyrine Vale");
  await expect(row).toHaveAccessibleDescription(ITERATION_READOUT);
  await expect(row).toHaveAccessibleDescription(VERDICT_ACCEPT);
});

test("a session with NO verdict wears no chip at all — the state is stated in the quiet subtitle, not shouted over the row's name", async ({ mount, page }) => {
  await routeTrpc(page, {
    "refinery.listSessions": (): unknown[] => [
      makeRefinerySessionSummary({ characterName: "Zephyrine Vale", name: null, iterationCount: 3, latestVerdict: null }),
    ],
    "character.list": emptyCharacterPage,
  });
  await mount(<RefineryRosterStory />);

  const row = page.getByRole("button", { name: "Zephyrine Vale" });
  await expect(row).toBeVisible();
  // The absent arm carries NO tone chip: `RefineryChip` always stamps `data-tone`, so its absence under
  // this row is the rendered proof that a filled, uppercase pill is no longer drawn for "not run yet".
  await expect(row.locator("[data-tone]"), "no verdict chip on a session that was never analyzed").toHaveCount(0);
  // …and the fact is not LOST with the chip — it is spoken in the row's description, in the same register
  // as the iteration and the stamp beside it, and in the user's terms rather than the wire field's.
  await expect(row).toHaveAccessibleDescription(NOT_ANALYZED);
  await expect(row).toHaveAccessibleName("Zephyrine Vale");
});

test("two sessions on ONE card are distinguishable — the start stamp differs them, name and all (P2 a11y)", async ({ mount, page }) => {
  await routeTrpc(page, {
    "refinery.listSessions": () => [
      makeRefinerySessionSummary({
        id: "rfs_earlier",
        characterName: "Elias Thorn",
        name: null,
        iterationCount: 0,
        latestVerdict: null,
        createdAt: STARTED_EARLIER,
      }),
      makeRefinerySessionSummary({
        id: "rfs_later",
        characterName: "Elias Thorn",
        name: null,
        iterationCount: 0,
        latestVerdict: null,
        createdAt: STARTED_LATER,
      }),
    ],
    "character.list": emptyCharacterPage,
  });
  await mount(<RefineryRosterStory />);
  const rows = page.getByRole("button", { name: "Elias Thorn" });
  await expect(rows).toHaveCount(2);
  const first = await accessibleDescriptionOf(rows.nth(0));
  const second = await accessibleDescriptionOf(rows.nth(1));
  // Same card, same iteration, same (no) verdict — under the old surface both rows were "Elias Thorn" with
  // an empty description, indistinguishable. The start stamp now tells them apart, in the tree and on screen.
  expect(first.length, "the row carries a description at all").toBeGreaterThan(0);
  expect(first).not.toBe(second);
});
