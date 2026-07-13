// domain/workloads/contract/workload-params — per-kind params vocabulary: one Zod schema per WorkloadKind,
// the exhaustive PARAMS_SCHEMAS Record (a new kind missing its schema is a tsc error), the derived
// ParamsByKind map, and the startWorkloadInput discriminated union the start verb re-parses.
//
// Tunables are optional (no Zod .default()) — precedence (param → user setting → runner floor) resolves in
// the runner. A kind with no tunables keeps an explicit z.object({}) so start() validates every kind uniformly.

import type { WorkloadKind, WorkloadSource } from "@orb/contracts/workloads";
import { indexSourceSchema, NON_INDEX_SOURCE } from "@orb/contracts/workloads";
import { z } from "zod";

const noParams = z.object({});

const computeThemesParams = z.object({ k: z.number().int().positive().optional() });

/** source is required (also the single-active lock dimension stamped into workloads.source). */
const indexParams = z.object({ source: indexSourceSchema, force: z.boolean().optional() });

const maintenanceParams = z.object({ dryRun: z.boolean().optional() });

/** Server-minted staging token; the runner-env op resolves basename(token) under the staging root (path-traversal-safe). */
const importBundleParams = z.object({ token: z.string().min(1) });

/** satisfies \{ [K in WorkloadKind]: ZodType \} forces an entry for every kind — a missing one is a tsc error. */
export const PARAMS_SCHEMAS = {
  index: indexParams,
  "distill-characters": noParams,
  "compute-themes": computeThemesParams,
  "memory-backfill": noParams,
  "group-character-backfill": noParams,
  "compute-cooccurrence": noParams,
  "find-duplicates": noParams,
  csls: noParams,
  "assets-backfill": maintenanceParams,
  "assets-gc": maintenanceParams,
  "assets-fsck": noParams,
  "import-st": maintenanceParams,
  "import-bundle": importBundleParams,
  "reconcile-stats": noParams,
  "refresh-model-catalog": noParams,
  "reconcile-world-state": noParams,
  "crew-lorebook-keeper": noParams,
  "crew-card-evolution": noParams,
  "crew-director": noParams,
  "crew-prose-audit": noParams,
  "expressions-sprite-sheet": noParams,
  "databank-ingest": noParams,
  "databank-reindex": noParams,
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

export type ParamsByKind = { [K in WorkloadKind]: z.infer<(typeof PARAMS_SCHEMAS)[K]> };

/** Discriminated union on kind; start re-parses it even after the wire validated. */
export const startWorkloadInput = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("index"), params: PARAMS_SCHEMAS.index }),
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
  z.object({ kind: z.literal("import-bundle"), params: PARAMS_SCHEMAS["import-bundle"] }),
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

export type StartWorkloadInput = z.infer<typeof startWorkloadInput>;

/** Throws the Zod error on a malformed blob; the row-read path (toView) catches it for poison tolerance. */
export function parseParamsForKind<K extends WorkloadKind>(
  kind: K,
  params: unknown,
): ParamsByKind[K] {
  return PARAMS_SCHEMAS[kind].parse(params) as ParamsByKind[K];
}

/** The single-active lock partition a row inserts under: index's own source, else the shared none sentinel. */
export function resolveWorkloadSource<K extends WorkloadKind>(
  kind: K,
  params: ParamsByKind[K],
): WorkloadSource {
  return kind === "index" ? (params as ParamsByKind["index"]).source : NON_INDEX_SOURCE;
}
