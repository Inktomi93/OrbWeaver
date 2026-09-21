// @orb/contracts/rpg/inputs — the transport WIRE input schemas for the `rpg.*` verb procs (W2). Pins the
// TRUST-BOUNDARY behavior the router relies on: the derived unions/enums REJECT garbage at the wire (so a
// malformed actorRef/mode/status/journal-type is a BAD_REQUEST, never a 500 in the domain resolver), the
// steeringNote cap rides through from the config contract, and the optional fields are genuinely optional.

import {
  RPG_JOURNAL_LIST_MAX_LIMIT,
  RPG_STEERING_NOTE_MAX,
  RPG_TURN_TOOL_CALLS_LIST_MAX_LIMIT,
  rpgCreateGameInputSchema,
  rpgDeleteJournalEntryInputSchema,
  rpgDismissActorInputSchema,
  rpgEditJournalEntryInputSchema,
  rpgEditQuestObjectiveInputSchema,
  rpgListJournalInputSchema,
  rpgListTurnToolCallsInputSchema,
  rpgPatchActorInputSchema,
  rpgPatchSheetInputSchema,
  rpgPromoteActorInputSchema,
  rpgRestoreCheckpointInputSchema,
  rpgUpdateConfigInputSchema,
  rpgUpsertQuestInputSchema,
} from "@orb/contracts/rpg";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "../../support/fixtures.ts";

const CHAT_ID = mintTypeId(ID_PREFIX.chat);
/** A wire-shaped character id (the `typeIdSchema(ID_PREFIX.character)` prefix) — the promotion test needs a
 *  VALID roster ref, or the refusal it asserts could be the id shape rather than the arm. */
const CHARACTER_ID = "character_01h0000000000000000000000";

test("TypeID request fields reject malformed and wrong-prefix values", () => {
  expect(rpgCreateGameInputSchema.safeParse({ chatId: CHAT_ID, mode: "lite" }).success).toBe(true);
  expect(rpgCreateGameInputSchema.safeParse({ chatId: mintTypeId(ID_PREFIX.preset), mode: "lite" }).success).toBe(false);
  expect(rpgCreateGameInputSchema.safeParse({ chatId: "chat_not-a-typeid", mode: "lite" }).success).toBe(false);

  const presetId = mintTypeId(ID_PREFIX.preset);
  expect(rpgUpdateConfigInputSchema.safeParse({ chatId: CHAT_ID, gmPresetId: presetId }).success).toBe(true);
  expect(rpgUpdateConfigInputSchema.safeParse({ chatId: CHAT_ID, gmPresetId: mintTypeId(ID_PREFIX.chat) }).success).toBe(false);
  expect(rpgUpdateConfigInputSchema.safeParse({ chatId: CHAT_ID, gmPresetId: "preset_not-a-typeid" }).success).toBe(false);

  const journalId = mintTypeId(ID_PREFIX.rpgJournal);
  for (const schema of [rpgEditJournalEntryInputSchema.shape.entryId, rpgDeleteJournalEntryInputSchema.shape.entryId]) {
    expect(schema.safeParse(journalId).success).toBe(true);
    expect(schema.safeParse(mintTypeId(ID_PREFIX.rpgCheckpoint)).success).toBe(false);
    expect(schema.safeParse("rpg_journal_not-a-typeid").success).toBe(false);
  }

  const checkpoint = rpgRestoreCheckpointInputSchema.shape.checkpointId;
  expect(checkpoint.safeParse(mintTypeId(ID_PREFIX.rpgCheckpoint)).success).toBe(true);
  expect(checkpoint.safeParse(journalId).success).toBe(false);
  expect(checkpoint.safeParse("rpg_checkpoint_not-a-typeid").success).toBe(false);
});

test("createGame: mode is enum-gated at the wire (a bogus mode is refused, not passed to the resolver)", () => {
  expect(rpgCreateGameInputSchema.safeParse({ chatId: CHAT_ID, mode: "lite" }).success).toBe(true);
  // `full` is wire-VALID (the verb throws the typed PHASE refusal) — the enum ships the vocabulary whole.
  expect(rpgCreateGameInputSchema.safeParse({ chatId: CHAT_ID, mode: "full" }).success).toBe(true);
  expect(rpgCreateGameInputSchema.safeParse({ chatId: CHAT_ID, mode: "sandbox" }).success).toBe(false);
  // #862 — `ruleset` is the create-time axis and it is OPTIONAL: a bare create omits it and the verb
  // births `freeform`. The retired `profile` arm must not be wire-reachable (a start-time vocabulary PICK
  // is exactly what the owner ruling replaced with a setting).
  expect(rpgCreateGameInputSchema.safeParse({ chatId: CHAT_ID, mode: "lite" }).data?.ruleset).toBeUndefined();
  expect(rpgCreateGameInputSchema.safeParse({ chatId: CHAT_ID, mode: "lite", ruleset: "d20" }).data?.ruleset).toBe("d20");
  expect(rpgCreateGameInputSchema.safeParse({ chatId: CHAT_ID, mode: "lite", ruleset: "special" }).success).toBe(false);
});

test("updateConfig: the steeringNote cap rides through the derived shape; the knobs are all optional", () => {
  const tooLong = { chatId: CHAT_ID, patch: { steeringNote: "x".repeat(RPG_STEERING_NOTE_MAX + 1) } };
  expect(rpgUpdateConfigInputSchema.safeParse(tooLong).success).toBe(false);
  // A chatId-only update (clearing nothing, keeping the knobs) is valid — every field optional.
  expect(rpgUpdateConfigInputSchema.safeParse({ chatId: CHAT_ID }).success).toBe(true);
  // extractionMode is enum-gated.
  expect(rpgUpdateConfigInputSchema.safeParse({ chatId: CHAT_ID, extractionMode: "cheap" }).success).toBe(true);
  expect(rpgUpdateConfigInputSchema.safeParse({ chatId: CHAT_ID, extractionMode: "yolo" }).success).toBe(false);
});

test("patchSheet: actorRef is the DERIVED discriminated union — a malformed ref is refused at the wire", () => {
  const ok = { chatId: CHAT_ID, actorRef: { kind: "user", userId: "user_a" }, patch: { className: "Ranger" } };
  expect(rpgPatchSheetInputSchema.safeParse(ok).success).toBe(true);
  // A bogus discriminant (not character/user/cast) fails BEFORE the domain sees it (no 500 in the resolver).
  const bogus = { chatId: CHAT_ID, actorRef: { kind: "admin", userId: "user_a" }, patch: {} };
  expect(rpgPatchSheetInputSchema.safeParse(bogus).success).toBe(false);
});

test("upsertQuest: create may seed objectives, but an update cannot send a stale objectives image", () => {
  expect(rpgUpsertQuestInputSchema.safeParse({ chatId: CHAT_ID, name: "Rescue" }).success).toBe(true);
  expect(rpgUpsertQuestInputSchema.safeParse({ chatId: CHAT_ID, name: "Rescue", status: "completed" }).success).toBe(true);
  expect(rpgUpsertQuestInputSchema.safeParse({ chatId: CHAT_ID, name: "Rescue", status: "abandoned" }).success).toBe(false);
  // an authoring objective omits its id (the verb mints it); an empty name is refused.
  const authored = { chatId: CHAT_ID, name: "Rescue", objectives: [{ text: "reach the tower" }] };
  expect(rpgUpsertQuestInputSchema.safeParse(authored).success).toBe(true);
  expect(
    rpgUpsertQuestInputSchema.safeParse({ chatId: CHAT_ID, questId: "quest_alpha", name: "Rescue", objectives: [{ id: "o1", text: "stale" }] }).success,
  ).toBe(false);
  expect(rpgUpsertQuestInputSchema.safeParse({ chatId: CHAT_ID, name: "" }).success).toBe(false);
});

test("editQuestObjective accepts only add/setCompleted/delete operations, never a list image", () => {
  expect(
    rpgEditQuestObjectiveInputSchema.safeParse({
      chatId: CHAT_ID,
      questId: "quest_alpha",
      op: { kind: "setCompleted", objectiveId: "o1", completed: true },
    }).success,
  ).toBe(true);
  expect(rpgEditQuestObjectiveInputSchema.safeParse({ chatId: CHAT_ID, questId: "quest_alpha", objectives: [{ id: "o1", text: "stale" }] }).success).toBe(
    false,
  );
});

test("listJournal: the paging knobs are optional and bounded (1 ≤ limit ≤ max, offset ≥ 0)", () => {
  expect(rpgListJournalInputSchema.safeParse({ chatId: CHAT_ID }).success).toBe(true);
  expect(rpgListJournalInputSchema.safeParse({ chatId: CHAT_ID, limit: 20, offset: 40 }).success).toBe(true);
  expect(rpgListJournalInputSchema.safeParse({ chatId: CHAT_ID, limit: 0 }).success).toBe(false);
  expect(rpgListJournalInputSchema.safeParse({ chatId: CHAT_ID, offset: -1 }).success).toBe(false);
  // The CEILING (#46): an over-bound ask is refused at the wire, never an unbounded SQL `.limit()`.
  expect(rpgListJournalInputSchema.safeParse({ chatId: CHAT_ID, limit: RPG_JOURNAL_LIST_MAX_LIMIT }).success).toBe(true);
  expect(rpgListJournalInputSchema.safeParse({ chatId: CHAT_ID, limit: RPG_JOURNAL_LIST_MAX_LIMIT + 1 }).success).toBe(false);
});

test("listTurnToolCalls: turnLimit is optional and bounded (1 ≤ turnLimit ≤ max) — no offset by design", () => {
  expect(rpgListTurnToolCallsInputSchema.safeParse({ chatId: CHAT_ID }).success).toBe(true);
  expect(rpgListTurnToolCallsInputSchema.safeParse({ chatId: CHAT_ID, turnLimit: 10 }).success).toBe(true);
  expect(rpgListTurnToolCallsInputSchema.safeParse({ chatId: CHAT_ID, turnLimit: 0 }).success).toBe(false);
  // The CEILING (#46): an over-bound ask is refused at the wire, never an unbounded SQL `.limit()`.
  expect(rpgListTurnToolCallsInputSchema.safeParse({ chatId: CHAT_ID, turnLimit: RPG_TURN_TOOL_CALLS_LIST_MAX_LIMIT }).success).toBe(true);
  expect(rpgListTurnToolCallsInputSchema.safeParse({ chatId: CHAT_ID, turnLimit: RPG_TURN_TOOL_CALLS_LIST_MAX_LIMIT + 1 }).success).toBe(false);
});

// The RENAME is the point (2026-08-14): the window stopped counting rows and started counting turns, so the
// old spelling must not keep silently parsing — a stale caller sending `limit: 50` would otherwise ask for
// the DEFAULT window while believing it had set one. zod strips unknown keys by default, which is exactly the
// failure mode this pins against: `limit` must not survive the parse as a usable bound.
test("listTurnToolCalls: the OLD `limit` spelling no longer binds the window", () => {
  const parsed = rpgListTurnToolCallsInputSchema.safeParse({ chatId: CHAT_ID, limit: 7 });
  expect(parsed.success).toBe(true);
  expect(parsed.success && "limit" in parsed.data).toBe(false);
  expect(parsed.success && parsed.data.turnLimit).toBeUndefined();
});

// ── R1: the op-shaped actor door ─────────────────────────────────────────────────────────────────────────

test("patchActor: the target rides the DERIVED actor union and an EMPTY op list is refused at the wire", () => {
  const ok = rpgPatchActorInputSchema.safeParse({
    chatId: CHAT_ID,
    targetRef: { kind: "npc", npcKey: "mira" },
    ops: [{ op: "setTracker", key: "trust", value: { value: 4 } }],
  });
  expect(ok.success).toBe(true);
  // A call that names no op is a write that means nothing — refused here rather than committing a no-op
  // snapshot (which on a committed head would mint a blank state-anchor slot for an unchanged state).
  expect(rpgPatchActorInputSchema.safeParse({ chatId: CHAT_ID, targetRef: { kind: "npc", npcKey: "mira" }, ops: [] }).success).toBe(false);
  // The reserved, unbuilt cross-game library arm (#906) — unrepresentable until `rpg_npcs` lands.
  expect(
    rpgPatchActorInputSchema.safeParse({ chatId: CHAT_ID, targetRef: { kind: "libraryNpc", libraryNpcId: "x" }, ops: [{ op: "setStatus", status: "" }] })
      .success,
  ).toBe(false);
});

test("dismissActor: chatId + the derived actor ref, nothing else", () => {
  expect(rpgDismissActorInputSchema.safeParse({ chatId: CHAT_ID, targetRef: { kind: "npc", npcKey: "mira" } }).success).toBe(true);
  expect(rpgDismissActorInputSchema.safeParse({ chatId: CHAT_ID }).success).toBe(false);
});

// ── R4: the promotion doorway ────────────────────────────────────────────────────────────────────────────

test("promoteActor: the target is the CAST ARM ONLY, and the card content is not on the wire at all", () => {
  expect(rpgPromoteActorInputSchema.safeParse({ chatId: CHAT_ID, targetRef: { kind: "npc", npcKey: "mira" } }).success).toBe(true);
  // Promoting a roster actor is not "refused", it is MEANINGLESS — she already has a card. The wire cannot
  // express it, so no verb has to carry a branch for the case.
  expect(rpgPromoteActorInputSchema.safeParse({ chatId: CHAT_ID, targetRef: { kind: "character", characterId: CHARACTER_ID } }).success).toBe(false);
  expect(rpgPromoteActorInputSchema.safeParse({ chatId: CHAT_ID, targetRef: { kind: "user", userId: "user_a" } }).success).toBe(false);
  // The npc key must ALREADY be its slug here too (the shared refine) — a raw caller cannot promote a
  // non-canonical sibling key into a card.
  expect(rpgPromoteActorInputSchema.safeParse({ chatId: CHAT_ID, targetRef: { kind: "npc", npcKey: "Sister Vesna" } }).success).toBe(false);
  // The card's name/handle/description are the SERVER's derivation off the actor's identity row — a client
  // that could only ever see the plane in projections must not author what lands in it (the R1 lesson).
  const parsed = rpgPromoteActorInputSchema.safeParse({ chatId: CHAT_ID, targetRef: { kind: "npc", npcKey: "mira" }, name: "Not Mira", handle: "hijack" });
  expect(parsed.success && Object.keys(parsed.data)).toEqual(["chatId", "targetRef"]);
});
