// schema/refinery — card-refinery pipeline sessions + the append-only run log (producer: domain/refinery
// — R1; rides the baseline as a BASELINE_RIDER until that domain lands, per the db-structure gate's
// designed pre-producer mechanism). Design: docs/design/refinery-r0.md; the owner-signed port study is
// docs/reviews/stickler/2026-08-08-card-refinery-port-study.md §5.2/§6.
//
// OWNERSHIP IS DERIVED, NOT STAMPED (D23): a session is anchored by `character_id NOT NULL → characters`
// (single-owner canon), so it carries NO `owner_id` — the same DERIVE class as gallery_items /
// imagery_generations. Verbs gate through the character join (`ensureCharacterOwned` persistence
// pattern), never `fetchOwned` on these tables. Cascade chain: user → characters → refinery_sessions →
// refinery_runs (F7: sessions live and die with their character).
//
// `original_card` is the ANTI-DRIFT ANCHOR — the full canonical-card blob snapshotted at session start
// (the `character_snapshots.content` shape; D28: an opaque blob NOTHING FKs or gates on). Every analyze
// run compares the latest rewrite against THIS, never against a previous rewrite ("no character drift").
//
// `refinery_runs` is APPEND-ONLY (the extension's history[]): "current result per stage" = the latest
// run per (session, stage) — no mutable current-pointer column, no updates. Each run snapshots the
// config arm that produced it (`payload_config` — kind-tagged, so the SF custom-schema arm lands as a
// union member with zero DDL) plus the typed stage payload, parsed at the read seam per stage through
// `REFINERY_STAGE_PAYLOADS` (@orb/contracts/refinery).

import type { CharacterCard } from "@orb/contracts/character";
import type {
  RefinerySelection,
  RefinerySessionStatus,
  RefineryStage,
  RefineryStageConfig,
  RefineryStagePayload,
  RefineryStagePayloadConfig,
} from "@orb/contracts/refinery";
import { REFINERY_SESSION_STATUSES, REFINERY_STAGES } from "@orb/contracts/refinery";
import type { CharacterId, ModelId, RefineryRunId, RefinerySessionId } from "@orb/kit/ids";
import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { characters } from "./character.ts";

// CHECK lists derived from the canonical contracts tuples (NOT re-spelled — §7.5): drizzle's `{enum:}`
// is TYPE-only for sqlite, so the SQL-level closure is an explicit tuple-built CHECK (the assets idiom).
// A CHECK is static DDL and cannot carry bound parameters, so it is built as a raw fragment.
const SESSION_STATUS_CHECK_LIST = REFINERY_SESSION_STATUSES.map((status) => `'${status}'`).join(", ");
const RUN_STAGE_CHECK_LIST = REFINERY_STAGES.map((stage) => `'${stage}'`).join(", ");

export const refinerySessions = sqliteTable(
  "refinery_sessions",
  {
    // TypeID PK (`refinery_session_…`); brand is type-only, SQL is plain TEXT. App-minted; no DB default.
    id: text("id").$type<RefinerySessionId>().primaryKey(),
    // The D23 ownership anchor (header) — CASCADE: a session is per-character work product, not canon.
    characterId: text("character_id")
      .$type<CharacterId>()
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    // Optional user label; null renders as the character-derived default in the roster (D62 LIST row).
    // Bounded at the write verb via `refinerySessionNameSchema` (@orb/contracts/refinery).
    name: text("name"),
    status: text("status", { enum: REFINERY_SESSION_STATUSES }).$type<RefinerySessionStatus>().notNull().default("active"),
    // The full canonical card snapshotted at session start — the anti-drift anchor (header; D28 blob law).
    originalCard: text("original_card", { mode: "json" }).$type<CharacterCard>().notNull(),
    // Which card fields ride the pipeline (F5; per-greeting via greetingIndexes). Read-seam parsed.
    selection: text("selection", { mode: "json" }).$type<RefinerySelection>().notNull(),
    // The in-force per-stage config (F4 modes, kind-tagged for the SF custom arm). Read-seam parsed.
    stageConfig: text("stage_config", { mode: "json" }).$type<RefineryStageConfig>().notNull(),
    // The session-level loop input ("keep her mean") threaded into every stage prompt; null = none.
    // HOST-authored but MODEL-FACING: the write verb parses it through `refineryGuidanceSchema`
    // (@orb/contracts/refinery — the cap's ONE home) and the prompt substrate NEUTRALIZES it before
    // splicing, the `{{input}}` guided precedent. SQLite has no length domain; the belt is the verb.
    guidance: text("guidance"),
    iterationCount: integer("iteration_count").notNull().default(0),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    // The per-character session listing + the characterId FK's cascade child scan (SQLite auto-indexes
    // no child FK — `fk-columns-indexed` gate; the character_snapshots precedent).
    index("refinery_sessions_character_idx").on(t.characterId),
    check("refinery_sessions_status_check", sql.raw(`status in (${SESSION_STATUS_CHECK_LIST})`)),
  ],
);

export const refineryRuns = sqliteTable(
  "refinery_runs",
  {
    // TypeID PK (`refinery_run_…`); brand is type-only, SQL is plain TEXT.
    id: text("id").$type<RefineryRunId>().primaryKey(),
    sessionId: text("session_id")
      .$type<RefinerySessionId>()
      .notNull()
      .references(() => refinerySessions.id, { onDelete: "cascade" }),
    stage: text("stage", { enum: REFINERY_STAGES }).$type<RefineryStage>().notNull(),
    // Which refinement round (0 = the initial pass; `iterate` increments the session counter).
    iteration: integer("iteration").notNull().default(0),
    // Provenance: the exact config arm that produced this payload (kind-tagged — the SF seam).
    payloadConfig: text("payload_config", { mode: "json" }).$type<RefineryStagePayloadConfig>().notNull(),
    // The typed stage payload (F3) — parsed at the read seam per `stage` via REFINERY_STAGE_PAYLOADS.
    payload: text("payload", { mode: "json" }).$type<RefineryStagePayload>().notNull(),
    model: text("model").$type<ModelId>().notNull(),
    // Provider-reported usage; null when the backend reports none (stats parity, study §5.2).
    promptTokens: integer("prompt_tokens"),
    outputTokens: integer("output_tokens"),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    // sessionId LEADS (`fk-columns-indexed`: the cascade child scan) and the composite serves the
    // latest-run-per-(session, stage) read — the append-only log's ONE hot query.
    index("refinery_runs_session_stage_idx").on(t.sessionId, t.stage, t.createdAt),
    check("refinery_runs_stage_check", sql.raw(`stage in (${RUN_STAGE_CHECK_LIST})`)),
  ],
);
