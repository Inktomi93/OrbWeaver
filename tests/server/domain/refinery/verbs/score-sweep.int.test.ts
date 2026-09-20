// .int tests for `scoreSweep` — the R4 library score pass (port study I3). The whole point of this verb is
// what it does to CANON without a session, so every test here drives the real chain: the injected
// enumeration op → the scripted summarize tape → the structured parse → the real `stampRefinerySignals`
// merge-write → a read-back of the character row. The four counts are asserted as a partition (every card
// lands in exactly one of scored/skipped/failed) because a sweep whose numbers don't add up is a sweep
// that lied about what it did.

import { SIDE_GEN_POSTURES } from "@orb/contracts/preset";
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
  // One reply per card; bounded submissions preserve the distill pairing (`items[i]` ↔ `replies[i]`).
  h.queueReply(scoreReply({ overallScore: 8.5 }));
  h.queueReply(scoreReply({ overallScore: 3 }));
  const sink = reporter();

  const result = await sweep({ ownerId: owner, rescoreAll: false, report: sink.report, signal: undefined, funderUserId: owner });

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

test("the initial model submission is bounded instead of flooding the whole library in one request", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_sw_bounded" });
  const h = makeRefineryHarness(db);
  for (let i = 0; i < 9; i += 1) {
    await seedOwnedCharacter(h, owner, `sw-card-bounded-${i}`);
    h.queueReply(scoreReply({ overallScore: i + 1 }));
  }
  const batchSizes: number[] = [];
  const deps = refineryWorkloadDepsOf(db, h);
  const sweep = createScoreSweep({
    ...deps,
    roleClientsFor: async (funder) => {
      const rc = await deps.roleClientsFor(funder);
      return {
        ...rc,
        structured: (inputs, opts) => {
          batchSizes.push(inputs.length);
          return rc.structured(inputs, opts);
        },
      };
    },
  });

  const result = await sweep({ ownerId: owner, rescoreAll: false, report: reporter().report, signal: undefined, funderUserId: owner });

  expect(result.scored).toBe(9);
  expect(batchSizes.length).toBeGreaterThan(1);
  expect(Math.max(...batchSizes)).toBeLessThanOrEqual(8);
});

// THE OUTPUT CAP (live-e2e 2026-08-09, open fork 3). The sweep used to ask for the raw `refine_score`
// posture floor — the exact static number that truncated the SESSION path on both attempts and 503'd it
// against the real fleet. Here the same shortfall is quieter and worse: a truncated card just counts
// `failed`, so a library-wide under-budget reads as a bad model rather than as a bad number. The pin is the
// LAW, not the constant: one cap for the batch, never below the shipped floor, and never below the
// HUNGRIEST card's own §8 estimate (`substrate/output-budget` — the same expression the session engine and
// the fit line evaluate).
test("the batch's output cap is PAYLOAD-AWARE and covers the hungriest card, not the raw posture floor", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_sw_budget" });
  const h = makeRefineryHarness(db);
  await seedOwnedCharacter(h, owner, "sw-card-budget-a");
  // A second card with far more selected text: the batch shares ONE cap, so it must be sized for this one.
  // Sized to move the OUTPUT axis (six scored targets vs the plain card's four) while leaving the harness's
  // 8 192-token window room to spare: a card whose PROMPT alone overruns the window is the input-side
  // overrun, where the budget correctly clamps back to the shipped floor — a different arm, not this one.
  const fat = "A meticulous keeper of records. ".repeat(20);
  const verbose = await h.character.create({
    principal: principal(owner),
    input: {
      handle: castId<CharacterHandle>("sw-card-budget-b"),
      name: "Verbose",
      description: fat,
      personality: fat,
      scenario: fat,
      greetings: [{ text: fat }, { text: fat }, { text: fat }],
    },
  });
  const sweep = createScoreSweep(refineryWorkloadDepsOf(db, h));
  h.queueReply(scoreReply());
  h.queueReply(scoreReply());

  await sweep({ ownerId: owner, rescoreAll: false, report: reporter().report, signal: undefined, funderUserId: owner });

  const cap = h.summarizeCalls[0]?.opts?.maxTokens ?? 0;
  expect(cap).toBeGreaterThanOrEqual(SIDE_GEN_POSTURES.refine_score.maxOutputTokens);
  // The hungriest card's need, read through the ONE estimator rather than re-spelled here: a SESSION on that
  // same card derives the same default selection, so its preflight prints exactly the number the sweep sized
  // its cap for. Both calls in the batch carry it — a cap is per generation, and every card shares this one.
  const session = await h.svc.startSession({ principal: principal(owner), characterId: verbose.id });
  const need = (await h.svc.preflight({ principal: principal(owner), sessionId: session.id })).stages.find((s) => s.stage === "score")?.outputEstimate ?? 0;
  expect(need).toBeGreaterThan(SIDE_GEN_POSTURES.refine_score.maxOutputTokens);
  expect(cap).toBeGreaterThanOrEqual(need);
  expect(h.summarizeCalls[1]?.opts?.maxTokens).toBe(cap);
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
  await sweep({ ownerId: owner, rescoreAll: false, report: reporter().report, signal: undefined, funderUserId: owner });
  const callsAfterFill = h.summarizeCalls.length;

  // Pass 2, FILL again: nothing is unscored, so the pass must spend ZERO model calls — the arithmetic the
  // arm exists for (a 500-card library must not pay 500 calls to re-learn what it knows).
  const refill = await sweep({ ownerId: owner, rescoreAll: false, report: reporter().report, signal: undefined, funderUserId: owner });
  // The counts stay HONEST about the library: two cards were in scope and both were skipped as already
  // scored — never "scanned 0", which would read as an empty library.
  expect(refill).toEqual({ scanned: 2, scored: 0, skipped: 2, failed: 0 });
  expect(h.summarizeCalls).toHaveLength(callsAfterFill);

  // Pass 3, REFRESH: every card is back in scope and the new score replaces the old one.
  h.queueReply(scoreReply({ overallScore: 2 }));
  h.queueReply(scoreReply({ overallScore: 2 }));
  const refresh = await sweep({ ownerId: owner, rescoreAll: true, report: reporter().report, signal: undefined, funderUserId: owner });
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

  const result = await sweep({ ownerId: owner, rescoreAll: false, report: sink.report, signal: undefined, funderUserId: owner });

  expect(result).toEqual({ scanned: 2, scored: 1, skipped: 0, failed: 1 });
  const rows = await db.select({ id: characters.id, refinery: characters.refinery }).from(characters).where(eq(characters.ownerId, owner));
  const scoreOf = new Map(rows.map((row) => [row.id, row.refinery?.score ?? null]));
  expect(scoreOf.get(good)).toBe(9);
  // The failed card is left UNSCORED — never a fabricated or zero score (the banned silent fork).
  expect(scoreOf.get(bad)).toBeNull();
  // …and the next FILL run picks it back up, which is what makes containment recoverable rather than lossy.
  h.queueReply(scoreReply({ overallScore: 5 }));
  const retryPass = await sweep({ ownerId: owner, rescoreAll: false, report: reporter().report, signal: undefined, funderUserId: owner });
  expect(retryPass).toEqual({ scanned: 2, scored: 1, skipped: 1, failed: 0 });
});

test("batch containment: an infra rejection on the batch fetch fails those cards, never the whole sweep (crash guard)", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_sw_batchfail" });
  const h = makeRefineryHarness(db);
  await seedOwnedCharacter(h, owner, "sw-card-x");
  await seedOwnedCharacter(h, owner, "sw-card-y");
  const sweep = createScoreSweep(refineryWorkloadDepsOf(db, h));
  // Queue NOTHING: the batch summarize call throws (tape exhausted) — standing in for the real infra failure
  // that motivated the fix. A card whose prompt overruns the model window 400s, and the vLLM summarize surface
  // is all-or-nothing, so one bad card rejects the WHOLE batch. The OLD raw `deps.summarize` let that throw
  // escape `runScoreSweep` (failing the workload, and — uncontained upstream — taking the fleet/server down);
  // the contained fetch degrades to the bounded per-card retry, where each card fails ALONE and the sweep
  // still resolves. Under the pre-fix code this `await sweep(...)` would REJECT; it must now resolve.
  const sink = reporter();

  const result = await sweep({ ownerId: owner, rescoreAll: false, report: sink.report, signal: undefined, funderUserId: owner });

  // Resolves (no throw): both cards counted failed, the four counts still partition the candidate set.
  expect(result).toEqual({ scanned: 2, scored: 0, skipped: 0, failed: 2 });
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

  const result = await sweep({ ownerId: owner, rescoreAll: false, report: sink.report, signal: undefined, funderUserId: owner });

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

  const result = await sweep({ ownerId: mine, rescoreAll: false, report: reporter().report, signal: undefined, funderUserId: mine });

  expect(result).toEqual({ scanned: 1, scored: 1, skipped: 0, failed: 0 });
  const rows = await db.select({ id: characters.id, refinery: characters.refinery }).from(characters);
  const scoreOf = new Map(rows.map((row) => [row.id, row.refinery?.score ?? null]));
  expect(scoreOf.get(myCard)).toBe(4);
  expect(scoreOf.get(theirCard)).toBeNull();
  // THE TERMINAL FAN (survey F2): exactly ONE `charactersChanged`, to the owner whose card was stamped —
  // the library sorts on `refineryScore`, and a workload has no mutation for any client to hang an
  // `invalidates` on, so without this every device kept serving the pre-sweep order. Not one per card
  // (that is a storm over a library-sized loop), and not `refineryChanged` (no refinery row moved).
  expect(h.userEvents).toEqual([{ userId: mine, event: { type: "charactersChanged" } }]);
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

  const result = await sweep({ ownerId: null, rescoreAll: false, report: reporter().report, signal: undefined, funderUserId: alpha });

  expect(result).toEqual({ scanned: 2, scored: 2, skipped: 0, failed: 0 });
  // The stamp op carries the OWNER PREDICATE in its WHERE, so a mixed-owner sweep only lands because each
  // card's own owner rode with it — a dropped owner would silently write nothing (the caller-gate posture).
  const rows = await db.select({ id: characters.id, refinery: characters.refinery }).from(characters);
  const scoreOf = new Map(rows.map((row) => [row.id, row.refinery?.score ?? null]));
  expect(scoreOf.get(alphaCard)).toBe(6);
  expect(scoreOf.get(betaCard)).toBe(6);
  // The terminal fan is PER OWNER for the same reason the stamp is: a user-bus event reaches exactly one
  // user's channel, so a single fan on a mixed-owner pass would leave every other owner frozen. One each,
  // once — never one per card.
  expect(h.userEvents).toEqual([
    { userId: alpha, event: { type: "charactersChanged" } },
    { userId: beta, event: { type: "charactersChanged" } },
  ]);
});

test("an aborted sweep stops before spending a model call", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_sw_abort" });
  const h = makeRefineryHarness(db);
  await seedOwnedCharacter(h, owner, "sw-card-abort");
  const sweep = createScoreSweep(refineryWorkloadDepsOf(db, h));
  const controller = new AbortController();
  controller.abort();

  await expect(sweep({ ownerId: owner, rescoreAll: false, report: reporter().report, signal: controller.signal, funderUserId: owner })).rejects.toThrow();
  expect(h.summarizeCalls).toHaveLength(0);
  // Nothing was stamped, so nothing is announced — the terminal fan's audience is the owners whose cards
  // actually took a score, never "whoever the pass was pointed at". (An abort AFTER some stamps does fan:
  // the set is accumulated as the waves land and announced from a `finally`.)
  expect(h.userEvents).toHaveLength(0);
});
