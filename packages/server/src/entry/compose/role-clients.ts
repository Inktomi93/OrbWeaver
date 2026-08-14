// The single `RoleClients` binder the composition root mints: a bundle of callables
// (embed/rerank/imageEmbed/summarize) + their `*Model` provenance tags. Downstream never sees a credential
// or picks a model — it calls `clients.embed(text)`. There is no vLLM-floor binder: a sync floor would
// silently route workload roles to vLLM even when the user pinned OpenRouter.
//
// SELECTOR HOT-RELOAD (owner dogfood 2026-08-13: "summarization and other selectors besides chat-completion
// require a server restart to take effect"). THE ASYMMETRY, source-derived: `connection.resolveRole` is
// already per-call hot — it reads the user's `routing.roleDefaults` through `loadUserSettings`, which is an
// uncached DB read (`domain/settings/verbs/load-user-settings.ts`). Chat therefore re-routes live, because
// chat resolves its connection per TURN. The derive roles did not, because THIS binder called `resolveRole`
// exactly FOUR TIMES — once, at boot (`entry/compose/services.ts` awaits one bundle and threads it into
// embeddings / search / refinery / imagery / assets-character / chat) — and baked the resulting
// `{credential, model}` into four closures. Nothing downstream was stale; the resolution was. The engine's
// LAUNCH config (which models the local fleet serves, ports, utilization) legitimately stays restart-gated:
// this file is the app's role ROUTING, not the fleet's serve config.
//
// THE FIX IS PER-CALL RESOLUTION, not an invalidation hook. A hook set is an ENUMERATION of write seams
// (`updateUserSettingsSection`, the settings import, every credential mutation, a users-row role change) and
// the one seam nobody enumerated is exactly where the restart requirement silently comes back. Per-call is
// TOTAL by construction. It costs one settings read + one credential resolve per provider call — both local
// sqlite reads in front of a network round trip that is three orders of magnitude longer — so there is no
// TTL here and no cache to invalidate.
//
// The `*Model` / `summarizerContextTokens` fields are GETTERS over the most recent resolution (seeded by the
// bind below so the composition root can read them while wiring, refreshed by every call). They are read at
// REQUEST time by the vector-space taggers (`domain/embeddings`, `domain/search`, the indexer handlers), so
// a getter makes the provenance tag follow the routing instead of contradicting it.
//
// PRESERVED FROM THE PRIOR RULING (this file, "One resolve per bundle … a per-role re-resolve would let one
// bundle straddle two verdicts"): the anti-straddle mechanism is intact — a principal is resolved ONCE per
// RESOLUTION PASS and every role in that pass sees it. The bind pass resolves one principal for all four
// roles; a live call resolves one principal for its one role. No pass ever mixes two verdicts. What the old
// wording additionally implied — that a bundle's verdict is frozen for the bundle's LIFETIME — is what the
// owner reported as the defect, and a request-time re-read of `users.role` is also the stricter half of
// D135 clause G (a demotion applies to the next call, not the next boot).
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

import type { ResolvedConnection } from "@orb/contracts/connection";
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

/** The four derive roles this bundle serves. `structured` is not a member: it is the `summarize` facade's
 *  constrained arm and rides the SAME resolved summarize connection (owner ruling 2026-07-27). */
const DERIVE_ROLES = ["embed", "rerank", "imageEmbed", "summarize"] as const;
type DeriveRole = (typeof DERIVE_ROLES)[number];

/** The most recent resolution per role — the backing store for both the per-call dispatch and the sync
 *  provenance getters. Mutable by construction: it IS the hot-reload. */
type RoleSnapshot = { [K in DeriveRole]: ResolvedConnection };

/**
 * Bind a `RoleClients` bundle for one user. Each callable resolves its role's `{credential, model}` through
 * `connection.resolveRole` AT CALL TIME, so a settings write that re-points a role governs the very next
 * call with no restart (see the header for why this is per-call rather than an invalidation hook).
 *
 * The `ownerId` name is the CALLER's word for the bundle's subject, never an authority claim: what every
 * `resolveRole` call sees is whatever `deps.resolvePrincipal` reads off that user's row, re-read per
 * resolution pass. One principal per pass, shared by every role in it — a pass never straddles two verdicts.
 *
 * The initial bind resolves all four roles eagerly: the composition root reads `embedModel` /
 * `summarizerContextTokens` synchronously while wiring, so the snapshot must be populated before the bundle
 * is handed out — and a role that cannot resolve at all should fail the boot, not the first search.
 */
export async function bindRoleClientsForUser(deps: RoleClientsBinderDeps, ownerId: UserId): Promise<RoleClientsWithSignal> {
  const bindPrincipal = await deps.resolvePrincipal(ownerId);
  const [embedConn, rerankConn, imageEmbedConn, summarizeConn] = await Promise.all(
    DERIVE_ROLES.map((role) => deps.connection.resolveRole({ role, principal: bindPrincipal })),
  );
  // `Promise.all` over a fixed-length tuple source still widens to `(T|undefined)[]` under
  // noUncheckedIndexedAccess; the four are present by construction (one per DERIVE_ROLES member).
  if (embedConn === undefined || rerankConn === undefined || imageEmbedConn === undefined || summarizeConn === undefined) {
    throw new Error("compose: the role-clients bind resolved fewer connections than there are derive roles");
  }
  const snapshot: RoleSnapshot = { embed: embedConn, rerank: rerankConn, imageEmbed: imageEmbedConn, summarize: summarizeConn };

  /** Re-resolve ONE role for the CURRENT settings + the CURRENT users row, and publish it to the snapshot the
   *  provenance getters read. Every callable below goes through this — there is no other path to a
   *  credential/model, so a future role cannot forget to be hot. */
  const live = async (role: DeriveRole): Promise<ResolvedConnection> => {
    const principal = await deps.resolvePrincipal(ownerId);
    const resolved = await deps.connection.resolveRole({ role, principal });
    snapshot[role] = resolved;
    return resolved;
  };

  return {
    embed: async (input: string | string[], opts?: { inputType?: "query" | "document"; instruction?: string }): Promise<EmbedResult> => {
      const conn = await live("embed");
      return deps.executor.embed({
        credential: conn.credential,
        model: conn.model,
        input,
        ...(opts?.inputType !== undefined ? { inputType: opts.inputType } : {}),
        ...(opts?.instruction !== undefined ? { instruction: opts.instruction } : {}),
      });
    },
    rerank: async (query: RerankQuery, documents: RerankDocument[], opts?: { instruction?: string }): Promise<RerankResult> => {
      const conn = await live("rerank");
      return deps.executor.rerank({
        credential: conn.credential,
        model: conn.model,
        query,
        documents,
        ...(opts?.instruction !== undefined ? { instruction: opts.instruction } : {}),
      });
    },
    imageEmbed: async (req: ImageEmbedInput): Promise<ImageEmbedResult> => {
      const conn = await live("imageEmbed");
      return deps.executor.imageEmbed({
        credential: conn.credential,
        model: conn.model,
        input: req,
      });
    },
    // ONE facade, TWO wire roles (owner ruling 2026-07-27 — summarize is summarization, structured is
    // schema-constrained generation). A caller passing `responseFormat` genuinely wants CONSTRAINED output →
    // route it to the `structured` role; a plain call is real summarization → `summarize`. Callers are
    // unchanged (the facade name stays `summarize`), but the WIRE role + its observability tag + its firewall
    // row are now HONEST — a debugging session filters `provider.structured-item` for constrained calls.
    // The caller's cancellation (a chat turn's active-turn handle) rides straight onto either role's request.
    summarize: async (inputs: SummarizeInput[], opts?: SummarizeCallOptions): Promise<SummarizeResult> => {
      const conn = await live("summarize");
      const common = {
        credential: conn.credential,
        model: conn.model,
        inputs,
        ...(opts?.signal !== undefined ? { signal: opts.signal } : {}),
        ...summarizeSamplerFields(opts),
      };
      return opts?.responseFormat !== undefined
        ? deps.executor.structured({
            ...common,
            responseFormat: resolveVehicle(opts.responseFormat, deps.structuredOutputVehicle(), conn.capability.output.structured === true),
          })
        : deps.executor.summarize(common);
    },
    // GETTERS, not baked values: these are the provenance/space tags the vector writers stamp rows with, and
    // they are read at REQUEST time. Reading them off the live snapshot is what keeps a row's `model` column
    // agreeing with the model that actually produced the vector after a role re-point.
    get embedModel(): string {
      return snapshot.embed.model;
    },
    get rerankModel(): string {
      return snapshot.rerank.model;
    },
    get imageEmbedModel(): string {
      return snapshot.imageEmbed.model;
    },
    get summarizerModel(): string {
      return snapshot.summarize.model;
    },
    // A catalog with no real window (0) falls back to the conservative floor.
    get summarizerContextTokens(): number {
      return snapshot.summarize.capability.context.window || SUMMARIZER_CONTEXT_FALLBACK;
    },
  };
}
