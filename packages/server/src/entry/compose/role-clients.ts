// The single `RoleClients` binder the composition root mints: a bundle of pre-bound callables
// (embed/rerank/imageEmbed/summarize) + their `*Model` provenance tags. Downstream never sees a credential
// or picks a model — it calls `clients.embed(text)`. There is no vLLM-floor binder: a sync floor would
// silently route workload roles to vLLM even when the user pinned OpenRouter.
//
// D135 clause G — THIS FILE MINTS NO PRINCIPAL AND STAMPS NO ROLE. It used to build one inline with a
// literal `role:"owner"` over whatever `UserId` it was handed, which was fine while the only caller was
// boot (the real owner) and became a forged elevation the moment `entry/compose/automation-plugin.ts`'s
// `/autobg` arm bound a bundle for an automation rule's AUTHOR — any authenticated user who creates a chat
// is its host (`automation/verbs/create-rule.ts` gates `requireChatHost`, a D18 ROOM role, not an app role),
// so under forward-header/oidc/multi-user-local a non-owner reached `connection.resolveRole` wearing
// `owner`. That is consumed, not cosmetic: `resolveRole` → `credentials.resolve` → `mintMaxProSub`, whose
// gate keys on `principal.role`, and `SUMMARIZE_SOURCES` lets any user pin `roleDefaults.summarize.source`
// to `max-pro-sub` — so the owner-only mint that calls itself "unconstructable except after requireOwner
// passes" was constructable here. Only the credential firewall's summarize row (which happens to omit
// `max-pro-sub`) stopped the call, and one policy row nobody wrote as a boundary is not a boundary.
// The binder now RESOLVES the caller through the one row→`Principal` home (`entry/auth/seam.ts`), so its
// principal reads `users.role` like every other path.

import type { Principal } from "@orb/contracts/identity";
import type { EmbedResult, ImageEmbedResult, RerankResult, SummarizeResult } from "@orb/contracts/providers";
import type { ImageEmbedInput, RerankDocument, RerankQuery, ResponseFormat, StructuredOutputVehicle, SummarizeInput } from "@orb/contracts/role-clients";
import type { UserId } from "@orb/kit/ids";
import type { ConnectionService } from "#domain/connection";
import { env } from "#foundation/env";
import type { ProviderExecutor, RoleClientsWithSignal, SummarizeCallOptions, SummarizeRequest } from "#infra/providers";

// Summarizer context fallback (tokens) for when a resolved connection reports window 0 (no contextLength).
// The default summarizer runs on the vLLM GEN engine, so its floor DERIVES from the gen window's single home
// (VLLM_GEN_MAX_MODEL_LEN) — killing the old coincidental bare `8192` that collided with the embed window.
const SUMMARIZER_CONTEXT_FALLBACK = env.VLLM_GEN_MAX_MODEL_LEN;

export interface RoleClientsBinderDeps {
  readonly connection: Pick<ConnectionService, "resolveRole">;
  readonly executor: ProviderExecutor;
  /** THE row→`Principal` mint (`entry/auth/seam.ts::createHostPrincipalResolver`) — injected, never
   *  re-implemented here, so this bundle's owner-gated resolutions read the SAME `users.role` the request
   *  seam and the frozen-host bridge read (D135). A resolver is the dep, not a `Principal`, because the
   *  caller's signature is a bare `UserId` (the automation author / the boot owner) and letting a caller
   *  hand in a Principal would just move the forging one file up. */
  readonly resolvePrincipal: (userId: UserId) => Promise<Principal>;
  /** The deployment's structured-output WIRE VEHICLE (task #36), read PER CALL off the resolved AppSettings
   *  tier — a thunk, never a captured value, for the same reason rpg's `structuredOutputShape` is one: an
   *  admin flip must govern the very next request with no restart. */
  readonly structuredOutputVehicle: () => StructuredOutputVehicle;
}

/** Project the summarize CALL options' sampler/token knobs onto the infra request fields, each emitted ONLY
 *  when the caller set it (an unset knob is absent, never a fabricated 0/null — no-op knob doctrine). Extracted
 *  from the facade so the arrow stays under the cognitive-complexity gate. `responseFormat` + `signal` are
 *  handled at the call site (they route the request / carry cancellation), so they are not projected here. */
function summarizeSamplerFields(
  opts: SummarizeCallOptions | undefined,
): Pick<
  SummarizeRequest,
  "maxTokens" | "temperature" | "topP" | "topK" | "frequencyPenalty" | "presencePenalty" | "repetitionPenalty" | "minP" | "repetitionDetection"
> {
  return {
    ...(opts?.maxTokens !== undefined ? { maxTokens: opts.maxTokens } : {}),
    ...(opts?.temperature !== undefined ? { temperature: opts.temperature } : {}),
    ...(opts?.topP !== undefined ? { topP: opts.topP } : {}),
    ...(opts?.topK !== undefined ? { topK: opts.topK } : {}),
    ...(opts?.frequencyPenalty !== undefined ? { frequencyPenalty: opts.frequencyPenalty } : {}),
    ...(opts?.presencePenalty !== undefined ? { presencePenalty: opts.presencePenalty } : {}),
    ...(opts?.repetitionPenalty !== undefined ? { repetitionPenalty: opts.repetitionPenalty } : {}),
    ...(opts?.minP !== undefined ? { minP: opts.minP } : {}),
    ...(opts?.repetitionDetection !== undefined ? { repetitionDetection: opts.repetitionDetection } : {}),
  };
}

/** Decide a structured call's WIRE VEHICLE here, at the one place that holds both the caller's ask and the
 *  RESOLVED MODEL'S CAPABILITY (task #36). `auto` — the deployment floor — means "the enforcing
 *  `response_format` vehicle when this model's endpoints advertise structured output, else the
 *  servable-everywhere forced tool", and `capability.output.structured` is exactly that fact, derived once in
 *  `domain/connection/catalog/resolve-model-capability.ts`. A backend may not read a domain, so the decision
 *  cannot live inside the sealed OpenRouter backend; it arrives there already made.
 *
 *  An explicit per-call `vehicle` (the schema-forge asks for `response-format`: a schema author wants the
 *  hard guarantee) is passed through untouched — including onto a model whose capability is unknown, where
 *  the backend's own 400 is the honest answer rather than a silent downgrade to an unenforced wire. */
function resolveVehicle(format: ResponseFormat, deployment: StructuredOutputVehicle, modelDoesStructured: boolean): ResponseFormat {
  const asked = format.vehicle ?? deployment;
  if (asked !== "auto") {
    return { ...format, vehicle: asked };
  }
  return { ...format, vehicle: modelDoesStructured ? "response-format" : "forced-tool" };
}

/**
 * Bind a `RoleClients` bundle for one user by resolving each derive-role's `{credential, model}` once via
 * `connection.resolveRole`, then binding a callable per role over the executor.
 *
 * The `ownerId` name is the CALLER's word for the bundle's subject, never an authority claim: what the four
 * `resolveRole` calls see is whatever `deps.resolvePrincipal` reads off that user's row. One resolve per
 * bundle, shared by all four roles — a per-role re-resolve would let one bundle straddle two verdicts.
 */
export async function bindRoleClientsForUser(deps: RoleClientsBinderDeps, ownerId: UserId): Promise<RoleClientsWithSignal> {
  const principal = await deps.resolvePrincipal(ownerId);
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
        ...summarizeSamplerFields(opts),
      };
      return opts?.responseFormat !== undefined
        ? deps.executor.structured({
            ...common,
            responseFormat: resolveVehicle(opts.responseFormat, deps.structuredOutputVehicle(), summarizeConn.capability.output.structured === true),
          })
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
