// @orb/contracts/rpg/inputs — the transport WIRE input schemas for the `rpg.*` verb procs (W2). Pins the
// TRUST-BOUNDARY behavior the router relies on: the derived unions/enums REJECT garbage at the wire (so a
// malformed actorRef/mode/status/journal-type is a BAD_REQUEST, never a 500 in the domain resolver), the
// steeringNote cap rides through from the config contract, and the optional fields are genuinely optional.

import {
  RPG_STEERING_NOTE_MAX,
  rpgCreateGameInputSchema,
  rpgDismissActorInputSchema,
  rpgListJournalInputSchema,
  rpgPatchActorInputSchema,
  rpgPatchSheetInputSchema,
  rpgUpdateConfigInputSchema,
  rpgUpsertQuestInputSchema,
} from "@orb/contracts/rpg";
import { expect, test } from "../../support/fixtures";

const CHAT_ID = "chat_alpha";

test("createGame: mode is enum-gated at the wire (a bogus mode is refused, not passed to the resolver)", () => {
  expect(rpgCreateGameInputSchema.safeParse({ chatId: CHAT_ID, mode: "lite" }).success).toBe(true);
  // `full` is wire-VALID (the verb throws the typed PHASE refusal) — the enum ships the vocabulary whole.
  expect(rpgCreateGameInputSchema.safeParse({ chatId: CHAT_ID, mode: "full" }).success).toBe(true);
  expect(rpgCreateGameInputSchema.safeParse({ chatId: CHAT_ID, mode: "sandbox" }).success).toBe(false);
  // profile is optional — a bare create omits it (the verb falls to freeform).
  expect(rpgCreateGameInputSchema.safeParse({ chatId: CHAT_ID, mode: "lite" }).data?.profile).toBeUndefined();
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

test("upsertQuest: status is enum-gated; questId + objectives are optional (a fresh quest omits them)", () => {
  expect(rpgUpsertQuestInputSchema.safeParse({ chatId: CHAT_ID, name: "Rescue" }).success).toBe(true);
  expect(rpgUpsertQuestInputSchema.safeParse({ chatId: CHAT_ID, name: "Rescue", status: "completed" }).success).toBe(true);
  expect(rpgUpsertQuestInputSchema.safeParse({ chatId: CHAT_ID, name: "Rescue", status: "abandoned" }).success).toBe(false);
  // an authoring objective omits its id (the verb mints it); an empty name is refused.
  const authored = { chatId: CHAT_ID, name: "Rescue", objectives: [{ text: "reach the tower" }] };
  expect(rpgUpsertQuestInputSchema.safeParse(authored).success).toBe(true);
  expect(rpgUpsertQuestInputSchema.safeParse({ chatId: CHAT_ID, name: "" }).success).toBe(false);
});

test("listJournal: the paging knobs are optional and bounded (limit ≥ 1, offset ≥ 0)", () => {
  expect(rpgListJournalInputSchema.safeParse({ chatId: CHAT_ID }).success).toBe(true);
  expect(rpgListJournalInputSchema.safeParse({ chatId: CHAT_ID, limit: 20, offset: 40 }).success).toBe(true);
  expect(rpgListJournalInputSchema.safeParse({ chatId: CHAT_ID, limit: 0 }).success).toBe(false);
  expect(rpgListJournalInputSchema.safeParse({ chatId: CHAT_ID, offset: -1 }).success).toBe(false);
});

// ── R1: the op-shaped actor door ─────────────────────────────────────────────────────────────────────────

test("patchActor: the target rides the DERIVED actor union and an EMPTY op list is refused at the wire", () => {
  const ok = rpgPatchActorInputSchema.safeParse({
    chatId: CHAT_ID,
    targetRef: { kind: "cast", castKey: "mira" },
    ops: [{ op: "setTracker", key: "trust", value: { value: 4 } }],
  });
  expect(ok.success).toBe(true);
  // A call that names no op is a write that means nothing — refused here rather than committing a no-op
  // snapshot (which on a committed head would mint a blank state-anchor slot for an unchanged state).
  expect(rpgPatchActorInputSchema.safeParse({ chatId: CHAT_ID, targetRef: { kind: "cast", castKey: "mira" }, ops: [] }).success).toBe(false);
  expect(rpgPatchActorInputSchema.safeParse({ chatId: CHAT_ID, targetRef: { kind: "npc", npcId: "x" }, ops: [{ op: "setStatus", status: "" }] }).success).toBe(
    false,
  );
});

test("dismissActor: chatId + the derived actor ref, nothing else", () => {
  expect(rpgDismissActorInputSchema.safeParse({ chatId: CHAT_ID, targetRef: { kind: "cast", castKey: "mira" } }).success).toBe(true);
  expect(rpgDismissActorInputSchema.safeParse({ chatId: CHAT_ID }).success).toBe(false);
});
