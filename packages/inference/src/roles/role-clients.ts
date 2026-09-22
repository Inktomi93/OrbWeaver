// `roleClientsFor(funder, actor?)` — the per-call `RoleClients` bundle (§3.3, §8.5b). Every callable resolves
// its task through the fold AT CALL TIME (a re-pointed binding governs the very next call, no restart, no
// invalidation hook to forget), names its task at the call site (`structured` is a method, never sniffed
// off an option — §7.5-1), and hands a provider failure to the credentials domain's strike-out before
// re-throwing the ORIGINAL error unchanged (#1800). One `resolved(task)` read replaces the six per-role
// getters: model, capability and connection id in one object, read live.

import type { Principal } from "@orb/contracts/identity";
import type { Task } from "@orb/contracts/inference";
import { acceptsForcedToolChoice, canFund } from "@orb/contracts/inference";
import type { EmbedResult, ImageEmbedResult, RerankResult, SummarizeResult } from "@orb/contracts/providers";
import type { ImageEmbedInput, RerankDocument, RerankQuery, ResponseFormat, SummarizeInput } from "@orb/contracts/role-clients";
import type { UserId } from "@orb/kit/ids";
import type { ProviderExecutor } from "../contract/backend.ts";
import { ProviderError } from "../contract/errors.ts";
import type { ResolvedEmbedKnobs } from "../contract/resolve.ts";
import type { Resolved } from "../contract/resolved.ts";
import type { EmbedRequest, RoleClientsWithSignal, SideGenSampling, StructuredCallOptions, SummarizeCallOptions } from "../contract/roles.ts";
import type { RoleClientsFor } from "../contract/runtime.ts";
import type { BindingActor, InferenceDeps } from "../deps.ts";
import { resolveEmbed } from "../funnel/resolve-embed.ts";
import type { ResolverContext } from "../resolve/resolve-task.ts";
import { NoConnectionError, resolveTask } from "../resolve/resolve-task.ts";

/** The tasks the bundle serves — the derive roles; chat/agent/generateImage reach the executor directly. */
const DERIVE_TASKS = ["embed", "rerank", "imageEmbed", "summarize", "structured"] as const satisfies readonly Task[];
type DeriveTask = (typeof DERIVE_TASKS)[number];

function samplerFields(opts: SummarizeCallOptions | undefined): SideGenSampling {
  return {
    ...(opts?.maxTokens !== undefined ? { maxTokens: opts.maxTokens } : {}),
    ...(opts?.temperature !== undefined ? { temperature: opts.temperature } : {}),
    ...(opts?.topP !== undefined ? { topP: opts.topP } : {}),
    ...(opts?.topK !== undefined ? { topK: opts.topK } : {}),
    ...(opts?.frequencyPenalty !== undefined ? { frequencyPenalty: opts.frequencyPenalty } : {}),
    ...(opts?.presencePenalty !== undefined ? { presencePenalty: opts.presencePenalty } : {}),
    ...(opts?.repetitionPenalty !== undefined ? { repetitionPenalty: opts.repetitionPenalty } : {}),
    ...(opts?.minP !== undefined ? { minP: opts.minP } : {}),
  };
}

/** What the resolved capability says about the two vehicles — read once at the call site, never re-derived. */
interface VehicleFacts {
  /** The model's endpoints advertise schema-constrained output (`output.structured`). */
  readonly structured: boolean;
  /** The model accepts a FORCED tool choice (`acceptsForcedToolChoice`). */
  readonly forcedTool: boolean;
}

function vehicleFactsOf(conn: Resolved): VehicleFacts {
  if (conn.capability.kind !== "generation") {
    return { structured: false, forcedTool: true };
  }
  const generation = conn.capability.generation;
  return { structured: generation.output.structured === true, forcedTool: acceptsForcedToolChoice(generation) };
}

/** The structured call's WIRE VEHICLE, decided where both the ask and the RESOLVED capability are in hand:
 *  `auto` ⇒ the enforcing `response-format` when the model's endpoints advertise structured output, else the
 *  servable-everywhere forced tool. An explicit vehicle (per-call or deployment) passes through untouched —
 *  including onto a model whose capability is unknown, where the backend's own 400 is the honest answer — with
 *  ONE exception, where the capability KNOWS the answer (#2575): a `forced-tool` ask on a model that rejects
 *  forced tool use AND does structured output rides `response-format`, the vehicle Anthropic prescribes for a
 *  forced call that only existed to extract JSON. Without structured output it stays a forced tool, which the
 *  wire downgrades to `auto` loudly (`servableToolChoice`). */
function resolveVehicle(format: ResponseFormat, deployment: ReturnType<InferenceDeps["structuredOutputVehicle"]>, facts: VehicleFacts): ResponseFormat {
  const asked = format.vehicle ?? deployment;
  if (asked === "forced-tool" && !facts.forcedTool && facts.structured) {
    return { ...format, vehicle: "response-format" };
  }
  if (asked !== "auto") {
    return { ...format, vehicle: asked };
  }
  return { ...format, vehicle: facts.structured ? "response-format" : "forced-tool" };
}

function providerFailureOf(err: unknown): ProviderError | null {
  let cause: unknown = err;
  const seen = new Set<unknown>();
  while (cause instanceof Error && !(cause instanceof ProviderError) && cause.cause !== undefined && !seen.has(cause)) {
    seen.add(cause);
    cause = cause.cause;
  }
  return cause instanceof ProviderError ? cause : null;
}

/** The embed request off the fold's knobs — each optional knob spread only when set (`exactOptionalPropertyTypes`). */
function embedRequestOf(conn: Resolved<"embed">, input: string | readonly string[], knobs: ResolvedEmbedKnobs): EmbedRequest {
  return {
    connection: conn,
    input,
    ...(knobs.dimensions !== undefined ? { dimensions: knobs.dimensions } : {}),
    ...(knobs.truncateTo !== undefined ? { truncateTo: knobs.truncateTo } : {}),
    ...(knobs.inputType !== undefined ? { inputType: knobs.inputType } : {}),
    ...(knobs.instruction !== undefined ? { instruction: knobs.instruction } : {}),
  };
}

/** Run one task's provider call; on failure let the credentials domain decide whether it costs the key the
 *  call ran under (#1800), then rethrow the ORIGINAL error (the recall seam reads this exact object). */
async function runWithStrikeOut<T>(args: {
  readonly deps: InferenceDeps;
  readonly ownerId: UserId;
  readonly conn: Resolved;
  readonly call: () => Promise<T>;
}): Promise<T> {
  const { deps, conn } = args;
  try {
    return await args.call();
  } catch (err) {
    const failure = providerFailureOf(err);
    if (failure !== null && deps.onAuthFailed !== undefined) {
      // @orb-waive caught-failure-ownership(Promise.resolve): strike-out is a passenger side effect; its failure is warning-logged and the provider's original error is rethrown. Precedent: packages/server/src/entry/import/run-profile-import.ts accepts the same passenger-side-effect failure while preserving the primary owner. Ends if either owner changes.
      await Promise.resolve(
        deps.onAuthFailed({ ownerId: args.ownerId, credentialId: conn.credential.credentialId, errorKind: failure.kind, errorMessage: failure.message }),
      ).catch((strikeErr: unknown) => {
        deps.log.warn({ task: conn.task, err: strikeErr }, "inference: the credential strike-out failed (the call's own error is unaffected)");
      });
    }
    throw err;
  }
}

export function createRoleClientsFor(args: {
  readonly deps: InferenceDeps;
  readonly ctx: ResolverContext;
  readonly executor: ProviderExecutor;
}): RoleClientsFor {
  const { deps, ctx, executor } = args;

  return (funder: Principal, actor?: BindingActor): RoleClientsWithSignal => {
    const live = async <T extends DeriveTask>(task: T): Promise<Resolved<T>> => {
      const { resolved } = await resolveTask(ctx, { task, principal: funder, ...(actor !== undefined ? { actor } : {}) });
      // The owner's per-row consent to unattended spend: a background task on a row that withholds it runs
      // nothing, and reads as the same "nothing ran" class as no binding (the callers' existing degrade).
      if (!canFund(resolved, task)) {
        throw new NoConnectionError(`the connection bound for "${task}" does not allow background work — enable it in Connections`);
      }
      return resolved as Resolved<T>;
    };

    const withStrikeOut = <T>(conn: Resolved, call: () => Promise<T>): Promise<T> => runWithStrikeOut({ deps, ownerId: funder.userId, conn, call });

    return {
      embed: async (input, opts): Promise<EmbedResult> => {
        const conn = await live("embed");
        if (conn.capability.kind !== "embedding") {
          throw new ProviderError({ kind: "invalid", retryable: false, message: "the embed binding resolved to a non-embedding model" });
        }
        const knobs = resolveEmbed({ inputType: opts?.inputType, instruction: opts?.instruction }, conn.capability.embedding, deps.embedSpace.dims);
        return withStrikeOut(conn, () => executor.embed(embedRequestOf(conn, input, knobs)));
      },
      rerank: async (query: RerankQuery, documents: RerankDocument[], opts?: { instruction?: string }): Promise<RerankResult> => {
        const conn = await live("rerank");
        return withStrikeOut(conn, () =>
          executor.rerank({ connection: conn, query, documents, ...(opts?.instruction !== undefined ? { instruction: opts.instruction } : {}) }),
        );
      },
      imageEmbed: async (req: ImageEmbedInput): Promise<ImageEmbedResult> => {
        const conn = await live("imageEmbed");
        return withStrikeOut(conn, () => executor.imageEmbed({ connection: conn, input: req }));
      },
      summarize: async (inputs: readonly SummarizeInput[], opts?: SummarizeCallOptions): Promise<SummarizeResult> => {
        const conn = await live("summarize");
        return withStrikeOut(conn, () =>
          executor.summarize({ connection: conn, inputs, ...(opts?.signal !== undefined ? { signal: opts.signal } : {}), ...samplerFields(opts) }),
        );
      },
      structured: async (inputs: readonly SummarizeInput[], opts: StructuredCallOptions): Promise<SummarizeResult> => {
        const conn = await live("structured");
        return withStrikeOut(conn, () =>
          executor.structured({
            connection: conn,
            inputs,
            responseFormat: resolveVehicle(opts.responseFormat, deps.structuredOutputVehicle(), vehicleFactsOf(conn)),
            ...(opts.signal !== undefined ? { signal: opts.signal } : {}),
            ...samplerFields(opts),
          }),
        );
      },
      resolved: async (task: DeriveTask): Promise<Resolved | null> => {
        try {
          return await live(task);
        } catch (err) {
          if (err instanceof ProviderError && err.name === "NoConnectionError") {
            return null;
          }
          throw err;
        }
      },
    };
  };
}
