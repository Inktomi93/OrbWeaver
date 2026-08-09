// domain/refinery/persistence/queries — all read access for the feature. OWNERSHIP IS DERIVED (D23 —
// docs/design/refinery-r0.md §3.1): every session read JOINS `characters` and carries the owner predicate
// IN THE WHERE (never a post-filter; the `ensureCharacterOwned` shape — reading the characters schema is
// the sanctioned cross-table read, security pass §3.E). A run is reachable ONLY through its session's
// join — a run id alone never resolves a payload.
//
// Read seams: `original_card` rides typed-as-written (the D28 opaque-blob posture — schema-valid at the
// startSession write, treated as the anchor blob, exactly like `character_snapshots.content`);
// `selection`/`stage_config` heal to their safe defaults OBSERVABLY (a corrupt row must not 500 the
// surface, but a silent heal is the banned-silent-fork class — `addSpanEvent` per arm); a run row whose
// payload no longer parses is DROPPED from reads with the same observable heal (a corrupt append-only log
// row must never fabricate a payload).

import type { RefineryRun, RefinerySessionSummary, RefineryStage, RefineryVerdict } from "@orb/contracts/refinery";
import {
  DEFAULT_REFINERY_STAGE_CONFIG,
  REFINERY_STAGE_PAYLOADS,
  refineryAnalyzeConfigSchema,
  refineryRewriteConfigSchema,
  refineryScoreConfigSchema,
  refinerySelectionSchema,
  refineryStageConfigSchema,
} from "@orb/contracts/refinery";
import type { Db } from "@orb/db";
import { characters, refineryRuns, refinerySessions } from "@orb/db";
import type { RefinerySessionId, UserId } from "@orb/kit/ids";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { addSpanEvent } from "#foundation/observability";
import type { RefinerySessionView } from "../contract/results.ts";

const LIMIT_ONE = 1;

// Derived row aliases — §7.4 sanctions them IN persistence, non-exported (the character queries precedent).
type RefinerySessionRow = typeof refinerySessions.$inferSelect;
type RefineryRunRow = typeof refineryRuns.$inferSelect;

const HEAL_EVENT = "refinery.read.heal";
const selectionParser = refinerySelectionSchema.catch(() => {
  addSpanEvent(HEAL_EVENT, { arm: "selection" });
  return { fields: [] };
});
const stageConfigParser = refineryStageConfigSchema.catch(() => {
  addSpanEvent(HEAL_EVENT, { arm: "stageConfig" });
  return DEFAULT_REFINERY_STAGE_CONFIG;
});
const strippedKeysParser = z.array(z.string()).catch(() => {
  addSpanEvent(HEAL_EVENT, { arm: "strippedKeys" });
  return [];
});

/** One OWNED session row, or undefined when absent OR foreign (collapsed — the caller throws its
 *  leak-free NOT_FOUND). The owner predicate rides the JOIN's WHERE. */
export async function loadOwnedSessionRow(db: Db, ownerId: UserId, sessionId: RefinerySessionId): Promise<RefinerySessionRow | undefined> {
  const rows = await db
    .select({ session: refinerySessions })
    .from(refinerySessions)
    .innerJoin(characters, eq(refinerySessions.characterId, characters.id))
    .where(and(eq(refinerySessions.id, sessionId), eq(characters.ownerId, ownerId)))
    .limit(LIMIT_ONE);
  return rows[0]?.session;
}

/** Every session of the owner's characters, newest-updated first (the roster read). */
export async function listOwnedSessionRows(db: Db, ownerId: UserId): Promise<RefinerySessionRow[]> {
  const rows = await db
    .select({ session: refinerySessions })
    .from(refinerySessions)
    .innerJoin(characters, eq(refinerySessions.characterId, characters.id))
    .where(eq(characters.ownerId, ownerId))
    .orderBy(desc(refinerySessions.updatedAt));
  return rows.map((r) => r.session);
}

/** The session's full run log, oldest first (the CONTEXT Runs ledger reads it forward). Callers reach
 *  this ONLY with a session id that already passed {@link loadOwnedSessionRow}'s belt. */
export function listRunRowsOf(db: Db, sessionId: RefinerySessionId): Promise<RefineryRunRow[]> {
  return db.select().from(refineryRuns).where(eq(refineryRuns.sessionId, sessionId)).orderBy(asc(refineryRuns.createdAt));
}

/** The newest run of ONE stage — "current result per stage" over the append-only log (the composite
 *  index's read). Same belt precondition as {@link listRunRowsOf}. */
export async function latestRunRowOf(db: Db, sessionId: RefinerySessionId, stage: RefineryStage): Promise<RefineryRunRow | undefined> {
  const rows = await db
    .select()
    .from(refineryRuns)
    .where(and(eq(refineryRuns.sessionId, sessionId), eq(refineryRuns.stage, stage)))
    .orderBy(desc(refineryRuns.createdAt))
    .limit(LIMIT_ONE);
  return rows[0];
}

/** The newest analyze VERDICT per session (the roster badge) — one query, grouped in JS (a per-owner
 *  roster is small; the newest-first scan takes the first verdict it sees per session). */
export async function latestVerdictsOf(db: Db, sessionIds: readonly RefinerySessionId[]): Promise<Map<RefinerySessionId, RefineryVerdict>> {
  // @orb-gate-ignore persistence-no-in-memory-state: query-local sessionId → newest-verdict map.
  const map = new Map<RefinerySessionId, RefineryVerdict>();
  if (sessionIds.length === 0) {
    return map;
  }
  const rows = await db
    .select({ sessionId: refineryRuns.sessionId, payload: refineryRuns.payload })
    .from(refineryRuns)
    .where(and(inArray(refineryRuns.sessionId, sessionIds), eq(refineryRuns.stage, "analyze")))
    .orderBy(desc(refineryRuns.createdAt));
  for (const row of rows) {
    if (map.has(row.sessionId)) {
      continue;
    }
    // The analyze payload schema is the one home for the verdict's shape — no field-plucking cast.
    const payload = REFINERY_STAGE_PAYLOADS.analyze.safeParse(row.payload);
    if (payload.success) {
      map.set(row.sessionId, payload.data.verdict);
    }
  }
  return map;
}

/** Row → the full session view (the read-seam parse on the two config blobs; the anchor blob rides
 *  typed-as-written — header). */
export function sessionViewOf(row: RefinerySessionRow): RefinerySessionView {
  return {
    id: row.id,
    characterId: row.characterId,
    name: row.name,
    status: row.status,
    originalCard: row.originalCard,
    selection: selectionParser.parse(row.selection),
    stageConfig: stageConfigParser.parse(row.stageConfig),
    guidance: row.guidance,
    iterationCount: row.iterationCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Row → the roster summary (verdict joined by the caller via {@link latestVerdictsOf}). */
export function sessionSummaryOf(row: RefinerySessionRow, latestVerdict: RefineryVerdict | null): RefinerySessionSummary {
  return {
    id: row.id,
    characterId: row.characterId,
    name: row.name,
    status: row.status,
    iterationCount: row.iterationCount,
    latestVerdict,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Row → the discriminated run view, or `null` when the stored payload no longer parses (the observable
 *  drop — header). An exhaustive per-stage switch (spine §7.5): each arm parses ITS payload schema out of
 *  the ONE dispatch home and ITS provenance-config schema (a drifted config heals to the stage's default
 *  arm, observably — it is provenance metadata, never dispatch input). */
export function runViewOf(row: RefineryRunRow): RefineryRun | null {
  const base = {
    id: row.id,
    sessionId: row.sessionId,
    iteration: row.iteration,
    model: row.model,
    promptTokens: row.promptTokens,
    outputTokens: row.outputTokens,
    durationMs: row.durationMs,
    sourceRunId: row.sourceRunId,
    strippedKeys: strippedKeysParser.parse(row.strippedKeys),
    createdAt: row.createdAt,
  };
  const healed = (): null => {
    addSpanEvent(HEAL_EVENT, { arm: "runPayload", stage: row.stage });
    return null;
  };
  const configHealed = (): void => {
    addSpanEvent(HEAL_EVENT, { arm: "runPayloadConfig", stage: row.stage });
  };
  // An if/else chain over the stage (the engine's own dispatch shape); the tail annotation proves
  // totality at compile time — a new stage member fails `tsc` on the narrowed assignment.
  if (row.stage === "score") {
    const payload = REFINERY_STAGE_PAYLOADS.score.safeParse(row.payload);
    if (!payload.success) {
      return healed();
    }
    const payloadConfig = refineryScoreConfigSchema.catch(() => {
      configHealed();
      return { kind: "fixed", mode: "full" } as const;
    });
    return { ...base, stage: "score", payloadConfig: payloadConfig.parse(row.payloadConfig), payload: payload.data };
  }
  if (row.stage === "rewrite") {
    const payload = REFINERY_STAGE_PAYLOADS.rewrite.safeParse(row.payload);
    if (!payload.success) {
      return healed();
    }
    const payloadConfig = refineryRewriteConfigSchema.catch(() => {
      configHealed();
      return { kind: "fixed", mode: "balanced" } as const;
    });
    return { ...base, stage: "rewrite", payloadConfig: payloadConfig.parse(row.payloadConfig), payload: payload.data };
  }
  // The exhaustive tail (spine §5.5): after the two narrows this MUST be "analyze" — a new stage member
  // makes this annotation a compile error.
  const stage: "analyze" = row.stage;
  const payload = REFINERY_STAGE_PAYLOADS.analyze.safeParse(row.payload);
  if (!payload.success) {
    return healed();
  }
  const payloadConfig = refineryAnalyzeConfigSchema.catch(() => {
    configHealed();
    return { kind: "fixed", mode: "full" } as const;
  });
  return { ...base, stage, payloadConfig: payloadConfig.parse(row.payloadConfig), payload: payload.data };
}
