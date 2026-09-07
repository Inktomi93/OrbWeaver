// CT: the Characters CONTENT pane AT REST — the landing (#864).
//
// WHAT THIS FILE REPLACED, and why the old pins are gone rather than kept beside the new ones: the pane used
// to be an `EmptyState` ("Choose a character" + one instruction), and its two tests pinned the two things
// that could vary about that caption — the #446 list-door footnote and #520's single New door. Side-eye's
// Characters delta pass ruled the caption itself out ("a 917×750 hole with a caption in it"), so a test that
// asserts the caption is a test for a surface the product no longer has. BOTH RULINGS SURVIVE AND ARE
// RE-PINNED HERE against the landing instead — the footnote still renders exactly while the list is off
// screen (`LIST_OFF_SCREEN_HINT`, one spelling), and the plane still carries exactly one `New` door.
//
// THE PINS, and what each would catch:
//  · the caption is GONE and the shelves are what the pane shows — the whole finding;
//  · APPLICABILITY: a shelf with nothing in it renders NOTHING, never an empty room. Driven from PLANTED
//    fixtures on both sides (populated / empty), because "no starred shelf" is only evidence if the same
//    mount would have drawn one;
//  · the FRESH-INSTALL arm — cards exist, nothing chatted, nothing starred;
//  · ONE New door, docked vs collapsed (#520/#532), and `Just added` only in the collapsed arm;
//  · a face carries "· N chats" (#865's `chatCount` on the wire is what makes that line possible at all);
//  · pressing a Recently-chatted face RESUMES her newest room, while every other shelf's face OPENS her (#1662);
//  · 430 + coarse: three columns of faces, and the doors, which is the only arm a phone can reach this pane in.
//
// THE STUB DISPATCHES ON `sort` (this file's own responder, not the shared `characterListResponder`): the
// landing issues THREE reads that differ by order and predicate, and a single-array stub would answer all
// three with page one of the same order — which would let a shelf reading the wrong keyset pass. The shared
// responder is left alone deliberately: its header states "ordering is the ARRAY's", and thirty-one other
// mounts are written against that.

import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator } from "@playwright/test";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { VIEWER_AMBIENT_ROUTES } from "../../fixtures.ts";
import { CharacterLibraryWelcomeListModeStory } from "../_ct-stories.tsx";
import type { CharacterSummaryFixture } from "../fixtures.ts";
import { characterListResponder, makeCharacterSummary } from "../fixtures.ts";

/** The caption the landing replaced — pinned by its ABSENCE, which is the finding. */
const OLD_CAPTION = /Choose a character/u;
const LIST_OFF_SCREEN_HINT = /Show list panel in the top bar/u;
/** #520's docked arm: the lead points AT the band's door by its visible label, never mints a second one. */
const BAND_DOOR = /New at the top of the list/u;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
/** A FROZEN reference instant (`test-determinism` — no ambient `Date.now()` in a test). Every fixture below
 *  is an offset from it, so the shelves' ORDER and the "· N chats" stamps are the same on every run.
 *
 *  The one thing this cannot pin is the week's-additions foot line: it compares `createdAt` against
 *  `timeLib.now()`, which is the browser's real clock inside the mounted app and has no injection seam in a
 *  CT (`timeLib` is a module singleton). Rows anchored here are years old, so that line is deliberately
 *  ABSENT from these mounts and takes its rendered receipt from `snap --isolated` instead — stating the
 *  limit rather than reaching for an ambient clock that would make every other pin here time-dependent. */
const FROZEN_AT = 1_750_000_000_000;
const NOW = FROZEN_AT;

function character(name: string, overrides: Partial<CharacterSummaryFixture> = {}): CharacterSummaryFixture {
  return makeCharacterSummary({ id: `char_${name.toLowerCase().replaceAll(" ", "_")}`, name, ...overrides });
}

const SABINE = character("Sabine Veyra", {
  starred: true,
  chatCount: 4,
  lastChattedAt: NOW - 3 * HOUR_MS,
  lastChatId: "chat_sabine_newest",
  elevatorPitch: "Warden of the outer stair; wary, precise, owes a debt.",
  createdAt: NOW - 2 * DAY_MS,
});
const ELIAS = character("Elias Thorn", {
  chatCount: 2,
  lastChattedAt: NOW - DAY_MS,
  lastChatId: "chat_elias_newest",
  elevatorPitch: "A scribe who talks to lanterns.",
  createdAt: NOW - 3 * DAY_MS,
});
const KOHAKU = character("Kohaku", {
  starred: true,
  chatCount: 7,
  lastChattedAt: NOW - 2 * DAY_MS,
  lastChatId: "chat_kohaku_newest",
  elevatorPitch: "Shrine fox, bored of prayers.",
  createdAt: NOW - 40 * DAY_MS,
});
const NIKO = character("Niko", {
  chatCount: 1,
  lastChattedAt: NOW - 5 * DAY_MS,
  lastChatId: "chat_niko_newest",
  elevatorPitch: "Courier. Never late, never early.",
  createdAt: NOW - 41 * DAY_MS,
});
/** Never chatted, never starred — the row the recent SORT sinks to its tail and the shelf must drop. */
const AVEL = character("Avel the Quiet", { elevatorPitch: "Says four words a day. Chooses them.", createdAt: NOW - DAY_MS });

/** The seeded roster: shipped, nothing chatted, nothing starred. */
const SHIPPED = ["Odalys", "Tobias Brand", "Marisol Reyes"].map((name, index) =>
  character(name, { provenance: "shipped", elevatorPitch: `${name} in one line.`, createdAt: NOW - (index + 1) * DAY_MS }),
);

/**
 * A `character.list` stub that answers each SORT from its own pre-ordered array — the shape the server
 * produces, where each sort is its own keyset. Everything else (the `starred`/`archived` predicates, `limit`)
 * rides the shared input-aware responder, so those semantics stay the real ones.
 */
function landingRoutes(by: {
  readonly recent: readonly CharacterSummaryFixture[];
  readonly newest: readonly CharacterSummaryFixture[];
}): Readonly<Record<string, unknown>> {
  const recent = characterListResponder(by.recent);
  const newest = characterListResponder(by.newest);
  return {
    ...VIEWER_AMBIENT_ROUTES,
    "character.list": (input: unknown): unknown => ((input as { sort?: string }).sort === "newest" ? newest(input) : recent(input)),
  };
}

/** A shelf, by the accessible name its grid carries. */
function shelf(component: Locator, name: string): Locator {
  return component.getByRole("list", { name });
}

test("#864 the pane at rest is the LANDING — the caption is gone and the shelves are what it shows", async ({ mount, page }) => {
  await routeTrpc(page, landingRoutes({ recent: [SABINE, ELIAS, KOHAKU, NIKO, AVEL], newest: [AVEL, SABINE, ELIAS, KOHAKU, NIKO] }));
  const pane = await mount(<CharacterLibraryWelcomeListModeStory />);

  await expect(pane.getByRole("heading", { name: "Pick up where you left off" })).toBeVisible();
  await expect(pane.getByText(OLD_CAPTION)).toHaveCount(0);

  // The faces the shelf shows are the CHATTED ones — `Avel the Quiet` is in the same recent page (the sort
  // sinks a never-chatted row, it does not drop it) and must not appear on a shelf claiming otherwise.
  const recentShelf = shelf(pane, "Recently chatted");
  await expect(recentShelf.getByRole("button")).toHaveCount(4);
  await expect(recentShelf.getByRole("button", { name: "Resume the chat with Elias Thorn" })).toBeVisible();
  await expect(recentShelf.getByRole("button", { name: /Avel the Quiet/u })).toHaveCount(0);

  // #865's two wire fields, rendered: the thread count on the stamp line and the pitch as the caption.
  await expect(recentShelf.getByText(/· 4 chats/u)).toBeVisible();
  await expect(recentShelf.getByText(/· 1 chat$/u)).toBeVisible();
  await expect(recentShelf.getByText("Shrine fox, bored of prayers.")).toBeVisible();

  // The STARRED shelf prints the server's census for the starred scope, not the face count.
  await expect(pane.getByRole("heading", { name: "Starred · 2" })).toBeVisible();
  await expect(shelf(pane, "Starred · 2").getByRole("button")).toHaveCount(2);
});

// #1134 (side-eye 2026-09-02 F5). THE THREE READS MUST BE ONE WAVE, and the shape of the defect is why
// this is pinned at the network boundary rather than by counting queries: three `useSuspenseQuery` calls in
// one body CANNOT fire together — the first suspends before React reaches the second hook — so the reads
// serialized into a waterfall (measured live on main: recent →01.227 ←01.259, starred →01.260 ←01.361,
// newest →01.362 ←01.369). `__orb.queries()`/`recorder.count()` are blind to it: three procedure calls
// happen either way. What CHANGES is whether a response lands before the last request goes out.
//
// The assertion is therefore ordering, not a count, so it holds whichever way `httpBatchLink` decides to
// pack them: one batched request trivially satisfies it, three concurrent ones satisfy it, and only a
// waterfall violates it. Barriered on the SETTLED pane (the shelf is rendered) before the log is read.
test("#1134 the landing's three reads go out as one wave — no response lands before the last request", async ({ mount, page }) => {
  const events: string[] = [];
  const isLanding = (url: string): boolean => url.includes("character.list");
  page.on("request", (request) => {
    if (isLanding(request.url())) {
      events.push("out");
    }
  });
  page.on("requestfinished", (request) => {
    if (isLanding(request.url())) {
      events.push("in");
    }
  });

  await routeTrpc(page, landingRoutes({ recent: [SABINE, ELIAS, KOHAKU], newest: [SABINE, ELIAS, KOHAKU] }));
  const pane = await mount(<CharacterLibraryWelcomeListModeStory />);
  await expect(shelf(pane, "Recently chatted").getByRole("button", { name: "Resume the chat with Kohaku, starred" })).toBeVisible();

  expect(events.filter((event) => event === "out").length, "the probe measured nothing — no read reached the wire").toBeGreaterThan(0);
  expect(events.indexOf("in"), `a response landed while reads were still going out: ${events.join(",")}`).toBe(events.lastIndexOf("out") + 1);
});

// #1662 (owner-ruled 2026-09-05) — THE RECENTLY-CHATTED FACE IS A RESUME DOOR, and the two halves of that
// ruling are pinned together here because either alone is satisfiable by a bug: a face that ANNOUNCES resume
// and still opens the editor is the same defect one layer down, and a face that resumes while announcing
// only "<character>" is the `duplicate-action-door` pairing this closes (the list row one pane over offers a
// button by exactly that name). The other shelves are the CONTROL: same component, same mount, same press —
// Starred still opens the character, so "the door moved" is a statement about the RESUME shelf and not about
// the cell.
test("#1662 pressing a Recently-chatted face RESUMES her newest room; a Starred face still opens her", async ({ mount, page }) => {
  await routeTrpc(page, landingRoutes({ recent: [SABINE, ELIAS], newest: [SABINE, ELIAS] }));
  const pane = await mount(<CharacterLibraryWelcomeListModeStory />);

  await expect(pane.getByText("selected: nobody")).toBeVisible();
  // The SECTION half is deliberately loose here: this story mounts the landing alone, so the shell's active
  // section is whatever the store defaults to. What must be none is the ROOM.
  await expect(pane.getByText(/^room: none in /u)).toBeVisible();

  await shelf(pane, "Recently chatted").getByRole("button", { name: "Resume the chat with Elias Thorn" }).click();
  // The ROOM the row named, and the section it lives in — never the editor selection.
  await expect(pane.getByText("room: chat_elias_newest in chats")).toBeVisible();
  await expect(pane.getByText("selected: nobody")).toBeVisible();

  // Starred is `door="open"`: the name carries no verb and the press lands in the editor.
  await shelf(pane, "Starred · 1").getByRole("button", { name: "Sabine Veyra, starred" }).click();
  await expect(pane.getByText("selected: char_sabine_veyra")).toBeVisible();
});

test("#864 APPLICABILITY — a shelf with nothing in it renders nothing, never an empty room", async ({ mount, page }) => {
  // Chatted, but nothing starred. The same mount DID draw a Starred shelf in the test above, so this is a
  // planted negative against a proven positive rather than a bare absence.
  await routeTrpc(page, landingRoutes({ recent: [ELIAS, NIKO], newest: [ELIAS, NIKO] }));
  const pane = await mount(<CharacterLibraryWelcomeListModeStory />);

  await expect(shelf(pane, "Recently chatted")).toBeVisible();
  await expect(pane.getByRole("heading", { name: /^Starred/u })).toHaveCount(0);
  await expect(pane.getByText(/no starred/iu)).toHaveCount(0);
});

test("#864 the FRESH INSTALL arm — cards exist, nothing chatted, nothing starred", async ({ mount, page }) => {
  await routeTrpc(page, landingRoutes({ recent: SHIPPED, newest: SHIPPED }));
  const pane = await mount(<CharacterLibraryWelcomeListModeStory />);

  await expect(pane.getByRole("heading", { name: "Meet your characters" })).toBeVisible();
  await expect(pane.getByRole("heading", { name: "Pick up where you left off" })).toHaveCount(0);
  // The count is the CENSUS — the whole library fits in the page, so it is a number the pane can prove.
  await expect(pane.getByRole("heading", { name: "Shipped with Orbweaver · 3" })).toBeVisible();
  await expect(shelf(pane, "Shipped with Orbweaver · 3").getByRole("button")).toHaveCount(3);
  await expect(pane.getByText(/the shelves appear when they have something to show/u)).toBeVisible();
});

test("#520/#532 ONE New door on the plane — the landing's exists only while the list is off screen", async ({ mount, page }) => {
  await routeTrpc(page, landingRoutes({ recent: [SABINE, ELIAS], newest: [AVEL, SABINE, ELIAS] }));
  const pane = await mount(<CharacterLibraryWelcomeListModeStory />);
  const newDoor = pane.getByRole("button", { name: "New character" });
  const importDoor = pane.getByRole("button", { name: "Import a card" });

  // Docked: the band carries both doors, so this pane mints neither and points at New by its label.
  await expect(newDoor).toHaveCount(0);
  await expect(importDoor).toHaveCount(0);
  await expect(pane.getByText(BAND_DOOR)).toBeVisible();
  await expect(pane.getByText(LIST_OFF_SCREEN_HINT)).toHaveCount(0);
  await expect(pane.getByRole("heading", { name: "Just added" })).toHaveCount(0);

  // Off screen: the band went with the list, so the landing owns the doors and is never a dead end — and
  // `Just added` appears, because the list that would otherwise carry the newest rows is gone.
  await pane.getByRole("button", { name: "take the list off screen" }).click();
  await expect(newDoor).toBeVisible();
  await expect(importDoor).toBeVisible();
  await expect(pane.getByText(BAND_DOOR)).toHaveCount(0);
  await expect(pane.getByText(LIST_OFF_SCREEN_HINT)).toBeVisible();
  await expect(shelf(pane, "Just added").getByRole("button", { name: /Avel the Quiet/u })).toBeVisible();

  await pane.getByRole("button", { name: "put the list back" }).click();
  await expect(newDoor).toHaveCount(0);
});

test.describe("phone", () => {
  // COARSE + 430 (`ct-mobile-repro-needs-coarse-and-the-real-affordance-set`): a narrow viewport alone
  // renders a fine-pointer layout no phone produces.
  test.use({ hasTouch: true, viewport: { width: 430, height: 860 } });

  test("#864 at 430 the shelf tiles THREE faces across and the doors are on the pane", async ({ mount, page }) => {
    await routeTrpc(page, landingRoutes({ recent: [SABINE, ELIAS, KOHAKU, NIKO], newest: [AVEL, SABINE] }));
    const pane = await mount(<CharacterLibraryWelcomeListModeStory />);
    // A phone reaches this pane only with the roster dropped (the mobile one-shell rule), which is the same
    // resolved `collapsed` the doors ride.
    await pane.getByRole("button", { name: "take the list off screen" }).click();

    await expect(pane.getByRole("button", { name: "New character" })).toBeVisible();
    // POLLED, never a single read (`ct-no-oneshot-live-read-assert`): the track list resolves after layout,
    // and a one-shot `evaluate` samples whatever the frame happened to hold.
    await expect
      .poll(async () => (await shelf(pane, "Recently chatted").evaluate((el) => globalThis.getComputedStyle(el).gridTemplateColumns)).split(" ").length)
      .toBe(3);
  });
});
