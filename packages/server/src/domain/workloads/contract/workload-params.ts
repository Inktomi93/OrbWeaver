// domain/workloads/contract/workload-params — the per-kind PARAMS vocabulary: one Zod schema per
// `WorkloadKind`, the `PARAMS_SCHEMAS` exhaustive Record (the §7.5 pin — a new kind missing its schema is a
// `tsc` error here), the derived `ParamsByKind` map, and the `startWorkloadInput` discriminated union the
// `start` verb re-parses (defense in depth).
//
// §7.2 settings precedence: tunables are OPTIONAL (NO Zod `.default()`) — the per-run param is just the top
// of the precedence chain (param → user `UserSettings.workloads.<knob>` → the runner floor const), resolved
// IN THE RUNNER, not baked into the schema. A kind with no tunables keeps an explicit `z.object({})` (NOT
// omitted) so the admin UI still renders a confirm dialog and `start()` validates every kind uniformly.

import type { WorkloadKind } from "@orb/contracts/workloads";
import { z } from "zod";

// ── per-kind param schemas (tunables OPTIONAL — precedence lives in the runner, §7.2) ────────────────────

/** No tunables — the embeddings text pass is resumable (skips already-embedded rows); nothing to configure. */
const noParams = z.object({});

/** k-means cluster count for the theme pass. OPTIONAL — falls through to the user/floor precedence. */
const computeThemesParams = z.object({ k: z.number().int().positive().optional() });

/** Re-embed everything even where the content hash matches (a forced rebuild, e.g. after an embed-model
 *  change). OPTIONAL — defaults (via the runner) to a resumable skip-matched pass. */
const embedParams = z.object({ force: z.boolean().optional() });

/** Validate-only: report what the maintenance pass WOULD do without mutating (assets fsck / backfill). */
const maintenanceParams = z.object({ dryRun: z.boolean().optional() });

/**
 * The exhaustive per-kind schema Record — the §7.5 backstop. `satisfies { [K in WorkloadKind]: ZodType }`
 * forces an entry for every kind: add a kind to `WORKLOAD_KINDS` without a schema here and `tsc` goes red.
 * The reserved v2 `reconcile-world-state` and the P5-deferred memory/character backfills all keep a real
 * (empty) schema so `start()` validates them uniformly even before their runner bodies land.
 */
export const PARAMS_SCHEMAS = {
  "embed-corpus": embedParams,
  "embed-assets": embedParams,
  "distill-characters": noParams,
  "compute-themes": computeThemesParams,
  "memory-backfill": noParams,
  "group-character-backfill": noParams,
  "compute-cooccurrence": noParams,
  "find-duplicates": noParams,
  csls: noParams,
  "assets-backfill": maintenanceParams,
  // GC takes `dryRun` (report what it WOULD reclaim); fsck is read-only (no tunables).
  "assets-gc": maintenanceParams,
  "assets-fsck": noParams,
  "import-st": maintenanceParams,
  "reconcile-stats": noParams,
  "refresh-model-catalog": noParams,
  "reconcile-world-state": noParams,
  // The chat-crew CW1 stubs (D59) keep the same real-empty-schema posture as the stubs above; the
  // committed `{chatId}` (+`variantId`) params land with each kind's real runner (chat-crew-design/03 §0).
  "crew-lorebook-keeper": noParams,
  "crew-card-evolution": noParams,
  "crew-director": noParams,
  "crew-prose-audit": noParams,
  // Expressions + databank STUB kinds (E1 / DB2-tables riders) keep the real-empty-schema posture; the
  // committed params land with each kind's real runner.
  "expressions-sprite-sheet": noParams,
  "databank-ingest": noParams,
  "databank-reindex": noParams,
  // The 10 rpg crew STUB kinds (R1-subset rider) keep the real-empty-schema posture; the committed
  // params land with each real crew runner (rpg-design/10 R6/R7/R9/R10).
  "rpg-world-gen": noParams,
  "rpg-recap": noParams,
  "rpg-session-distill": noParams,
  "rpg-director": noParams,
  "rpg-lorebook-upkeep": noParams,
  "rpg-illustration": noParams,
  "rpg-npc-portrait": noParams,
  "rpg-scene-plan": noParams,
  "rpg-scene-distill": noParams,
  "rpg-recruit-card": noParams,
} as const satisfies { [K in WorkloadKind]: z.ZodType };

/** The per-kind params payload type — derived from {@link PARAMS_SCHEMAS} (one home; the runner's
 *  `Runner<K>` second arg + the row projection both index this map). */
export type ParamsByKind = { [K in WorkloadKind]: z.infer<(typeof PARAMS_SCHEMAS)[K]> };

/**
 * The `start` input the verb re-parses — a discriminated union on `kind` carrying the kind's params. tRPC
 * derives its wire schema from this; `start` re-runs it even after the wire validated (mocked-procedure
 * tests bypass the transport validator). Built explicitly per kind (Zod needs static literal
 * discriminants); {@link PARAMS_SCHEMAS} is the exhaustiveness backstop that catches a forgotten kind.
 */
export const startWorkloadInput = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("embed-corpus"), params: PARAMS_SCHEMAS["embed-corpus"] }),
  z.object({ kind: z.literal("embed-assets"), params: PARAMS_SCHEMAS["embed-assets"] }),
  z.object({ kind: z.literal("distill-characters"), params: PARAMS_SCHEMAS["distill-characters"] }),
  z.object({ kind: z.literal("compute-themes"), params: PARAMS_SCHEMAS["compute-themes"] }),
  z.object({ kind: z.literal("memory-backfill"), params: PARAMS_SCHEMAS["memory-backfill"] }),
  z.object({
    kind: z.literal("group-character-backfill"),
    params: PARAMS_SCHEMAS["group-character-backfill"],
  }),
  z.object({
    kind: z.literal("compute-cooccurrence"),
    params: PARAMS_SCHEMAS["compute-cooccurrence"],
  }),
  z.object({ kind: z.literal("find-duplicates"), params: PARAMS_SCHEMAS["find-duplicates"] }),
  z.object({ kind: z.literal("csls"), params: PARAMS_SCHEMAS.csls }),
  z.object({ kind: z.literal("assets-backfill"), params: PARAMS_SCHEMAS["assets-backfill"] }),
  z.object({ kind: z.literal("assets-gc"), params: PARAMS_SCHEMAS["assets-gc"] }),
  z.object({ kind: z.literal("assets-fsck"), params: PARAMS_SCHEMAS["assets-fsck"] }),
  z.object({ kind: z.literal("import-st"), params: PARAMS_SCHEMAS["import-st"] }),
  z.object({ kind: z.literal("reconcile-stats"), params: PARAMS_SCHEMAS["reconcile-stats"] }),
  z.object({
    kind: z.literal("refresh-model-catalog"),
    params: PARAMS_SCHEMAS["refresh-model-catalog"],
  }),
  z.object({
    kind: z.literal("reconcile-world-state"),
    params: PARAMS_SCHEMAS["reconcile-world-state"],
  }),
  z.object({
    kind: z.literal("crew-lorebook-keeper"),
    params: PARAMS_SCHEMAS["crew-lorebook-keeper"],
  }),
  z.object({
    kind: z.literal("crew-card-evolution"),
    params: PARAMS_SCHEMAS["crew-card-evolution"],
  }),
  z.object({ kind: z.literal("crew-director"), params: PARAMS_SCHEMAS["crew-director"] }),
  z.object({ kind: z.literal("crew-prose-audit"), params: PARAMS_SCHEMAS["crew-prose-audit"] }),
  z.object({
    kind: z.literal("expressions-sprite-sheet"),
    params: PARAMS_SCHEMAS["expressions-sprite-sheet"],
  }),
  z.object({ kind: z.literal("databank-ingest"), params: PARAMS_SCHEMAS["databank-ingest"] }),
  z.object({ kind: z.literal("databank-reindex"), params: PARAMS_SCHEMAS["databank-reindex"] }),
  z.object({ kind: z.literal("rpg-world-gen"), params: PARAMS_SCHEMAS["rpg-world-gen"] }),
  z.object({ kind: z.literal("rpg-recap"), params: PARAMS_SCHEMAS["rpg-recap"] }),
  z.object({
    kind: z.literal("rpg-session-distill"),
    params: PARAMS_SCHEMAS["rpg-session-distill"],
  }),
  z.object({ kind: z.literal("rpg-director"), params: PARAMS_SCHEMAS["rpg-director"] }),
  z.object({
    kind: z.literal("rpg-lorebook-upkeep"),
    params: PARAMS_SCHEMAS["rpg-lorebook-upkeep"],
  }),
  z.object({ kind: z.literal("rpg-illustration"), params: PARAMS_SCHEMAS["rpg-illustration"] }),
  z.object({ kind: z.literal("rpg-npc-portrait"), params: PARAMS_SCHEMAS["rpg-npc-portrait"] }),
  z.object({ kind: z.literal("rpg-scene-plan"), params: PARAMS_SCHEMAS["rpg-scene-plan"] }),
  z.object({ kind: z.literal("rpg-scene-distill"), params: PARAMS_SCHEMAS["rpg-scene-distill"] }),
  z.object({ kind: z.literal("rpg-recruit-card"), params: PARAMS_SCHEMAS["rpg-recruit-card"] }),
]);

/** The parsed `start` input (the wire/verb shape). The `kind`-keyed `params` is narrowed by the union. */
export type StartWorkloadInput = z.infer<typeof startWorkloadInput>;

/** Re-parse a raw params blob against its kind's schema (the `start` defense-in-depth + the row read seam).
 *  Throws the Zod error on a malformed blob; the row-read path (`toView`) catches it for poison tolerance. */
export function parseParamsForKind<K extends WorkloadKind>(
  kind: K,
  params: unknown,
): ParamsByKind[K] {
  return PARAMS_SCHEMAS[kind].parse(params) as ParamsByKind[K];
}
