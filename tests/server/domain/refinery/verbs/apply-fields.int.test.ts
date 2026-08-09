// .int tests for `applyFields` — the sharp end (security pass §4.8-13): the accept∩rewrite∩selection
// intersection with per-entry itemized drops (the model/caller cannot widen the apply scope), the LIVE
// greeting-index assert, snapshot-first reversibility, the real `character.update` write, and the honest
// zero-write arm. The REAL character service runs under the apply (its own belts included).

import { characterSnapshots } from "@orb/db";
import { RefineryStageNotReadyError } from "@orb/server/domain/refinery";
import { eq } from "drizzle-orm";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeRefineryHarness, principal, rewriteReply, scoreReply, seedOwnedCharacter, seedUser } from "../_support.ts";

test("accepted entries land on the LIVE card, snapshot-first, per-entry drops itemized, session completes", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_af_a" });
  const h = makeRefineryHarness(db);
  const characterId = await seedOwnedCharacter(h, owner, "af-card-a");
  const session = await h.svc.startSession({ principal: principal(owner), characterId });
  h.queueReply(rewriteReply());
  await h.svc.runStage({ principal: principal(owner), sessionId: session.id, stage: "rewrite" });

  const result = await h.svc.applyFields({
    principal: principal(owner),
    sessionId: session.id,
    accepts: [
      { field: "description" },
      { field: "greetings", greetingIndex: 1 },
      // NOT in the rewrite payload → itemized drop, never a whole-payload refusal.
      { field: "systemPrompt" },
      // greetingIndex on a non-greetings field → the biconditional's other arm.
      { field: "personality", greetingIndex: 0 },
    ],
  });

  expect(result.applied).toEqual([
    { field: "description", greetingIndex: undefined, kind: "replaced" },
    { field: "greetings", greetingIndex: 1, kind: "replaced" },
  ]);
  expect(result.dropped).toEqual([
    { field: "systemPrompt", greetingIndex: undefined, reason: "not_in_rewrite" },
    { field: "personality", greetingIndex: 0, reason: "greeting_index_forbidden" },
  ]);
  // The LIVE card took exactly the accepted texts (through the REAL character.update belt).
  expect(result.character.description).toBe("A meticulous keeper of records; {{char}} files every memory of {{user}}.");
  expect(result.character.greetings[1]?.text).toBe("Back again? The stacks kept your seat warm.");
  expect(result.character.greetings[0]?.text).toBe("Welcome to the archive.");
  // Snapshot-first (belt 13): the auto snapshot exists with the ruled label.
  const snaps = await db.select().from(characterSnapshots).where(eq(characterSnapshots.characterId, characterId));
  expect(snaps).toHaveLength(1);
  expect(snaps[0]?.label).toBe("auto: before refinery apply");
  // …and it holds the PRE-apply description (reversibility — the snapshot is the undo).
  expect(snaps[0]?.content.description).toBe("A meticulous keeper of records who says {{char}} likes {{user}}.");
  // An apply completes the session (a label, not a lock).
  const updated = await h.svc.getSession({ principal: principal(owner), sessionId: session.id });
  expect(updated.status).toBe("completed");
});

test("the selection intersection stops scope-widening: a rewritten-but-UNSELECTED field is dropped", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_af_b" });
  const h = makeRefineryHarness(db);
  const characterId = await seedOwnedCharacter(h, owner, "af-card-b");
  const session = await h.svc.startSession({ principal: principal(owner), characterId });
  // Narrow the selection to greetings ONLY — the model's description rewrite must not be applicable.
  await h.svc.updateSession({ principal: principal(owner), sessionId: session.id, patch: { selection: { fields: ["greetings"] } } });
  h.queueReply(rewriteReply());
  await h.svc.runStage({ principal: principal(owner), sessionId: session.id, stage: "rewrite" });

  const result = await h.svc.applyFields({ principal: principal(owner), sessionId: session.id, accepts: [{ field: "description" }] });
  expect(result.applied).toEqual([]);
  expect(result.dropped).toEqual([{ field: "description", greetingIndex: undefined, reason: "not_selected" }]);
  // The honest ZERO-WRITE arm: no snapshot, card untouched.
  expect(await db.select().from(characterSnapshots).where(eq(characterSnapshots.characterId, characterId))).toHaveLength(0);
  expect(result.character.description).toBe("A meticulous keeper of records who says {{char}} likes {{user}}.");
});

test("the selection fence honors greetingIndexes: an accepted rewrite of an UNSELECTED greeting index is dropped", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_af_gi" });
  const h = makeRefineryHarness(db);
  const characterId = await seedOwnedCharacter(h, owner, "af-card-gi");
  const session = await h.svc.startSession({ principal: principal(owner), characterId });
  // The user narrows to greeting index 0 ONLY — greeting 1 is out of the pipeline (never fed to the model).
  await h.svc.updateSession({
    principal: principal(owner),
    sessionId: session.id,
    patch: { selection: { fields: ["greetings"], greetingIndexes: [0] } },
  });
  // A (potentially prompt-steered) rewrite fabricates an entry for greeting 1 — a slot the user did NOT
  // select. `rewriteReply()` carries exactly that greetingIndex:1 entry.
  h.queueReply(rewriteReply());
  await h.svc.runStage({ principal: principal(owner), sessionId: session.id, stage: "rewrite" });

  const result = await h.svc.applyFields({
    principal: principal(owner),
    sessionId: session.id,
    accepts: [{ field: "greetings", greetingIndex: 1 }],
  });
  // Belt 9 must fence on the SELECTED indexes, not just the greetings field — the model cannot widen its
  // apply scope to an unselected greeting slot even with an explicit accept.
  expect(result.applied).toEqual([]);
  expect(result.dropped).toEqual([{ field: "greetings", greetingIndex: 1, reason: "not_selected" }]);
  // The zero-write arm: greeting 1 untouched, no snapshot.
  expect(result.character.greetings[1]?.text).toBe("Back again? The stacks missed you.");
  expect(await db.select().from(characterSnapshots).where(eq(characterSnapshots.characterId, characterId))).toHaveLength(0);
});

test("the greeting-index assert runs against the LIVE card: an index deleted since session start drops", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_af_c" });
  const h = makeRefineryHarness(db);
  const characterId = await seedOwnedCharacter(h, owner, "af-card-c");
  const session = await h.svc.startSession({ principal: principal(owner), characterId });
  h.queueReply(rewriteReply());
  await h.svc.runStage({ principal: principal(owner), sessionId: session.id, stage: "rewrite" });
  // The owner deletes greeting 1 AFTER the rewrite ran — the snapshot still has 2 greetings, the LIVE
  // card has 1; the apply must not re-create the deleted slot by index.
  await h.character.update({ principal: principal(owner), characterId, input: { greetings: [{ text: "Welcome to the archive." }] } });

  const result = await h.svc.applyFields({
    principal: principal(owner),
    sessionId: session.id,
    accepts: [{ field: "greetings", greetingIndex: 1 }, { field: "greetings" }],
  });
  expect(result.applied).toEqual([]);
  expect(result.dropped).toEqual([
    { field: "greetings", greetingIndex: 1, reason: "greeting_index_invalid" },
    { field: "greetings", greetingIndex: undefined, reason: "greeting_index_missing" },
  ]);
});

// ── THE EMPTYING ARM (owner overrule 2026-08-08: "they can fill it therefore they can empty it";
//    design docs/design/refinery-schema-renderer.md §15). Every test here drives the WHOLE chain —
//    tape payload → contract parse → run row → apply verb → `character.update` → the read-back card —
//    because the schema accepting `cleared:true` proves nothing about what lands in canon. ─────────────

test("a CLEARED entry empties the field in canon, itemized as kind:cleared, and the snapshot holds the old text", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_af_clr" });
  const h = makeRefineryHarness(db);
  const characterId = await seedOwnedCharacter(h, owner, "af-card-clr");
  const session = await h.svc.startSession({ principal: principal(owner), characterId });
  // The consolidation shape: description absorbs the content, personality is emptied as its donor.
  h.queueReply(
    rewriteReply({
      fields: [
        { field: "description", text: "A meticulous, dry-humoured keeper of records." },
        { field: "personality", cleared: true },
      ],
    }),
  );
  await h.svc.runStage({ principal: principal(owner), sessionId: session.id, stage: "rewrite" });

  const result = await h.svc.applyFields({
    principal: principal(owner),
    sessionId: session.id,
    accepts: [{ field: "description" }, { field: "personality" }],
  });

  // The outcome itemizes DESTRUCTION separately from replacement (§15.5) — consent is to a named act.
  expect(result.applied).toEqual([
    { field: "description", greetingIndex: undefined, kind: "replaced" },
    { field: "personality", greetingIndex: undefined, kind: "cleared" },
  ]);
  expect(result.dropped).toEqual([]);
  // The nullable card field clears to NULL, not to "" — one spelling of empty (§15.3).
  expect(result.character.personality).toBeNull();
  expect(result.character.description).toBe("A meticulous, dry-humoured keeper of records.");
  // READ-BACK through the real character verb: the row itself, not the write's own return value.
  const readBack = await h.character.get({ principal: principal(owner), characterId });
  expect(readBack.personality).toBeNull();
  expect(readBack.description).toBe("A meticulous, dry-humoured keeper of records.");
  // Belt 13 — an emptying write is reversible: the pre-apply snapshot still carries the donor text.
  const snaps = await db.select().from(characterSnapshots).where(eq(characterSnapshots.characterId, characterId));
  expect(snaps[0]?.content.personality).toBe("precise, dry-humoured");
});

test('clear(description) writes "" and clear(depthPrompt) drops the whole note — the per-field applicability arms', async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_af_desc" });
  const h = makeRefineryHarness(db);
  const characterId = await seedOwnedCharacter(h, owner, "af-card-desc");
  // The card must carry a depth note BEFORE the session pins it (an absent note is the `not_applicable` belt).
  await h.character.update({
    principal: principal(owner),
    characterId,
    input: { depthPrompt: { prompt: "Stay archival.", depth: 4, role: "system" } },
  });
  const session = await h.svc.startSession({ principal: principal(owner), characterId });
  h.queueReply(
    rewriteReply({
      fields: [
        { field: "description", cleared: true },
        { field: "depthPrompt", cleared: true },
      ],
    }),
  );
  await h.svc.runStage({ principal: principal(owner), sessionId: session.id, stage: "rewrite" });

  const result = await h.svc.applyFields({
    principal: principal(owner),
    sessionId: session.id,
    accepts: [{ field: "description" }, { field: "depthPrompt" }],
  });
  expect(result.applied.map((a) => a.kind)).toEqual(["cleared", "cleared"]);
  // `updateCharacterSchema.description` is NON-nullable (contracts/character — the card face's own shape),
  // so the ONE field whose clear cannot be null spells empty as "" (§15.3's declared asymmetry).
  expect(result.character.description).toBe("");
  // The note AND its authored `{depth, role}` directive go together — a dangling directive is the
  // degenerate state the `not_applicable` belt exists to avoid.
  expect(result.character.depthPrompt).toBeNull();
  const readBack = await h.character.get({ principal: principal(owner), characterId });
  expect(readBack.description).toBe("");
  expect(readBack.depthPrompt).toBeNull();
});

test("a cleared GREETING removes the slot — an entry removal, never an empty-string greeting", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_af_grm" });
  const h = makeRefineryHarness(db);
  const characterId = await seedOwnedCharacter(h, owner, "af-card-grm");
  const session = await h.svc.startSession({ principal: principal(owner), characterId });
  // Both greeting writes in ONE round, so the two kinds are proven to be different writes: index 0 is
  // REPLACED (text survives at its slot), index 1 is REMOVED (the slot itself goes).
  h.queueReply(
    rewriteReply({
      fields: [
        { field: "greetings", greetingIndex: 0, text: "The archive is open." },
        { field: "greetings", greetingIndex: 1, cleared: true },
      ],
    }),
  );
  await h.svc.runStage({ principal: principal(owner), sessionId: session.id, stage: "rewrite" });

  const result = await h.svc.applyFields({
    principal: principal(owner),
    sessionId: session.id,
    accepts: [
      { field: "greetings", greetingIndex: 0 },
      { field: "greetings", greetingIndex: 1 },
    ],
  });
  expect(result.applied).toEqual([
    { field: "greetings", greetingIndex: 0, kind: "replaced" },
    { field: "greetings", greetingIndex: 1, kind: "cleared" },
  ]);
  // The card LOST a slot; it did not gain a blank one (an empty greeting is offered in chat — §15.2).
  expect(result.character.greetings).toHaveLength(1);
  expect(result.character.greetings[0]?.text).toBe("The archive is open.");
  const readBack = await h.character.get({ principal: principal(owner), characterId });
  expect(readBack.greetings).toHaveLength(1);
  expect(readBack.greetings.some((g) => g.text === "")).toBe(false);
});

test("the last greeting cannot be cleared away — would_leave_no_greeting, itemized not thrown", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_af_last" });
  const h = makeRefineryHarness(db);
  const characterId = await seedOwnedCharacter(h, owner, "af-card-last");
  const session = await h.svc.startSession({ principal: principal(owner), characterId });
  h.queueReply(
    rewriteReply({
      fields: [
        { field: "greetings", greetingIndex: 0, cleared: true },
        { field: "greetings", greetingIndex: 1, cleared: true },
      ],
    }),
  );
  await h.svc.runStage({ principal: principal(owner), sessionId: session.id, stage: "rewrite" });

  const result = await h.svc.applyFields({
    principal: principal(owner),
    sessionId: session.id,
    accepts: [
      { field: "greetings", greetingIndex: 0 },
      { field: "greetings", greetingIndex: 1 },
    ],
  });
  // The FIRST clear lands; the second would leave a card with zero greetings, which is a worse authoring
  // state than any empty field — refused per entry with its own typed reason.
  expect(result.applied).toEqual([{ field: "greetings", greetingIndex: 0, kind: "cleared" }]);
  expect(result.dropped).toEqual([{ field: "greetings", greetingIndex: 1, reason: "would_leave_no_greeting" }]);
  expect(result.character.greetings).toHaveLength(1);
});

test("removing a greeting REMAPS the session's selected indexes (survivors shift down, in the same act)", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_af_remap" });
  const h = makeRefineryHarness(db);
  const characterId = await seedOwnedCharacter(h, owner, "af-card-remap");
  await h.character.update({
    principal: principal(owner),
    characterId,
    input: { greetings: [{ text: "g0" }, { text: "g1" }, { text: "g2" }, { text: "g3" }] },
  });
  const session = await h.svc.startSession({ principal: principal(owner), characterId });
  // The doc's worked example (§15.2): [0,2,3] minus a removal at 2 → [0,2].
  await h.svc.updateSession({
    principal: principal(owner),
    sessionId: session.id,
    patch: { selection: { fields: ["greetings"], greetingIndexes: [0, 2, 3] } },
  });
  h.queueReply(rewriteReply({ fields: [{ field: "greetings", greetingIndex: 2, cleared: true }] }));
  await h.svc.runStage({ principal: principal(owner), sessionId: session.id, stage: "rewrite" });

  const result = await h.svc.applyFields({
    principal: principal(owner),
    sessionId: session.id,
    accepts: [{ field: "greetings", greetingIndex: 2 }],
  });
  expect(result.applied).toEqual([{ field: "greetings", greetingIndex: 2, kind: "cleared" }]);
  expect(result.character.greetings.map((g) => g.text)).toEqual(["g0", "g1", "g3"]);
  // The session speaks in POSITIONS, so a removal that did not remap would silently re-point every
  // selected index above it at a different greeting.
  const after = await h.svc.getSession({ principal: principal(owner), sessionId: session.id });
  expect(after.selection.greetingIndexes).toEqual([0, 2]);
});

test("belt 9 fences a CLEAR exactly like a rewrite: an unselected field and an unselected greeting index both die", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_af_fence" });
  const h = makeRefineryHarness(db);
  const characterId = await seedOwnedCharacter(h, owner, "af-card-fence");
  const session = await h.svc.startSession({ principal: principal(owner), characterId });
  // The user narrows to greeting 0 only. A prompt-steered payload then asks to DESTROY two things it was
  // never given: an unselected field, and an unselected greeting slot.
  await h.svc.updateSession({
    principal: principal(owner),
    sessionId: session.id,
    patch: { selection: { fields: ["greetings"], greetingIndexes: [0] } },
  });
  h.queueReply(
    rewriteReply({
      fields: [
        { field: "systemPrompt", cleared: true },
        { field: "greetings", greetingIndex: 1, cleared: true },
      ],
    }),
  );
  await h.svc.runStage({ principal: principal(owner), sessionId: session.id, stage: "rewrite" });

  const result = await h.svc.applyFields({
    principal: principal(owner),
    sessionId: session.id,
    accepts: [{ field: "systemPrompt" }, { field: "greetings", greetingIndex: 1 }],
  });
  expect(result.applied).toEqual([]);
  expect(result.dropped).toEqual([
    { field: "systemPrompt", greetingIndex: undefined, reason: "not_selected" },
    { field: "greetings", greetingIndex: 1, reason: "not_selected" },
  ]);
  // The honest ZERO-WRITE arm holds for destruction too: no snapshot, both greetings intact.
  expect(await db.select().from(characterSnapshots).where(eq(characterSnapshots.characterId, characterId))).toHaveLength(0);
  expect(result.character.greetings).toHaveLength(2);
});

test("apply with no rewrite run is the typed stage-order refusal; analyze payloads never apply", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_af_d" });
  const h = makeRefineryHarness(db);
  const characterId = await seedOwnedCharacter(h, owner, "af-card-d");
  const session = await h.svc.startSession({ principal: principal(owner), characterId });
  // A score run exists; there is still nothing applicable (apply reads ONLY the rewrite log).
  h.queueReply(scoreReply());
  await h.svc.runStage({ principal: principal(owner), sessionId: session.id, stage: "score" });
  await expect(h.svc.applyFields({ principal: principal(owner), sessionId: session.id, accepts: [{ field: "description" }] })).rejects.toBeInstanceOf(
    RefineryStageNotReadyError,
  );
});
