// .int tests for refinery persistence: the D23 derived-ownership belt in the WHERE (foreign collapses to
// undefined), latest-per-stage over the append-only log, and the newest-analyze verdict grouping.

// The persistence module is imported by RELATIVE path — the package `./*` map only resolves a directory
// front door, not a flat file (the character persistence-test convention).
import type { CharacterCard } from "@orb/contracts/character";
import type { RefineryAnalyzePayload, RefineryScorePayload, RefineryVerdict } from "@orb/contracts/refinery";
import { DEFAULT_REFINERY_STAGE_CONFIG } from "@orb/contracts/refinery";
import type { Db } from "@orb/db";
import { characters, refineryRuns, refinerySessions } from "@orb/db";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { CharacterHandle, CharacterId, Handle, ModelId, RefineryRunId, RefinerySessionId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq, sql } from "drizzle-orm";
import {
  latestRunRowOf,
  latestVerdictsOf,
  loadOwnedSessionRow,
  sessionViewOf,
} from "../../../../../packages/server/src/domain/refinery/persistence/queries.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeRefineryHarness, principal, seedOwnedCharacter, seedUser } from "../_support.ts";

const AT_EARLY = 1_700_000_000_000;
const AT_LATE = 1_700_000_100_000;

const CARD: CharacterCard = {
  name: "Aria",
  description: "calm",
  personality: null,
  scenario: null,
  greetings: [],
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

const SCORE: RefineryScorePayload = { fieldScores: [], overallScore: 5, priorityImprovements: [], summary: "s" };

async function seedSession(db: Db, ownerId: UserId, tag: string): Promise<RefinerySessionId> {
  const characterId = castId<CharacterId>(`character_${tag}`);
  await db.insert(characters).values({ id: characterId, handle: castId<CharacterHandle>(`h-${tag}`), ownerId, contentHash: "h", name: "Aria" });
  const sessionId = castId<RefinerySessionId>(`refinery_session_${tag}`);
  await db
    .insert(refinerySessions)
    .values({ id: sessionId, characterId, originalCard: CARD, selection: { fields: [] }, stageConfig: DEFAULT_REFINERY_STAGE_CONFIG });
  return sessionId;
}

test("loadOwnedSessionRow: the owner predicate rides the character JOIN (foreign ⇒ undefined)", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_rq_a" });
  const stranger = await seedUser(db, { id: "user_rq_b", handle: castId<Handle>("rq-stranger") });
  const sessionId = await seedSession(db, owner, "rq_owned");

  expect((await loadOwnedSessionRow(db, owner, sessionId))?.id).toBe(sessionId);
  expect(await loadOwnedSessionRow(db, stranger, sessionId)).toBeUndefined();
});

test("sessionViewOf heals a corrupt stored stageConfig to the canonical default", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_rq_config" });
  const sessionId = await seedSession(db, owner, "rq_config");
  const healthy = await loadOwnedSessionRow(db, owner, sessionId);
  if (healthy === undefined) {
    throw new Error("expected the seeded refinery session to load");
  }
  expect(sessionViewOf(healthy).stageConfig).toEqual(DEFAULT_REFINERY_STAGE_CONFIG);

  await db.run(sql`UPDATE refinery_sessions SET stage_config = ${JSON.stringify({ stages: "corrupt" })} WHERE id = ${sessionId}`);
  const corrupt = await loadOwnedSessionRow(db, owner, sessionId);
  if (corrupt === undefined) {
    throw new Error("expected the corrupted refinery session to load");
  }
  expect(sessionViewOf(corrupt).stageConfig).toEqual(DEFAULT_REFINERY_STAGE_CONFIG);
});

const MALFORMED_SELECTIONS = [
  { label: "missing fields", value: { greetingIndexes: [1] } },
  { label: "unknown field", value: { fields: ["legacy-field"], greetingIndexes: [1] } },
  { label: "duplicate greeting indexes", value: { fields: ["greetings"], greetingIndexes: [1, 1] } },
] as const;

test.for(MALFORMED_SELECTIONS)("owned session read heals $label to empty canonical selection without rewriting stored bytes", async ({ value }) => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_selection_reader" });
  const stranger = await seedUser(db, { id: "user_selection_stranger", handle: castId<Handle>("selection-stranger") });
  const h = makeRefineryHarness(db);
  const characterId = await seedOwnedCharacter(h, owner, "selection-read");
  const session = await h.svc.startSession({ principal: principal(owner), characterId });
  const valid = { fields: ["greetings", "description"], greetingIndexes: [1] } as const;
  const saved = await h.svc.updateSession({
    principal: principal(owner),
    sessionId: session.id,
    patch: { selection: { fields: [...valid.fields], greetingIndexes: [...valid.greetingIndexes] } },
  });
  expect(saved.selection).toEqual(valid);
  expect((await h.svc.getSession({ principal: principal(owner), sessionId: session.id })).selection).toEqual(valid);

  await db.run(sql`UPDATE refinery_sessions SET selection = ${JSON.stringify(value)} WHERE id = ${session.id}`);
  const before = await db.select().from(refinerySessions).where(eq(refinerySessions.id, session.id));
  const healed = await h.svc.getSession({ principal: principal(owner), sessionId: session.id });
  expect(healed.selection).toEqual({ fields: [] });
  expect(healed.originalCard).toEqual(session.originalCard);
  expect(healed.stageConfig).toEqual(session.stageConfig);
  expect(before[0]?.selection).toEqual(value);
  await expect(h.svc.getSession({ principal: principal(stranger), sessionId: session.id })).rejects.toBeInstanceOf(DomainNotFoundError);
  expect(await db.select().from(refinerySessions).where(eq(refinerySessions.id, session.id))).toEqual(before);
  expect(h.userEvents).toEqual([
    { userId: owner, event: { type: "refineryChanged", sessionId: session.id } },
    { userId: owner, event: { type: "refineryChanged", sessionId: session.id } },
  ]);
  expect(h.summarizeCalls).toEqual([]);
});

test("latestRunRowOf picks the newest of THAT stage; latestVerdictsOf groups newest-analyze per session", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_rq_c" });
  const sessionId = await seedSession(db, owner, "rq_runs");
  const model = castId<ModelId>("vetted-model");
  const analyze = (verdict: RefineryVerdict): RefineryAnalyzePayload => ({
    preserved: [],
    lost: [],
    gained: [],
    soulScore: 7,
    soulAssessment: "ok",
    verdict,
    issues: [],
    recommendations: [],
  });
  await db.insert(refineryRuns).values([
    {
      id: castId<RefineryRunId>("refinery_run_rq_s1"),
      sessionId,
      stage: "score",
      payloadConfig: { kind: "fixed", mode: "full" },
      payload: SCORE,
      model,
      durationMs: 0,
      createdAt: AT_EARLY,
    },
    {
      id: castId<RefineryRunId>("refinery_run_rq_s2"),
      sessionId,
      stage: "score",
      payloadConfig: { kind: "fixed", mode: "quick" },
      payload: SCORE,
      model,
      durationMs: 0,
      createdAt: AT_LATE,
    },
    {
      id: castId<RefineryRunId>("refinery_run_rq_a1"),
      sessionId,
      stage: "analyze",
      payloadConfig: { kind: "fixed", mode: "full" },
      payload: analyze("NEEDS_REFINEMENT"),
      model,
      durationMs: 0,
      createdAt: AT_EARLY,
    },
    {
      id: castId<RefineryRunId>("refinery_run_rq_a2"),
      sessionId,
      stage: "analyze",
      payloadConfig: { kind: "fixed", mode: "full" },
      payload: analyze("ACCEPT"),
      model,
      durationMs: 0,
      createdAt: AT_LATE,
    },
  ]);

  expect((await latestRunRowOf(db, sessionId, "score"))?.id).toBe("refinery_run_rq_s2");
  const verdicts = await latestVerdictsOf(db, [sessionId]);
  expect(verdicts.get(sessionId)).toBe("ACCEPT");
});
