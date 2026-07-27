// The single `RoleClients` binder the composition root mints: a bundle of pre-bound callables
// (embed/rerank/imageEmbed/summarize) + their `*Model` provenance tags. Downstream never sees a credential
// or picks a model — it calls `clients.embed(text)`. There is no vLLM-floor binder: a sync floor would
// silently route workload roles to vLLM even when the user pinned OpenRouter.

import type { Principal } from "@orb/contracts/identity";
import type { EmbedResult, ImageEmbedResult, RerankResult, SummarizeResult } from "@orb/contracts/providers";
import type { ImageEmbedInput, RerankDocument, RerankQuery, SummarizeInput } from "@orb/contracts/role-clients";
import type { Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ConnectionService } from "#domain/connection";
import { env } from "#foundation/env";
import type { ProviderExecutor, RoleClientsWithSignal, SummarizeCallOptions } from "#infra/providers";

// Summarizer context fallback (tokens) for when a resolved connection reports window 0 (no contextLength).
// The default summarizer runs on the vLLM GEN engine, so its floor DERIVES from the gen window's single home
// (VLLM_GEN_MAX_MODEL_LEN) — killing the old coincidental bare `8192` that collided with the embed window.
const SUMMARIZER_CONTEXT_FALLBACK = env.VLLM_GEN_MAX_MODEL_LEN;

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
export async function bindRoleClientsForUser(deps: RoleClientsBinderDeps, ownerId: UserId): Promise<RoleClientsWithSignal> {
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
    // ONE facade, TWO wire roles (owner ruling 2026-07-27 — summarize is summarization, structured is
    // schema-constrained generation). A caller passing `responseFormat` genuinely wants CONSTRAINED output →
    // route it to the `structured` role; a plain call is real summarization → `summarize`. Callers are
    // unchanged (the facade name stays `summarize`), but the WIRE role + its observability tag + its firewall
    // row are now HONEST — a debugging session filters `provider.structured-item` for constrained calls.
    // The caller's cancellation (a chat turn's active-turn handle) rides straight onto either role's request.
    summarize: (inputs: SummarizeInput[], opts?: SummarizeCallOptions): Promise<SummarizeResult> => {
      const common = {
        credential: summarizeConn.credential,
        model: summarizeConn.model,
        inputs,
        ...(opts?.signal !== undefined ? { signal: opts.signal } : {}),
        ...(opts?.maxTokens !== undefined ? { maxTokens: opts.maxTokens } : {}),
        ...(opts?.temperature !== undefined ? { temperature: opts.temperature } : {}),
        ...(opts?.minP !== undefined ? { minP: opts.minP } : {}),
        ...(opts?.repetitionDetection !== undefined ? { repetitionDetection: opts.repetitionDetection } : {}),
      };
      return opts?.responseFormat !== undefined
        ? deps.executor.structured({ ...common, responseFormat: opts.responseFormat })
        : deps.executor.summarize(common);
    },
    embedModel: embedConn.model,
    rerankModel: rerankConn.model,
    imageEmbedModel: imageEmbedConn.model,
    summarizerModel: summarizeConn.model,
    // A catalog with no real window (0) falls back to the conservative floor.
    summarizerContextTokens: summarizeConn.capability.context.window || SUMMARIZER_CONTEXT_FALLBACK,
  };
}
