// E2E (@live) — "the group modes work the way they are MEANT to", proven end-to-end through the real
// stack with real turns. The arbitration ENGINE is pure and exhaustively unit-tested
// (tests/server/domain/chat/engine/select-speakers.test.ts pins every policy, the soft ban-last yield, the
// talkativeness weighting and the forced/@mention hard override) — this spec does NOT re-test it. Its job
// is the other claim: that each mode still MANIFESTS after the whole stack has had its say (roster load →
// group config → arbitration → the per-speaker round driver → the engine → canon).
//
// EVERY assertion DISTINGUISHES its mode from the others. The distinguishing instrument is the committed
// canon's SPEAKER SEQUENCE (`characterId` per assistant row, in seq order) plus the row COUNT:
//   • per-speaker — N rows, N DISTINCT roster characterIds  ·  narrator — exactly 1 row, authored by a
//     SYNTHETIC group character that is NOT in the roster
//   • list        — every eligible seat, in ROSTER order    ·  pooled  — the rotation across rounds
//   • manual      — a plain send commits ZERO assistant rows; a force/@mention commits exactly one
//   • ban-last    — round 2 excludes round 1's last speaker while another seat is eligible
//   • mute        — a muted seat never appears in a round (but is still force-summonable)
//   • talkativeness 0 — sorts BEHIND a positive seat under `natural`
//   • autoMode    — the chain adds exactly `autoModeMaxTurns` rows on top of the round, then STOPS
//
// SPEND: local vLLM only, ~30 short turns at a 32-token output ceiling (`GROUP_TURN_MAX_OUTPUT_TOKENS`).
// The `chat` Model role is bound to the harness's local-engine connection (the STATELESS openai-compat wire)
// and RESTORED in a finally — the agent-sdk arm rejects the per-send `maxOutputTokens` intent
// (`result success-subtype flagged is_error`), which would burn unbounded tokens per speaker. Nothing here
// touches a hosted credential.
//
// @live: skipped unless E2E_LIVE=1 (the config's `@live` grepInvert). Each arm uses Playwright's native
// conditional skip when the operator's stack has no local chat backend, so unavailable evidence is never
// recorded as a pass.
//
// SELF-SEEDING: each test mints its own 2–3 spec-owned characters and its own uniquely-titled chat with
// `opening: "none"` — an empty canon means round 1 has NO last speaker, which is what makes the
// "everyone speaks" arms deterministic. Characters (and with them their chats) are removed in a finally.

import type { CharacterHandle, CharacterId, ChatId, MessageId, UserConnectionId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/test";
import type { RosterSeat } from "./support/trpc.ts";
import {
  assistantTurns,
  characterSeats,
  countMessageVariants,
  deleteChat,
  forceCharacterTurn,
  mintFreshCharacter,
  pinChatToLocalEngine,
  removeCharacter,
  restoreChatBinding,
  sendGroupTurn,
  setSeatKnobs,
  speakerSequence,
  startGroupChat,
  swipeMessage,
} from "./support/trpc.ts";

/** The spec-owned cast: unique handles (idempotent re-mint) + unique display names (so `@mention`
 *  resolution can only match the intended member). */
const CAST = [
  { handle: castId<CharacterHandle>("e2e-modes-alpha"), name: "Modespec Alpha" },
  { handle: castId<CharacterHandle>("e2e-modes-bravo"), name: "Modespec Bravo" },
  { handle: castId<CharacterHandle>("e2e-modes-cirrus"), name: "Modespec Cirrus" },
] as const;

/** Long enough for a 3-character round plus an auto-mode chain on a warm local 8B. */
const LIVE_TIMEOUT_MS = 240_000;

interface Room {
  readonly chatId: ChatId;
  readonly characterIds: readonly CharacterId[];
  readonly seats: readonly RosterSeat[];
}

async function mintCast(count: number): Promise<readonly CharacterId[]> {
  const ids: CharacterId[] = [];
  for (const member of CAST.slice(0, count)) {
    ids.push(await mintFreshCharacter(member.handle, member.name, `${member.name} greeting.`));
  }
  return ids;
}

async function dropCast(characterIds: readonly CharacterId[]): Promise<void> {
  for (const id of characterIds) {
    await removeCharacter(id).catch(() => null);
  }
}

/** Seed a fresh room with `count` spec-owned characters and the given group config. The returned `seats`
 *  are in ROSTER (join) order — the order `list`/`pooled` walk, and the comparand for an order assertion. */
async function seedRoom(label: string, count: number, groupConfig: Record<string, unknown>): Promise<Room> {
  const characterIds = await mintCast(count);
  const chat = await startGroupChat({ characterIds, title: `e2e-modes-${label}-${Date.now()}`, groupConfig });
  return { chatId: chat.id, characterIds, seats: await characterSeats(chat.id) };
}

async function teardown(room: Room): Promise<void> {
  await deleteChat(room.chatId).catch(() => null);
  await dropCast(room.characterIds);
}

test.describe("group modes on the live local stack", () => {
  /** The `chat` Model role as it stood before this file ran (restored in afterAll — the rows are the
   *  single-user owner's and serial specs share them). */
  let priorChatBinding: { readonly connectionId: UserConnectionId } | null = null;
  /** Null ⇒ local turns work on this stack; a string ⇒ the unavailable reason every arm reports to the runner. */
  let bail: string | null = null;

  // The ENVIRONMENT probe, paid ONCE: pin the stateless local route and drive one throwaway turn on a
  // scratch room. A box with no local vllm engine listening at the harness's loopback port fail-closes
  // every local turn — an environment verdict, not a group-chat regression. Recording it here (instead of
  // catching inside each arm) keeps a REAL group failure red: the arms below never swallow their own errors.
  test.beforeAll(async () => {
    test.setTimeout(LIVE_TIMEOUT_MS);
    const probeCast = await mintCast(1);
    const probe = await startGroupChat({ characterIds: probeCast, title: `e2e-modes-probe-${Date.now()}` });
    try {
      // The stateless openai-compat local wire — the arm that honors the per-send `maxOutputTokens` ceiling.
      priorChatBinding = await pinChatToLocalEngine();
      await sendGroupTurn(probe.id, "Say hello.");
    } catch (err) {
      bail = err instanceof Error ? err.message : String(err);
    } finally {
      await deleteChat(probe.id).catch(() => null);
      await dropCast(probeCast);
    }
  });

  test.afterAll(async () => {
    await restoreChatBinding(priorChatBinding);
  });

  function skipWhenBackendUnavailable(): void {
    test.skip(bail !== null, bail === null ? "local chat backend available" : `no local chat backend on this stack: ${bail}`);
  }

  test("per-speaker with three characters commits three separately-attributed, independently swipeable messages", { tag: "@live" }, async () => {
    test.setTimeout(LIVE_TIMEOUT_MS);
    skipWhenBackendUnavailable();
    const room = await seedRoom("per-speaker", 3, { output: "per-speaker", policy: "list" });
    try {
      await sendGroupTurn(room.chatId, "Say hello.");

      const turns = await assistantTurns(room.chatId);
      // THE per-speaker fingerprint: N messages for ONE round, each a DIFFERENT roster character — the
      // exact opposite of narrator's single cast-voiced row (asserted below in its own arm).
      expect(turns).toHaveLength(3);
      const speakers = turns.map((t) => t.characterId);
      expect(new Set(speakers).size).toBe(3);
      expect(speakers).toEqual(room.seats.map((s) => s.characterId));

      // …and each of those rows is its OWN swipeable slot: regenerating the first grows only that slot.
      const first = turns[0];
      const second = turns[1];
      expect(first).toBeDefined();
      expect(second).toBeDefined();
      await swipeMessage(room.chatId, first?.id ?? castId<MessageId>(""));
      expect(await countMessageVariants(room.chatId, first?.id ?? castId<MessageId>(""))).toBe(2);
      expect(await countMessageVariants(room.chatId, second?.id ?? castId<MessageId>(""))).toBe(1);
    } finally {
      await teardown(room);
    }
  });

  test("narrator voices the whole cast in exactly ONE message authored by a synthetic non-roster character", { tag: "@live" }, async () => {
    test.setTimeout(LIVE_TIMEOUT_MS);
    skipWhenBackendUnavailable();
    // The SAME 3-character cast and the SAME `list` policy as the per-speaker arm — so the only variable
    // is `output`, and 3-rows-vs-1-row is attributable to the mode alone.
    const room = await seedRoom("narrator", 3, { output: "narrator", policy: "list" });
    try {
      await sendGroupTurn(room.chatId, "Say hello.");

      const turns = await assistantTurns(room.chatId);
      expect(turns).toHaveLength(1);
      // Authored by the synthetic group character (§10) — a REAL id, never null, and never a roster member.
      const author = turns[0]?.characterId ?? null;
      expect(author).not.toBeNull();
      expect(room.characterIds).not.toContain(author);
    } finally {
      await teardown(room);
    }
  });

  test("list policy walks the roster in order and every eligible seat speaks; pooled rotates across rounds", { tag: "@live" }, async () => {
    test.setTimeout(LIVE_TIMEOUT_MS);
    skipWhenBackendUnavailable();
    const room = await seedRoom("pooled", 3, { output: "per-speaker", policy: "pooled" });
    try {
      const roster = room.seats.map((s) => s.characterId);

      // ROUND 1 — no prior speaker, so nothing is banned: the full roster speaks, in roster order.
      await sendGroupTurn(room.chatId, "Round one.");
      expect(await speakerSequence(room.chatId)).toEqual(roster);

      // ROUND 2 — the ROTATION: round 1's last speaker is banned out of the pool, so the round covers the
      // OTHER two, still in roster order. This is what makes `pooled` round-robin rather than a re-run.
      await sendGroupTurn(room.chatId, "Round two.");
      expect((await speakerSequence(room.chatId)).slice(roster.length)).toEqual(roster.slice(0, -1));
    } finally {
      await teardown(room);
    }
  });

  test("ban-last-speaker: with two characters the same one never speaks twice in a row", { tag: "@live" }, async () => {
    test.setTimeout(LIVE_TIMEOUT_MS);
    skipWhenBackendUnavailable();
    const room = await seedRoom("ban-last", 2, { output: "per-speaker", policy: "list" });
    try {
      const [alpha, bravo] = room.seats.map((s) => s.characterId);

      await sendGroupTurn(room.chatId, "Round one.");
      expect(await speakerSequence(room.chatId)).toEqual([alpha, bravo]);

      // Round 2's pool is ALPHA only (BRAVO closed round 1) — the soft ban is what stops a repeat, and
      // with another seat eligible it never yields.
      await sendGroupTurn(room.chatId, "Round two.");
      expect(await speakerSequence(room.chatId)).toEqual([alpha, bravo, alpha]);
    } finally {
      await teardown(room);
    }
  });

  test("manual schedules nobody: a plain send commits no character turn, a forced turn does", { tag: "@live" }, async () => {
    test.setTimeout(LIVE_TIMEOUT_MS);
    skipWhenBackendUnavailable();
    const room = await seedRoom("manual", 3, { output: "per-speaker", policy: "manual" });
    try {
      // THE manual fingerprint: the user's line commits, the AI round schedules NO ONE — zero assistant
      // rows. Under every other policy this same send would have produced at least one.
      await sendGroupTurn(room.chatId, "Anyone there?");
      expect(await assistantTurns(room.chatId)).toHaveLength(0);

      // The host's explicit summons is the ONLY thing that drives a manual room — and it targets exactly
      // the named member.
      const target = room.characterIds[1] ?? castId<CharacterId>("");
      await forceCharacterTurn(room.chatId, target);
      expect(await speakerSequence(room.chatId)).toEqual([target]);
    } finally {
      await teardown(room);
    }
  });

  test("@mention is a hard override: the mentioned character speaks even under manual policy", { tag: "@live" }, async () => {
    test.setTimeout(LIVE_TIMEOUT_MS);
    skipWhenBackendUnavailable();
    // `manual` is the strongest possible contrast: the policy schedules nobody (proven in the arm above),
    // so ANY speaker here can only be the @mention override, applied BEFORE the policy.
    const room = await seedRoom("mention", 3, { output: "per-speaker", policy: "manual" });
    try {
      const mentioned = room.characterIds[2] ?? "";
      await sendGroupTurn(room.chatId, `@${CAST[2].name} what do you think?`);
      expect(await speakerSequence(room.chatId)).toEqual([mentioned]);
    } finally {
      await teardown(room);
    }
  });

  test("a muted seat is skipped by arbitration but stays force-summonable; talkativeness 0 sorts behind a positive seat", { tag: "@live" }, async () => {
    test.setTimeout(LIVE_TIMEOUT_MS);
    skipWhenBackendUnavailable();
    const muteRoom = await seedRoom("mute", 3, { output: "per-speaker", policy: "list" });
    try {
      const mutedSeat = muteRoom.seats[1];
      expect(mutedSeat).toBeDefined();
      await setSeatKnobs(muteRoom.chatId, mutedSeat?.id ?? "", { disabled: true });

      // `list` means EVERY eligible seat speaks — so a missing member here can only be the mute.
      await sendGroupTurn(muteRoom.chatId, "Say hello.");
      expect(await speakerSequence(muteRoom.chatId)).toEqual([muteRoom.characterIds[0], muteRoom.characterIds[2]]);

      // Mute is passive arbitration exclusion, NOT a host-override block (verbs/turn.ts: presence-only).
      await forceCharacterTurn(muteRoom.chatId, mutedSeat?.characterId ?? castId<CharacterId>(""));
      expect((await speakerSequence(muteRoom.chatId)).at(-1)).toBe(mutedSeat?.characterId);
    } finally {
      await teardown(muteRoom);
    }

    const weightRoom = await seedRoom("weight", 2, { output: "per-speaker", policy: "natural" });
    try {
      // `natural` orders the WHOLE eligible pool by a talkativeness-weighted sample: a 0 weight collapses to
      // the floor (1e-9), whose sample key is ~0, so the quiet seat sorts LAST. Both still speak — the
      // distinguishing signal is the ORDER, not the membership (that is `mute`'s job, above).
      const quiet = weightRoom.seats[0];
      expect(quiet).toBeDefined();
      await setSeatKnobs(weightRoom.chatId, quiet?.id ?? "", { talkativeness: 0 });

      await sendGroupTurn(weightRoom.chatId, "Say hello.");
      expect(await speakerSequence(weightRoom.chatId)).toEqual([weightRoom.characterIds[1], weightRoom.characterIds[0]]);
    } finally {
      await teardown(weightRoom);
    }
  });

  test("auto-mode chains AI→AI turns after the human round and STOPS at autoModeMaxTurns", { tag: "@live" }, async () => {
    test.setTimeout(LIVE_TIMEOUT_MS);
    skipWhenBackendUnavailable();
    // A SMALL bound keeps the arm cheap while still proving the stop: 2 characters × `list` makes the
    // human-triggered round exactly 2 rows, so anything past row 2 is the chain, and the chain is
    // single-speaker per iteration (ban-last, `allowSelfResponses` off) ⇒ it must alternate.
    const room = await seedRoom("automode", 2, {
      output: "per-speaker",
      policy: "list",
      autoMode: true,
      autoModeMaxTurns: 2,
      autoModeDelayMs: 0,
    });
    try {
      const [alpha, bravo] = room.characterIds;
      await sendGroupTurn(room.chatId, "Talk amongst yourselves.");

      const speakers = await speakerSequence(room.chatId);
      // 2 (the round) + exactly 2 (the chain) — the BOUND is the assertion: an unbounded chain would keep
      // spending, and a chain that never started would leave only the round's 2 rows.
      expect(speakers).toHaveLength(4);
      expect(speakers.slice(0, 2)).toEqual([alpha, bravo]);
      expect(speakers.slice(2)).toEqual([alpha, bravo]);
    } finally {
      await teardown(room);
    }
  });
});
