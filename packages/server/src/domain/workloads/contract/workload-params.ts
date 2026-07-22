// domain/workloads/contract/workload-params — per-kind params vocabulary: one Zod schema per WorkloadKind,
// the exhaustive PARAMS_SCHEMAS Record (a new kind missing its schema is a tsc error), the derived
// ParamsByKind map, and the startWorkloadInput discriminated union the start verb re-parses.
//
// Tunables are optional (no Zod .default()) — precedence (param → user setting → runner floor) resolves in
// the runner. A kind with no tunables keeps an explicit z.object({}) so start() validates every kind uniformly.

import { documentIdSchema, reindexModeSchema, reindexScopeSchema } from "@orb/contracts/databank";

import type { WorkloadKind, WorkloadSource } from "@orb/contracts/workloads";
import { indexSourceSchema, NON_INDEX_SOURCE } from "@orb/contracts/workloads";
import { z } from "zod";

const noParams = z.object({});

/** A staged-upload handle is a SINGLE path segment minted by the import HTTP routes
 *  (`import-tree-<uuid>` / `import-bundle-<uuid>.zip`) — never a path. This is the OUTER (contract-layer) belt:
 *  a tRPC-crafted `".."`, `"."`, `"/etc"`, `"a/b"`, or `"a\\b"` fails validation here, before the runner-env
 *  ever resolves it. The runner-env's resolve-and-contain check (`resolveStagedPath`) is the authoritative
 *  inner belt; this makes the traversal shapes unrepresentable at the boundary. Charset admits exactly the
 *  minted tokens: alphanumerics, `-`, `.`, `_`, first char alphanumeric (so a leading-dot `.`/`..`/`.hidden`
 *  is rejected), and no `..` substring anywhere. */
const STAGED_HANDLE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
/** Common single-segment filename ceiling — a UUID token is ~50 chars; this is just a sane upper bound. */
const STAGED_HANDLE_MAX = 255;
const stagedHandleSchema = z
  .string()
  .max(STAGED_HANDLE_MAX)
  .regex(STAGED_HANDLE, "must be a single safe path segment (no separators, no leading dot)")
  .refine((s) => !s.includes(".."), "must not contain a `..` traversal segment");

const computeThemesParams = z.object({ k: z.number().int().positive().optional() });

/** databank-ingest: chunk+embed+prune ONE document (the post-upload path). `documentId` is required; the row
 *  owner (`ctx.ownerId`) scopes the run. */
const databankIngestParams = z.object({ documentId: documentIdSchema });

/** databank-reindex: bulk derived-layer maintenance (param/model change, extractor upgrade). `scope` selects
 *  one document or every document the row owner owns; `mode` is a tunable (optional — the runner floors it to
 *  `chunk-embed`). The owner is `ctx.ownerId` (`null` = the box-wide bulk sweep). */
const databankReindexParams = z.object({ scope: reindexScopeSchema, mode: reindexModeSchema.optional() });

/** source is required (also the single-active lock dimension stamped into workloads.source). */
const indexParams = z.object({ source: indexSourceSchema, force: z.boolean().optional() });

const maintenanceParams = z.object({ dryRun: z.boolean().optional() });

/** import-st tunables: the maintenance `dryRun` plus an optional folder-upload `stagedDir` override (a
 *  server-minted staging handle — a single safe path segment; the runner-env resolves it to a strict
 *  descendant of the staging root). Absent stagedDir ⇒ the env-configured ST profile dir (the existing
 *  behavior). */
const importStParams = z.object({
  dryRun: z.boolean().optional(),
  stagedDir: stagedHandleSchema.optional(),
});

/** Server-minted staging handle (a single safe path segment); the runner-env op resolves it to a strict
 *  descendant of the staging root (path-traversal-safe). `source` selects the staged shape: `zip` (a single
 *  archive, the default) or `dir` (a folder-upload tree). */
const importBundleParams = z.object({
  token: stagedHandleSchema,
  source: z.enum(["zip", "dir"]).optional(),
});

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
  "import-st": importStParams,
  "import-bundle": importBundleParams,
  "reconcile-stats": noParams,
  "refresh-model-catalog": noParams,
  "reconcile-world-state": noParams,
  "databank-ingest": databankIngestParams,
  "databank-reindex": databankReindexParams,
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
  z.object({ kind: z.literal("databank-ingest"), params: PARAMS_SCHEMAS["databank-ingest"] }),
  z.object({ kind: z.literal("databank-reindex"), params: PARAMS_SCHEMAS["databank-reindex"] }),
]);
// NOTE: these five kinds keep `stub:true` in `@orb/contracts/workloads` WORKLOAD_KIND_MODES until their real
// runners land (rpg-design/10 §R9/§R10) — the mode-policy flip rides the SAME change as each runner body.

export type StartWorkloadInput = z.infer<typeof startWorkloadInput>;

/** Throws the Zod error on a malformed blob; the row-read path (toView) catches it for poison tolerance. */
export function parseParamsForKind<K extends WorkloadKind>(kind: K, params: unknown): ParamsByKind[K] {
  return PARAMS_SCHEMAS[kind].parse(params) as ParamsByKind[K];
}

/** The single-active lock partition a row inserts under: index's own source, else the shared none sentinel. */
export function resolveWorkloadSource<K extends WorkloadKind>(kind: K, params: ParamsByKind[K]): WorkloadSource {
  return kind === "index" ? (params as ParamsByKind["index"]).source : NON_INDEX_SOURCE;
}
