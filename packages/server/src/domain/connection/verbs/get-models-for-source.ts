// verb: getModelsForSource — the read-only Connections role-slot picker facade. Zero outbound fetch by
// construction: reads snapshots (OR/agent-sdk), env/config (vllm), the injected builtin trio (local-light),
// and credential presence only — never a live /models call. 5-arm switch over params.source, assertNever-exhaustive.
//
// defaultModelId is what resolveRole picks for an unset slot; the client displays it but persists "" — the
// resolver re-derives it live so a server-config change never freezes into roleDefaults.

import type { ModelCatalogEntry, RoutingRoleKey } from "@orb/contracts/connection";
import { DEFAULT_CHAT_MODEL_ID, DEFAULT_OR_CHAT_MODEL_ID } from "@orb/contracts/connection";
import { DomainNoCredentialError } from "@orb/kit/errors";
import { env } from "#foundation/env";
import type { ConnectionContext } from "../context";
import type { GetModelsForSourceParams } from "../contract/params";
import type { SourceModelEntry, SourceModelsResult } from "../contract/results";
import type { ConnectionService } from "../contract/service";
import { readAgentSdkCatalogSnapshot } from "../persistence/agent-sdk-catalog-snapshot";
import { readCatalogSnapshot } from "../persistence/catalog-snapshot";
import { curatedShortlistEntries } from "../substrate/curated-shortlist";

function assertNever(value: never): never {
  throw new Error(`getModelsForSource: unhandled source ${String(value)}`);
}

const BUILTIN_EMBED_DIM = 1024;

const EMBED_ROLES: ReadonlySet<RoutingRoleKey> = new Set<RoutingRoleKey>(["embed", "imageEmbed"]);

function orDefaultForRole(role: RoutingRoleKey): string | null {
  return role === "generateImage" ? null : DEFAULT_OR_CHAT_MODEL_ID;
}

/** Mirrors resolve-role.ts's per-role selectors; generateImage isn't a vllm role so GEN is a harmless fall-through. */
function vllmModelForRole(role: RoutingRoleKey): string {
  if (EMBED_ROLES.has(role)) {
    return env.VLLM_EMBED_MODEL;
  }
  if (role === "rerank") {
    return env.VLLM_RERANK_MODEL;
  }
  return env.VLLM_GEN_MODEL;
}

/** null for a non-derive role — local-light serves the three derive roles only. */
function localLightModelForRole(role: RoutingRoleKey, trio: ConnectionContext["localLightDefaults"]): string | null {
  if (EMBED_ROLES.has(role)) {
    return role === "imageEmbed" ? trio.imageEmbed : trio.embed;
  }
  if (role === "rerank") {
    return trio.rerank;
  }
  return null;
}

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

/** Key presence only — no fetch. DomainNoCredentialError means "no key"; any other throw re-throws. */
async function hasCredential(ctx: ConnectionContext, params: GetModelsForSourceParams): Promise<boolean> {
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

/** Keyless browse stays legal — models stay populated, only the state goes needs-key. */
async function openrouterArm(ctx: ConnectionContext, params: GetModelsForSourceParams): Promise<SourceModelsResult> {
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

/** Owner-gated. Non-owner → owner-only, but the curated list is still returned so the disabled option renders honestly. */
async function maxProSubArm(ctx: ConnectionContext, params: GetModelsForSourceParams): Promise<SourceModelsResult> {
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

/** Key-presence only, never a fetch. No key → needs-key; resolves → needs-probe (client fetches models on picker open). */
async function customOpenAiArm(ctx: ConnectionContext, params: GetModelsForSourceParams): Promise<SourceModelsResult> {
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
function localLightArm(ctx: ConnectionContext, params: GetModelsForSourceParams): SourceModelsResult {
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

export function createGetModelsForSource(ctx: ConnectionContext): ConnectionService["getModelsForSource"] {
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
