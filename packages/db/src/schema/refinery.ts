// schema/refinery — card-refinery pipeline sessions + the append-only run log (producer: domain/refinery
// — R1; rides the baseline as a BASELINE_RIDER until that domain lands, per the db-structure gate's
// designed pre-producer mechanism). Design: docs/history/design/refinery-r0.md; the owner-signed port study is
// docs/history/reviews/stickler/2026-08-08-card-refinery-port-study.md §5.2/§6.
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
  RefinerySchemaStage,
  RefinerySelection,
  RefinerySessionStatus,
  RefineryStage,
  RefineryStageConfig,
  RefineryStagePayload,
  RefineryStagePayloadConfig,
} from "@orb/contracts/refinery";
import { REFINERY_SCHEMA_STAGES, REFINERY_SESSION_STATUSES, REFINERY_STAGES } from "@orb/contracts/refinery";
import type { CharacterId, ModelId, RefineryRunId, RefinerySchemaId, RefinerySessionId, UserId } from "@orb/kit/ids";
import { sql } from "drizzle-orm";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { check, index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { checkList } from "../kit/check-list.ts";
import { characters } from "./character.ts";
import { users } from "./users.ts";

// CHECK lists derived from the canonical contracts tuples (NOT re-spelled — §7.5): drizzle's `{enum:}`
// is TYPE-only for sqlite, so the SQL-level closure is an explicit tuple-built CHECK (the assets idiom).
// A CHECK is static DDL and cannot carry bound parameters, so it is built as a raw fragment.
const SESSION_STATUS_CHECK_LIST = checkList(REFINERY_SESSION_STATUSES);
const RUN_STAGE_CHECK_LIST = checkList(REFINERY_STAGES);
const SCHEMA_STAGE_CHECK_LIST = checkList(REFINERY_SCHEMA_STAGES);

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
    // THE ROUND CLAIM (#1568) — a LEASE DEADLINE in epoch ms, not a boolean flag, and that is the whole
    // design: a flag set by a process that then crashes wedges the session forever, whereas a deadline in
    // the past IS a free session with no reaper, no heartbeat and no boot sweep to own. NULL = no round in
    // flight. `iterate` takes it with a conditional UPDATE (`inflight_until IS NULL OR inflight_until < now`)
    // BEFORE it pays for any model call and clears it on both the commit and the failure arm; the TTL is
    // only the crash backstop (`domain/refinery/substrate/round-claim.ts` owns the number + its reason).
    // NOT indexed: every read of it is by the sessions PK.
    inflightUntil: integer("inflight_until"),
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
    // The stage payload — parsed at the read seam via `payloadSchemaFor(stage, payload_config)`: fixed
    // and manual runs are the typed F3 contracts; a CUSTOM run's payload is an object of its own EMBEDDED
    // schema (the P1-B provenance embed), typed here as the honest record.
    payload: text("payload", { mode: "json" }).$type<RefineryStagePayload | Record<string, unknown>>().notNull(),
    // NULLABLE for exactly the `manual` provenance arm (a hand-authored rewrite has no model) — an
    // honest null, never a sentinel spelling. Every model-produced run writes it.
    model: text("model").$type<ModelId>(),
    // Provider-reported usage; null when the backend reports none (stats parity, study §5.2). The
    // summarize result DOES carry usage and the engine threads it — a null here is a silent backend.
    promptTokens: integer("prompt_tokens"),
    outputTokens: integer("output_tokens"),
    // The run's WALL TIME — the Runs ledger's third economic column beside the token counts.
    // NOT NULL and un-backfillable, which is why it lands in the baseline window:
    // a run that produced a row took some measurable time, and there is no honest value to invent later.
    durationMs: integer("duration_ms").notNull(),
    // The DAG parent: the run whose output this one CONSUMED — an analyze
    // names the rewrite it judged, a rewrite names the score/analyze it worked from. Without it the log is
    // a timestamp-ordered LIST, so "which rewrite did this analyze judge?" is answerable only by "the
    // latest at the time" — false the moment step-back targets an earlier run.
    //
    // SELF-FK, not a bare id. The design doc proposed "nullable text, no FK constraint needed beyond the
    // session scope"; D24 overrules it (boundaries are physics, FK-enforced) and the `no-untyped-soft-ref`
    // gate makes that mechanical — an id-shaped column with no `.references()` is RED. It is also simply
    // the better answer: the edge is now unforgeable rather than a convention the next writer must honor.
    // `set null` because a parent's disappearance means the edge is UNKNOWN, never that the child should
    // vanish — a run is independent append-only history whichever run it read (in practice the session
    // cascade takes both together, so the arm is a correctness statement more than a live path).
    sourceRunId: text("source_run_id")
      .$type<RefineryRunId>()
      .references((): AnySQLiteColumn => refineryRuns.id, { onDelete: "set null" }),
    // The keys the strip-mode payload parse silently REMOVED — dotted paths, never content (the
    // strip-and-itemize posture, security pass §1 gap 5 / belt 6: an invented key must appear in the run
    // record instead of vanishing into a success). Always a list; `[]` = shape-clean.
    strippedKeys: text("stripped_keys", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    // sessionId LEADS (`fk-columns-indexed`: the cascade child scan) and the composite serves the
    // latest-run-per-(session, stage) read — the append-only log's ONE hot query.
    index("refinery_runs_session_stage_idx").on(t.sessionId, t.stage, t.createdAt),
    // The self-FK's own child-scan index (`fk-columns-indexed`) — and the read the ledger's DAG view runs
    // to answer "what was derived FROM this run?".
    index("refinery_runs_source_idx").on(t.sourceRunId),
    check("refinery_runs_stage_check", sql.raw(`stage in (${RUN_STAGE_CHECK_LIST})`)),
  ],
);

// The user-authored custom payload-schema library (R3/SF0 — docs/history/design/refinery-r3-build-plan.md §2;
// the NL design §4.2's `presets`-shaped row). DIRECTLY owner-scoped (unlike sessions/runs, which derive
// through the character join): a schema is library tooling, not per-character work product. `schema` is
// LIFTABLE BY INVARIANT — every write parses `refinerySchemaDocumentSchema` (the contracts belt: lift +
// depth/pattern/hint/core tightenings); reads still re-lift defensively. `version` bumps on every content
// update — the run log pins it in its EMBEDDED provenance (P1-B), so editing a schema never re-writes
// history. RESTRICT like `presets`: never cascade-delete a user's authored library.
export const refinerySchemas = sqliteTable(
  "refinery_schemas",
  {
    // TypeID PK (`refinery_schema_…`); brand is type-only, SQL is plain TEXT. App-minted; no DB default.
    id: text("id").$type<RefinerySchemaId>().primaryKey(),
    ownerId: text("owner_id")
      .$type<UserId>()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    // The wire ResponseFormat identifier (identifier grammar, verb-enforced per-owner case-insensitively
    // unique — the S5 registry-hygiene bar).
    name: text("name").notNull(),
    // The NL origin / purpose note (editable; rides the editor + the refine prompt).
    description: text("description").notNull(),
    // Which stage this schema serves (score|analyze — no custom rewrite, F-N3).
    stage: text("stage", { enum: REFINERY_SCHEMA_STAGES }).$type<RefinerySchemaStage>().notNull(),
    // The JSON-Schema document (liftable subset + x-orb-ui hints). Read-seam re-lifted.
    schema: text("schema", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
    // Bumped on every content update — the provenance pin the run embed records.
    version: integer("version").notNull().default(1),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    // The owner's library list + the FK's child scan (`fk-columns-indexed`).
    index("refinery_schemas_owner_idx").on(t.ownerId),
    check("refinery_schemas_stage_check", sql.raw(`stage in (${SCHEMA_STAGE_CHECK_LIST})`)),
  ],
);
