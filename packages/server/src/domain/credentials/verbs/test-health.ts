// verb: testHealth — probe a credential against its provider's health endpoint + run the throttle and
// circuit-breaker side-effects. Probes by credentialId (not active=true) so inactive owned credentials can
// be probed too. Throttled to one probe per 60s window; 3 consecutive unreachable strikes mark it revoked.
//
// HONESTY INVARIANT (SID-01): `ok` means a probe WENT OUT and the credential was accepted — nothing else.
// Two probe arms exist, dispatched on the STORAGE axis (`row.provider`, the axis a stored row has):
//   · `openrouter`    → the providers diagnostic probe (injected `ctx.probe`, a credits round-trip)
//   · `custom_openai` → the row's OWN endpoint (injected `ctx.probeEndpoint` → infra/network's host-pinned
//                       `GET {baseUrl}/models`) — the same egress boundary the `/models` fetch already uses
// Every other storable provider (`anthropic`, `openai`) has NO probe and reports `unchecked`. Until 2026-08-14
// this verb returned a bare `{status:"ok"}` for every non-openrouter row without dialling anything: a user
// "tested" a custom endpoint or an Anthropic key, saw green, and the first real reachability/auth check was
// their next turn. An unprobed provider also no longer claims the 60s throttle window (nothing went out).
//
// `unchecked` carries NO row/breaker side-effect — it is the absence of a verdict, not a failure. Only a
// TRANSPORT failure strikes toward auto-revocation, and only an auth-class answer revokes outright: a
// reachable BYO endpoint that merely doesn't serve `/models` must not be revoked out from under the user.

import type { CredentialHealth } from "@orb/contracts/credentials";
import type { UserCredentialId, UserId } from "@orb/kit/ids";
import { getLog } from "#foundation/observability";
import { isPrivateOrLoopback } from "#infra/network";
import type { CredentialContext } from "../context.ts";
import type { TestHealthParams } from "../contract/params.ts";
import type { CredentialsService } from "../contract/service.ts";
import { aadFor } from "../persistence/aad.ts";
import { clearRevokedOwned, fetchOwnedCredential, setRevokedById } from "../persistence/queries.ts";
import { requireOwned } from "../substrate/credential-not-found.ts";
import { decryptSealed } from "../substrate/decrypt.ts";
import { beginProbe, recordStrike, resetStrikes } from "../substrate/health-throttle.ts";
import { mintOpenRouter } from "../substrate/mint.ts";
import { parseCustomOpenAiEndpoint } from "../substrate/parse-metadata.ts";

/** `localhost` never parses as an IP literal, so `isPrivateOrLoopback` (which matches CIDRs) misses it —
 *  the one alias worth special-casing; every other loopback/LAN spelling an endpoint would realistically
 *  carry (`127.0.0.1`, `192.168.x.x`, …) IS an IP literal and reaches the shared CIDR set. */
const LOCALHOST_ALIAS = "localhost";

/** True when `hostname` is loopback or a private/LAN range — an offline box there is a REACHABILITY fact,
 *  never a credential problem, so it must not feed the auto-revoke strike counter (owner ruling). */
function isLocalOrLanHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === LOCALHOST_ALIAS || isPrivateOrLoopback(host);
}

/** What both probe arms need to apply their side-effects: the owner-scoped row identity + its clock/state. */
interface ProbeContext {
  readonly ownerId: UserId;
  readonly credentialId: UserCredentialId;
  readonly sealed: { ciphertext: string; iv: string; tag: string };
  readonly revoked: boolean;
  readonly now: number;
  /** True when the probed endpoint is loopback/LAN (custom_openai only — openrouter is always remote). An
   *  unreachable local box strikes NOTHING: it's a "the box is off" fact, not evidence the credential is
   *  bad, and 3-strike auto-revoking it would lock a user out of their own key over their own downtime. */
  readonly localEndpoint: boolean;
}

/** Apply a probe outcome's row + breaker side-effects, re-stamping `checkedAt` from the verb's clock.
 *  Shared by both arms so the classification→consequence mapping cannot drift between providers. */
async function applyProbeOutcome(ctx: CredentialContext, args: ProbeContext, result: CredentialHealth): Promise<CredentialHealth> {
  const { ownerId, credentialId, now } = args;
  if (result.status === "ok") {
    if (args.revoked) {
      await clearRevokedOwned(ctx.db, ownerId, credentialId, now);
    }
    resetStrikes(credentialId);
    return { status: "ok", checkedAt: now };
  }
  if (result.status === "revoked") {
    resetStrikes(credentialId);
    // The probe reached the provider and the provider rejected the key — the SAME fact the post-generation
    // strike-out records, so it carries the same persisted reason.
    await setRevokedById(ctx.db, { ownerId, credentialId, revokedAt: now, reason: "auth_failed" });
    return { status: "revoked", checkedAt: now, reason: result.reason };
  }
  if (result.status === "unreachable") {
    if (args.localEndpoint) {
      // A loopback/LAN endpoint being unreachable is "the box is off", not a credential fact — never
      // strikes toward auto-revoke (owner ruling).
      return { status: "unreachable", checkedAt: now, reason: result.reason };
    }
    const { strikes, limitHit } = recordStrike(credentialId);
    if (limitHit) {
      // `unreachable`, NOT `auth_failed`: nothing ever answered, so nothing has judged the key. The log line
      // below says exactly that, and the persisted reason must not tell the user a story the probe cannot
      // support ("the provider rejected your key" when the provider was never reached).
      await setRevokedById(ctx.db, { ownerId, credentialId, revokedAt: now, reason: "unreachable" });
      getLog().warn({ credentialId, strikes }, "credentials: health probe strike-limit hit — marking revoked despite no auth classification");
      return { status: "revoked", checkedAt: now, reason: result.reason };
    }
    return { status: "unreachable", checkedAt: now, reason: result.reason };
  }
  if (result.status === "unchecked") {
    // No verdict: no row write, no strike — and re-stamped on the verb's clock like every other arm.
    return { status: "unchecked", checkedAt: now, reason: result.reason };
  }
  return result; // `throttled` is domain-only; a probe op cannot produce it.
}

/** The openrouter probe path (already-decrypted key → probe → side-effects); split out for complexity. */
async function probeOpenRouterHealth(ctx: CredentialContext, args: ProbeContext, apiKey: string): Promise<CredentialHealth> {
  return applyProbeOutcome(ctx, args, await ctx.probe(mintOpenRouter(apiKey, args.credentialId)));
}

/** The custom_openai probe path: resolve the row's declared endpoint, decrypt its key, dial it through the
 *  injected infra/network probe (host-pinned egress), then apply the same side-effects. A row with no usable
 *  endpoint metadata is `unchecked` and dials NOTHING (the parse seam is what keeps an `undefined` URL off
 *  the wire). A decrypt failure short-circuits BEFORE the dial: probing key-less would make an authenticated
 *  endpoint answer 401 and revoke a credential whose only problem is a rotated CREDENTIALS_KEY. */
async function probeCustomEndpointHealth(ctx: CredentialContext, args: ProbeContext, metadata: unknown, apiKey: string): Promise<CredentialHealth> {
  const endpoint = parseCustomOpenAiEndpoint(metadata);
  if (endpoint === null) {
    return { status: "unchecked", checkedAt: args.now, reason: "this credential carries no usable custom-endpoint metadata (no baseUrl to probe)" };
  }
  // A malformed baseUrl can't reach `ctx.probeEndpoint` (its own URL parse would fail identically), so
  // treating it as non-local here just falls through to the normal strike path — never silently swallowed.
  const localEndpoint = ((): boolean => {
    // @orb-waive caught-failure-ownership(catch): the comment above is the contract — a malformed baseUrl cannot reach `ctx.probeEndpoint` either (its own URL parse fails identically), so `false` here just routes to the normal strike path where the dial reports the real failure. This branch only classifies local-vs-remote; it never decides the health verdict. Ends if the local/LAN classification gains an effect the strike path does not cover.
    try {
      return isLocalOrLanHost(new URL(endpoint.baseUrl).hostname);
    } catch {
      return false;
    }
  })();
  // An empty stored key means "no-auth local server" (the same rule `inspectEndpoint`/`resolve` apply): send
  // no Authorization header rather than `Bearer `.
  const result = await ctx.probeEndpoint({
    baseUrl: endpoint.baseUrl,
    apiKey: apiKey.length > 0 ? apiKey : null,
    headers: endpoint.headers,
  });
  return applyProbeOutcome(ctx, { ...args, localEndpoint }, result);
}

export function createTestHealth(ctx: CredentialContext): CredentialsService["testHealth"] {
  return async (params: TestHealthParams): Promise<CredentialHealth> => {
    const ownerId = params.principal.userId;
    const { credentialId } = params;
    // Owner-scoped FIRST: a foreign id is not-found before any endpoint is dialled, so no probe result can
    // become an existence/reachability oracle for another user's row.
    const row = requireOwned(await fetchOwnedCredential(ctx.db, ownerId, credentialId), credentialId);
    const now = ctx.now();

    // No probe arm for this provider → say so, and say it BEFORE claiming the throttle window: nothing goes
    // out, so a second ask must still answer `unchecked` rather than a misleading `throttled`.
    if (row.provider !== "openrouter" && row.provider !== "custom_openai") {
      return { status: "unchecked", checkedAt: now, reason: `no health probe exists for ${row.provider} credentials yet` };
    }

    // Decrypt BEFORE claiming the throttle window: no provider request can happen on failure, and an
    // operator who repairs the key must be able to retry immediately. Empty plaintext remains the valid
    // keyless custom endpoint arm; OpenRouter rows are never intentionally empty in production.
    const apiKey = decryptSealed(ctx.box, row, aadFor(ownerId, row.provider));

    const throttledAt = beginProbe(credentialId, now);
    if (throttledAt !== null) {
      return { status: "throttled", checkedAt: throttledAt };
    }

    const probeArgs: ProbeContext = {
      ownerId,
      credentialId,
      sealed: { ciphertext: row.ciphertext, iv: row.iv, tag: row.tag },
      revoked: row.revokedAt !== null,
      now,
      // openrouter is always a remote host; the custom_openai arm resolves the real answer off its own
      // endpoint before calling `applyProbeOutcome` (it spreads over this default).
      localEndpoint: false,
    };
    return row.provider === "custom_openai" ? probeCustomEndpointHealth(ctx, probeArgs, row.metadata, apiKey) : probeOpenRouterHealth(ctx, probeArgs, apiKey);
  };
}
