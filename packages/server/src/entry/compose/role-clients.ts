// The single `RoleClients` binder the composition root mints: a bundle of pre-bound callables
// (embed/rerank/imageEmbed/summarize) + their `*Model` provenance tags. Downstream never sees a credential
// or picks a model — it calls `clients.embed(text)`. There is no vLLM-floor binder: a sync floor would
// silently route workload roles to vLLM even when the user pinned OpenRouter.

import type { Principal } from "@orb/contracts/identity";
import type { EmbedResult, ImageEmbedResult, RerankResult, SummarizeResult } from "@orb/contracts/providers";
import type { ImageEmbedInput, RerankDocument, RerankQuery, RoleClients, SummarizeInput, SummarizeOptions } from "@orb/contracts/role-clients";
import type { Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ConnectionService } from "#domain/connection";
import type { ProviderExecutor } from "#infra/providers";

/** Conservative summarizer context fallback (tokens) when the model catalog reports no contextLength. */
const SUMMARIZER_CONTEXT_FALLBACK = 8192;

export interface RoleClientsBinderDeps {
  readonly connection: Pick<ConnectionService, "resolveRole">;
  readonly executor: ProviderExecutor;
}

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
 * Bind a `RoleClients` bundle for one user by resolving each derive-role's `{credential, model}` once via
 * `connection.resolveRole`, then binding a callable per role over the executor.
 */
export async function bindRoleClientsForUser(deps: RoleClientsBinderDeps, ownerId: UserId): Promise<RoleClients> {
  const principal = ownerPrincipal(ownerId);
  const [embedConn, rerankConn, imageEmbedConn, summarizeConn] = await Promise.all([
    deps.connection.resolveRole({ role: "embed", principal }),
    deps.connection.resolveRole({ role: "rerank", principal }),
    deps.connection.resolveRole({ role: "imageEmbed", principal }),
    deps.connection.resolveRole({ role: "summarize", principal }),
  ]);
  return {
    embed: (input: string | string[], opts?: { inputType?: "query" | "document"; instruction?: string }): Promise<EmbedResult> =>
      deps.executor.embed({
        credential: embedConn.credential,
        model: embedConn.model,
        input,
        ...(opts?.inputType !== undefined ? { inputType: opts.inputType } : {}),
        ...(opts?.instruction !== undefined ? { instruction: opts.instruction } : {}),
      }),
    rerank: (query: RerankQuery, documents: RerankDocument[], opts?: { instruction?: string }): Promise<RerankResult> =>
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
        ...(opts?.responseFormat !== undefined ? { responseFormat: opts.responseFormat } : {}),
        ...(opts?.repetitionDetection !== undefined ? { repetitionDetection: opts.repetitionDetection } : {}),
      }),
    embedModel: embedConn.model,
    rerankModel: rerankConn.model,
    imageEmbedModel: imageEmbedConn.model,
    summarizerModel: summarizeConn.model,
    // A catalog with no real window (0) falls back to the conservative floor.
    summarizerContextTokens: summarizeConn.capability.context.window || SUMMARIZER_CONTEXT_FALLBACK,
  };
}
