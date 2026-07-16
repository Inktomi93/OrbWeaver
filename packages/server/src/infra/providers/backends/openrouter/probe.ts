// infra/providers/backends/openrouter/probe — the credential-health probe the `credentials.testHealth`
// verb calls THROUGH injection. A cheap authenticated round-trip (the credits endpoint) classified into the
// cross-boundary `CredentialHealth`. Imports `backends/kit` DOWN; never a sibling backend.

import type { GetCreditsResponse } from "@openrouter/sdk/models/operations";
import { errorMessage } from "@orb/kit/error-message";
import type { CredentialHealth } from "../../contract";
import { sanitizeApiError } from "../kit";

// An auth-class failure (bad/revoked key) vs a reachability failure — the SDK doesn't surface a typed
// status here, so we match the message (hoisted per useTopLevelRegex).
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
 */
export async function probeOpenRouterCredential(client: OrProbeClient, now: () => number): Promise<CredentialHealth> {
  const checkedAt = now();
  try {
    await client.credits.getCredits();
    return { status: "ok", checkedAt };
  } catch (err) {
    const reason = sanitizeApiError(errorMessage(err));
    if (AUTH_FAILURE_RE.test(reason)) {
      return { status: "revoked", checkedAt, reason };
    }
    return { status: "unreachable", checkedAt, reason };
  }
}
