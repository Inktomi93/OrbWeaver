// .int tests for `applyAsCopy` (schema-renderer §17 — the branch-off terminal act) and the §21
// DIVERGENCE belt both terminal verbs share: the copy carries the accepted patch while the ORIGINAL card
// is byte-untouched; no snapshot is minted (nothing existing was written); the zero-write arm mints no
// copy; a diverged field drops without `confirmDiverged` and lands with it.

import { characterSnapshots } from "@orb/db";
import { eq } from "drizzle-orm";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeRefineryHarness, principal, rewriteReply, scoreReply, seedOwnedCharacter, seedUser } from "../_support.ts";

test("applyAsCopy mints a fresh character with the accepted patch; the live card and its snapshots are untouched", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_ac_a" });
  const h = makeRefineryHarness(db);
  const characterId = await seedOwnedCharacter(h, owner, "ac-card-a");
  const p = principal(owner);
  const session = await h.svc.startSession({ principal: p, characterId });
  h.queueReply(rewriteReply({ fields: [{ field: "description", text: "REFINED description with {{user}}." }] }));
  await h.svc.runStage({ principal: p, sessionId: session.id, stage: "rewrite" });

  const result = await h.svc.applyAsCopy({ principal: p, sessionId: session.id, accepts: [{ field: "description" }] });
  expect(result.applied).toEqual([{ field: "description", greetingIndex: undefined, kind: "replaced" }]);
  expect(result.character).not.toBeNull();
  expect(result.character?.id).not.toBe(characterId);
  // The copy carries the patch + the default "(refined)" name; the original is byte-untouched.
  expect(result.character?.description).toBe("REFINED description with {{user}}.");
  expect(result.character?.name).toBe("Aria the Archivist (refined)");
  const original = await h.character.get({ principal: p, characterId });
  expect(original.description).toContain("{{char}} likes {{user}}");
  // NO snapshot on either card — nothing existing was written (the §17 no-snapshot contract).
  expect(await db.select().from(characterSnapshots)).toHaveLength(0);
  // The terminal act completes the session.
  const view = await h.svc.getSession({ principal: p, sessionId: session.id });
  expect(view.status).toBe("completed");
  // Three refinery ticks (start · rewrite run · this terminal act); the NEW card's arrival is announced by
  // `duplicate`/`update` on character's own port, never re-spelled here.
  expect(h.userEvents.map((e) => e.event.type)).toEqual(["refineryChanged", "refineryChanged", "refineryChanged"]);
});

test("the zero-write arm mints NO copy: every accept dead on the belts returns character:null", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_ac_b" });
  const h = makeRefineryHarness(db);
  const characterId = await seedOwnedCharacter(h, owner, "ac-card-b");
  const p = principal(owner);
  const session = await h.svc.startSession({ principal: p, characterId });
  h.queueReply(rewriteReply({ fields: [{ field: "description", text: "REFINED." }] }));
  await h.svc.runStage({ principal: p, sessionId: session.id, stage: "rewrite" });
  // `scenario` is not in the rewrite — the only accept drops, so no duplicate is minted.
  const result = await h.svc.applyAsCopy({ principal: p, sessionId: session.id, accepts: [{ field: "scenario" }] });
  expect(result.character).toBeNull();
  expect(result.dropped).toEqual([{ field: "scenario", greetingIndex: undefined, reason: "not_in_rewrite" }]);
  // …and it announces NOTHING: no copy, no session flip, no row moved. The ledger still holds only the
  // setup's two ticks (startSession + the rewrite run) — a freshness event for a write that never happened
  // would be a lie the whole fleet refetches on.
  expect(h.userEvents).toHaveLength(2);
});

test("the §21 divergence belt: a field edited under the session drops without confirmDiverged, lands with it", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_ac_c" });
  const h = makeRefineryHarness(db);
  const characterId = await seedOwnedCharacter(h, owner, "ac-card-c");
  const p = principal(owner);
  const session = await h.svc.startSession({ principal: p, characterId });
  h.queueReply(rewriteReply({ fields: [{ field: "description", text: "REFINED description." }] }));
  await h.svc.runStage({ principal: p, sessionId: session.id, stage: "rewrite" });
  // The live card moves UNDER the session (a hand edit) — the merge conflict.
  await h.character.update({ principal: p, characterId, input: { description: "Hand-edited underneath." } });

  const dropped = await h.svc.applyFields({ principal: p, sessionId: session.id, accepts: [{ field: "description" }] });
  expect(dropped.applied).toEqual([]);
  expect(dropped.dropped).toEqual([{ field: "description", greetingIndex: undefined, reason: "diverged_since_session" }]);
  // The zero-write arm took no snapshot — stated by the null id.
  expect(dropped.snapshotId).toBeNull();

  // The re-confirmed accept passes, snapshots first, and the result carries the rollback point (§16.2).
  const confirmed = await h.svc.applyFields({ principal: p, sessionId: session.id, accepts: [{ field: "description", confirmDiverged: true }] });
  expect(confirmed.applied).toEqual([{ field: "description", greetingIndex: undefined, kind: "replaced" }]);
  expect(confirmed.snapshotId).not.toBeNull();
  const snaps = await db.select().from(characterSnapshots).where(eq(characterSnapshots.characterId, characterId));
  expect(snaps).toHaveLength(1);
  expect(snaps[0]?.id).toBe(confirmed.snapshotId);
  // The snapshot holds the PRE-apply (hand-edited) text — reversibility over the conflict pick.
  expect(snaps[0]?.content.description).toBe("Hand-edited underneath.");
  const detail = await h.character.get({ principal: p, characterId });
  expect(detail.description).toBe("REFINED description.");
});

test("#1519: applying an OLDER named rewrite stamps the copy with the score run correlated to IT, never a newer score run that landed after", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_ac_e" });
  const h = makeRefineryHarness(db);
  const characterId = await seedOwnedCharacter(h, owner, "ac-card-e");
  const p = principal(owner);
  const session = await h.svc.startSession({ principal: p, characterId });

  // Score run #1 (overallScore 6.5, the default SCORE_PAYLOAD), THEN rewrite #1 — this is the rewrite the
  // operate-back apply below re-selects.
  h.queueReply(scoreReply());
  await h.svc.runStage({ principal: p, sessionId: session.id, stage: "score" });
  h.advance(1000);
  h.queueReply(rewriteReply({ fields: [{ field: "description", text: "REFINED against the OLDER score." }] }));
  const olderRewrite = await h.svc.runStage({ principal: p, sessionId: session.id, stage: "rewrite" });
  h.advance(1000);

  // A SECOND, NEWER score run lands after the rewrite the caller is about to apply — the exact drift
  // `latestRunRowOf(sessionId, "score")` (the session's HEAD) could not tell apart from run #1's.
  h.queueReply(scoreReply({ overallScore: 9.5 }));
  await h.svc.runStage({ principal: p, sessionId: session.id, stage: "score" });
  h.advance(1000);
  // A second, newer rewrite too — so "latest rewrite" and "the rewrite this copy applies" visibly diverge.
  h.queueReply(rewriteReply({ fields: [{ field: "description", text: "A newer rewrite nobody is applying." }] }));
  await h.svc.runStage({ principal: p, sessionId: session.id, stage: "rewrite" });

  // The §16.1 operate-back path: apply the OLDER rewrite by id, explicitly.
  const result = await h.svc.applyAsCopy({
    principal: p,
    sessionId: session.id,
    rewriteRunId: olderRewrite.id,
    accepts: [{ field: "description" }],
  });
  expect(result.character?.description).toBe("REFINED against the OLDER score.");
  // The RETURNED `character` is captured before the signal stamp lands (a separate, pre-existing
  // staleness this row does not touch) — re-read the copy to see the actual persisted stamp.
  const copyId = result.character?.id;
  expect(copyId).toBeDefined();
  const copy = await h.character.get({ principal: p, characterId: copyId as NonNullable<typeof copyId> });
  // The copy is stamped with the OLDER score (6.5) — the one that preceded the applied rewrite — never
  // the 9.5 that landed afterward and describes a DIFFERENT rewrite's content.
  expect(copy.refinery?.score).toBe(6.5);
});

test("an UNMOVED field never trips divergence (the belt is about motion, not the storage spelling)", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_ac_d" });
  const h = makeRefineryHarness(db);
  const characterId = await seedOwnedCharacter(h, owner, "ac-card-d");
  const p = principal(owner);
  const session = await h.svc.startSession({ principal: p, characterId });
  h.queueReply(rewriteReply({ fields: [{ field: "description", text: "REFINED, no conflict." }] }));
  await h.svc.runStage({ principal: p, sessionId: session.id, stage: "rewrite" });
  const result = await h.svc.applyFields({ principal: p, sessionId: session.id, accepts: [{ field: "description" }] });
  expect(result.applied).toHaveLength(1);
  expect(result.dropped).toEqual([]);
});
