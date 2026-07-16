// infra/providers/backends/custom-byo/inspect — the "Test endpoint" inspector behind the Connections
// surface. The user wires the endpoint themselves, so this sends the ACTUAL shaped request (the same body +
// headers a real turn would send, with the user's transforms applied) and returns a REDACTED request + the
// raw response — so the user verifies the real wire (the §1a inspector that "stays"). Never throws; the key
// never leaves the server (kit `redactHeaders` runs before the result is built).
//
// Egress is the GLOBAL undici dispatcher (the firewall applies to this fetch too); we just fetch.

import type { EndpointInspection } from "@orb/contracts/providers";
import { errorMessage } from "@orb/kit/error-message";
import { applyIncludeExclude, redactHeaders } from "../kit";

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
      ...(args.signal !== undefined ? { signal: args.signal } : {}),
    });
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
