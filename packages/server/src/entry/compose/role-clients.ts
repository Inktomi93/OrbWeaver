// entry/compose/role-clients — THE single `RoleClients` binder the composition root mints (tiers/entry.md
// §layout "role-clients.ts"; tiers/providers.md §"boot binder" + Esoteric §2). `RoleClients`
// (@orb/contracts/role-clients) is the GOLD-STANDARD cross-feature seam: a bundle of PRE-BOUND callables
// (embed/rerank/imageEmbed/summarize) + their `*Model` provenance tags. Downstream (search / embeddings /
// discovery / workloads) never sees a credential or picks a model — it calls `clients.embed(text)`.
//
// ONE binder (shared-dissolution §6: `createDefaultRoleClients` is DELETED — there is no silent family
// default; every bundle is explicitly bound here):
//   • bindRoleClientsForUser — ASYNC, the PD-9 paydown: per-role `connection.resolveRole({role})` resolves
//     `{credential, model}` (honoring `routing.roleDefaults.<role>` incl. the D39 local-light arm, resolved
//     ONCE for the user), then each callable dispatches through the bound `ProviderExecutor`. The `*Model`
//     provenance = the eagerly-resolved `conn.model`. Used for BOTH the boot-global OWNER bundle (embeddings
//     indexer + discovery summarize + search) AND the workloads per-owner bundle — there is no vLLM-floor
//     binder: a sync floor silently routed workload roles to vLLM even when the user pinned OpenRouter,
//     breaking providers.md invariant #6 (the binder honors per-role roleDefaults). Ported from neo's
//     `bindRoleClientsForUser`, but orbweaver uses `connection.resolveRole` + `executor.<role>`.

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
import type { Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ConnectionService } from "#domain/connection";
import type { ProviderExecutor } from "#infra/providers";

/** The conservative summarizer context fallback (tokens) when the model catalog reports no `contextLength`.
 *  Small enough to be safe on a tiny local main; the token-guard degrades visibly below it (knowledge-cluster
 *  §10 — the soft-warning fires when the resolved context is under the build's floor). */
const SUMMARIZER_CONTEXT_FALLBACK = 8192;

/** What the async per-user binder needs: the `resolveRole` selector + the bound executor surface. */
export interface RoleClientsBinderDeps {
  readonly connection: Pick<ConnectionService, "resolveRole">;
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
 * `connection.resolveRole` (the PD-9 paydown), then binding a callable per role over the executor. Async —
 * `resolveRole` touches the per-user settings + credential resolution. Call once per binding context (the
 * boot-global owner bundle in compose; the workloads per-owner bundle via the pre-bound `bindRoleClients`
 * thunk on `ServicesResult`). This is the ONLY binder — there is no vLLM floor.
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
    // The summarizer's actual context window (the token-guard reads it). A catalog with no real window (0)
    // falls back to the conservative floor so the guard degrades visibly, never divides by a bogus budget.
    summarizerContextTokens: summarizeConn.capability.context.window || SUMMARIZER_CONTEXT_FALLBACK,
  };
}
