// entry/compose/role-clients — the two `RoleClients` binders the composition root mints (tiers/entry.md
// §layout "role-clients.ts"; tiers/providers.md §"boot binder" + Esoteric §2). `RoleClients`
// (@orb/contracts/role-clients) is the GOLD-STANDARD cross-feature seam: a bundle of PRE-BOUND callables
// (embed/rerank/imageEmbed/summarize) + their `*Model` provenance tags. Downstream (search / embeddings /
// discovery / workloads) never sees a credential or picks a model — it calls `clients.embed(text)`.
//
// TWO binders (shared-dissolution §6: `createDefaultRoleClients` is DELETED — there is no silent family
// default; every bundle is explicitly bound here):
//   • bindRoleClientsForUser — ASYNC, the PD-9 paydown: per-role `connection.resolveRole({role})` resolves
//     `{credential, model}` (honoring `routing.roleDefaults.<role>` incl. the D39 local-light arm, resolved
//     ONCE at boot for the user), then each callable dispatches through the bound `ProviderExecutor`. The
//     `*Model` provenance = the eagerly-resolved `conn.model`. Used for the boot-global OWNER bundle
//     (embeddings indexer + discovery summarize + search). Ported from neo's `bindRoleClientsForUser`, but
//     orbweaver uses `connection.resolveRole` (not neo's `resolveRoleConnection`) + `executor.<role>`.
//   • createVllmFloorRoleClients — SYNC, satisfies the workloads `BindRoleClients = (ownerId) => RoleClients`
//     contract. Mints the vLLM credential synchronously + uses the env-pinned vLLM model ids; callables
//     dispatch through the executor. This is neo's `createVllmRoleClients` ported.

import type { Principal } from "@orb/contracts/identity";
import type {
  EmbedResult,
  ImageEmbedResult,
  RerankResult,
  SummarizeResult,
} from "@orb/contracts/providers";
import type {
  ImageEmbedInput,
  RerankDocument,
  RerankQuery,
  RoleClients,
  SummarizeInput,
  SummarizeOptions,
} from "@orb/contracts/role-clients";
import type { Handle, ModelId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ConnectionService } from "#domain/connection";
import type { CredentialsService } from "#domain/credentials";
import { env } from "#foundation/env";
import type { ProviderExecutor } from "#infra/providers";

/** What the async per-user binder needs: the `resolveRole` selector + the bound executor surface. */
export interface RoleClientsBinderDeps {
  readonly connection: Pick<ConnectionService, "resolveRole">;
  readonly executor: ProviderExecutor;
}

/** What the sync vLLM-floor binder needs: the synchronous vLLM credential mint + the executor surface. */
export interface VllmFloorBinderDeps {
  readonly credentials: Pick<CredentialsService, "mintVllmCredential">;
  readonly executor: ProviderExecutor;
}

/** The synthetic OWNER principal `resolveRole` needs (it scopes the user's routing settings + the D17 owner
 *  credential gate). `via:"fallback"` is the SAFE "this IS the owner" discriminator (spine §1); `handle` is
 *  unused by `resolveRole` (it reads `routing.roleDefaults` by `userId`) — derived from the id for parity. */
function ownerPrincipal(ownerId: UserId): Principal {
  return {
    userId: ownerId,
    role: "owner",
    handle: castId<Handle>(ownerId),
    externalId: null,
    via: "fallback",
  };
}

/**
 * Bind a `RoleClients` bundle for one user by resolving each derive-role's `{credential, model}` ONCE via
 * `connection.resolveRole` (the boot-time PD-9 paydown), then binding a callable per role over the executor.
 * Async — `resolveRole` touches the per-user settings + credential resolution. Call once per binding context
 * (the boot-global owner bundle here; the workloads per-owner bundle is the sync floor binder below).
 */
export async function bindRoleClientsForUser(
  deps: RoleClientsBinderDeps,
  ownerId: UserId,
): Promise<RoleClients> {
  const principal = ownerPrincipal(ownerId);
  const [embedConn, rerankConn, imageEmbedConn, summarizeConn] = await Promise.all([
    deps.connection.resolveRole({ role: "embed", principal }),
    deps.connection.resolveRole({ role: "rerank", principal }),
    deps.connection.resolveRole({ role: "imageEmbed", principal }),
    deps.connection.resolveRole({ role: "summarize", principal }),
  ]);
  return {
    embed: (
      input: string | string[],
      opts?: { inputType?: "query" | "document"; instruction?: string },
    ): Promise<EmbedResult> =>
      deps.executor.embed({
        credential: embedConn.credential,
        model: embedConn.model,
        input,
        ...(opts?.inputType !== undefined ? { inputType: opts.inputType } : {}),
        ...(opts?.instruction !== undefined ? { instruction: opts.instruction } : {}),
      }),
    rerank: (
      query: RerankQuery,
      documents: RerankDocument[],
      opts?: { instruction?: string },
    ): Promise<RerankResult> =>
      deps.executor.rerank({
        credential: rerankConn.credential,
        model: rerankConn.model,
        query,
        documents,
        ...(opts?.instruction !== undefined ? { instruction: opts.instruction } : {}),
      }),
    imageEmbed: (req: ImageEmbedInput): Promise<ImageEmbedResult> =>
      deps.executor.imageEmbed({
        credential: imageEmbedConn.credential,
        model: imageEmbedConn.model,
        input: req,
      }),
    summarize: (inputs: SummarizeInput[], opts?: SummarizeOptions): Promise<SummarizeResult> =>
      deps.executor.summarize({
        credential: summarizeConn.credential,
        model: summarizeConn.model,
        inputs,
        ...(opts?.maxTokens !== undefined ? { maxTokens: opts.maxTokens } : {}),
        ...(opts?.temperature !== undefined ? { temperature: opts.temperature } : {}),
        ...(opts?.minP !== undefined ? { minP: opts.minP } : {}),
        ...(opts?.jsonSchema !== undefined ? { jsonSchema: opts.jsonSchema } : {}),
        ...(opts?.repetitionDetection !== undefined
          ? { repetitionDetection: opts.repetitionDetection }
          : {}),
      }),
    embedModel: embedConn.model,
    rerankModel: rerankConn.model,
    imageEmbedModel: imageEmbedConn.model,
    summarizerModel: summarizeConn.model,
  };
}

/**
 * Bind a `RoleClients` bundle on the vLLM FLOOR — the synchronous binder satisfying the workloads
 * `BindRoleClients = (ownerId) => RoleClients` contract. Mints the keyless vLLM credential synchronously and
 * uses the env-pinned engine model ids (one unified multimodal engine serves embed AND imageEmbed → same
 * model/space/dim); the callables dispatch through the executor.
 *
 * FLAG[PD-50]: workloads per-user async role-defaults rebind (provenance-correct) → revisit the
 * BindRoleClients sync signature when per-user workload routing is needed.
 */
export function createVllmFloorRoleClients(
  deps: VllmFloorBinderDeps,
  ownerId: UserId,
): RoleClients {
  void ownerId; // floor is owner-agnostic today (see FLAG[PD-50] above); the param honors the sync contract shape.
  const credential = deps.credentials.mintVllmCredential();
  const embedModel = castId<ModelId>(env.VLLM_EMBED_MODEL);
  const rerankModel = castId<ModelId>(env.VLLM_RERANK_MODEL);
  const imageEmbedModel = castId<ModelId>(env.VLLM_EMBED_MODEL);
  const summarizerModel = castId<ModelId>(env.VLLM_GEN_MODEL);
  return {
    embed: (
      input: string | string[],
      opts?: { inputType?: "query" | "document"; instruction?: string },
    ): Promise<EmbedResult> =>
      deps.executor.embed({
        credential,
        model: embedModel,
        input,
        ...(opts?.inputType !== undefined ? { inputType: opts.inputType } : {}),
        ...(opts?.instruction !== undefined ? { instruction: opts.instruction } : {}),
      }),
    rerank: (
      query: RerankQuery,
      documents: RerankDocument[],
      opts?: { instruction?: string },
    ): Promise<RerankResult> =>
      deps.executor.rerank({
        credential,
        model: rerankModel,
        query,
        documents,
        ...(opts?.instruction !== undefined ? { instruction: opts.instruction } : {}),
      }),
    imageEmbed: (req: ImageEmbedInput): Promise<ImageEmbedResult> =>
      deps.executor.imageEmbed({ credential, model: imageEmbedModel, input: req }),
    summarize: (inputs: SummarizeInput[], opts?: SummarizeOptions): Promise<SummarizeResult> =>
      deps.executor.summarize({
        credential,
        model: summarizerModel,
        inputs,
        ...(opts?.maxTokens !== undefined ? { maxTokens: opts.maxTokens } : {}),
        ...(opts?.temperature !== undefined ? { temperature: opts.temperature } : {}),
        ...(opts?.minP !== undefined ? { minP: opts.minP } : {}),
        ...(opts?.jsonSchema !== undefined ? { jsonSchema: opts.jsonSchema } : {}),
        ...(opts?.repetitionDetection !== undefined
          ? { repetitionDetection: opts.repetitionDetection }
          : {}),
      }),
    embedModel,
    rerankModel,
    imageEmbedModel,
    summarizerModel,
  };
}
