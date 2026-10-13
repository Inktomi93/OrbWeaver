// Each callable folds its binding at call time; a re-point governs the next call without invalidation.
// The executor owns execution authority and strike-out; resolved(task) keeps the unavailable projection.

import type { Principal } from "@orb/contracts/identity";
import type { Task, UnavailableCause } from "@orb/contracts/inference";
import { canFund } from "@orb/contracts/inference";
import { rolePresetParamsOf } from "@orb/contracts/preset";
import type { EmbedResult, ImageEmbedResult, RerankResult, SummarizeResult } from "@orb/contracts/providers";
import type { ImageEmbedInput, RerankDocument, RerankQuery, SummarizeInput } from "@orb/contracts/role-clients";
import type { ProviderExecutor } from "../contract/backend.ts";
import { ProviderError } from "../contract/errors.ts";
import type { ResolvedEmbedKnobs } from "../contract/resolve.ts";
import type { Resolved } from "../contract/resolved.ts";
import type { EmbedRequest, RoleClientsWithSignal, StructuredCallOptions, SummarizeCallOptions, TaskSampling } from "../contract/roles.ts";
import type { RoleClientsFor } from "../contract/runtime.ts";
import type { BindingActor } from "../deps.ts";
import { resolveEmbed } from "../funnel/resolve-embed.ts";
import type { ResolverContext } from "../resolve/resolve-task.ts";
import { NoConnectionError, resolveTask } from "../resolve/resolve-task.ts";

/** The tasks the bundle serves — the derive roles; chat/agent/generateImage reach the executor directly. */
const DERIVE_TASKS = ["embed", "rerank", "imageEmbed", "summarize", "structured"] as const satisfies readonly Task[];
type DeriveTask = (typeof DERIVE_TASKS)[number];

/** The caller's options onto the backend request. The role surface speaks `maxOutputTokens` (the posture
 *  vocabulary); the backend request keeps `maxTokens`, so this is the one place the name changes. */
function samplerFields(opts: SummarizeCallOptions | undefined): TaskSampling {
  const { maxOutputTokens, ...rest } = rolePresetParamsOf(opts ?? {});
  return { ...rest, ...(maxOutputTokens !== undefined ? { maxTokens: maxOutputTokens } : {}) };
}

/** What the user is told per availability cause — a mapped Record, so a new `UNAVAILABLE_CAUSES` member fails
 *  `tsc` here. */
const REFUSAL_TEXT: Record<UnavailableCause, (task: Task) => string> = {
  "no-connection": (task) => `no ${task} connection is bound for this user — bind one in Connections`,
  "endpoint-unreachable": (task) => `the connection bound for "${task}" is unreachable right now`,
  "runtime-missing": (task) => `the connection bound for "${task}" needs the Claude runtime, which is not installed on this server`,
  "background-refused": (task) => `the connection bound for "${task}" does not allow background work — enable it in Connections`,
  "requirement-unmet": (task) => `the model bound for "${task}" cannot do this task — pick another in Connections`,
  unavailable: (task) => `the connection bound for "${task}" uses a backend this server does not run`,
  "model-load-failed": (task) => `the built-in model bound for "${task}" failed to load on this server — the next call retries it`,
};

/** The refusal for a task that cannot run, named by its availability cause. One home, so a caller that learns
 *  the cause from the availability verdict tells the user the same thing the role call does. */
export function unavailableRefusal(task: Task, cause: UnavailableCause): NoConnectionError {
  return new NoConnectionError(REFUSAL_TEXT[cause](task));
}

/** The embed request off the fold's knobs — each optional knob spread only when set (`exactOptionalPropertyTypes`). */
function embedRequestOf(conn: Resolved<"embed">, input: string | readonly string[], knobs: ResolvedEmbedKnobs): EmbedRequest {
  return {
    connection: conn,
    input,
    ...(knobs.dimensions !== undefined ? { dimensions: knobs.dimensions } : {}),
    ...(knobs.inputType !== undefined ? { inputType: knobs.inputType } : {}),
    ...(knobs.instruction !== undefined ? { instruction: knobs.instruction } : {}),
  };
}

export function createRoleClientsFor(args: { readonly ctx: ResolverContext; readonly executor: ProviderExecutor }): RoleClientsFor {
  const { ctx, executor } = args;

  return (funder: Principal, actor?: BindingActor): RoleClientsWithSignal => {
    const live = async <T extends DeriveTask>(task: T): Promise<Resolved<T>> => {
      const { resolved } = await resolveTask(ctx, { task, principal: funder, ...(actor !== undefined ? { actor } : {}) });
      // The owner's per-row consent to unattended spend: a background task on a row that withholds it runs
      // nothing, and reads as the same "nothing ran" class as no binding (the callers' existing degrade).
      if (!canFund(resolved, task)) {
        throw unavailableRefusal(task, "background-refused");
      }
      return resolved as Resolved<T>;
    };

    return {
      embed: async (input, opts): Promise<EmbedResult> => {
        const conn = await live("embed");
        if (conn.capability.kind !== "embedding") {
          throw new ProviderError({ kind: "invalid", retryable: false, message: "the embed binding resolved to a non-embedding model" });
        }
        const knobs = resolveEmbed({ inputType: opts?.inputType, instruction: opts?.instruction }, conn.capability.embedding);
        return executor.embed(embedRequestOf(conn, input, knobs));
      },
      rerank: async (query: RerankQuery, documents: RerankDocument[], opts?: { instruction?: string }): Promise<RerankResult> => {
        const conn = await live("rerank");
        return executor.rerank({ connection: conn, query, documents, ...(opts?.instruction !== undefined ? { instruction: opts.instruction } : {}) });
      },
      imageEmbed: async (req: ImageEmbedInput): Promise<ImageEmbedResult> => {
        const conn = await live("imageEmbed");
        return executor.imageEmbed({ connection: conn, input: req });
      },
      summarize: async (inputs: readonly SummarizeInput[], opts?: SummarizeCallOptions): Promise<SummarizeResult> => {
        const conn = await live("summarize");
        return executor.summarize({
          connection: conn,
          inputs,
          onObservedResult: opts?.onObservedResult,
          ...(opts?.signal !== undefined ? { signal: opts.signal } : {}),
          ...samplerFields(opts),
        });
      },
      structured: async (inputs: readonly SummarizeInput[], opts: StructuredCallOptions): Promise<SummarizeResult> => {
        const conn = await live("structured");
        return executor.structured({
          connection: conn,
          inputs,
          responseFormat: opts.responseFormat,
          onObservedResult: opts.onObservedResult,
          ...(opts.signal !== undefined ? { signal: opts.signal } : {}),
          ...samplerFields(opts),
        });
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
