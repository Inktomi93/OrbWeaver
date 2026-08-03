// infra/providers/backends/custom-byo/inspect — the "Test endpoint" inspector behind the Connections
// surface. The user wires the endpoint themselves, so this sends the ACTUAL shaped request (the same body +
// headers a real turn would send, with the user's transforms applied) and returns a REDACTED request + the
// raw response — so the user verifies the real wire (the §1a inspector that "stays"). Never throws.
//
// SECURITY INVARIANT: the key DOES leave the server — it must, to test the real endpoint — but it must
// never be DISPLAY-eligible on the way back. Two seams enforce that: the request headers are masked with
// kit `redactHeaders`, and the raw response body is scrubbed of the known secret literals (the apiKey + any
// secret-valued custom header) via `redactSecretsFromText` BEFORE it becomes `response.bodyPreview` — an
// echoing endpoint (httpbin / a debug proxy / a misconfigured BYO server) otherwise reflects the plaintext
// `Authorization: Bearer <key>` straight into the rendered dialog.
//
// SECURITY INVARIANT (credential-exfil via redirect): the probe is HOST-PINNED — `redirect: "manual"`, so a
// `3xx` from the configured endpoint is surfaced verbatim (its status becomes the diagnostic) and is NEVER
// followed. Node's default `redirect:"follow"` re-sends the `Authorization: Bearer <key>` header to whatever
// host the endpoint's `Location` names — a `302 → https://attacker/…` would silently exfil the key past the
// egress firewall (the firewall blocks PRIVATE targets, not a redirect to a public attacker host, and it does
// not strip credential headers on a cross-origin hop). This mirrors the host-pin the sibling `/models` probe
// gets from `safeFetch` (openai-models.ts). We can't use `safeFetch` here — the BYO endpoint is legitimately
// LAN/http/IP-literal (the owner-configured-endpoint class) — so we pin at the redirect boundary instead.
//
// Egress is the GLOBAL undici dispatcher (the firewall applies to this fetch too); we just fetch.

import type { EndpointInspection } from "@orb/contracts/providers";
import { errorMessage } from "@orb/kit/error-message";
import { applyIncludeExclude, redactHeaders, redactSecretsFromText, secretHeaderValues } from "../kit/index.ts";

const PING_CONTENT = "ping";
const PING_MAX_TOKENS = 1;
const BODY_PREVIEW_LIMIT = 4000;
const JSON_CONTENT_TYPE = "application/json";
const CHAT_COMPLETIONS_PATH = "/chat/completions";
const TRAILING_SLASH_RE = /\/$/;

// The inspector's result is the cross-boundary `EndpointInspection` (the credentials/connection "Test
// endpoint" path reads it through the providers diagnostic front door) — homed in `@orb/contracts/providers`,
// not file-local here.

/**
 * Real 1-message probe against a user-defined OpenAI-compatible endpoint. Sends a trivial non-streaming
 * chat request — the SAME body a real turn would send, with the user's `includeBody`/`excludeBody`
 * transforms applied (the runner + this inspector share that seam, PD-13) — and returns the redacted
 * request + raw response preview. `signal` cancels the in-flight fetch (PD-16).
 */
export async function inspectCustomByoEndpoint(args: {
  readonly baseUrl: string;
  readonly apiKey: string | null;
  readonly headers: Record<string, string> | null;
  readonly model: string;
  readonly includeBody: Record<string, unknown> | null;
  readonly excludeBody: readonly string[] | null;
  readonly signal?: AbortSignal | undefined;
}): Promise<EndpointInspection> {
  const base: Record<string, unknown> = {
    model: args.model,
    messages: [{ role: "user", content: PING_CONTENT }],
    stream: false,
    max_tokens: PING_MAX_TOKENS,
  };
  const body = applyIncludeExclude(base, args.includeBody, args.excludeBody);
  const headers: Record<string, string> = {
    "content-type": JSON_CONTENT_TYPE,
    ...(args.apiKey !== null && args.apiKey.length > 0 ? { authorization: `Bearer ${args.apiKey}` } : {}),
    ...(args.headers ?? {}),
  };
  const url = `${args.baseUrl.replace(TRAILING_SLASH_RE, "")}${CHAT_COMPLETIONS_PATH}`;
  const request = {
    url,
    headers: redactHeaders(headers),
    body: JSON.stringify(body, null, 2),
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      // Host-pin: never chase a redirect off the configured endpoint with the key in tow (see the header).
      redirect: "manual",
      ...(args.signal !== undefined ? { signal: args.signal } : {}),
    });
    const text = await res.text().catch((): string => "");
    // Scrub secrets BEFORE display-eligibility: an echoing endpoint reflects the plaintext key back in the
    // body. The known literals we hold (the apiKey + any secret-valued custom header) are the primary belt.
    const secrets = [...(args.apiKey !== null ? [args.apiKey] : []), ...secretHeaderValues(args.headers)];
    const bodyPreview = redactSecretsFromText(text, secrets).slice(0, BODY_PREVIEW_LIMIT);
    return {
      ok: res.ok,
      request,
      response: {
        status: res.status,
        statusText: res.statusText,
        bodyPreview,
      },
    };
  } catch (err) {
    return { ok: false, request, response: null, error: errorMessage(err) };
  }
}
