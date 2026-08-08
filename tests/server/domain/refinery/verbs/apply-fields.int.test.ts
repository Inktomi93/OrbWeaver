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
    { field: "description", greetingIndex: undefined },
    { field: "greetings", greetingIndex: 1 },
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
