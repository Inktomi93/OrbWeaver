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

import type { RefineryRun, RefinerySchemaStage, RefinerySchemaSummary, RefinerySessionSummary, RefineryStage, RefineryVerdict } from "@orb/contracts/refinery";
import {
  DEFAULT_REFINERY_STAGE_CONFIG,
  REFINERY_STAGE_PAYLOADS,
  refineryAnalyzeFixedConfigSchema,
  refineryCustomRunConfigSchema,
  refineryManualRewriteConfigSchema,
  refineryRewriteConfigSchema,
  refineryScoreFixedConfigSchema,
  refinerySelectionSchema,
  refineryStageConfigSchema,
  refineryVerdictSchema,
} from "@orb/contracts/refinery";
import type { Db } from "@orb/db";
import { assets, characters, refineryRuns, refinerySchemas, refinerySessions } from "@orb/db";
import type { RefineryRunId, RefinerySchemaId, RefinerySessionId, UserId } from "@orb/kit/ids";
import { liftJsonSchema } from "@orb/kit/json-schema";
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

/** A roster row + the two CHARACTER DISPLAY facts the summary carries. The ownership join was already
 *  here (it is what scopes the read); naming the card is two more selected columns on it, not a second
 *  query — and it is the only place that can name a card whose row sits past `character.list`'s 100-row
 *  page (the ceiling the client-side join could not clear; see `refinerySessionSummarySchema`). */
interface RefinerySessionRosterRow {
  readonly session: RefinerySessionRow;
  readonly characterName: string;
  readonly characterAvatarHash: string | null;
}

/** Every session of the owner's characters, newest-updated first (the roster read), each carrying its
 *  card's name + avatar hash. `assets` is a LEFT join — an avatar-less card is a normal card. */
export async function listOwnedSessionRows(db: Db, ownerId: UserId): Promise<RefinerySessionRosterRow[]> {
  const rows = await db
    .select({ session: refinerySessions, characterName: characters.name, characterAvatarHash: assets.hash })
    .from(refinerySessions)
    .innerJoin(characters, eq(refinerySessions.characterId, characters.id))
    .leftJoin(assets, eq(characters.avatarAssetId, assets.id))
    .where(eq(characters.ownerId, ownerId))
    .orderBy(desc(refinerySessions.updatedAt));
  return rows.map((r) => ({ session: r.session, characterName: r.characterName, characterAvatarHash: r.characterAvatarHash }));
}

/** The session's full run log, oldest first (the CONTEXT Runs ledger reads it forward). Callers reach
 *  this ONLY with a session id that already passed {@link loadOwnedSessionRow}'s belt. */
export function listRunRowsOf(db: Db, sessionId: RefinerySessionId): Promise<RefineryRunRow[]> {
  return db.select().from(refineryRuns).where(eq(refineryRuns.sessionId, sessionId)).orderBy(asc(refineryRuns.createdAt));
}

/** ONE named REWRITE run of THIS session (the §16.1 operate-back resolve): the session predicate rides
 *  the WHERE, so a foreign/wrong-session/wrong-stage id is undefined — the caller's leak-free NOT_FOUND.
 *  Same belt precondition as {@link listRunRowsOf} (the session already passed the ownership join). */
export async function loadSessionRewriteRunRow(db: Db, sessionId: RefinerySessionId, runId: RefineryRunId): Promise<RefineryRunRow | undefined> {
  const rows = await db
    .select()
    .from(refineryRuns)
    .where(and(eq(refineryRuns.id, runId), eq(refineryRuns.sessionId, sessionId), eq(refineryRuns.stage, "rewrite")))
    .limit(LIMIT_ONE);
  return rows[0];
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

/** The verdict-core pluck for a CUSTOM analyze run: the well-known core (save belt) guarantees every
 *  custom analyze schema a `verdict` with the three spellings, so the roster badge survives any custom
 *  shape. Gated to custom-config rows — a corrupt FIXED payload must not half-parse into a badge. */
const verdictCoreSchema = z.object({ verdict: refineryVerdictSchema });

/** The newest analyze VERDICT per session (the roster badge) — one query, grouped in JS (a per-owner
 *  roster is small; the newest-first scan takes the first verdict it sees per session). */
export async function latestVerdictsOf(db: Db, sessionIds: readonly RefinerySessionId[]): Promise<Map<RefinerySessionId, RefineryVerdict>> {
  // @orb-gate-ignore persistence-no-in-memory-state: query-local sessionId → newest-verdict map.
  const map = new Map<RefinerySessionId, RefineryVerdict>();
  if (sessionIds.length === 0) {
    return map;
  }
  const rows = await db
    .select({ sessionId: refineryRuns.sessionId, payload: refineryRuns.payload, payloadConfig: refineryRuns.payloadConfig })
    .from(refineryRuns)
    .where(and(inArray(refineryRuns.sessionId, sessionIds), eq(refineryRuns.stage, "analyze")))
    .orderBy(desc(refineryRuns.createdAt));
  for (const row of rows) {
    if (map.has(row.sessionId)) {
      continue;
    }
    if (refineryCustomRunConfigSchema.safeParse(row.payloadConfig).success) {
      const core = verdictCoreSchema.safeParse(row.payload);
      if (core.success) {
        map.set(row.sessionId, core.data.verdict);
      }
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

/** Roster row → the roster summary (verdict joined by the caller via {@link latestVerdictsOf}). Takes the
 *  JOINED row, not the bare session row: the card's name and avatar are display facts the wire carries. */
export function sessionSummaryOf(rosterRow: RefinerySessionRosterRow, latestVerdict: RefineryVerdict | null): RefinerySessionSummary {
  const { session: row, characterName, characterAvatarHash } = rosterRow;
  return {
    id: row.id,
    characterId: row.characterId,
    characterName,
    characterAvatarHash,
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
  // A CUSTOM run re-parses its payload against the schema EMBEDDED in its own provenance (P1-B — never a
  // live schema row). A corrupt embed OR a payload that no longer parses is the same observable drop.
  const custom = refineryCustomRunConfigSchema.safeParse(row.payloadConfig);
  if (custom.success && (row.stage === "score" || row.stage === "analyze")) {
    return customRunViewOf(row.stage, custom.data, row.payload, base);
  }
  return fixedRunViewOf(row, base);
}

type RunViewBase = Omit<Extract<RefineryRun, { stage: "score" }>, "stage" | "payload" | "payloadConfig">;

function healedRun(stage: RefineryRunRow["stage"]): null {
  addSpanEvent(HEAL_EVENT, { arm: "runPayload", stage });
  return null;
}

function customRunViewOf(
  stage: RefinerySchemaStage,
  config: z.infer<typeof refineryCustomRunConfigSchema>,
  rawPayload: unknown,
  base: RunViewBase,
): RefineryRun | null {
  let lifted: z.ZodType;
  try {
    lifted = liftJsonSchema(config.schema);
  } catch {
    return healedRun(stage);
  }
  const payload = lifted.safeParse(rawPayload);
  if (!payload.success) {
    return healedRun(stage);
  }
  const data = payload.data as Record<string, unknown>;
  return stage === "score"
    ? { ...base, stage: "score", payloadConfig: config, payload: data }
    : { ...base, stage: "analyze", payloadConfig: config, payload: data };
}

/** The FIXED arms — an if/else chain over the stage (the engine's own dispatch shape); the tail
 *  annotation proves totality at compile time — a new stage member fails `tsc` on the narrowed
 *  assignment. A drifted provenance config heals to the stage's default arm, observably. */
function fixedRunViewOf(row: RefineryRunRow, base: RunViewBase): RefineryRun | null {
  const configHealed = (): void => {
    addSpanEvent(HEAL_EVENT, { arm: "runPayloadConfig", stage: row.stage });
  };
  if (row.stage === "score") {
    const payload = REFINERY_STAGE_PAYLOADS.score.safeParse(row.payload);
    if (!payload.success) {
      return healedRun(row.stage);
    }
    const payloadConfig = refineryScoreFixedConfigSchema.catch(() => {
      configHealed();
      return { kind: "fixed", mode: "full" } as const;
    });
    return { ...base, stage: "score", payloadConfig: payloadConfig.parse(row.payloadConfig), payload: payload.data };
  }
  if (row.stage === "rewrite") {
    const payload = REFINERY_STAGE_PAYLOADS.rewrite.safeParse(row.payload);
    if (!payload.success) {
      return healedRun(row.stage);
    }
    // Manual provenance parses as itself; anything else heals to the fixed default arm.
    const manual = refineryManualRewriteConfigSchema.safeParse(row.payloadConfig);
    if (manual.success) {
      return { ...base, stage: "rewrite", payloadConfig: manual.data, payload: payload.data };
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
    return healedRun(stage);
  }
  const payloadConfig = refineryAnalyzeFixedConfigSchema.catch(() => {
    configHealed();
    return { kind: "fixed", mode: "full" } as const;
  });
  return { ...base, stage, payloadConfig: payloadConfig.parse(row.payloadConfig), payload: payload.data };
}

// ── the custom-schema library (R3/SF0) — DIRECTLY owner-scoped rows (the schema table's own header) ─────

type RefinerySchemaRow = typeof refinerySchemas.$inferSelect;

/** One OWNED schema row, or undefined when absent OR foreign (collapsed — leak-free NOT_FOUND at the
 *  caller). Direct owner predicate: schemas are library tooling, not per-character work product. */
export async function loadOwnedSchemaRow(db: Db, ownerId: UserId, schemaId: RefinerySchemaId): Promise<RefinerySchemaRow | undefined> {
  const rows = await db
    .select()
    .from(refinerySchemas)
    .where(and(eq(refinerySchemas.id, schemaId), eq(refinerySchemas.ownerId, ownerId)))
    .limit(LIMIT_ONE);
  return rows[0];
}

/** The owner's schema library, newest-updated first. */
export function listOwnedSchemaRows(db: Db, ownerId: UserId): Promise<RefinerySchemaRow[]> {
  return db.select().from(refinerySchemas).where(eq(refinerySchemas.ownerId, ownerId)).orderBy(desc(refinerySchemas.updatedAt));
}

/** Row → the library wire view (the stored blob rides typed-as-written — liftable by the write belt's
 *  invariant; consumers re-lift defensively at their own seams). */
export function schemaSummaryOf(row: RefinerySchemaRow): RefinerySchemaSummary {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    stage: row.stage,
    version: row.version,
    schema: row.schema,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
