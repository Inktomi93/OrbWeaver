// `@orb/contracts/workloads` — per-kind PARAMS vocabulary: one Zod schema per WorkloadKind plus the
// `WorkloadParamsByKind` type map the wire + the row projection index by kind.
//
// The schemas live in `contracts` (not `domain/workloads/contract/`) because a workload's params are a
// domain↔domain wire shape: the OWNING domain authors the schema and hands it to the engine on its
// `WorkloadContribution`; the workloads domain never spells another domain's vocabulary. Kinds whose owner
// has its own contracts module are promoted there stage by stage (the `IngestRunResult` precedent) — this
// module carries the ones still awaiting their owner + assembles the exhaustive map.
//
// Tunables are optional (no Zod `.default()`) — precedence (param → user setting → the owner's floor)
// resolves inside the contribution's run body. A kind with no tunables keeps an explicit `z.object({})` so
// every kind validates uniformly.

import { z } from "zod";
import { documentIdSchema, reindexModeSchema, reindexScopeSchema } from "#databank";
import type { ComputeThemesWorkloadParams, FindDuplicatesWorkloadParams } from "#discovery";
import type { RefineScoreSweepWorkloadParams } from "#refinery";
import type { WorkloadKind } from "./axes.ts";
import { indexSourceSchema, workloadKindSchema } from "./axes.ts";

const noParams = z.object({});

/** The params of a kind with no tunables (`{}`) — the shared type for every tunable-less kind. */
export type NoWorkloadParams = z.infer<typeof noParams>;

/** A staged-upload handle is a SINGLE path segment minted by the import HTTP routes
 *  (`import-tree-<uuid>` / `import-bundle-<uuid>.zip`) — never a path. This is the OUTER (contract-layer) belt:
 *  a tRPC-crafted `".."`, `"."`, `"/etc"`, `"a/b"`, or `"a\\b"` fails validation here, before the import
 *  contribution ever resolves it. The contribution's resolve-and-contain check (`resolveStagedPath`) is the
 *  authoritative inner belt; this makes the traversal shapes unrepresentable at the boundary. Charset admits
 *  exactly the minted tokens: alphanumerics, `-`, `.`, `_`, first char alphanumeric (so a leading-dot
 *  `.`/`..`/`.hidden` is rejected), and no `..` substring anywhere. */
const STAGED_HANDLE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
/** Common single-segment filename ceiling — a UUID token is ~50 chars; this is just a sane upper bound. */
const STAGED_HANDLE_MAX = 255;
const stagedHandleSchema = z
  .string()
  .max(STAGED_HANDLE_MAX)
  .regex(STAGED_HANDLE, "must be a single safe path segment (no separators, no leading dot)")
  .refine((s) => !s.includes(".."), "must not contain a `..` traversal segment");

/** databank-ingest: chunk+embed+prune ONE document (the post-upload path). `documentId` is required; the row
 *  owner (`ctx.ownerId`) scopes the run. */
export const databankIngestWorkloadParams = z.object({ documentId: documentIdSchema });

/** databank-reindex: bulk derived-layer maintenance (param/model change, extractor upgrade). `scope` selects
 *  one document or every document the row owner owns; `mode` is a tunable (the contribution floors it to
 *  `chunk-embed`). The owner is `ctx.ownerId` (`null` = the box-wide bulk sweep). */
export const databankReindexWorkloadParams = z.object({ scope: reindexScopeSchema, mode: reindexModeSchema.optional() });

/** index: the embeddings reindex. Its ONE required field is `source` — which is the queue's OWN
 *  single-active lock sub-partition (stamped into `workloads.source`), so unlike every other kind this
 *  schema stays here rather than in `@orb/contracts/embeddings`: the field is queue vocabulary, and moving
 *  it would make `contracts/embeddings` and `contracts/workloads` import each other. */
export const indexWorkloadParams = z.object({ source: indexSourceSchema, force: z.boolean().optional() });

/** The shared maintenance tunable — `dryRun` reports what a pass WOULD change without mutating. */
export const maintenanceWorkloadParams = z.object({ dryRun: z.boolean().optional() });

/** import-st tunables: the maintenance `dryRun` plus an optional folder-upload `stagedDir` override (a
 *  server-minted staging handle — a single safe path segment; the import contribution resolves it to a
 *  strict descendant of the staging root). Absent `stagedDir` ⇒ the env-configured ST profile dir. */
export const importStWorkloadParams = z.object({
  dryRun: z.boolean().optional(),
  stagedDir: stagedHandleSchema.optional(),
});

/** import-bundle: a server-minted staging handle (a single safe path segment); the import contribution
 *  resolves it to a strict descendant of the staging root (path-traversal-safe). `source` selects the staged
 *  shape: `zip` (a single archive, the default) or `dir` (a folder-upload tree). */
export const importBundleWorkloadParams = z.object({
  token: stagedHandleSchema,
  source: z.enum(["zip", "dir"]).optional(),
});

/** No-tunable kinds share this schema — the explicit empty object every uniform parse runs against. */
export const emptyWorkloadParams = noParams;

/**
 * kind → its params TYPE. The map the wire (`StartWorkloadInput`), the row projection
 * (`WorkloadRowAnyKind`), and every `WorkloadContribution<K>` index by kind. A kind missing an entry here is
 * a tsc error at `WorkloadContributions` (the mapped-type registry indexes this map for every member).
 */
export interface WorkloadParamsByKind {
  index: z.infer<typeof indexWorkloadParams>;
  "distill-characters": NoWorkloadParams;
  "compute-themes": ComputeThemesWorkloadParams;
  "memory-backfill": NoWorkloadParams;
  "group-character-backfill": NoWorkloadParams;
  "compute-cooccurrence": NoWorkloadParams;
  "find-duplicates": FindDuplicatesWorkloadParams;
  csls: NoWorkloadParams;
  "assets-backfill": z.infer<typeof maintenanceWorkloadParams>;
  "assets-gc": z.infer<typeof maintenanceWorkloadParams>;
  "assets-fsck": NoWorkloadParams;
  "import-st": z.infer<typeof importStWorkloadParams>;
  "import-bundle": z.infer<typeof importBundleWorkloadParams>;
  "reconcile-stats": NoWorkloadParams;
  "refresh-model-catalog": NoWorkloadParams;
  "reconcile-world-state": NoWorkloadParams;
  "databank-ingest": z.infer<typeof databankIngestWorkloadParams>;
  "databank-reindex": z.infer<typeof databankReindexWorkloadParams>;
  "refine-score-sweep": RefineScoreSweepWorkloadParams;
}

/**
 * The enqueue wire shape — a kind correlated with ITS params. Derived mechanically from
 * {@link WorkloadParamsByKind} (there is no hand-written 18-arm union to drift): the per-kind VALIDATOR is
 * the owning domain's `WorkloadContribution.params`, re-parsed at the `start` door.
 */
export type StartWorkloadInput = { [K in WorkloadKind]: { readonly kind: K; readonly params: WorkloadParamsByKind[K] } }[WorkloadKind];

/**
 * The `start`/`createSchedule` wire validator: a known `kind` + a params OBJECT, and nothing more.
 *
 * It deliberately does NOT enforce the kind's own params shape — the per-kind schemas live with their
 * owners now (there is no central schema map left to build a discriminated union from), so the
 * AUTHORITATIVE validator is `contributions[kind].params.parse(...)` at the `start` door, which maps a parse
 * failure to a BAD_REQUEST domain error. A malformed blob is still rejected — one layer later, never
 * accepted.
 */
export const startWorkloadEnvelope = z.object({ kind: workloadKindSchema, params: z.record(z.string(), z.unknown()) });

export type StartWorkloadEnvelope = z.infer<typeof startWorkloadEnvelope>;

/** The ONE home of the envelope→per-kind widening (the transport hands the domain door a not-yet-per-kind
 *  -validated input; the door re-parses it). Contained here so no call site spells a bare cast. */
export function asStartWorkloadInput(envelope: StartWorkloadEnvelope): StartWorkloadInput {
  return envelope as StartWorkloadInput;
}
