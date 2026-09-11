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
// …AND THE CUT COMES LAST (#1820). The preview's length limit is a MUTATION of the text, so it obeys the
// same order law as `sanitizeApiError` (backends/kit/sanitize.ts) — with one difference that makes it
// worse: truncating at the READ is not merely out of order, it is UNREACHABLE by any later belt, because
// the tail of a straddling credential was never pulled off the socket at all. The reader therefore
// over-reads by the longest literal the scrub will search for (`secretScrubOverhang`), the scrub runs on
// that whole buffer, and the slice to `BODY_PREVIEW_LIMIT` happens after it.
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
import { applyIncludeExclude, customOpenAiSecretLiterals, redactHeaders, redactSecretsFromText, sanitizeApiError, secretScrubOverhang } from "../kit/index.ts";

const PING_CONTENT = "ping";
const PING_MAX_TOKENS = 1;
const BODY_PREVIEW_LIMIT = 4000;
const JSON_CONTENT_TYPE = "application/json";
const CHAT_COMPLETIONS_PATH = "/chat/completions";
const TRAILING_SLASH_RE = /\/$/;

/**
 * Read at most `BODY_PREVIEW_LIMIT + overhang` characters of the response and cancel the rest.
 *
 * THE OVERHANG IS THE SECURITY PART (#1820). This used to stop dead at {@link BODY_PREVIEW_LIMIT}, and the
 * scrub ran on what was left — so an echoing endpoint that positions the reflected key ACROSS the cut left
 * a key PREFIX standing in the displayed preview: half a literal matches neither of its spellings, and the
 * other half was never read, so no later belt could ever reach it. The caller over-reads by the longest
 * literal the scrub will search for ({@link secretScrubOverhang}), scrubs the whole buffer, and only then
 * slices to the limit — the "scrub before you mangle" law, one hop upstream of `sanitizeApiError`.
 *
 * IT COUNTS AND CUTS IN ONE UNIT: UTF-16 code units, the unit both the scrub's `String.includes` and the
 * caller's final `slice` work in. The old loop bounded the read in BYTES and sliced in code units, which
 * reopens exactly this hole whenever the body carries multi-byte content ahead of the credential (the byte
 * budget then lands mid-key while the string is still short of the character limit). Whole chunks are
 * appended rather than byte-sliced: a `subarray` cut mid-UTF-8-sequence just moves bytes into the decoder's
 * hold-back anyway, and the surplus is dropped by the return slice.
 */
async function readBodyPreview(res: Response, overhang: number): Promise<string> {
  if (res.body === null) {
    return "";
  }
  const budget = BODY_PREVIEW_LIMIT + overhang;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let out = "";
  try {
    let ended = false;
    while (!ended && out.length < budget) {
      const chunk = await reader.read();
      ended = chunk.done;
      out += chunk.done ? decoder.decode() : decoder.decode(chunk.value, { stream: true });
    }
    if (!ended) {
      await reader.cancel();
    }
    return out.slice(0, budget);
  } finally {
    reader.releaseLock();
  }
}

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
  // Through the ONE producer (#1760) rather than a third hand-rolled `[apiKey, ...headerValues]`: this
  // surface DISPLAYS both the request body it sent and the response the endpoint returned, so a BYO
  // endpoint authenticating by a BODY field (`includeBody: {"api_key": …}`) had its credential rendered in
  // cleartext twice — the same response-echo class as the P0 above, one field over.
  const secrets = customOpenAiSecretLiterals(args);
  const request = {
    url: redactSecretsFromText(url, secrets),
    headers: redactHeaders(headers, secrets),
    body: redactSecretsFromText(JSON.stringify(body, null, 2), secrets),
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
    // @orb-waive caught-failure-ownership(readBodyPreview): a diagnostic body-preview read failure collapses to an empty string (then secret-scrubbed by value); display-only enrichment, no credential/auth decision and no leak. Ends if the preview ever bypasses scrubbing or gates auth.
    const text = await readBodyPreview(res, secretScrubOverhang(secrets)).catch((): string => "");
    // Scrub secrets BEFORE display-eligibility: an echoing endpoint reflects the plaintext key back in the
    // body. The known literals we hold (the apiKey + any secret-valued custom header) are the primary belt.
    // OVER-READ, SCRUB, THEN CUT (#1820) — the truncation is the LAST step, so a key the endpoint placed
    // across `BODY_PREVIEW_LIMIT` is whole when the belt looks for it instead of surviving as a prefix.
    const bodyPreview = redactSecretsFromText(text, secrets).slice(0, BODY_PREVIEW_LIMIT);
    return {
      ok: res.ok,
      request,
      response: {
        status: res.status,
        statusText: redactSecretsFromText(res.statusText, secrets),
        bodyPreview,
      },
    };
  } catch (err) {
    // SCRUB, then sanitize (#1809) — `sanitizeApiError` strips `<…>` spans and caps at 500 chars, so
    // running it first fragments a markup-bearing credential past the by-value belt's reach.
    return { ok: false, request, response: null, error: sanitizeApiError(redactSecretsFromText(errorMessage(err), secrets)) };
  }
}
