// domain/workloads/contract/workload-params — per-kind params vocabulary: one Zod schema per WorkloadKind,
// the exhaustive PARAMS_SCHEMAS Record (a new kind missing its schema is a tsc error), the derived
// ParamsByKind map, and the startWorkloadInput discriminated union the start verb re-parses.
//
// Tunables are optional (no Zod .default()) — precedence (param → user setting → runner floor) resolves in
// the runner. A kind with no tunables keeps an explicit z.object({}) so start() validates every kind uniformly.

import { documentIdSchema, reindexModeSchema, reindexScopeSchema } from "@orb/contracts/databank";
import { expressionLabelSchema, SPRITE_SHEET_MAX_LABELS, STYLE_PROMPT_MAX } from "@orb/contracts/expressions";
import type { WorkloadKind, WorkloadSource } from "@orb/contracts/workloads";
import { indexSourceSchema, NON_INDEX_SOURCE } from "@orb/contracts/workloads";
import type { UserId } from "@orb/kit/ids";
import { brandedId, ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
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

/** rpg-world-gen: session zero for ONE game (rpg-design/06 §4). Enqueued singular on the host. */
const rpgWorldGenParams = z.object({ gameId: typeIdSchema(ID_PREFIX.rpgGame) });
/** rpg-recap / rpg-session-distill: scoped to ONE game + ONE session (rpg-design/06 §3). */
const rpgSessionScopedParams = z.object({ gameId: typeIdSchema(ID_PREFIX.rpgGame), sessionId: typeIdSchema(ID_PREFIX.rpgSession) });

/** rpg-npc-portrait (rpg-design/10 §R9): generate/refresh ONE npc's portrait, scoped to its game. `dryRun`
 *  returns the compiled prompt for host review without spending (08 §2 preview-before-spend). */
const rpgNpcPortraitParams = z.object({
  gameId: typeIdSchema(ID_PREFIX.rpgGame),
  npcId: typeIdSchema(ID_PREFIX.rpgNpc),
  dryRun: z.boolean().optional(),
});
/** rpg-illustration (rpg-design/10 §R9): a scene illustration for ONE game. `sceneMoment`/`purpose` are the
 *  model's `request_illustration` args (the CG-worthy moment it chose); `force` bypasses the cadence gate
 *  (08 §3 host "force"); `dryRun` compiles the prompt without spending (08 §2). */
const rpgIllustrationParams = z.object({
  gameId: typeIdSchema(ID_PREFIX.rpgGame),
  sceneMoment: z.string(),
  purpose: z.string().optional(),
  force: z.boolean().optional(),
  dryRun: z.boolean().optional(),
});
/** rpg-scene-plan (rpg-design/10 §R10 / 07 §2.1): the host's structured scene proposal for ONE game; the
 *  optional `prompt` seeds the model's plan. */
const rpgScenePlanParams = z.object({
  gameId: typeIdSchema(ID_PREFIX.rpgGame),
  prompt: z.string().optional(),
});
/** rpg-scene-distill (rpg-design/10 §R10 / 07 §2.3): the ≤200-word summary of ONE concluding scene. */
const rpgSceneDistillParams = z.object({
  gameId: typeIdSchema(ID_PREFIX.rpgGame),
  sceneId: typeIdSchema(ID_PREFIX.rpgScene),
});
/** rpg-recruit-card (rpg-design/10 §R10 / 07 §3): generate the character card for ONE npc being recruited into
 *  the roster. */
const rpgRecruitCardParams = z.object({
  gameId: typeIdSchema(ID_PREFIX.rpgGame),
  npcId: typeIdSchema(ID_PREFIX.rpgNpc),
});

/** crew-lorebook-keeper + crew-card-evolution + crew-director: the run is scoped to ONE chat (chat-crew-design
 *  /03 §0 — these crew params are uniformly `{ chatId }`). Enqueued singular on the chat HOST by the scheduler
 *  / `runNow`. */
const crewChatScopedParams = z.object({ chatId: typeIdSchema(ID_PREFIX.chat) });

/** crew-prose-audit: one audited VARIANT (03 §4). The on-demand + every-turn arms both target one variant, so
 *  the params carry it alongside the chat. Singular on the host. */
const crewProseAuditParams = z.object({ chatId: typeIdSchema(ID_PREFIX.chat), variantId: typeIdSchema(ID_PREFIX.messageVariant) });

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

/** expressions-sprite-sheet (E4 §2): the resolved sheet-generation job. `matte` is REQUIRED here (the
 *  enqueue verb resolved the arm — explicit \> wired-model \> flood — and stamped it, §4.3), unlike the OPTIONAL
 *  wire field. `ownerId` is the requesting principal (bills + scopes the imagery call). The label/style bounds
 *  mirror `@orb/contracts/expressions` (the wire already validated; this is the workloads defense-in-depth
 *  re-parse). Labels re-normalize through `expressionLabelSchema` (idempotent — the verb already normalized). */
const expressionsSpriteSheetParams = z.object({
  characterId: typeIdSchema(ID_PREFIX.character),
  labels: z.array(expressionLabelSchema).min(1).max(SPRITE_SHEET_MAX_LABELS),
  stylePrompt: z.string().max(STYLE_PROMPT_MAX).optional(),
  matte: z.enum(["model", "flood", "none"]),
  ownerId: brandedId<UserId>(),
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
  "crew-lorebook-keeper": crewChatScopedParams,
  "crew-card-evolution": crewChatScopedParams,
  "crew-director": crewChatScopedParams,
  "crew-prose-audit": crewProseAuditParams,
  "expressions-sprite-sheet": expressionsSpriteSheetParams,
  "databank-ingest": databankIngestParams,
  "databank-reindex": databankReindexParams,
  "rpg-world-gen": rpgWorldGenParams,
  "rpg-recap": rpgSessionScopedParams,
  "rpg-session-distill": rpgSessionScopedParams,
  "rpg-director": rpgWorldGenParams,
  "rpg-lorebook-upkeep": rpgSessionScopedParams,
  "rpg-illustration": rpgIllustrationParams,
  "rpg-npc-portrait": rpgNpcPortraitParams,
  "rpg-scene-plan": rpgScenePlanParams,
  "rpg-scene-distill": rpgSceneDistillParams,
  "rpg-recruit-card": rpgRecruitCardParams,
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
