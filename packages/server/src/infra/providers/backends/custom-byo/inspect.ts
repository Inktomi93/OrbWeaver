// infra/providers/backends/custom-byo/inspect — the "Test endpoint" inspector behind the Connections
// surface. The user wires the endpoint themselves, so this sends the ACTUAL shaped request (the same body +
// headers a real turn would send, with the user's transforms applied) and returns a REDACTED request + the
// raw response — so the user verifies the real wire (the §1a inspector that "stays"). Never throws; the key
// never leaves the server (kit `redactHeaders` runs before the result is built).
//
// Egress is the GLOBAL undici dispatcher (the firewall applies to this fetch too); we just fetch.

import { errorMessage } from "@orb/kit/error-message";
import { redactHeaders } from "../kit";

const PING_CONTENT = "ping";
const PING_MAX_TOKENS = 1;
const BODY_PREVIEW_LIMIT = 4000;
const JSON_CONTENT_TYPE = "application/json";
const CHAT_COMPLETIONS_PATH = "/chat/completions";
const TRAILING_SLASH_RE = /\/$/;

/** The inspector's result. File-local — the `no-inline-types` gate forbids a backend EXPORTING a type.
 *  FLAG: this is a cross-boundary diagnostic shape (the credentials/connection "Test endpoint" path reads
 *  it); when that path is wired it should be homed in `infra/providers/contract/` (or `@orb/contracts`),
 *  not here. Kept file-local for now so the backend creates no contract type. */
interface CustomEndpointInspection {
  /** True iff the endpoint answered with a 2xx. */
  readonly ok: boolean;
  readonly request: {
    readonly url: string;
    /** REDACTED — Authorization / key-shaped headers are masked (the key never leaves the server). */
    readonly headers: Record<string, string>;
    /** Pretty-printed JSON of the outbound body. */
    readonly body: string;
  };
  /** The raw response, or null when the request never completed (DNS / refused / timeout). */
  readonly response: {
    readonly status: number;
    readonly statusText: string;
    readonly bodyPreview: string;
  } | null;
  /** Transport error message when `response` is null. */
  readonly error?: string;
}

/**
 * Real 1-message probe against a user-defined OpenAI-compatible endpoint. Sends a trivial non-streaming
 * chat request and returns the redacted request + raw response preview.
 *
 * FLAG (DEFERRED): the per-endpoint `includeBody`/`excludeBody` request transforms (§1a) have no contract
 * home yet (credentials.md v1 deferral); the probe body is the OpenAI base + the user's headers only. When
 * those transforms land they apply to this body too (the runner + this inspector share that seam).
 */
export async function inspectCustomByoEndpoint(args: {
  readonly baseUrl: string;
  readonly apiKey: string | null;
  readonly headers: Record<string, string> | null;
  readonly model: string;
}): Promise<CustomEndpointInspection> {
  const body: Record<string, unknown> = {
    model: args.model,
    messages: [{ role: "user", content: PING_CONTENT }],
    stream: false,
    max_tokens: PING_MAX_TOKENS,
  };
  const headers: Record<string, string> = {
    "content-type": JSON_CONTENT_TYPE,
    ...(args.apiKey !== null && args.apiKey.length > 0
      ? { authorization: `Bearer ${args.apiKey}` }
      : {}),
    ...(args.headers ?? {}),
  };
  const url = `${args.baseUrl.replace(TRAILING_SLASH_RE, "")}${CHAT_COMPLETIONS_PATH}`;
  const request = {
    url,
    headers: redactHeaders(headers),
    body: JSON.stringify(body, null, 2),
  };

  try {
    const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
    const text = await res.text().catch((): string => "");
    return {
      ok: res.ok,
      request,
      response: {
        status: res.status,
        statusText: res.statusText,
        bodyPreview: text.slice(0, BODY_PREVIEW_LIMIT),
      },
    };
  } catch (err) {
    return { ok: false, request, response: null, error: errorMessage(err) };
  }
}
