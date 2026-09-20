// domain/connection/contract/errors — the typed connection errors. One home for the `code` strings a
// client keys on (no inline re-spell, §7.5). Every refusal is a bad WRITE or a missing row — HTTP 400-shaped —
// except `ConnectionNotFoundError`, which collapses not-owned and not-found on purpose so a 404 never leaks
// that a row exists for someone else.

import { DomainOperationError } from "@orb/kit/errors";
import type { UserConnectionId } from "@orb/kit/ids";

export const CONNECTION_OP_CODES = {
  notFound: "connection_not_found",
  /** The `providerId` is not in the registry (built-ins ∪ runtime rows). */
  providerUnknown: "connection_provider_unknown",
  /** The `api` is not one the provider row lists (coherence is DATA, §7.3). */
  apiIncoherent: "connection_api_incoherent",
  /** An `auth: endpoint` provider needs a `baseUrl`; a hosted provider must not carry one. */
  baseUrlShape: "connection_base_url_shape",
  /** The `baseUrl` did not parse as an http(s) URL. */
  baseUrlInvalid: "connection_base_url_invalid",
  /** The `baseUrl` resolves to a private/loopback host the deployment allowlist does not admit (F12). */
  baseUrlRefused: "connection_base_url_refused",
  /** The named credential is not the caller's (or does not exist — collapsed, no existence oracle). */
  credentialForeign: "connection_credential_foreign",
  /** The task's `spend` is `background` and the row's `allowBackground` is off (`canFund`, F5). */
  backgroundRefused: "connection_background_refused",
  /** The binding's actor (a rule, a plugin) is not the caller's. */
  actorForeign: "connection_actor_foreign",
  /** The row cannot serve the task (`connectionTasks` — one connection = one model = one kind). */
  taskUnservable: "connection_task_unservable",
} as const;

export class ConnectionNotFoundError extends DomainOperationError {
  declare readonly code: typeof CONNECTION_OP_CODES.notFound;
  constructor(connectionId: UserConnectionId) {
    super(CONNECTION_OP_CODES.notFound, `connection ${connectionId} not found`);
  }
}
