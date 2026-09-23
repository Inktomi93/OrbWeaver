// .int tests for `applyFields` — the sharp end (security pass §4.8-13): the accept∩rewrite∩selection
// intersection with per-entry itemized drops (the model/caller cannot widen the apply scope), the LIVE
// greeting-index assert, snapshot-first reversibility, the real `character.update` write, and the honest
// zero-write arm. The REAL character service runs under the apply (its own belts included).

import { GREETING_SLOTS_MAX } from "@orb/contracts/refinery";
import { characterSnapshots } from "@orb/db";
import { RefineryStageNotReadyError } from "@orb/server/domain/refinery";
import { eq } from "drizzle-orm";
import { freshDb, freshHeldDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeRefineryHarness, principal, rewriteReply, scoreReply, seedOwnedCharacter, seedUser } from "../_support.ts";

const SNAPSHOT_INSERT = /insert into "character_snapshots"/iu;

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
  // The §6.2 classification convention: prefix + the session id (the version walk classifies by it).
  expect(snaps[0]?.label).toBe(`auto: before refinery apply · ${session.id}`);
  // …and it holds the PRE-apply description (reversibility — the snapshot is the undo).
  expect(snaps[0]?.content.description).toBe("A meticulous keeper of records who says {{char}} likes {{user}}.");
  // An apply completes the session (a label, not a lock).
  const updated = await h.svc.getSession({ principal: principal(owner), sessionId: session.id });
  expect(updated.status).toBe("completed");
  // The REFINERY half announces exactly once per write (start · rewrite run · this apply) and NOTHING
  // else: the card half is `charactersChanged`, fanned from inside the injected `character.update` on
  // character's OWN emit port (its suite pins it). Re-spelling it here would be the double-invalidate storm.
  expect(h.userEvents.map((e) => e.event.type)).toEqual(["refineryChanged", "refineryChanged", "refineryChanged"]);
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
//    design D171). Every test here drives the WHOLE chain —
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

// ── THE APPEND ARM (fork F-T1, owner-ruled IN for R4 — schema-renderer §7b). Same discipline as the
//    emptying block above: every test drives the WHOLE chain, because a contract that accepts
//    `append:true` proves nothing about what lands in canon. ────────────────────────────────────────────

test("an APPENDED greeting lands as a NEW slot at the end, itemized kind:added, existing slots untouched", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_af_add" });
  const h = makeRefineryHarness(db);
  const characterId = await seedOwnedCharacter(h, owner, "af-card-add");
  const session = await h.svc.startSession({ principal: principal(owner), characterId });
  // THE SPLIT (the owner's own case): greeting 0 keeps the first half, a NEW slot carries the second.
  h.queueReply(
    rewriteReply({
      fields: [
        { field: "greetings", greetingIndex: 0, text: "Welcome to the archive." },
        { field: "greetings", append: true, text: "…and mind the third shelf." },
      ],
    }),
  );
  await h.svc.runStage({ principal: principal(owner), sessionId: session.id, stage: "rewrite" });

  const result = await h.svc.applyFields({
    principal: principal(owner),
    sessionId: session.id,
    accepts: [
      { field: "greetings", greetingIndex: 0 },
      // The APPEND address: the ordinal among the payload's append entries, never a card slot.
      { field: "greetings", appendIndex: 0 },
    ],
  });

  expect(result.applied).toEqual([
    { field: "greetings", greetingIndex: 0, kind: "replaced" },
    { field: "greetings", greetingIndex: undefined, appendIndex: 0, kind: "added" },
  ]);
  expect(result.dropped).toEqual([]);
  // The card GAINED a slot at the tail; the pre-existing greetings kept their positions and their text.
  const readBack = await h.character.get({ principal: principal(owner), characterId });
  expect(readBack.greetings.map((g) => g.text)).toEqual(["Welcome to the archive.", "Back again? The stacks missed you.", "…and mind the third shelf."]);
  // Belt 13 still runs for an additive write — the snapshot holds the two-greeting card.
  const snaps = await db.select().from(characterSnapshots).where(eq(characterSnapshots.characterId, characterId));
  expect(snaps[0]?.content.greetings).toHaveLength(2);
});

test("two appends in one round land in payload order, addressed by their own ordinals", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_af_add2" });
  const h = makeRefineryHarness(db);
  const characterId = await seedOwnedCharacter(h, owner, "af-card-add2");
  const session = await h.svc.startSession({ principal: principal(owner), characterId });
  h.queueReply(
    rewriteReply({
      fields: [
        { field: "greetings", append: true, text: "first new" },
        { field: "description", text: "A meticulous keeper of records." },
        { field: "greetings", append: true, text: "second new" },
      ],
    }),
  );
  await h.svc.runStage({ principal: principal(owner), sessionId: session.id, stage: "rewrite" });

  // Only the SECOND append is kept — proving the ordinal addresses the append LIST (not the payload's
  // `fields` positions, where this entry sits third).
  const result = await h.svc.applyFields({
    principal: principal(owner),
    sessionId: session.id,
    accepts: [{ field: "greetings", appendIndex: 1 }],
  });
  expect(result.applied).toEqual([{ field: "greetings", greetingIndex: undefined, appendIndex: 1, kind: "added" }]);
  const readBack = await h.character.get({ principal: principal(owner), characterId });
  expect(readBack.greetings.map((g) => g.text)).toEqual(["Welcome to the archive.", "Back again? The stacks missed you.", "second new"]);
  // The undecided first append was never sent, so it never landed — belt 10 (fail-closed) for the new arm.
  expect(readBack.greetings.some((g) => g.text === "first new")).toBe(false);
});

test("belt 9 fences an APPEND on the FIELD: greetings out of selection dies, a narrowed index set does NOT block it", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_af_addfence" });
  const h = makeRefineryHarness(db);
  const characterId = await seedOwnedCharacter(h, owner, "af-card-addfence");
  const session = await h.svc.startSession({ principal: principal(owner), characterId });
  // Greetings OUT of scope entirely — a steered append is an invented act, exactly like a steered rewrite.
  await h.svc.updateSession({ principal: principal(owner), sessionId: session.id, patch: { selection: { fields: ["description"] } } });
  h.queueReply(rewriteReply({ fields: [{ field: "greetings", append: true, text: "smuggled" }] }));
  await h.svc.runStage({ principal: principal(owner), sessionId: session.id, stage: "rewrite" });
  const fenced = await h.svc.applyFields({
    principal: principal(owner),
    sessionId: session.id,
    accepts: [{ field: "greetings", appendIndex: 0 }],
  });
  expect(fenced.applied).toEqual([]);
  expect(fenced.dropped).toEqual([{ field: "greetings", greetingIndex: undefined, appendIndex: 0, reason: "not_selected" }]);
  expect((await h.character.get({ principal: principal(owner), characterId })).greetings).toHaveLength(2);

  // …but a selection that NARROWED to specific existing slots still permits an append: a new slot has no
  // index to be inside that set, and gating on it would make "add a greeting" unreachable in any narrowed
  // session (the deliberate asymmetry — the field fence is what belt 9 is actually about here).
  await h.svc.updateSession({
    principal: principal(owner),
    sessionId: session.id,
    patch: { selection: { fields: ["greetings"], greetingIndexes: [0] } },
  });
  h.queueReply(rewriteReply({ fields: [{ field: "greetings", append: true, text: "a third opening" }] }));
  await h.svc.runStage({ principal: principal(owner), sessionId: session.id, stage: "rewrite" });
  const allowed = await h.svc.applyFields({
    principal: principal(owner),
    sessionId: session.id,
    accepts: [{ field: "greetings", appendIndex: 0 }],
  });
  expect(allowed.applied).toEqual([{ field: "greetings", greetingIndex: undefined, appendIndex: 0, kind: "added" }]);
  expect((await h.character.get({ principal: principal(owner), characterId })).greetings.map((g) => g.text)).toEqual([
    "Welcome to the archive.",
    "Back again? The stacks missed you.",
    "a third opening",
  ]);
});

test("an APPEND at the card's greetings ceiling is refused per entry (greeting_cap_reached), never a thrown patch", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_af_cap" });
  const h = makeRefineryHarness(db);
  const characterId = await seedOwnedCharacter(h, owner, "af-card-cap");
  // Fill the card to its ceiling (the card contract's own max) BEFORE the session pins it.
  await h.character.update({
    principal: principal(owner),
    characterId,
    input: { greetings: Array.from({ length: GREETING_SLOTS_MAX }, (_, i) => ({ text: `g${i}` })) },
  });
  const session = await h.svc.startSession({ principal: principal(owner), characterId });
  h.queueReply(rewriteReply({ fields: [{ field: "greetings", append: true, text: "one too many" }] }));
  await h.svc.runStage({ principal: principal(owner), sessionId: session.id, stage: "rewrite" });

  const result = await h.svc.applyFields({
    principal: principal(owner),
    sessionId: session.id,
    accepts: [{ field: "greetings", appendIndex: 0 }],
  });
  // Itemized, not thrown: a card at its ceiling is a LEGAL card, so this is a refusal about one entry —
  // and the belt runs BEFORE the patch is built, so `updateCharacterSchema` is never handed an over-cap array.
  expect(result.applied).toEqual([]);
  expect(result.dropped).toEqual([{ field: "greetings", greetingIndex: undefined, appendIndex: 0, reason: "greeting_cap_reached" }]);
  expect((await h.character.get({ principal: principal(owner), characterId })).greetings).toHaveLength(GREETING_SLOTS_MAX);
});

test("a malformed APPEND address is itemized: an unknown ordinal, and an appendIndex on a non-greetings field", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_af_addbad" });
  const h = makeRefineryHarness(db);
  await seedOwnedCharacter(h, owner, "af-card-addbad");
  const characterId = await seedOwnedCharacter(h, owner, "af-card-addbad2");
  const session = await h.svc.startSession({ principal: principal(owner), characterId });
  h.queueReply(rewriteReply({ fields: [{ field: "greetings", append: true, text: "the only one" }] }));
  await h.svc.runStage({ principal: principal(owner), sessionId: session.id, stage: "rewrite" });

  const result = await h.svc.applyFields({
    principal: principal(owner),
    sessionId: session.id,
    accepts: [
      // Ordinal 4 addresses an append this payload never produced.
      { field: "greetings", appendIndex: 4 },
      // An append address on a field that cannot grow.
      { field: "description", appendIndex: 0 },
    ],
  });
  expect(result.applied).toEqual([]);
  expect(result.dropped).toEqual([
    { field: "greetings", greetingIndex: undefined, appendIndex: 4, reason: "not_in_rewrite" },
    { field: "description", greetingIndex: undefined, appendIndex: 0, reason: "greeting_index_forbidden" },
  ]);
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

test("a card edit landing AFTER the basis read refuses the apply instead of overwriting it (#1446)", async () => {
  const { db, hold } = await freshHeldDb();
  const owner = await seedUser(db, { id: "user_af_race" });
  const h = makeRefineryHarness(db);
  const characterId = await seedOwnedCharacter(h, owner, "af-card-race");
  const session = await h.svc.startSession({ principal: principal(owner), characterId });
  h.queueReply(rewriteReply());
  await h.svc.runStage({ principal: principal(owner), sessionId: session.id, stage: "rewrite" });

  // The window the §21 divergence belt cannot see: it compares against the session's `original_card` pin
  // from session START, while the patch is built from the card read at basis resolution. Holding the belt-13
  // snapshot insert puts a real edit INSIDE that window — another tab, or a plain `character.update` call.
  const snapshotting = hold(SNAPSHOT_INSERT, 1);
  const applying = h.svc.applyFields({ principal: principal(owner), sessionId: session.id, accepts: [{ field: "description" }] });
  await snapshotting.reached;
  await h.character.update({ principal: principal(owner), characterId, input: { description: "the user's own edit, mid-apply" } });
  snapshotting.release();

  // TOTAL refusal, typed: the apply wrote nothing and said so. Silently landing the rewrite here would
  // destroy an edit the user made seconds ago, with no diff and no toast to tell them.
  await expect(applying).rejects.toThrow(/changed while the edit was being prepared/u);
  const live = await h.character.getCard({ principal: principal(owner), characterId });
  expect(live?.description).toBe("the user's own edit, mid-apply");
});

test("a creatorNotes-only edit in the same window ALSO refuses — the fence is not the hash alone (#1560)", async () => {
  const { db, hold } = await freshHeldDb();
  const owner = await seedUser(db, { id: "user_af_notes" });
  const h = makeRefineryHarness(db);
  const characterId = await seedOwnedCharacter(h, owner, "af-card-notes");
  const session = await h.svc.startSession({ principal: principal(owner), characterId });
  h.queueReply(rewriteReply());
  await h.svc.runStage({ principal: principal(owner), sessionId: session.id, stage: "rewrite" });

  // `creatorNotes` is REFINABLE (this verb writes it) and deliberately OUTSIDE the card's identity hash
  // (re-attributing a card must not change what it is — `#kit/serde/card`, pinned in its own suite). So a
  // creator-notes-only edit moves nothing the hash can see: a hash-only fence waves it through and the
  // apply overwrites it, which is the #1446 defect surviving for one field in nine.
  const snapshotting = hold(SNAPSHOT_INSERT, 1);
  const applying = h.svc.applyFields({ principal: principal(owner), sessionId: session.id, accepts: [{ field: "description" }] });
  await snapshotting.reached;
  await h.character.update({ principal: principal(owner), characterId, input: { creatorNotes: "my own note, written mid-apply" } });
  snapshotting.release();

  await expect(applying).rejects.toThrow(/changed while the edit was being prepared/u);
  const live = await h.character.getCard({ principal: principal(owner), characterId });
  expect(live?.creatorNotes).toBe("my own note, written mid-apply");
  // …and the rewrite did NOT land: the refusal is total, not per-field.
  expect(live?.description).toBe("A meticulous keeper of records who says {{char}} likes {{user}}.");
});

test("#1551: a stale_basis refusal leaves ZERO new history rows — the belt-13 snapshot is the apply's witness, not its prelude", async () => {
  const { db, hold } = await freshHeldDb();
  const owner = await seedUser(db, { id: "user_af_witness" });
  const h = makeRefineryHarness(db);
  const characterId = await seedOwnedCharacter(h, owner, "af-card-witness");
  const session = await h.svc.startSession({ principal: principal(owner), characterId });
  h.queueReply(rewriteReply());
  await h.svc.runStage({ principal: principal(owner), sessionId: session.id, stage: "rewrite" });

  // Same race as #1446 above, but the assertion here is on the HISTORY table rather than the live card: the
  // belt-13 snapshot commits BEFORE the conditional write can refuse, so a naive apply left one spurious
  // "auto: before refinery apply" row behind for a write that never happened.
  const snapshotting = hold(SNAPSHOT_INSERT, 1);
  const applying = h.svc.applyFields({ principal: principal(owner), sessionId: session.id, accepts: [{ field: "description" }] });
  await snapshotting.reached;
  await h.character.update({ principal: principal(owner), characterId, input: { description: "the user's own edit, mid-apply" } });
  snapshotting.release();

  await expect(applying).rejects.toThrow(/changed while the edit was being prepared/u);
  const snaps = await db.select().from(characterSnapshots).where(eq(characterSnapshots.characterId, characterId));
  expect(snaps).toHaveLength(0);
});
