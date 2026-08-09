// .int tests for `scoreSweep` — the R4 library score pass (port study I3). The whole point of this verb is
// what it does to CANON without a session, so every test here drives the real chain: the injected
// enumeration op → the scripted summarize tape → the structured parse → the real `stampRefinerySignals`
// merge-write → a read-back of the character row. The four counts are asserted as a partition (every card
// lands in exactly one of scored/skipped/failed) because a sweep whose numbers don't add up is a sweep
// that lied about what it did.

import { characters, refineryRuns, refinerySessions } from "@orb/db";
import type { CharacterHandle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createScoreSweep } from "@orb/server/domain/refinery";
import { eq } from "drizzle-orm";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeRefineryHarness, principal, refineryWorkloadDepsOf, scoreReply, seedOwnedCharacter, seedUser } from "../_support.ts";

/** The workload engine's `report` — a sink here, plus the messages the assertions read. */
function reporter(): { report: (p: { message?: string; current?: number; total?: number }) => void; messages: string[] } {
  const messages: string[] = [];
  const report = (p: { message?: string }): void => {
    if (p.message !== undefined) {
      messages.push(p.message);
    }
  };
  return { report, messages };
}

test("the sweep scores every card in the library and stamps the score into canon — no session, no run rows", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_sw_a" });
  const h = makeRefineryHarness(db);
  const first = await seedOwnedCharacter(h, owner, "sw-card-a1");
  const second = await seedOwnedCharacter(h, owner, "sw-card-a2");
  const sweep = createScoreSweep(refineryWorkloadDepsOf(db, h));
  // One batched call, one reply per card — the distill pairing (`items[i]` ↔ `replies[i]`).
  h.queueReply(scoreReply({ overallScore: 8.5 }));
  h.queueReply(scoreReply({ overallScore: 3 }));
  const sink = reporter();

  const result = await sweep({ ownerId: owner, rescoreAll: false, report: sink.report, signal: undefined });

  expect(result).toEqual({ scanned: 2, scored: 2, skipped: 0, failed: 0 });
  // CANON: the scores landed on the rows, in card order, through the same op a session's score run uses.
  const rows = await db.select({ id: characters.id, refinery: characters.refinery }).from(characters).where(eq(characters.ownerId, owner));
  const scoreOf = new Map(rows.map((row) => [row.id, row.refinery?.score ?? null]));
  expect(scoreOf.get(first)).toBe(8.5);
  expect(scoreOf.get(second)).toBe(3);
  // THE NO-SESSION PATH: the sweep is not a session and appends no run ledger rows (its whole reason for
  // existing — a per-card session would mint workspace rows nobody opened).
  expect(await db.select().from(refinerySessions)).toHaveLength(0);
  expect(await db.select().from(refineryRuns)).toHaveLength(0);
  // The other signals half is untouched: the stamp is a per-arm MERGE, never a whole-object overwrite.
  expect(rows.every((row) => row.refinery?.analysis === null)).toBe(true);
  expect(sink.messages.at(-1)).toBe("scored 2 of 2");
});

test("the FILL arm skips already-scored cards; rescoreAll re-scores them", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_sw_fill" });
  const h = makeRefineryHarness(db);
  const first = await seedOwnedCharacter(h, owner, "sw-card-f1");
  await seedOwnedCharacter(h, owner, "sw-card-f2");
  const sweep = createScoreSweep(refineryWorkloadDepsOf(db, h));
  // Pass 1 fills both.
  h.queueReply(scoreReply({ overallScore: 7 }));
  h.queueReply(scoreReply({ overallScore: 7 }));
  await sweep({ ownerId: owner, rescoreAll: false, report: reporter().report, signal: undefined });
  const callsAfterFill = h.summarizeCalls.length;

  // Pass 2, FILL again: nothing is unscored, so the pass must spend ZERO model calls — the arithmetic the
  // arm exists for (a 500-card library must not pay 500 calls to re-learn what it knows).
  const refill = await sweep({ ownerId: owner, rescoreAll: false, report: reporter().report, signal: undefined });
  // The counts stay HONEST about the library: two cards were in scope and both were skipped as already
  // scored — never "scanned 0", which would read as an empty library.
  expect(refill).toEqual({ scanned: 2, scored: 0, skipped: 2, failed: 0 });
  expect(h.summarizeCalls).toHaveLength(callsAfterFill);

  // Pass 3, REFRESH: every card is back in scope and the new score replaces the old one.
  h.queueReply(scoreReply({ overallScore: 2 }));
  h.queueReply(scoreReply({ overallScore: 2 }));
  const refresh = await sweep({ ownerId: owner, rescoreAll: true, report: reporter().report, signal: undefined });
  expect(refresh).toEqual({ scanned: 2, scored: 2, skipped: 0, failed: 0 });
  const [row] = await db.select({ refinery: characters.refinery }).from(characters).where(eq(characters.id, first));
  expect(row?.refinery?.score).toBe(2);
});

test("per-card containment: one card's unusable reply fails ALONE — the rest still land", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_sw_fail" });
  const h = makeRefineryHarness(db);
  const good = await seedOwnedCharacter(h, owner, "sw-card-g");
  const bad = await seedOwnedCharacter(h, owner, "sw-card-b");
  const sweep = createScoreSweep(refineryWorkloadDepsOf(db, h));
  h.queueReply(scoreReply({ overallScore: 9 }));
  // Card 2's batch reply is junk, and so is its ONE bounded retry — the double failure the pass contains.
  h.queueReply("not json at all");
  h.queueReply("still not json");
  const sink = reporter();

  const result = await sweep({ ownerId: owner, rescoreAll: false, report: sink.report, signal: undefined });

  expect(result).toEqual({ scanned: 2, scored: 1, skipped: 0, failed: 1 });
  const rows = await db.select({ id: characters.id, refinery: characters.refinery }).from(characters).where(eq(characters.ownerId, owner));
  const scoreOf = new Map(rows.map((row) => [row.id, row.refinery?.score ?? null]));
  expect(scoreOf.get(good)).toBe(9);
  // The failed card is left UNSCORED — never a fabricated or zero score (the banned silent fork).
  expect(scoreOf.get(bad)).toBeNull();
  // …and the next FILL run picks it back up, which is what makes containment recoverable rather than lossy.
  h.queueReply(scoreReply({ overallScore: 5 }));
  const retryPass = await sweep({ ownerId: owner, rescoreAll: false, report: reporter().report, signal: undefined });
  expect(retryPass).toEqual({ scanned: 2, scored: 1, skipped: 1, failed: 0 });
});

test("the CONTENT FLOOR counts a name-only card as skipped, never as scored or failed", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_sw_floor" });
  const h = makeRefineryHarness(db);
  await seedOwnedCharacter(h, owner, "sw-card-real");
  // A card with a name and NOTHING else: there is no refinable text to critique, so the sweep must decline
  // rather than ask a model to invent a quality judgement out of a name.
  await h.character.create({
    principal: principal(owner),
    // An EMPTY description is the card contract's own spelling of "nothing written" (the field is required
    // on create), so this really is a name-only card — not a card the fixture forgot to fill in.
    input: { handle: castId<CharacterHandle>("sw-card-empty"), name: "Nameless", description: "" },
  });
  const sweep = createScoreSweep(refineryWorkloadDepsOf(db, h));
  h.queueReply(scoreReply({ overallScore: 6 }));
  const sink = reporter();

  const result = await sweep({ ownerId: owner, rescoreAll: false, report: sink.report, signal: undefined });

  expect(result).toEqual({ scanned: 2, scored: 1, skipped: 1, failed: 0 });
  // Exactly ONE model call was made — the skipped card never reached the tape.
  expect(h.summarizeCalls).toHaveLength(1);
});

test("a sweep is OWNER-SCOPED: another owner's cards are neither read nor stamped", async () => {
  const db = await freshDb();
  const mine = await seedUser(db, { id: "user_sw_mine" });
  const theirs = await seedUser(db, { id: "user_sw_theirs" });
  const h = makeRefineryHarness(db);
  const myCard = await seedOwnedCharacter(h, mine, "sw-card-mine");
  const theirCard = await seedOwnedCharacter(h, theirs, "sw-card-theirs");
  const sweep = createScoreSweep(refineryWorkloadDepsOf(db, h));
  h.queueReply(scoreReply({ overallScore: 4 }));

  const result = await sweep({ ownerId: mine, rescoreAll: false, report: reporter().report, signal: undefined });

  expect(result).toEqual({ scanned: 1, scored: 1, skipped: 0, failed: 0 });
  const rows = await db.select({ id: characters.id, refinery: characters.refinery }).from(characters);
  const scoreOf = new Map(rows.map((row) => [row.id, row.refinery?.score ?? null]));
  expect(scoreOf.get(myCard)).toBe(4);
  expect(scoreOf.get(theirCard)).toBeNull();
});

test("the BULK arm (ownerId null) sweeps every owner, stamping each card under ITS OWN owner", async () => {
  const db = await freshDb();
  const alpha = await seedUser(db, { id: "user_sw_alpha" });
  const beta = await seedUser(db, { id: "user_sw_beta" });
  const h = makeRefineryHarness(db);
  const alphaCard = await seedOwnedCharacter(h, alpha, "sw-card-alpha");
  const betaCard = await seedOwnedCharacter(h, beta, "sw-card-beta");
  const sweep = createScoreSweep(refineryWorkloadDepsOf(db, h));
  h.queueReply(scoreReply({ overallScore: 6 }));
  h.queueReply(scoreReply({ overallScore: 6 }));

  const result = await sweep({ ownerId: null, rescoreAll: false, report: reporter().report, signal: undefined });

  expect(result).toEqual({ scanned: 2, scored: 2, skipped: 0, failed: 0 });
  // The stamp op carries the OWNER PREDICATE in its WHERE, so a mixed-owner sweep only lands because each
  // card's own owner rode with it — a dropped owner would silently write nothing (the caller-gate posture).
  const rows = await db.select({ id: characters.id, refinery: characters.refinery }).from(characters);
  const scoreOf = new Map(rows.map((row) => [row.id, row.refinery?.score ?? null]));
  expect(scoreOf.get(alphaCard)).toBe(6);
  expect(scoreOf.get(betaCard)).toBe(6);
});

test("an aborted sweep stops before spending a model call", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_sw_abort" });
  const h = makeRefineryHarness(db);
  await seedOwnedCharacter(h, owner, "sw-card-abort");
  const sweep = createScoreSweep(refineryWorkloadDepsOf(db, h));
  const controller = new AbortController();
  controller.abort();

  await expect(sweep({ ownerId: owner, rescoreAll: false, report: reporter().report, signal: controller.signal })).rejects.toThrow();
  expect(h.summarizeCalls).toHaveLength(0);
});
