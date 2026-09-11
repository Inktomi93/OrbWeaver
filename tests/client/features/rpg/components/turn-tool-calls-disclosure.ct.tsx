// CT: the per-row "what this turn did" disclosure (TOOLCALLS-INVISIBLE, arm A) — mounted through the REAL
// rpg `message-footer` contribution, so this exercises the `when` → `body` path `main.tsx` wires rather than
// the component in isolation.
//
// WHAT IT PINS, and why each one is the defect it is:
//   • the disclosure is COLLAPSED by default (a transcript must not become a debug dump);
//   • a DROPPED call says so, with the failing field as VISIBLE TEXT — `SCENE-DROPPED` cost a live session
//     hours because that reason existed nowhere a human could read it;
//   • an OVERRIDDEN call — well-formed, applied, then partly eaten by the reader's own hand LOCK — reads as
//     their edit holding rather than as a success, and NAMES the pinned path (#77);
//   • APPLICABILITY is keyed to the VARIANT, not the message: swiping to a variant with no record renders
//     NOTHING (not an empty shell) — the swipe-correctness the variantId keying buys;
//   • a USER row never mounts it at all (`when` refuses);
//   • a room with NO LIVE GAME never ASKS — the read is gated on the chat's own rpg pointer, because
//     `listTurnToolCalls` answers a deliberate leak-free NOT_FOUND for a gameless chat and every non-game
//     committed room was printing that 404 (twice, with the retry) on open.

import { expect, test } from "@playwright/experimental-ct-react";
import { touchFloorPx } from "../../../../support/browser/touch-floor.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import {
  TurnToolCallsDisclosureStory,
  TurnToolCallsEngagementStory,
  TurnToolCallsNonGameStory,
  TurnToolCallsOtherVariantStory,
  TurnToolCallsUserRowStory,
} from "../_ct-stories.tsx";

/** The room's `ChatDetail` as a LIVE game — the gate the hook reads before it asks for any record
 *  (`isRpgEngaged`, the one client predicate). Every story below is a game room unless it says otherwise;
 *  without this stub the disclosure correctly never fetches and the whole file would assert nothing. */
const GAME_ROOM = {
  "chat.getChat": (): { readonly rpg: { readonly gameId: string; readonly engaged: boolean } } => ({ rpg: { gameId: "rpg_game_ct", engaged: true } }),
};

/** A REAL folded turn's call set, in the shape the record projection produces — all FOUR verdicts at once,
 *  because the mixed row is the one a user actually has to read. The `update_scene` drop is the live
 *  `SCENE-DROPPED` payload verbatim (an indoor scene against an all-outdoor weather enum); the
 *  `update_inventory` override is the live #77 shape (a host-added item's plane, auto-locked by the hand door,
 *  eating the model's later write to it). */
const RECORDED_TURN = [
  {
    variantId: "mv_ct_folded",
    messageId: "msg_ct_folded",
    createdAt: 1_700_000_000_000,
    calls: [
      {
        name: "update_party",
        args: '{"members":[{"targetRef":"Alex","trackerDeltas":{"hp":-3}}]}',
        verdict: "applied" as const,
        issues: [],
        withheld: null,
      },
      {
        name: "update_scene",
        args: '{"location":"Throne Room","weather":{"type":"indoors"}}',
        verdict: "salvaged" as const,
        issues: ["update_scene.weather"],
        withheld: null,
      },
      {
        name: "upsert_quest",
        args: '{"name":42}',
        verdict: "dropped" as const,
        issues: ['name: Invalid input: expected string — sent "42"'],
        withheld: null,
      },
      {
        name: "update_inventory",
        args: '{"targetRef":"Alex","items":[{"name":"Coil of rope","location":"belt"}]}',
        verdict: "overridden" as const,
        issues: ["locked actorState.user:u_nate.volatile.inventory — your manual edit holds this value"],
        withheld: null,
      },
    ],
  },
];

const RE_TRIGGER = /Game actions on this turn/;
const RE_COUNT_4 = /4/;
const RE_EXPECTED_STRING = /Invalid input: expected string/;
const RE_LOCKED_PATH = /locked actorState\.user:u_nate\.volatile\.inventory/;

test("collapsed by default; opening it names each call and whether it landed", async ({ mount, page }) => {
  await routeTrpc(page, { ...GAME_ROOM, "rpg.listTurnToolCalls": () => RECORDED_TURN });

  const component = await mount(<TurnToolCallsDisclosureStory />);

  // §13.10 N3 — stable identity leads, the volatile count is suffixed, so this name survives a count change.
  const trigger = component.getByRole("button", { name: RE_TRIGGER });
  await expect(trigger).toBeVisible();
  await expect(trigger).toHaveAccessibleName(RE_COUNT_4);

  // A transcript row must not open as a debug dump.
  await expect(component.getByText("update_scene")).toHaveCount(0);

  await trigger.click();

  await expect(component.locator("[data-slot=turn-tool-call]")).toHaveCount(4);
  await expect(component.getByText("update_party")).toBeVisible();
  await expect(component.getByText("recorded", { exact: true })).toBeVisible();
});

test("a DROPPED call says so, and its reason is VISIBLE TEXT (never a hover-only tooltip)", async ({ mount, page }) => {
  // The SCENE-DROPPED lesson: 12 identical silent drops cost a live session hours. The whole point of this
  // surface is that the reason reaches the person at the keyboard, on touch as well as on a mouse.
  await routeTrpc(page, { ...GAME_ROOM, "rpg.listTurnToolCalls": () => RECORDED_TURN });

  const component = await mount(<TurnToolCallsDisclosureStory />);
  await component.getByRole("button", { name: RE_TRIGGER }).click();

  await expect(component.getByText("not recorded")).toBeVisible();
  await expect(component.getByText(RE_EXPECTED_STRING)).toBeVisible();
  // …and the SALVAGED arm names the field the closed vocabulary could not hold.
  await expect(component.getByText("partly recorded")).toBeVisible();
  await expect(component.getByText("update_scene.weather")).toBeVisible();
});

test("an OVERRIDDEN call reads as the reader's own edit holding, and NAMES the locked path", async ({ mount, page }) => {
  // #77: the row used to badge this call `recorded` with no reason line at all — a durable claim that a write
  // landed which no state carries. The badge must not read as success, and the PATH must be on screen: on a
  // turn with several calls it is the only thing that says which pin ate which write.
  await routeTrpc(page, { ...GAME_ROOM, "rpg.listTurnToolCalls": () => RECORDED_TURN });

  const component = await mount(<TurnToolCallsDisclosureStory />);
  await component.getByRole("button", { name: RE_TRIGGER }).click();

  await expect(component.getByText("your edit kept")).toBeVisible();
  await expect(component.getByText(RE_LOCKED_PATH)).toBeVisible();
});

// #1690 — THE WITHHELD ARM. The server belts a member's copy of the args, and args that did not PARSE cannot
// be belted at all, so it serves none of them plus a typed reason. A reader told nothing about that reads the
// absence as "the model sent nothing"; the line has to be on screen, in the same visible-text posture as the
// verdict reasons above.
const WITHHELD_TURN = [
  {
    variantId: "mv_ct_folded",
    messageId: "msg_ct_folded",
    createdAt: 1_700_000_000_000,
    calls: [{ name: "update_scene", args: "", verdict: "dropped" as const, issues: ["arguments: not valid JSON"], withheld: "unparseable" as const }],
  },
];

const RE_NOT_VALID_JSON = /arguments: not valid JSON/;
const RE_ARGS_WITHHELD = /Arguments not shown/;

test("a call whose args were WITHHELD says so as visible text, beside what still landed", async ({ mount, page }) => {
  await routeTrpc(page, { ...GAME_ROOM, "rpg.listTurnToolCalls": () => WITHHELD_TURN });

  const component = await mount(<TurnToolCallsDisclosureStory />);
  await component.getByRole("button", { name: RE_TRIGGER }).click();

  await expect(component.locator("[data-slot=turn-tool-call-withheld]")).toBeVisible();
  await expect(component.getByText(RE_ARGS_WITHHELD)).toBeVisible();
  // The reader keeps everything they can act on: the call's name, its verdict and its reason.
  await expect(component.getByText("update_scene")).toBeVisible();
  await expect(component.getByText("not recorded")).toBeVisible();
  await expect(component.getByText(RE_NOT_VALID_JSON)).toBeVisible();
});

test("a call with nothing withheld renders NO withheld line (the field is not a permanent ornament)", async ({ mount, page }) => {
  await routeTrpc(page, { ...GAME_ROOM, "rpg.listTurnToolCalls": () => RECORDED_TURN });

  const component = await mount(<TurnToolCallsDisclosureStory />);
  await component.getByRole("button", { name: RE_TRIGGER }).click();

  await expect(component.locator("[data-slot=turn-tool-call]")).toHaveCount(4);
  await expect(component.locator("[data-slot=turn-tool-call-withheld]")).toHaveCount(0);
});

test("APPLICABILITY is per-VARIANT: the same slot swiped to an unrecorded variant renders nothing", async ({ mount, page }) => {
  // The swipe-correctness the `variantId` keying buys. A message-keyed record would wrongly show this
  // variant its sibling's calls; an absent record must render NOTHING, not an empty disclosure.
  await routeTrpc(page, { ...GAME_ROOM, "rpg.listTurnToolCalls": () => RECORDED_TURN });

  const component = await mount(<TurnToolCallsOtherVariantStory />);

  await expect(component.getByRole("button", { name: RE_TRIGGER })).toHaveCount(0);
  await expect(component.locator("[data-slot=turn-tool-calls]")).toHaveCount(0);
});

test("a USER row never mounts it — `when` refuses before any lookup", async ({ mount, page }) => {
  await routeTrpc(page, { ...GAME_ROOM, "rpg.listTurnToolCalls": () => RECORDED_TURN });

  const component = await mount(<TurnToolCallsUserRowStory />);

  await expect(component.locator("[data-slot=turn-tool-calls]")).toHaveCount(0);
});

// ── The gate (side-eye 2026-08-07 P3) ────────────────────────────────────────────────────────────────
// Every non-game committed chat printed `rpg.listTurnToolCalls ✗ game chat_… not found` on open, twice (the
// initial request and one retry). The verb is innocent: its NOT_FOUND is the leak-free collapse
// `domain/rpg/guard.ts` deliberately makes indistinguishable across "no such chat"/"not a game"/"not a
// member", so a foreigner cannot probe a chat's game-ness. Asking is the defect.

test("a room with NO live game NEVER asks for the record — no request, and therefore no retry", async ({ mount, page }) => {
  // The record is stubbed as PRESENT: if the gate let the query through, this room would render a disclosure
  // and the count would be non-zero. Nothing here is absent for want of data.
  const trpc = await routeTrpc(page, {
    "chat.getChat": () => ({ rpg: null }),
    "rpg.listTurnToolCalls": () => RECORDED_TURN,
  });

  const component = await mount(<TurnToolCallsNonGameStory />);

  // BARRIER on the RENDERED settled arm: the sentinel reads the same `chat.getChat` the gate reads, so
  // "plain" means the browser has the detail and the gate has decided. Only then is an absence meaningful —
  // before it, "no request yet" is true of every mount for a millisecond.
  await expect(component.getByTestId("room-kind")).toHaveText("plain");
  await expect(component.locator("[data-slot=turn-tool-calls]")).toHaveCount(0);
  // @orb-waive ct-no-oneshot-live-read-assert(expect): settled by the barrier above — the gated query would have been issued during the same commit that painted "plain", so this is a read of finished state, not a mid-flight sample.
  expect(trpc.count("rpg.listTurnToolCalls")).toBe(0);
});

// The OTHER negative arm, and the one the predicate choice was MADE for. `contracts/rpg/pointer.ts` rules
// that every client gate reads `isRpgEngaged` and "the OFF arm must gate identically everywhere" — so a game
// toggled OFF (present pointer, `engaged:false`) must be as silent as no game at all, and re-engaging must
// bring the surface back on the same commit. A raw `rpg !== null` check would pass the test above and fail
// both of these.

test("a game toggled OFF asks for nothing either — the OFF arm gates identically to no game", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "chat.getChat": (): { readonly rpg: { readonly gameId: string; readonly engaged: boolean } } => ({
      rpg: { gameId: "rpg_game_ct", engaged: false },
    }),
    "rpg.listTurnToolCalls": () => RECORDED_TURN,
  });

  const component = await mount(<TurnToolCallsEngagementStory />);

  // `off`, not `plain`: the sentinel distinguishes the two negative arms, so this barrier cannot be met by
  // an absent pointer. The game EXISTS here — it is switched off.
  await expect(component.getByTestId("room-kind")).toHaveText("off");
  await expect(component.locator("[data-slot=turn-tool-calls]")).toHaveCount(0);
  // @orb-waive ct-no-oneshot-live-read-assert(expect): settled by the barrier above — the gated query would have been issued during the same commit that painted `off`. A read of finished state, not a mid-flight sample.
  expect(trpc.count("rpg.listTurnToolCalls")).toBe(0);
});

test("re-engaging the game brings the record back with no reload", async ({ mount, page }) => {
  // The pointer MIRROR flips server-side on the config write; the stub mirrors that. Keyed off the write
  // itself (the `Decline` test's pattern), never a call counter.
  let engaged = false;
  await routeTrpc(page, {
    "chat.getChat": (): { readonly rpg: { readonly gameId: string; readonly engaged: boolean } } => ({
      rpg: { gameId: "rpg_game_ct", engaged },
    }),
    "rpg.updateConfig": (): null => {
      engaged = true;
      return null;
    },
    "rpg.getConfigView": (): null => null,
    "rpg.getTrackerView": (): null => null,
    "rpg.listTurnToolCalls": () => RECORDED_TURN,
  });

  const component = await mount(<TurnToolCallsEngagementStory />);

  await expect(component.getByTestId("room-kind")).toHaveText("off");
  await expect(component.getByRole("button", { name: RE_TRIGGER })).toHaveCount(0);

  // The REAL door: `rpg.updateConfig` with `patch.engaged`, whose own `invalidates` recipe names
  // `chat.getChat`. Nothing in the story writes the cache by hand.
  await component.getByRole("button", { name: "engage the game" }).click();

  await expect(component.getByTestId("room-kind")).toHaveText("game");
  // …and the disclosure is back — the gate re-armed the query and the record landed, no remount, no reload.
  await expect(component.getByRole("button", { name: RE_TRIGGER })).toBeVisible();
});

// #1468 item 2 — THE ROUND THAT COULD NOT RUN. A provider throw returns the same empty delta a quiet beat
// returns, so the turn used to record NOTHING and the reader saw a beat that simply did nothing ("it thought
// for a while and then nothing happened" — the exact silence this surface exists to end). The record now
// carries the reason with an EMPTY call list, and the disclosure must render on that: an empty list is no
// longer "nothing to show". The reason is the server's projection — the host reads the vehicle's own error,
// every other member the bare summary — so the panel prints what it is handed and decides nothing.
const FAILED_ROUND = [
  {
    variantId: "mv_ct_folded",
    messageId: "msg_ct_folded",
    createdAt: 1_700_000_000_000,
    calls: [],
    failure: "the model call that records game state failed, so this turn changed nothing",
  },
];

const RE_ROUND_FAILED = /the model call that records game state failed/;
const RE_NOT_RECORDED_SUFFIX = /Game actions on this turn — not recorded/;

test("a turn whose STATE ROUND could not run renders the disclosure with the reason — an empty call list is not nothing to show", async ({ mount, page }) => {
  await routeTrpc(page, { ...GAME_ROOM, "rpg.listTurnToolCalls": () => FAILED_ROUND });

  const component = await mount(<TurnToolCallsDisclosureStory />);

  // The count suffix has nothing to count — the trigger says what happened instead, in the same word a
  // dropped call's badge uses, so one turn's outcome reads the same whichever half was lost.
  const trigger = component.getByRole("button", { name: RE_NOT_RECORDED_SUFFIX });
  await expect(trigger).toBeVisible();
  // Still COLLAPSED by default: a failed turn is not a reason to shout at the transcript.
  await expect(component.locator("[data-slot=turn-tool-calls-failure]")).toHaveCount(0);

  await trigger.click();

  // VISIBLE TEXT, never a tooltip — the same posture every other reason on this surface takes.
  await expect(component.locator("[data-slot=turn-tool-calls-failure]")).toBeVisible();
  await expect(component.getByText(RE_ROUND_FAILED)).toBeVisible();
  // …and no fabricated call: the model called nothing, so nothing is listed as called.
  await expect(component.locator("[data-slot=turn-tool-call]")).toHaveCount(0);
});

test("a turn that DID run renders no failure line (the field is not a permanent ornament)", async ({ mount, page }) => {
  await routeTrpc(page, { ...GAME_ROOM, "rpg.listTurnToolCalls": () => RECORDED_TURN });

  const component = await mount(<TurnToolCallsDisclosureStory />);
  await component.getByRole("button", { name: RE_TRIGGER }).click();

  await expect(component.locator("[data-slot=turn-tool-call]")).toHaveCount(4);
  await expect(component.locator("[data-slot=turn-tool-calls-failure]")).toHaveCount(0);
});

test("a room with NO records renders no disclosure at all (a non-game chat is untouched)", async ({ mount, page }) => {
  // [[no-separate-reduced-modes]]: there is no flag and no "reduced" transcript — the surface is simply
  // absent where it does not apply.
  await routeTrpc(page, { ...GAME_ROOM, "rpg.listTurnToolCalls": () => [] });

  const component = await mount(<TurnToolCallsDisclosureStory />);

  await expect(component.locator("[data-slot=turn-tool-calls]")).toHaveCount(0);
});

// ── The coarse touch floor (side-eye 2026-08-16 #93) ─────────────────────────────────────────────────
// `CollapsibleTrigger` is a text-height `inline-flex` line, not a control box, so — unlike `Button`'s
// `inline`/`glyph-*` arms — it ships NO hit-area `::after` at all. Measured live at 430×740 DPR3
// `pointer:coarse` this row was 406×16 and its own CENTRE did not resolve to it under `elementFromPoint`.
// It is the only affordance that reveals why a turn's writes did not land, so on a phone it has to be
// thumbable. A full-bleed row has width to spare and only wants HEIGHT, hence a floor on the trigger's own
// box rather than an overflowing pseudo (which is what collides with neighbours in a wrapped run).

test.describe("coarse touch floor", () => {
  test.use({ hasTouch: true });

  test("the trigger's RENDERED box clears the touch floor — measured against the resolved token, not a literal", async ({ mount, page }) => {
    // THE BOX, not an `elementFromPoint` sweep: this trigger has no hit pseudo, so its floor IS its box.
    // `hitExtent` used to count ANY ancestor as owning the point (a full-bleed row's ancestors span the
    // whole footer), so a sweep passed on a 16px trigger regardless of its real size (verified: it did,
    // against the pre-fix source) — a test that cannot fail is not evidence. `hitExtent` now scopes
    // ancestor credit to pseudo-carried floors only (#662), so it would correctly fail this trigger too;
    // the box read stays the assertion because it needs no compositor sweep for a plain box-carried floor.
    // The floor is read off `--spacing-touch-target` because a literal 44 both survives a token retune and
    // fails a correct fix.
    await expect.poll(() => page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
    await routeTrpc(page, { ...GAME_ROOM, "rpg.listTurnToolCalls": () => RECORDED_TURN });

    const component = await mount(<TurnToolCallsDisclosureStory />);
    const trigger = component.getByRole("button", { name: RE_TRIGGER });
    await expect(trigger).toBeVisible();

    const floor = await touchFloorPx(page);
    await expect.poll(() => trigger.evaluate((el: HTMLElement) => Math.round(el.getBoundingClientRect().height))).toBeGreaterThanOrEqual(Math.round(floor));
    // …and it is the TOKEN that put it there, not a stray height from somewhere else in the cascade.
    await expect.poll(() => trigger.evaluate((el: HTMLElement) => Math.round(Number.parseFloat(getComputedStyle(el).minHeight)))).toBe(Math.round(floor));
  });
});

test("the FINE pointer keeps the transcript's dense line — the floor is COARSE-ONLY", async ({ mount, page }) => {
  // The density half of the claim, and the reason the floor is spelled as a `pointer-coarse:` FRAGMENT
  // rather than the bare pointer-conditional token: `min-h-touch-target` alone still resolves to 28px at a
  // fine pointer, which would grow every folded turn's footer on every desktop. This block has no
  // `hasTouch`, so it runs at the default FINE pointer — the pin that catches a "fix" that inflates desktop.
  await expect.poll(() => page.evaluate(() => matchMedia("(pointer: fine)").matches)).toBe(true);
  await routeTrpc(page, { ...GAME_ROOM, "rpg.listTurnToolCalls": () => RECORDED_TURN });

  const component = await mount(<TurnToolCallsDisclosureStory />);
  const trigger = component.getByRole("button", { name: RE_TRIGGER });
  await expect(trigger).toBeVisible();

  // No min-height at all at fine: the variant's declaration never matches, so the row is its text height.
  await expect.poll(() => trigger.evaluate((el: HTMLElement) => Math.round(Number.parseFloat(getComputedStyle(el).minHeight) || 0))).toBe(0);
  await expect.poll(() => trigger.evaluate((el: HTMLElement) => Math.round(el.getBoundingClientRect().height))).toBeLessThan(await touchFloorPx(page));

  // …and the RULING that makes that dense line legitimate is RENDERED, not just commented (#1381). The
  // `@sub-floor-ok` marker above the JSX is a source fact the design-audit walker cannot read, which is
  // why two independent cold audits of /chats filed this row as a P1 hours apart. The attribute is what
  // the walker reads: `checks-a11y.ts` excludes the candidate at FINE pointer with the named reason
  // `ruledSubFloor` and counts it in the population row. If this attribute is ever dropped, the ruling
  // silently stops existing for every audit — so it is pinned on the RENDERED element, by its accessible
  // name, exactly as the walker finds it.
  await expect(trigger).toHaveAttribute("data-target-floor", "sub-floor-ok");
});
