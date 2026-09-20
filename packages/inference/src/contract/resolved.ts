// `Resolved<Task>` — what `runtime.resolve` returns and every task request carries: the connection row
// folded with its provider row, its secret, its folded features and its capability, in one object. The
// credential-free half is `ResolvedConnectionView` (`@orb/contracts/inference`); this adds the parts a
// backend needs and a client must never see. "The connection IS the pick" — there is nothing to heal.

import type { ResolvedSecret } from "@orb/contracts/credentials";
import type { EndpointFeatures, GenerationCapability, ProviderDef, ResolvedConnectionView, Task } from "@orb/contracts/inference";
import type { UserId } from "@orb/kit/ids";
import type { JsonValue } from "@orb/kit/json";
import { ProviderError } from "./errors.ts";

/** A custom endpoint's REQUEST/RESPONSE transforms (today's `custom_openai` metadata, re-homed on the
 *  connection): headers on the request, a strip/keep list applied AFTER `extras` as the endpoint's final
 *  word, a dot-path map that reshapes a non-OpenAI reply into one the shared stream reducer can read. Shown
 *  only on `auth: endpoint` rows. */
export interface ConnectionTransport {
  readonly headers?: Readonly<Record<string, string>> | undefined;
  readonly includeBody?: Readonly<Record<string, JsonValue>> | undefined;
  readonly excludeBody?: readonly string[] | undefined;
  readonly responseMap?: ResponseMap | undefined;
}

/** Dot-paths into a raw reply that override the OpenAI-compatible defaults (a numeric segment indexes an
 *  array); an unset path keeps the default. */
export interface ResponseMap {
  readonly contentPath?: string | undefined;
  readonly reasoningPath?: string | undefined;
  readonly finishReasonPath?: string | undefined;
  readonly promptTokensPath?: string | undefined;
  readonly completionTokensPath?: string | undefined;
  readonly errorMessagePath?: string | undefined;
  readonly errorCodePath?: string | undefined;
  readonly toolCallsPath?: string | undefined;
}

export interface Resolved<T extends Task = Task> extends ResolvedConnectionView {
  readonly task: T;
  /** The connection's owner — the FUNDER; the agent-sdk wire keys its per-user runtime dir on it (§8.4-2). */
  /** The CONNECTION ROW's owner — the funding user (§8.4-3), never the box owner (no such principal exists in
   *  this package). It keys the per-user runtime dir and the credential AAD; the resolver refuses a row whose
   *  owner is not the funding principal. */
  readonly ownerId: UserId;
  readonly provider: ProviderDef;
  readonly credential: ResolvedSecret;
  /** The provider's fixed URL or the connection's own (`auth: endpoint`); `null` on an in-process wire. */
  readonly baseUrl: string | null;
  /** `wire default ← provider row ← connection.declared.features`, folded once at resolve. */
  readonly features: EndpointFeatures;
  /** The connection's extra BODY fields (merged last behind the belt, MODELLED WINS — D143(b)/D156). */
  readonly extras: Readonly<Record<string, JsonValue>> | null;
  readonly transport: ConnectionTransport | null;
  readonly allowBackground: boolean;
}

/** The GENERATION half of a chat-shaped resolve. The resolver only hands a chat/summarize/structured task a
 *  generation-kind row (`connectionTasks` refuses the others), so the miss is a program error, not a user one. */
export function generationOf(resolved: Resolved): GenerationCapability {
  if (resolved.capability.kind !== "generation") {
    throw new ProviderError({
      kind: "invalid",
      retryable: false,
      message: `connection ${resolved.connectionId} resolved a ${resolved.capability.kind} model for a generation task`,
    });
  }
  return resolved.capability.generation;
}
