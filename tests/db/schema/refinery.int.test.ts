// .int tests for schema/refinery (R0 — docs/design/refinery-r0.md §4.3). Real libSQL :memory: via
// freshDb (FK PRAGMA ON). Covers: session insert→select round-trip (branded id, status default, the
// three notNull JSON columns), the run round-trip (typed payload + provenance config, nullable usage),
// the D23 DERIVED-ownership cascade chain (user → character → session → run — sessions carry NO
// owner_id; the character FK is the ownership anchor), the stage CHECK constraint (drizzle emits CHECK
// for text-enum columns), the FK rejection on a phantom session, and the latest-run-per-(session,stage)
// read the composite index serves.

import type { CharacterCard } from "@orb/contracts/character";
import type { RefineryScorePayload, RefinerySelection } from "@orb/contracts/refinery";
import { DEFAULT_REFINERY_STAGE_CONFIG, REFINERY_SESSION_STATUSES, REFINERY_STAGES } from "@orb/contracts/refinery";
import type { Db } from "@orb/db";
import { characters, refineryRuns, refinerySessions, users } from "@orb/db";
import { isConstraintViolation } from "@orb/db/kit";
import type { CharacterHandle, CharacterId, Handle, ModelId, RefineryRunId, RefinerySessionId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { and, desc, eq, sql } from "drizzle-orm";
import { freshDb } from "../../support/db.ts";
import { expect, test } from "../../support/fixtures.ts";
import { seedUser } from "./_support.ts";

// Deterministic timestamps for the ordering pin (no wall clock in tests — Spine-Testing §3).
const RUN_AT_EARLY = 1_700_000_000_000;
const RUN_AT_MID = 1_700_000_050_000;
const RUN_AT_LATE = 1_700_000_100_000;

const MODEL = castId<ModelId>("vetted-model");

// The anti-drift anchor blob — a minimal-but-complete canonical card (the character_snapshots.content shape).
const ORIGINAL_CARD: CharacterCard = {
  name: "Aria",
  description: "calm",
  personality: null,
  scenario: null,
  greetings: [{ text: "hi" }, { text: "back again?" }],
  exampleMessages: null,
  systemPrompt: null,
  postHistoryInstructions: null,
  depthPrompt: null,
  creatorNotes: null,
  creator: null,
  cardVersion: null,
  nickname: null,
  source: null,
  creationDate: null,
  modificationDate: null,
  extensions: null,
  residualData: null,
  avatarAssetId: null,
  refinery: null,
};

const SELECTION: RefinerySelection = { fields: ["description", "greetings"], greetingIndexes: [1] };

const SCORE_PAYLOAD: RefineryScorePayload = {
  fieldScores: [{ field: "description", score: 7, strengths: "clear", weaknesses: "thin", suggestions: "add texture" }],
  overallScore: 7,
  priorityImprovements: ["add texture"],
  summary: "solid",
};

async function seedCharacter(db: Db, ownerId: UserId, id: string): Promise<CharacterId> {
  const characterId = castId<CharacterId>(id);
  await db.insert(characters).values({
    id: characterId,
    handle: castId<CharacterHandle>(`card-${id}`),
    ownerId,
    contentHash: "hash-refinery",
    name: "Refined",
  });
  return characterId;
}

async function seedSession(db: Db, characterId: CharacterId, id: string): Promise<RefinerySessionId> {
  const sessionId = castId<RefinerySessionId>(id);
  await db.insert(refinerySessions).values({
    id: sessionId,
    characterId,
    originalCard: ORIGINAL_CARD,
    selection: SELECTION,
    stageConfig: DEFAULT_REFINERY_STAGE_CONFIG,
  });
  return sessionId;
}

test("refinery_sessions insert→select round-trips (status default, the three JSON columns)", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_ref_a", handle: castId<Handle>("ref-owner-a") });
  const characterId = await seedCharacter(db, ownerId, "character_ref_roundtrip");
  const sessionId = await seedSession(db, characterId, "refinery_session_roundtrip");

  const rows = await db.select().from(refinerySessions).where(eq(refinerySessions.id, sessionId));
  expect(rows).toHaveLength(1);
  expect(rows[0]?.id).toBe(sessionId);
  expect(rows[0]?.characterId).toBe(characterId);
  // Born active (DDL default); name/guidance absent ⇒ null; the counter starts at 0.
  expect(rows[0]?.status).toBe("active");
  expect(rows[0]?.name).toBeNull();
  expect(rows[0]?.guidance).toBeNull();
  expect(rows[0]?.iterationCount).toBe(0);
  // The notNull JSON columns round-trip whole (the anti-drift anchor, F5 selection, F4 kind-tagged config).
  expect(rows[0]?.originalCard).toEqual(ORIGINAL_CARD);
  expect(rows[0]?.selection).toEqual(SELECTION);
  expect(rows[0]?.stageConfig).toEqual(DEFAULT_REFINERY_STAGE_CONFIG);
});

test("refinery_runs insert→select round-trips (typed payload + provenance config; usage nullable)", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_ref_b", handle: castId<Handle>("ref-owner-b") });
  const characterId = await seedCharacter(db, ownerId, "character_ref_runs");
  const sessionId = await seedSession(db, characterId, "refinery_session_runs");

  const runId = castId<RefineryRunId>("refinery_run_score_1");
  await db.insert(refineryRuns).values({
    id: runId,
    sessionId,
    stage: "score",
    payloadConfig: { kind: "fixed", mode: "full" },
    payload: SCORE_PAYLOAD,
    model: MODEL,
    durationMs: 6100,
  });

  const rows = await db.select().from(refineryRuns).where(eq(refineryRuns.id, runId));
  expect(rows).toHaveLength(1);
  expect(rows[0]?.stage).toBe("score");
  expect(rows[0]?.iteration).toBe(0);
  expect(rows[0]?.payloadConfig).toEqual({ kind: "fixed", mode: "full" });
  expect(rows[0]?.payload).toEqual(SCORE_PAYLOAD);
  // Usage is nullable by design (stats parity — a backend may report none).
  expect(rows[0]?.promptTokens).toBeNull();
  expect(rows[0]?.outputTokens).toBeNull();
  // The Runs-ledger economics: wall time is REQUIRED (un-backfillable, so it can never be absent), while
  // the DAG parent edge is optional — a score run consumes nothing and is a root.
  expect(rows[0]?.durationMs).toBe(6100);
  expect(rows[0]?.sourceRunId).toBeNull();
});

test("duration_ms is NOT NULL at the DDL — a run row can never exist without its wall time", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_ref_dur", handle: castId<Handle>("ref-owner-dur") });
  const characterId = await seedCharacter(db, ownerId, "character_ref_dur");
  const sessionId = await seedSession(db, characterId, "refinery_session_dur");
  // The column carries no default and cannot be backfilled honestly, so the DDL is the enforcer — not a
  // convention the next producer has to remember (the planted control for the NOT NULL itself).
  await expect(
    db.run(
      sql`INSERT INTO refinery_runs (id, session_id, stage, payload_config, payload, model)
          VALUES ('refinery_run_nodur', ${sessionId}, 'score', '{}', '{}', ${MODEL})`,
    ),
  ).rejects.toThrow();
});

test("source_run_id records the DAG parent and survives the round-trip (nullable self-FK, set null)", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_ref_src", handle: castId<Handle>("ref-owner-src") });
  const characterId = await seedCharacter(db, ownerId, "character_ref_src");
  const sessionId = await seedSession(db, characterId, "refinery_session_src");
  const parentId = castId<RefineryRunId>("refinery_run_src_parent");
  const childId = castId<RefineryRunId>("refinery_run_src_child");
  await db.insert(refineryRuns).values([
    { id: parentId, sessionId, stage: "rewrite", payloadConfig: { kind: "fixed", mode: "balanced" }, payload: { fields: [] }, model: MODEL, durationMs: 10 },
    {
      id: childId,
      sessionId,
      stage: "analyze",
      payloadConfig: { kind: "fixed", mode: "full" },
      payload: { fields: [] },
      model: MODEL,
      durationMs: 20,
      sourceRunId: parentId,
    },
  ]);
  const rows = await db.select().from(refineryRuns).where(eq(refineryRuns.id, childId));
  expect(rows[0]?.sourceRunId).toBe(parentId);
});

test("source_run_id against a phantom run is a foreign-key rejection (self-FK, FK PRAGMA is ON)", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_ref_src_fk", handle: castId<Handle>("ref-owner-src-fk") });
  const characterId = await seedCharacter(db, ownerId, "character_ref_src_fk");
  const sessionId = await seedSession(db, characterId, "refinery_session_src_fk");

  let caught: unknown;
  try {
    await db.insert(refineryRuns).values({
      id: castId<RefineryRunId>("refinery_run_src_fk_child"),
      sessionId,
      stage: "analyze",
      payloadConfig: { kind: "fixed", mode: "full" },
      payload: { fields: [] },
      model: MODEL,
      durationMs: 0,
      sourceRunId: castId<RefineryRunId>("refinery_run_src_fk_phantom"),
    });
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeDefined();
  expect(isConstraintViolation(caught)?.kind).toBe("foreign-key");
});

test("deleting the parent run SETS NULL on the child's source_run_id (not cascade — the child survives)", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_ref_src_null", handle: castId<Handle>("ref-owner-src-null") });
  const characterId = await seedCharacter(db, ownerId, "character_ref_src_null");
  const sessionId = await seedSession(db, characterId, "refinery_session_src_null");
  const parentId = castId<RefineryRunId>("refinery_run_src_null_parent");
  const childId = castId<RefineryRunId>("refinery_run_src_null_child");
  await db.insert(refineryRuns).values([
    { id: parentId, sessionId, stage: "rewrite", payloadConfig: { kind: "fixed", mode: "balanced" }, payload: { fields: [] }, model: MODEL, durationMs: 10 },
    {
      id: childId,
      sessionId,
      stage: "analyze",
      payloadConfig: { kind: "fixed", mode: "full" },
      payload: { fields: [] },
      model: MODEL,
      durationMs: 20,
      sourceRunId: parentId,
    },
  ]);

  await db.delete(refineryRuns).where(eq(refineryRuns.id, parentId));

  // The child ROW SURVIVES (not cascaded) — only the DAG edge is unset.
  const rows = await db.select().from(refineryRuns).where(eq(refineryRuns.id, childId));
  expect(rows).toHaveLength(1);
  expect(rows[0]?.sourceRunId).toBeNull();
});

test("deleting a character CASCADEs sessions AND runs (the D23 derived-ownership chain, two levels)", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_ref_c", handle: castId<Handle>("ref-owner-c") });
  const characterId = await seedCharacter(db, ownerId, "character_ref_cascade");
  const sessionId = await seedSession(db, characterId, "refinery_session_cascade");
  await db.insert(refineryRuns).values({
    id: castId<RefineryRunId>("refinery_run_cascade_1"),
    sessionId,
    stage: "score",
    payloadConfig: { kind: "fixed", mode: "quick" },
    payload: SCORE_PAYLOAD,
    model: MODEL,
    durationMs: 0,
  });

  // Positive control BEFORE the delete (non-vacuity — the absence assert below can't pass vacuously).
  expect(await db.select().from(refinerySessions).where(eq(refinerySessions.characterId, characterId))).toHaveLength(1);
  expect(await db.select().from(refineryRuns).where(eq(refineryRuns.sessionId, sessionId))).toHaveLength(1);

  await db.delete(characters).where(eq(characters.id, characterId));

  expect(await db.select().from(refinerySessions).where(eq(refinerySessions.characterId, characterId))).toHaveLength(0);
  expect(await db.select().from(refineryRuns).where(eq(refineryRuns.sessionId, sessionId))).toHaveLength(0);
});

test("deleting the USER cascades the whole chain (user → character → session → run)", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_ref_d", handle: castId<Handle>("ref-owner-d") });
  const characterId = await seedCharacter(db, ownerId, "character_ref_user_cascade");
  const sessionId = await seedSession(db, characterId, "refinery_session_user_cascade");
  await db.insert(refineryRuns).values({
    id: castId<RefineryRunId>("refinery_run_user_cascade"),
    sessionId,
    stage: "analyze",
    payloadConfig: { kind: "fixed", mode: "full" },
    payload: {
      preserved: ["voice"],
      lost: [],
      gained: [],
      soulScore: 9,
      soulAssessment: "intact",
      verdict: "ACCEPT",
      issues: [],
      recommendations: [],
    },
    model: MODEL,
    durationMs: 0,
  });
  // Positive control on BOTH levels before the delete (the session row's own non-vacuity — the assert
  // below cannot pass because the session was never written).
  expect(await db.select().from(refinerySessions).where(eq(refinerySessions.id, sessionId))).toHaveLength(1);
  expect(await db.select().from(refineryRuns).where(eq(refineryRuns.sessionId, sessionId))).toHaveLength(1);

  await db.delete(users).where(eq(users.id, ownerId));

  expect(await db.select().from(refinerySessions).where(eq(refinerySessions.id, sessionId))).toHaveLength(0);
  expect(await db.select().from(refineryRuns).where(eq(refineryRuns.sessionId, sessionId))).toHaveLength(0);
});

test("the stage CHECK constraint rejects a foreign stage member", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_ref_e", handle: castId<Handle>("ref-owner-e") });
  const characterId = await seedCharacter(db, ownerId, "character_ref_check");
  const sessionId = await seedSession(db, characterId, "refinery_session_check");

  let caught: unknown;
  try {
    await db.insert(refineryRuns).values({
      id: castId<RefineryRunId>("refinery_run_bad_stage"),
      sessionId,
      // Force an off-tuple value past the TS enum to exercise the SQL CHECK (the assets idiom).
      stage: "polish" as (typeof REFINERY_STAGES)[number],
      payloadConfig: { kind: "fixed", mode: "full" },
      payload: SCORE_PAYLOAD,
      model: MODEL,
      durationMs: 0,
    });
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeDefined();
  expect(isConstraintViolation(caught)?.kind).toBe("check");
});

test("the session status CHECK constraint rejects a foreign status member", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_ref_g", handle: castId<Handle>("ref-owner-g") });
  const characterId = await seedCharacter(db, ownerId, "character_ref_status_check");

  let caught: unknown;
  try {
    await db.insert(refinerySessions).values({
      id: castId<RefinerySessionId>("refinery_session_bad_status"),
      characterId,
      // Force an off-tuple value past the TS enum to exercise the SQL CHECK (the runs-stage twin above —
      // the sessions CHECK was DECLARED but never bitten until this pin).
      status: "paused" as (typeof REFINERY_SESSION_STATUSES)[number],
      originalCard: ORIGINAL_CARD,
      selection: SELECTION,
      stageConfig: DEFAULT_REFINERY_STAGE_CONFIG,
    });
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeDefined();
  expect(isConstraintViolation(caught)?.kind).toBe("check");
});

test("a run against a phantom session is a foreign-key rejection (FK PRAGMA is ON)", async () => {
  const db = await freshDb();
  let caught: unknown;
  try {
    await db.insert(refineryRuns).values({
      id: castId<RefineryRunId>("refinery_run_orphan"),
      sessionId: castId<RefinerySessionId>("refinery_session_phantom"),
      stage: "score",
      payloadConfig: { kind: "fixed", mode: "full" },
      payload: SCORE_PAYLOAD,
      model: MODEL,
      durationMs: 0,
    });
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeDefined();
  expect(isConstraintViolation(caught)?.kind).toBe("foreign-key");
});

test("latest-run-per-(session, stage): the append-only log's hot read returns the newest of THAT stage", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_ref_f", handle: castId<Handle>("ref-owner-f") });
  const characterId = await seedCharacter(db, ownerId, "character_ref_latest");
  const sessionId = await seedSession(db, characterId, "refinery_session_latest");
  await db.insert(refineryRuns).values([
    {
      id: castId<RefineryRunId>("refinery_run_score_early"),
      sessionId,
      stage: "score",
      payloadConfig: { kind: "fixed", mode: "full" },
      payload: SCORE_PAYLOAD,
      model: MODEL,
      durationMs: 0,
      createdAt: RUN_AT_EARLY,
    },
    // A different stage BETWEEN the two score runs — the stage filter must exclude it.
    {
      id: castId<RefineryRunId>("refinery_run_rewrite_mid"),
      sessionId,
      stage: "rewrite",
      payloadConfig: { kind: "fixed", mode: "balanced" },
      payload: { fields: [{ field: "description", text: "richer" }] },
      model: MODEL,
      durationMs: 0,
      createdAt: RUN_AT_MID,
    },
    {
      id: castId<RefineryRunId>("refinery_run_score_late"),
      sessionId,
      stage: "score",
      payloadConfig: { kind: "fixed", mode: "quick" },
      payload: SCORE_PAYLOAD,
      model: MODEL,
      durationMs: 0,
      createdAt: RUN_AT_LATE,
    },
  ]);

  const latest = await db
    .select()
    .from(refineryRuns)
    .where(and(eq(refineryRuns.sessionId, sessionId), eq(refineryRuns.stage, "score")))
    .orderBy(desc(refineryRuns.createdAt))
    .limit(1);
  expect(latest[0]?.id).toBe("refinery_run_score_late");
});

// The Tier-1-DB §7.4 test-mirror: the db enum columns and their contracts tuples cannot drift (both
// columns derive by import, so this is the tripwire for a future re-spell, the assets precedent).
test("test-mirror: refinery db enum members === the contracts tuples", () => {
  expect([...refineryRuns.stage.enumValues]).toEqual([...REFINERY_STAGES]);
  expect([...refinerySessions.status.enumValues]).toEqual([...REFINERY_SESSION_STATUSES]);
});
