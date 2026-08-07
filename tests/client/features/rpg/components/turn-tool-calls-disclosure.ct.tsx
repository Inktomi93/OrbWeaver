// CT: the per-row "what this turn did" disclosure (TOOLCALLS-INVISIBLE, arm A) — mounted through the REAL
// rpg `message-footer` contribution, so this exercises the `when` → `body` path `main.tsx` wires rather than
// the component in isolation.
//
// WHAT IT PINS, and why each one is the defect it is:
//   • the disclosure is COLLAPSED by default (a transcript must not become a debug dump);
//   • a DROPPED call says so, with the failing field as VISIBLE TEXT — `SCENE-DROPPED` cost a live session
//     hours because that reason existed nowhere a human could read it;
//   • APPLICABILITY is keyed to the VARIANT, not the message: swiping to a variant with no record renders
//     NOTHING (not an empty shell) — the swipe-correctness the variantId keying buys;
//   • a USER row never mounts it at all (`when` refuses);
//   • a room with NO LIVE GAME never ASKS — the read is gated on the chat's own rpg pointer, because
//     `listTurnToolCalls` answers a deliberate leak-free NOT_FOUND for a gameless chat and every non-game
//     committed room was printing that 404 (twice, with the retry) on open.

import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/ct/route-trpc.ts";
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

/** A REAL folded turn's call set, in the shape `recordToolCalls` produces — all three verdicts at once,
 *  because the mixed row is the one a user actually has to read. The `update_scene` drop is the live
 *  `SCENE-DROPPED` payload verbatim (an indoor scene against an all-outdoor weather enum). */
const RECORDED_TURN = [
  {
    variantId: "mv_ct_folded",
    messageId: "msg_ct_folded",
    createdAt: 1_700_000_000_000,
    calls: [
      { name: "update_party", args: '{"members":[{"targetRef":"Nate","trackerDeltas":{"hp":-3}}]}', verdict: "applied" as const, issues: [] },
      {
        name: "update_scene",
        args: '{"location":"Throne Room","weather":{"type":"indoors"}}',
        verdict: "salvaged" as const,
        issues: ["update_scene.weather"],
      },
      {
        name: "upsert_quest",
        args: '{"name":42}',
        verdict: "dropped" as const,
        issues: ['name: Invalid input: expected string — sent "42"'],
      },
    ],
  },
];

// Regex literals hoisted to module scope (biome `useTopLevelRegex`).
const RE_TRIGGER = /Game actions on this turn/;
const RE_COUNT_3 = /3/;
const RE_EXPECTED_STRING = /Invalid input: expected string/;

test("collapsed by default; opening it names each call and whether it landed", async ({ mount, page }) => {
  await routeTrpc(page, { ...GAME_ROOM, "rpg.listTurnToolCalls": () => RECORDED_TURN });

  const component = await mount(<TurnToolCallsDisclosureStory />);

  // §13.10 N3 — stable identity leads, the volatile count is suffixed, so this name survives a count change.
  const trigger = component.getByRole("button", { name: RE_TRIGGER });
  await expect(trigger).toBeVisible();
  await expect(trigger).toHaveAccessibleName(RE_COUNT_3);

  // A transcript row must not open as a debug dump.
  await expect(component.getByText("update_scene")).toHaveCount(0);

  await trigger.click();

  await expect(component.locator("[data-slot=turn-tool-call]")).toHaveCount(3);
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
  // ONESHOT-OK: settled by the barrier above — the gated query would have been issued during the same commit
  // that painted "plain", so this is a read of finished state, not a mid-flight sample.
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
  // ONESHOT-OK: settled by the barrier above — the gated query would have been issued during the same commit
  // that painted `off`. A read of finished state, not a mid-flight sample.
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

test("a room with NO records renders no disclosure at all (a non-game chat is untouched)", async ({ mount, page }) => {
  // [[no-separate-reduced-modes]]: there is no flag and no "reduced" transcript — the surface is simply
  // absent where it does not apply.
  await routeTrpc(page, { ...GAME_ROOM, "rpg.listTurnToolCalls": () => [] });

  const component = await mount(<TurnToolCallsDisclosureStory />);

  await expect(component.locator("[data-slot=turn-tool-calls]")).toHaveCount(0);
});
