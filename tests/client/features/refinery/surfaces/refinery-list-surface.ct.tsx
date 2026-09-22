// CT: the sessions ROSTER. The pin is the one the side-eye's P1-4/P1-5 could not hold on its own —
// character identity is a fact the SERVER sends, not one the client reconstructs. The old surface
// joined `character.list` (a cursor page capped at 100 rows) by `characterId`, so a session whose card
// sat past page one rendered "Character unavailable" and was invisible to the roster's own search. The
// stories below put the card OUTSIDE any page the client could fetch and assert the row names itself
// anyway — and that the surface asks `character.list` nothing at all.

import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator } from "@playwright/test";
import type { TrpcRoutes, TrpcWireOutput } from "../../../../support/node/route-trpc.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { characterListResponder, makeCharacterSummary } from "../../character/fixtures.ts";
import { RefineryLandingStory, RefineryRosterStory } from "../_ct-stories.tsx";
import { makeRefinerySessionSummary } from "../fixtures.ts";

/** The one card the header's picker offers — MINTED, never a hand-written literal (`typeIdSchema`). */
const HEADER_PICK_CHARACTER_ID = mintTypeId(ID_PREFIX.character);
/** A session for the arm where CONTENT shows the pipeline rather than the landing picker. */
const OPEN_SESSION_ID = mintTypeId(ID_PREFIX.refinerySession);

// The affordance names and copy pins.
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
type CharacterPage = TrpcWireOutput<"character.list">;
function emptyCharacterPage(): CharacterPage {
  return { items: [], nextCursor: null, totalCount: 0 };
}

/** A roster whose one session is about a card NO client page contains. */
const PAST_THE_PAGE: TrpcRoutes<"refinery.listSessions" | "character.list"> = {
  "refinery.listSessions": () => [makeRefinerySessionSummary({ characterName: "Zephyrine Vale", name: null, iterationCount: 3, latestVerdict: "ACCEPT" })],
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
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the row above is rendered, and the roster is a SUSPENSE surface — it cannot paint until every query it declared has resolved. A `character.list` this surface still owed would have suspended the row, so a settled row IS the barrier for "it asked for nothing else".
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
function emptyRosterRoutes(): TrpcRoutes<"refinery.listSessions" | "character.list"> {
  return {
    "refinery.listSessions": () => [],
    "character.list": characterListResponder([makeCharacterSummary({ id: HEADER_PICK_CHARACTER_ID, name: "Zephyrine Vale" })]),
  };
}

test("on a PHONE the roster's EMPTY-arm CTA is a real door — it opens the picker popover (no CONTENT picker exists there)", async ({ mount, page }) => {
  await routeTrpc(page, emptyRosterRoutes());
  // Mobile: CONTENT is not rendered (this roster is the screen, `resolvePanelMode`'s `listIsScreen` arm),
  // so the empty-state CTA is the ONLY picker — it stays the anchored popover it has always been. The #307
  // desktop change below does not touch this arm; the P1-1 ruling (the CTA must never be a dead no-op)
  // holds here through the popover.
  await mount(<RefineryRosterStory mobile={true} />);
  await expect(page.getByText("No refinery sessions yet")).toBeVisible();
  await page.getByRole("button", { name: "Pick a character" }).click();
  await expect(page.getByRole("option", { name: "Zephyrine Vale" })).toBeVisible();
});

// ── #307: THE DUPLICATE-DOOR'S LAST MOUTH (the #284 sweep) ───────────────────────────────────────────
// On a desktop landing with 0 sessions, CONTENT already mounts the full-library landing picker. The
// empty-state CTA used to be a `StartSessionDoor` popover in EVERY regime, so on desktop it anchored a
// SECOND identical 100-row picker over the one already on screen. The fix: on desktop the CTA focuses the
// mounted CONTENT picker instead of opening a duplicate; the popover survives only where CONTENT has no
// picker (a phone, or a session open). This is the only mount that can see it — the roster's own
// list-only story has no CONTENT picker to duplicate.

/** The empty roster BESIDE the CONTENT landing picker — the same routes, on the full-landing mount. The
 *  picker lists one card so the search box and its rows are real. */
function fullLandingRoutes(): TrpcRoutes<"refinery.listSessions" | "character.list"> {
  return {
    "refinery.listSessions": () => [],
    "character.list": characterListResponder([makeCharacterSummary({ id: HEADER_PICK_CHARACTER_ID, name: "Zephyrine Vale" })]),
  };
}

/** The picker's search box, by its placeholder — BOTH the CONTENT landing picker and the `StartSessionDoor`
 *  popover render one with this exact placeholder, so its COUNT is the duplicate-door discriminator: one on
 *  the desktop landing means the CTA focused the mounted picker; two means it opened a second. */
const PICKER_SEARCH = /^Search characters…$/;

test("#307: on the desktop landing the empty-state CTA focuses the picker CONTENT already shows — it does NOT open a second one", async ({ mount, page }) => {
  await routeTrpc(page, fullLandingRoutes());
  await mount(<RefineryLandingStory />);
  await expect(page.getByText("No refinery sessions yet")).toBeVisible();

  // Exactly ONE picker before the press — CONTENT's landing picker. (Its search box settles once the
  // library page lands; barrier on it so the count below reads a settled plane, not a mid-suspense one.)
  const searchBoxes = page.getByPlaceholder(PICKER_SEARCH);
  await expect(searchBoxes).toHaveCount(1);

  await page.getByRole("button", { name: "Pick a character" }).click();

  // THE DEFECT, on the wire of the DOM: against the old source the press anchored a `StartSessionDoor`
  // popover carrying a second identical picker, so this became two. One picker on one plane is the fix.
  await expect(searchBoxes).toHaveCount(1);
  // …and the press was not a no-op (the P1-1 ruling survives): the CTA handed focus to the mounted picker's
  // search field, so a user who pressed it is now typing in the library rather than staring at a dead button.
  await expect(searchBoxes).toBeFocused();
});

// ── #308: THE LANDING'S READ COUNT (owner: "hunt it down") ───────────────────────────────────────────
// The motion audit read `region:content 36 updates` (a `__orb` RENDER census, not a network count) and a
// dev console showing `character.list` "twice", and prescribed deduping two `character.list` reads. This
// is the network re-derivation the standing lane fact demands before any such dedupe: on the faithful
// desktop landing, over PRODUCTION React (playwright-ct — StrictMode inert, i.e. no dev double-invoke),
// `character.list` is fetched ONCE (the CONTENT picker) and `refinery.listSessions` ONCE (the roster,
// shared by the header + surface + selection-title through one cache key). They are DIFFERENT endpoints —
// there is no shared key to dedupe onto — and neither duplicates. The "twice" seen in the dev console is
// the dev-only StrictMode double-fetch, not an app defect.
test("#308: the desktop landing fetches character.list once and listSessions once — the reads are distinct, neither duplicates", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, fullLandingRoutes());
  await mount(<RefineryLandingStory />);

  // Settle the whole landing: the empty roster arm AND the picker's first page. Both are the barrier — the
  // roster is a suspense surface (it cannot paint its empty state until `listSessions` resolved) and the
  // picker's search box appears only once `character.list`'s first page lands. Past both, every request the
  // landing produces is recorded.
  await expect(page.getByText("No refinery sessions yet")).toBeVisible();
  await expect(page.getByPlaceholder(PICKER_SEARCH)).toBeVisible();

  // @orb-waive ct-no-oneshot-live-read-assert(expect): the two settled arms above are the barrier — a read either surface still owed would have suspended the arm that asserts here.
  expect(trpc.count("character.list")).toBe(1);
  // @orb-waive ct-no-oneshot-live-read-assert(expect): same settled barrier — header, surface and selection-title share one `listSessions` key.
  expect(trpc.count("refinery.listSessions")).toBe(1);
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
  // The POSITIVE control for the absent-chip pin below: an ANALYZED session DOES wear the chip, and its
  // render-hint tone now rides `data-hint-tone` (#1097 — `data-tone` became @orb/ui's, stamped by the
  // `<Text>` recipe through the variant-axis seam, and the ui-audit walker reads it as an authored RECIPE
  // arm; a feature word there was two vocabularies under one name).
  const chip = row.getByTestId("refinery-chip");
  await expect(chip).toHaveCount(1);
  await expect(chip).toHaveAttribute("data-hint-tone", "good");
  // …and the seam's own stamp is on that same element, in the RECIPE's vocabulary — the two channels are
  // readable apart, which is the whole point of the rename.
  await expect(chip).toHaveAttribute("data-tone", "default");
});

test("a session with NO verdict wears no chip at all — the state is stated in the quiet subtitle, not shouted over the row's name", async ({ mount, page }) => {
  await routeTrpc(page, {
    "refinery.listSessions": () => [makeRefinerySessionSummary({ characterName: "Zephyrine Vale", name: null, iterationCount: 3, latestVerdict: null })],
    "character.list": emptyCharacterPage,
  });
  await mount(<RefineryRosterStory />);

  const row = page.getByRole("button", { name: "Zephyrine Vale" });
  await expect(row).toBeVisible();
  // The absent arm carries NO tone chip: `RefineryChip` stamps its own typed test id, so its absence
  // under this row is the rendered proof that a filled, uppercase pill is no longer drawn for "not run
  // yet". It keyed on a bare `[data-tone]` until #1097: `<Text>` now emits its resolved recipe `tone` arm
  // as `data-tone` through the @orb/ui variant-axis seam, so that selector matches the row's NAME and
  // SUBTITLE too and could no longer state anything about the chip.
  await expect(row.getByTestId("refinery-chip"), "no verdict chip on a session that was never analyzed").toHaveCount(0);
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

// ── #1206: the LIST band rides the shared `ListPaneHeader`, not a hand-rolled `Text` pair ───────────────
// Refinery's own band was the ONE holdout after `ListPaneHeader` was minted (chat/corpus/analytics), which
// also meant it never carried the `LIST_PANE_TITLE_ID` landmark `panel-chrome.tsx`'s `aria-labelledby`
// expects for the LIST `<aside>`. Pinning both: the composite's own title heading resolves the id, and the
// title/count read as the shared band would render them (`ListPaneHeader`'s own CT owns the generic shape).
test("the LIST band renders through ListPaneHeader and resolves the LIST_PANE_TITLE_ID landmark (#1206)", async ({ mount, page }) => {
  await routeTrpc(page, {
    "refinery.listSessions": () => [makeRefinerySessionSummary({ characterName: "Zephyrine Vale", name: null, iterationCount: 3, latestVerdict: "ACCEPT" })],
    "character.list": emptyCharacterPage,
  });
  const component = await mount(<RefineryRosterStory />);

  const title = component.locator('[data-slot="list-pane-title"]');
  await expect(title).toHaveText(/Sessions.*1/s);
  await expect(title).toHaveAttribute("id", "orb-list-pane-title");
});
