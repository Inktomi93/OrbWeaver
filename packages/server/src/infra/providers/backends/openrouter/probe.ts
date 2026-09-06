// infra/providers/backends/openrouter/probe — the credential-health probe the `credentials.testHealth`
// verb calls THROUGH injection. A cheap authenticated round-trip (the credits endpoint) classified into the
// cross-boundary `CredentialHealth`. Imports `backends/kit` DOWN; never a sibling backend.

import type { GetCreditsResponse } from "@openrouter/sdk/models/operations";
import { errorMessage } from "@orb/kit/error-message";
import type { CredentialHealth, ProviderScrubSet } from "../../contract/index.ts";
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
 *
 * SECURITY (#1599, extended here by #1820): `secrets` is REQUIRED and is a branded
 * {@link ProviderScrubSet} — it used to read `secrets: readonly string[] = []`, a DEFAULTED, UNBRANDED
 * scrub set on the one boundary in this file that exists to handle a credential. That default made the
 * by-value scrub pure call-site discipline over a `reason` that is rendered in the Connections UI and
 * carried on the `CredentialHealth` row, and the two ways it was silently defeated — forgetting the
 * argument, or passing a bare `[]` — both compiled. `providerErrorFromHttp` closed the identical shape at
 * #1599; a credential PROBE has strictly less standing to keep it. The only two admissible values remain
 * `providerCredentialSecretValues(credential)` and the loudly-named `NO_PROVIDER_SECRETS`, and a probe is
 * never the second one: it always holds a credential, so an empty runtime set is a keyless SOURCE, not a
 * licence to skip the belt.
 */
export async function probeOpenRouterCredential(client: OrProbeClient, now: () => number, secrets: ProviderScrubSet): Promise<CredentialHealth> {
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
