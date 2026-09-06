// infra/providers/backends/openrouter/probe — the credential-health probe the `credentials.testHealth`
// verb calls THROUGH injection. A cheap authenticated round-trip (the credits endpoint) classified into the
// cross-boundary `CredentialHealth`. Imports `backends/kit` DOWN; never a sibling backend.

import type { GetCreditsResponse } from "@openrouter/sdk/models/operations";
import { errorMessage } from "@orb/kit/error-message";
import type { CredentialHealth } from "../../contract/index.ts";
import { redactSecretsFromText, sanitizeApiError } from "../kit/index.ts";

// An auth-class failure (bad/revoked key) vs a reachability failure — the SDK doesn't surface a typed
// status here, so we match the message.
const AUTH_FAILURE_RE = /\b401\b|\b403\b|unauthor|forbidden|invalid[\s_-]?api[\s_-]?key/i;

interface OrProbeClient {
  readonly credits: {
    readonly getCredits: () => Promise<GetCreditsResponse>;
  };
}

/**
 * Probe an OpenRouter credential by reading its credit balance. Success → `ok`; an auth-class error →
 * `revoked` (a bad/revoked key); anything else → `unreachable`. `checkedAt` is stamped from the injected
 * clock (the domain may layer its own throttle state on top). The reason is sanitized — never raw upstream
 * markup/secrets.
 *
 * ORDER (#1809): SCRUB, then sanitize. `sanitizeApiError` strips `<…>` spans and caps at 500 chars, so
 * running it first can bite a known credential in half and leave a fragment the by-value belt no longer
 * matches. See {@link sanitizeApiError}'s file header.
 */
export async function probeOpenRouterCredential(client: OrProbeClient, now: () => number, secrets: readonly string[] = []): Promise<CredentialHealth> {
  const checkedAt = now();
  // @orb-gate-ignore caught-failure-ownership(empty:err): a credential-probe failure is classified into a typed CredentialHealth (auth-class → revoked, else → unreachable), reason sanitized + secret-redacted by value; propagated as a verdict, never a false green, no secret leak. Ends if the catch can return "ok".
  try {
    await client.credits.getCredits();
    return { status: "ok", checkedAt };
  } catch (err) {
    const reason = sanitizeApiError(redactSecretsFromText(errorMessage(err), secrets));
    if (AUTH_FAILURE_RE.test(reason)) {
      return { status: "revoked", checkedAt, reason };
    }
    return { status: "unreachable", checkedAt, reason };
  }
}
