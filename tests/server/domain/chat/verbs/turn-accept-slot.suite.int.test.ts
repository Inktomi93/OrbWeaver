// The ACCEPTED-SLOT TOTALITY property (cross-cutting: swipe / continueTurn / generate / forceCharacterTurn /
// send + the engine's shared pre-start seam). One rule, proved per strand path: once a verb emits
// `turnAccepted` the client's turn slot is OPEN, so EVERY exit of that verb must resolve it —
// `turnStarted`→terminal on the running path, else `turnAborted`. An accepted-but-unresolved slot is a stuck
// Stop button over a stale variant, the exact class the ghost-slot fix would otherwise have introduced while
// curing the late-open one.
//
// The strand paths, per verb, are the four ways an accepted aux turn can end WITHOUT reaching `turnStarted`:
//   1. the verb's own post-accept validation throws (generate's unknown-speaker NOT_FOUND),
//   2. `resolveTurnBase` throws (here: the FOREIGN preset/persona resolve faults),
//   3. the engine refuses PRE-START on the per-chat lock ("a turn is already in flight" — the measured
//      amplifier in the diagnosis: no `turnStarted` ever comes),
//   4. the engine refuses PRE-START on a security belt (budget here; consent is the same try-region, pinned
//      white-box in `engine/engine.int.test.ts`).
// `generate` has no arm 3 BY CONSTRUCTION (`lockFree: true` — it runs concurrent with a locked send).
//
// Asserted through the BUS only (the client is bus-driven and never reads the verb return), so these read the
// same surface the browser does. The NOT_FOUND-target arms are FENCES, not defect proofs: they passed before
// the fix too, and they pin the ORDERING decision that makes them true — the target load runs BEFORE the
// accept, so a bad slot id opens no slot and needs no closer.

import type { AssemblePersona, ChatBusEvent } from "@orb/contracts/chat";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { CharacterId, MessageId } from "@orb/kit/ids";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { describe } from "vitest";
import { DEFAULT_CHAT_BEHAVIOR } from "../../../../../packages/server/src/domain/chat/contract/foreign.ts";
import { tryAcquireLock } from "../../../../../packages/server/src/domain/chat/persistence/lock.ts";
import type { ChatScenario, ChatScenarioOptions } from "../../../../support/chat/scenario.ts";
import { scenario } from "../../../../support/chat/scenario.ts";
import { tape } from "../../../../support/chat/tape.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { FROZEN_AT } from "../_support.ts";

/** The `type` sequence of a captured event slice. */
const types = (events: readonly ChatBusEvent[]): string[] => events.map((e) => e.type);

/** A room with ONE committed assistant slot to swipe/continue, plus the id of that slot and the events
 *  cursor to slice the next verb's emissions from. */
async function roomWithReply(options: ChatScenarioOptions = {}): Promise<{
  chat: ChatScenario;
  assistantId: MessageId;
  speaker: CharacterId;
  since: () => readonly ChatBusEvent[];
}> {
  const chat = await scenario.chat(tape().reply("first").reply("second"), { characters: ["aria"], ...options });
  const sent = await chat.send("hello");
  const reply = sent.messages.find((m) => m.role === "assistant");
  if (reply === undefined) {
    throw new Error("scenario seeded no assistant reply");
  }
  const speaker = reply.characterId;
  if (speaker === null) {
    throw new Error("the seeded reply has no speaker");
  }
  const before = chat.events.length;
  return { chat, assistantId: reply.id, speaker, since: () => chat.events.slice(before) };
}

/** Hold the per-chat turn lock under a FOREIGN holder — the next locked turn is refused pre-start. */
async function holdLock(chat: ChatScenario): Promise<void> {
  const acquired = await tryAcquireLock(chat.db, {
    chatId: chat.chatId,
    holder: "other-replica",
    now: FROZEN_AT,
    expiresAt: FROZEN_AT + 60_000,
  });
  expect(acquired).toBe(true);
}

/** The scenario's own default FOREIGN inputs (a single "Alex" POV, shipped prompt config) — re-stated here
 *  because {@link faultingForeign} replaces the resolver wholesale. */
const PERSONA: AssemblePersona = { name: "Alex", description: "the user" };

/** A FOREIGN-inputs resolver that serves the room normally until `fail.now` flips, then faults — so the
 *  seeding send succeeds and the turn UNDER TEST throws inside `resolveTurnBase` (the FOREIGN resolve is one
 *  of its four awaits; any of them faulting is the same strand). */
function faultingForeign(fail: { now: boolean }): NonNullable<ChatScenarioOptions["resolveForeignInputs"]> {
  return () =>
    fail.now
      ? Promise.reject(new Error("foreign inputs unavailable"))
      : Promise.resolve({
          promptConfig: DEFAULT_PROMPT_CONFIG,
          personas: { anchor: PERSONA, active: PERSONA },
          globalRegexScripts: [],
          scanDepth: 6,
          injectionTokenBudget: 0,
          chatBehavior: DEFAULT_CHAT_BEHAVIOR,
        });
}

describe("accepted-slot totality — swipe", () => {
  test("HAPPY: accepts with the REAL targetMessageId + the slot's speaker, before turnStarted", async () => {
    const { chat, assistantId, speaker, since } = await roomWithReply();

    await chat.turn.swipe({ principal: chat.principal(), chatId: chat.chatId, messageId: assistantId });

    expect(types(since())).toEqual(["turnAccepted", "turnStarted", "delta", "messageCommitted", "turnCompleted"]);
    // The ghost-slot payload: the client renders its pending ghost OVER this message id.
    expect(since()[0]).toMatchObject({ type: "turnAccepted", intent: "swipe", targetMessageId: assistantId, speakerCharacterId: speaker });
  });

  test("NOT_FOUND target: no slot is opened at all (the load is ordered BEFORE the accept)", async () => {
    const { chat, since } = await roomWithReply();

    await expect(
      chat.turn.swipe({ principal: chat.principal(), chatId: chat.chatId, messageId: mintTypeId(ID_PREFIX.message) as MessageId }),
    ).rejects.toThrow();

    expect(types(since())).toEqual([]);
  });

  test("resolveTurnBase throws → the accepted slot CLOSES with turnAborted", async () => {
    const fail: { now: boolean } = { now: false };
    const { chat, assistantId, since } = await roomWithReply({ resolveForeignInputs: faultingForeign(fail) });
    fail.now = true;

    await expect(chat.turn.swipe({ principal: chat.principal(), chatId: chat.chatId, messageId: assistantId })).rejects.toThrow();

    expect(types(since())).toEqual(["turnAccepted", "turnAborted"]);
    expect(since()[0]).toMatchObject({ targetMessageId: assistantId });
    expect(since()[1]).toMatchObject({ type: "turnAborted", intent: "swipe", reason: "error", automationDepth: 0 });
  });

  test("LOCK CONTENTION (a turn already in flight) → the accepted slot CLOSES with turnAborted", async () => {
    const { chat, assistantId, since } = await roomWithReply();
    await holdLock(chat);

    await expect(chat.turn.swipe({ principal: chat.principal(), chatId: chat.chatId, messageId: assistantId })).rejects.toMatchObject({ code: "locked" });

    expect(types(since())).toEqual(["turnAccepted", "turnAborted"]);
    expect(since()[1]).toMatchObject({ reason: "error" });
  });
});

describe("accepted-slot totality — continueTurn", () => {
  test("HAPPY: accepts with the REAL targetMessageId before turnStarted", async () => {
    const { chat, assistantId, speaker, since } = await roomWithReply();

    await chat.turn.continueTurn({ principal: chat.principal(), chatId: chat.chatId, messageId: assistantId });

    expect(types(since())).toEqual(["turnAccepted", "turnStarted", "delta", "messageCommitted", "turnCompleted"]);
    expect(since()[0]).toMatchObject({ type: "turnAccepted", intent: "continue", targetMessageId: assistantId, speakerCharacterId: speaker });
  });

  test("NOT_FOUND target: no slot is opened at all", async () => {
    const { chat, since } = await roomWithReply();

    await expect(
      chat.turn.continueTurn({ principal: chat.principal(), chatId: chat.chatId, messageId: mintTypeId(ID_PREFIX.message) as MessageId }),
    ).rejects.toThrow();

    expect(types(since())).toEqual([]);
  });

  test("resolveTurnBase throws → the accepted slot CLOSES with turnAborted", async () => {
    const fail: { now: boolean } = { now: false };
    const { chat, assistantId, since } = await roomWithReply({ resolveForeignInputs: faultingForeign(fail) });
    fail.now = true;

    await expect(chat.turn.continueTurn({ principal: chat.principal(), chatId: chat.chatId, messageId: assistantId })).rejects.toThrow();

    expect(types(since())).toEqual(["turnAccepted", "turnAborted"]);
    expect(since()[1]).toMatchObject({ intent: "continue", reason: "error" });
  });

  test("LOCK CONTENTION → the accepted slot CLOSES with turnAborted", async () => {
    const { chat, assistantId, since } = await roomWithReply();
    await holdLock(chat);

    await expect(chat.turn.continueTurn({ principal: chat.principal(), chatId: chat.chatId, messageId: assistantId })).rejects.toMatchObject({
      code: "locked",
    });

    expect(types(since())).toEqual(["turnAccepted", "turnAborted"]);
  });
});

describe("accepted-slot totality — generate", () => {
  test("HAPPY: accepts a FRESH slot (no ghost target, no speaker yet) before turnStarted", async () => {
    const { chat, since } = await roomWithReply();

    await chat.turn.generate({ principal: chat.principal(), chatId: chat.chatId });

    expect(types(since())).toEqual(["turnAccepted", "turnStarted", "delta", "messageCommitted", "turnCompleted"]);
    // A fresh reply has nothing to ghost over, and the requested speaker is still UNVALIDATED at accept —
    // `turnStarted` carries the validated one.
    expect(since()[0]).toMatchObject({ type: "turnAccepted", intent: "generate", targetMessageId: null, speakerCharacterId: null });
  });

  test("unknown speaker (post-accept NOT_FOUND) → the accepted slot CLOSES with turnAborted", async () => {
    const { chat, since } = await roomWithReply();

    await expect(
      chat.turn.generate({ principal: chat.principal(), chatId: chat.chatId, speakerCharacterId: mintTypeId(ID_PREFIX.character) as CharacterId }),
    ).rejects.toThrow();

    // The validation is INSIDE the accepted region (it needs the resolved room), so unlike swipe's target
    // check it does open a slot — and must close it.
    expect(types(since())).toEqual(["turnAccepted", "turnAborted"]);
    expect(since()[1]).toMatchObject({ intent: "generate", reason: "error" });
  });

  test("resolveTurnBase throws → the accepted slot CLOSES with turnAborted", async () => {
    const fail: { now: boolean } = { now: false };
    const { chat, since } = await roomWithReply({ resolveForeignInputs: faultingForeign(fail) });
    fail.now = true;

    await expect(chat.turn.generate({ principal: chat.principal(), chatId: chat.chatId })).rejects.toThrow();

    expect(types(since())).toEqual(["turnAccepted", "turnAborted"]);
  });
});

// `forceCharacterTurn` is the ROUND-driving sibling of the three above — a host summoning a named roster
// character. It never went through `runRegistered`, so it kept the late-open defect after the aux fix landed:
// nothing at all reached the room until the engine's `turnStarted`, which lands only after `resolveConnection`
// + `buildTurnContext` (the same memory-recall wall the aux diagnosis measured). Its slot is a FRESH reply
// (`targetMessageId: null`, nothing to ghost over) but its speaker is known at the accept instant — the host
// named them — so unlike `generate` it accepts WITH the character id.
describe("accepted-slot totality — forceCharacterTurn", () => {
  test("HAPPY: accepts with the FORCED speaker and no ghost target, before turnStarted", async () => {
    const { chat, since } = await roomWithReply();

    await chat.turn.forceCharacterTurn({ principal: chat.principal(), chatId: chat.chatId, characterId: chat.chars[0] as CharacterId });

    expect(types(since())).toEqual(["turnAccepted", "turnStarted", "delta", "messageCommitted", "turnCompleted"]);
    expect(since()[0]).toMatchObject({
      type: "turnAccepted",
      // A forced turn's bus intent is `generate` (KIND_TO_INTENT.force) — it appends a fresh assistant reply.
      intent: "generate",
      targetMessageId: null,
      speakerCharacterId: chat.chars[0],
    });
  });

  test("NOT_FOUND target (a character with no present seat): no slot is opened at all", async () => {
    const { chat, since } = await roomWithReply();

    await expect(
      chat.turn.forceCharacterTurn({ principal: chat.principal(), chatId: chat.chatId, characterId: mintTypeId(ID_PREFIX.character) as CharacterId }),
    ).rejects.toThrow();

    // Same ORDERING decision as swipe's: the roster/presence check runs BEFORE the accept.
    expect(types(since())).toEqual([]);
  });

  test("the context build throws → the accepted slot CLOSES with turnAborted", async () => {
    const fail: { now: boolean } = { now: false };
    const { chat, since } = await roomWithReply({ resolveForeignInputs: faultingForeign(fail) });
    fail.now = true;

    await expect(
      chat.turn.forceCharacterTurn({ principal: chat.principal(), chatId: chat.chatId, characterId: chat.chars[0] as CharacterId }),
    ).rejects.toThrow();

    expect(types(since())).toEqual(["turnAccepted", "turnAborted"]);
    expect(since()[1]).toMatchObject({ type: "turnAborted", intent: "generate", reason: "error", automationDepth: 0 });
  });

  test("LOCK CONTENTION → the accepted slot CLOSES with turnAborted (driveRound SWALLOWS the refusal)", async () => {
    const { chat, since } = await roomWithReply();
    await holdLock(chat);

    // Unlike the aux verbs, a forced turn rides `driveRound`, which treats `locked` as "yield the round" — so
    // the verb RESOLVES with zero messages and the accept was the last event the room ever saw.
    const outcome = await chat.turn.forceCharacterTurn({ principal: chat.principal(), chatId: chat.chatId, characterId: chat.chars[0] as CharacterId });

    expect(outcome.messages).toEqual([]);
    expect(types(since())).toEqual(["turnAccepted", "turnAborted"]);
    expect(since()[1]).toMatchObject({ reason: "error" });
  });
});

describe("accepted-slot totality — send (the SHARED engine seam, not an aux verb)", () => {
  test("a send refused on the LOCK closes its own accepted slot — driveRound SWALLOWS that refusal", async () => {
    // `send` has accepted pre-arbitration since the smart-arbiter hang fix, but `driveRound` treats a `locked`
    // refusal as "yield the round" (it breaks and returns what committed), so the verb resolves NORMALLY with
    // just the user row. Before the engine-side close, that accept was the last event the room ever saw.
    const chat = await scenario.chat(tape().reply("never runs"), { characters: ["aria"] });
    await holdLock(chat);

    const outcome = await chat.send("hello");

    expect(outcome.messages.map((m) => m.role)).toEqual(["user"]);
    expect(types(chat.events)).toEqual(["messageCommitted", "turnAccepted", "turnAborted"]);
    expect(chat.events.at(-1)).toMatchObject({ type: "turnAborted", intent: "send", reason: "error", automationDepth: 0 });
  });
});
