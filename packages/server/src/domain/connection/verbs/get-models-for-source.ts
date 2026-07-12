// verb: getModelsForSource — the read-only Connections role-slot picker facade (CONNECTIONS-BUILD-SPEC §2).
// ZERO OUTBOUND FETCH by construction: it reads snapshots (OR / agent-sdk), env/config (vllm), the injected
// builtin trio (local-light), and CREDENTIAL PRESENCE only — never a live `/models` call. The SSRF-guarded
// outbound probes stay on the credentials-router `.mutation()`s (Esoteric #9); this stays a safe
// `authedProcedure.query`. The whole verb is a 5-arm switch over `params.source`, `assertNever`-exhaustive
// like `credentials/verbs/resolve.ts` — a new `ChatSource` member is a `tsc` error until its arm lands.
//
// LOAD-BEARING — the DERIVE-NOT-STAMP contract: `defaultModelId` is what `resolveRole` picks for an UNSET
// slot for this (role, source). The client DISPLAYS it (ghost/auto-fill) but PERSISTS `""`; the resolver
// re-derives it live from env/builtin. Stamping the env value into `roleDefaults` would freeze a server-
// config change — the bug this contract exists to prevent (resolve-role.ts applyVllmFallback + env
// fallbacks). A ghost-parity test guards `defaultModelId` against resolver drift.

import type { ModelCatalogEntry, RoutingRoleKey } from "@orb/contracts/connection";
import { DEFAULT_CHAT_MODEL_ID, DEFAULT_OR_CHAT_MODEL_ID } from "@orb/contracts/connection";
import { DomainNoCredentialError } from "@orb/kit/errors";
import { env } from "#foundation/env";
import type { GetModelsForSourceParams } from "../contract/params";
import type { SourceModelEntry, SourceModelsResult } from "../contract/results";
import type { ConnectionContext, ConnectionService } from "../contract/service";
import { readAgentSdkCatalogSnapshot } from "../persistence/agent-sdk-catalog-snapshot";
import { readCatalogSnapshot } from "../persistence/catalog-snapshot";
import { curatedShortlistEntries } from "../substrate/curated-shortlist";

function assertNever(value: never): never {
  throw new Error(`getModelsForSource: unhandled source ${String(value)}`);
}

/** The fixed local-light / built-in vector space (`F32_BLOB(1024)`; connections-model.ts) — surfaced on the
 *  embed-role builtin/config entries so the picker can render "1024-dim". */
const BUILTIN_EMBED_DIM = 1024;

/** The roles whose vllm/local-light model is an EMBED model (env `VLLM_EMBED_MODEL` / the jina builtin) — the
 *  imageEmbed role shares the embed model + dim (mirrors `resolve-role.ts` embed/imageEmbed selectors). */
const EMBED_ROLES: ReadonlySet<RoutingRoleKey> = new Set<RoutingRoleKey>(["embed", "imageEmbed"]);

/** The keyless-legal OR default the resolver would heal an unset chat-family slot to (`openrouter/auto`).
 *  generateImage has no OR default (the resolver's model stays null → castId), so it ghosts nothing. */
function orDefaultForRole(role: RoutingRoleKey): string | null {
  return role === "generateImage" ? null : DEFAULT_OR_CHAT_MODEL_ID;
}

/** The vllm env model for a role, mirroring the resolver's per-role selectors (resolve-role.ts:78/84/104).
 *  embed/imageEmbed → VLLM_EMBED_MODEL, rerank → VLLM_RERANK_MODEL, else → VLLM_GEN_MODEL. generateImage is
 *  not a vllm role (the schema forbids it, openrouter-only) — the client never asks, so GEN is a harmless
 *  fall-through. */
function vllmModelForRole(role: RoutingRoleKey): string {
  if (EMBED_ROLES.has(role)) {
    return env.VLLM_EMBED_MODEL;
  }
  if (role === "rerank") {
    return env.VLLM_RERANK_MODEL;
  }
  return env.VLLM_GEN_MODEL;
}

/** The local-light builtin model for a derive role, from the injected trio. `null` for a non-derive role
 *  (chat/agent/summarize/generateImage) — local-light serves the three derive roles only, and the client
 *  never asks the picker for the others (`INFERENCE_SOURCES` gates the options). */
function localLightModelForRole(
  role: RoutingRoleKey,
  trio: ConnectionContext["localLightDefaults"],
): string | null {
  if (EMBED_ROLES.has(role)) {
    return role === "imageEmbed" ? trio.imageEmbed : trio.embed;
  }
  if (role === "rerank") {
    return trio.rerank;
  }
  return null;
}

/** Map an OR catalog entry → the picker entry (carry the display + filter-chip facts). */
function orEntryToSourceModel(entry: ModelCatalogEntry): SourceModelEntry {
  return {
    id: entry.id,
    label: entry.name.length > 0 ? entry.name : entry.id,
    ...(entry.contextLength !== null ? { contextLength: entry.contextLength } : {}),
    ...(entry.promptPrice !== null ? { promptPrice: entry.promptPrice } : {}),
    inputModalities: entry.inputModalities,
    ...(entry.outputModalities !== undefined ? { outputModalities: entry.outputModalities } : {}),
    supportedParameters: entry.supportedParameters,
    origin: "catalog",
  };
}

/** Whether the principal has a resolvable credential for `source` (KEY PRESENCE only — no fetch). A
 *  `DomainNoCredentialError` means "no key" (the deliberate keyless-browse signal); any other throw is a
 *  real fault and re-throws. */
async function hasCredential(
  ctx: ConnectionContext,
  params: GetModelsForSourceParams,
): Promise<boolean> {
  try {
    await ctx.resolveCredential({ principal: params.principal, source: params.source });
    return true;
  } catch (err) {
    if (err instanceof DomainNoCredentialError) {
      return false;
    }
    throw err;
  }
}

/** openrouter — read the persisted catalog snapshot (warm-on-read is free); keyless browse stays legal
 *  (models stay populated, only the state goes `needs-key`). */
async function openrouterArm(
  ctx: ConnectionContext,
  params: GetModelsForSourceParams,
): Promise<SourceModelsResult> {
  const snapshot = await readCatalogSnapshot(ctx.db);
  const defaultModelId = orDefaultForRole(params.role);
  if (snapshot === null || snapshot.models.length === 0) {
    return {
      state: "empty-catalog",
      models: [],
      fetchedAt: null,
      defaultModelId,
      allowsFreeText: false,
    };
  }
  const models = snapshot.models.map(orEntryToSourceModel);
  const keyed = await hasCredential(ctx, params);
  return {
    state: keyed ? "ok" : "needs-key",
    models,
    fetchedAt: snapshot.fetchedAt,
    defaultModelId,
    allowsFreeText: false,
  };
}

/** max-pro-sub — owner-gated (D17). Non-owner → `owner-only` (the curated list is still returned so the
 *  disabled option renders honestly). Models: the agent-sdk snapshot, else the curated `CHAT_MODELS`
 *  cold-cache fallback. `defaultModelId` = the curated opus id (what `healToChatDefault(null)` returns). */
async function maxProSubArm(
  ctx: ConnectionContext,
  params: GetModelsForSourceParams,
): Promise<SourceModelsResult> {
  const owner = ctx.isOwner(params.principal);
  const snapshot = await readAgentSdkCatalogSnapshot(ctx.db);
  const models: SourceModelEntry[] =
    snapshot !== null && snapshot.models.length > 0
      ? snapshot.models.map((m) => ({
          id: m.alias,
          label: m.displayName,
          ...(m.resolvedModel !== null ? { detail: `${m.alias} → ${m.resolvedModel}` } : {}),
          origin: "catalog" as const,
        }))
      : curatedShortlistEntries();
  const fetchedAt = snapshot !== null && snapshot.models.length > 0 ? snapshot.fetchedAt : null;
  return {
    state: owner ? "ok" : "owner-only",
    models,
    fetchedAt,
    defaultModelId: DEFAULT_CHAT_MODEL_ID,
    allowsFreeText: false,
  };
}

/** custom_openai — KEY-PRESENCE ONLY, never a fetch. No key → `needs-key`; resolves → `needs-probe` (the
 *  client fires `credentials.fetchModels` on picker open). `defaultModelId` = the credential's
 *  `metadata.model` (GAP-6) when present; free-text is always allowed. */
async function customOpenAiArm(
  ctx: ConnectionContext,
  params: GetModelsForSourceParams,
): Promise<SourceModelsResult> {
  let defaultModelId: string | null = null;
  let keyed = false;
  try {
    const credential = await ctx.resolveCredential({
      principal: params.principal,
      source: "custom_openai",
    });
    keyed = true;
    if (credential.source === "custom_openai") {
      defaultModelId = credential.model ?? null;
    }
  } catch (err) {
    if (!(err instanceof DomainNoCredentialError)) {
      throw err;
    }
  }
  return {
    state: keyed ? "needs-probe" : "needs-key",
    models: [],
    fetchedAt: null,
    defaultModelId,
    allowsFreeText: true,
  };
}

/** vllm — pure env/config read. `engine-off` when the boot GPU fact is false (still return the config
 *  entry — the user should see what WOULD run). ONE entry from the role→env map; `dimensions` on the embed
 *  roles. generateImage is not a vllm role (empty result — the client never asks). */
function vllmArm(ctx: ConnectionContext, params: GetModelsForSourceParams): SourceModelsResult {
  if (params.role === "generateImage") {
    return {
      state: "ok",
      models: [],
      fetchedAt: null,
      defaultModelId: null,
      allowsFreeText: false,
    };
  }
  const id = vllmModelForRole(params.role);
  const entry: SourceModelEntry = {
    id,
    label: id,
    ...(EMBED_ROLES.has(params.role) ? { dimensions: env.VLLM_EMBED_DIM } : {}),
    origin: "config",
  };
  return {
    state: ctx.vllmAvailable ? "ok" : "engine-off",
    models: [entry],
    fetchedAt: null,
    defaultModelId: id,
    allowsFreeText: false,
  };
}

/** local-light — the injected builtin trio (the domain must not runtime-import infra). ONE entry for a
 *  derive role; empty + `ok` for a non-derive role (the client never asks). `dimensions: 1024` on the
 *  embeds (the fixed shared space). */
function localLightArm(
  ctx: ConnectionContext,
  params: GetModelsForSourceParams,
): SourceModelsResult {
  const id = localLightModelForRole(params.role, ctx.localLightDefaults);
  if (id === null) {
    return {
      state: "ok",
      models: [],
      fetchedAt: null,
      defaultModelId: null,
      allowsFreeText: false,
    };
  }
  const entry: SourceModelEntry = {
    id,
    label: id,
    ...(EMBED_ROLES.has(params.role) ? { dimensions: BUILTIN_EMBED_DIM } : {}),
    origin: "builtin",
  };
  return {
    state: "ok",
    models: [entry],
    fetchedAt: null,
    defaultModelId: id,
    allowsFreeText: false,
  };
}

export function createGetModelsForSource(
  ctx: ConnectionContext,
): ConnectionService["getModelsForSource"] {
  return (params: GetModelsForSourceParams): Promise<SourceModelsResult> => {
    switch (params.source) {
      case "openrouter":
        return openrouterArm(ctx, params);
      case "max-pro-sub":
        return maxProSubArm(ctx, params);
      case "custom_openai":
        return customOpenAiArm(ctx, params);
      case "vllm":
        return Promise.resolve(vllmArm(ctx, params));
      case "local-light":
        return Promise.resolve(localLightArm(ctx, params));
      default:
        return assertNever(params.source);
    }
  };
}
