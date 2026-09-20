// The ONE JSON fetch the plain-fetch surfaces share (catalog lists, rerank, credits, generation cost, the
// endpoint inspector) — and the home of two of the five custom-byo controls that survive the SDK cut-over:
//   • HOST-PIN (#25): `redirect: "manual"`, and ANY 3xx / opaqueredirect is a hard NON-retryable error, never
//     followed. Node's default follow re-sends `Authorization: Bearer …` to whatever host `Location` names —
//     a `302 → https://attacker/…` would exfil the key past the egress firewall, which blocks PRIVATE targets
//     and does not strip credential headers on a cross-origin hop. Applied to EVERY endpoint row (vLLM
//     included — today only custom-byo had it).
//   • The error body is read capped at 64 KiB with `reader.cancel()` past the limit, then classified through
//     the shared HTTP table with the caller's secret scrub set (#1599 — the set is REQUIRED, never defaulted).
//
// THIS IS THE SECOND UPSTREAM-PROSE PATH, and it must compose its hygiene exactly like the first
// (`providerErrorFromHttp` in `error-classify.ts`). Until 2026-09-20 it did not: it ran
// `redactSecretsFromText` and then dropped the raw remainder straight into `ProviderError.message` with NO
// `sanitizeApiError` — so an upstream HTML 502 page rode to a caller whole, markup, control chars and all,
// against a 64 KiB bound instead of the 500-char one every other provider message obeys. Two upstream-prose
// paths where one is sanitized and one is not is the inconsistency that bites the moment a third is added.
// The two ORDER laws that govern the composition below:
//   • #1820 — OVER-READ, THEN SCRUB, THEN SLICE. A reader that truncates first cannot be saved by any later
//     belt: a credential straddling the cut is half-present, so neither of its spellings matches and the
//     surviving PREFIX is real key material. `secretScrubOverhang` is the derived over-read distance.
//   • #1809 — SCRUB BEFORE YOU MANGLE. `sanitizeApiError` mutates (tag strip, control strip, whitespace
//     collapse, hard cap), each of which can bite a known literal in half, so the by-value belt reads
//     INTACT text and the cap applies to already-scrubbed bytes.

import type { ProviderScrubSet } from "../../contract/errors.ts";
import { ProviderError } from "../../contract/errors.ts";
import { classifyHttpStatus } from "./error-classify.ts";
import { redactSecretsFromText, secretScrubOverhang } from "./openai-body.ts";
import { sanitizeApiError } from "./sanitize.ts";

const ERROR_BODY_LIMIT = 65_536;
const REDIRECT_MIN = 300;
const REDIRECT_MAX = 399;
const JSON_CONTENT_TYPE = "application/json";

export interface FetchJsonArgs {
  readonly fetch: typeof fetch;
  readonly url: string;
  readonly method?: "GET" | "POST" | undefined;
  readonly headers?: Readonly<Record<string, string>> | undefined;
  readonly body?: unknown;
  readonly signal?: AbortSignal | undefined;
  /** The literals to scrub from any error text (the bearer, secret-valued headers, key-in-body values). */
  readonly secrets: ProviderScrubSet;
  /** Names the call in error messages (`openrouter credits`, `endpoint models`). */
  readonly label: string;
}

export interface FetchJsonResult {
  readonly status: number;
  readonly headers: Headers;
  readonly json: unknown;
}

/** Read at most `limit` UTF-16 code units of the body, cancelling the stream past it. `limit` is the
 *  caller's display bound PLUS the #1820 scrub over-read — it is counted in code units because that is the
 *  unit `String.includes` matches in, so a byte-counted read against a code-unit slice would reopen the
 *  straddle hole for any body with multi-byte content ahead of the credential. */
async function readCapped(res: Response, limit: number): Promise<string> {
  if (res.body === null) {
    return "";
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let out = "";
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) {
        out += decoder.decode();
        break;
      }
      out += decoder.decode(chunk.value, { stream: true });
      if (out.length >= limit) {
        await reader.cancel();
        break;
      }
    }
  } finally {
    reader.releaseLock();
  }
  return out.slice(0, limit);
}

/** The reflected upstream error body, made safe for a `ProviderError.message`: over-read → by-value scrub
 *  → slice to the read bound → sanitize (which applies the 500-char cap every provider message obeys).
 *  The order is the two laws in this file's header; do not reorder. */
async function safeErrorBody(res: Response, secrets: ProviderScrubSet): Promise<string> {
  const raw = await readCapped(res, ERROR_BODY_LIMIT + secretScrubOverhang(secrets));
  return sanitizeApiError(redactSecretsFromText(raw, secrets).slice(0, ERROR_BODY_LIMIT));
}

function isRedirect(res: Response): boolean {
  return res.type === "opaqueredirect" || (res.status >= REDIRECT_MIN && res.status <= REDIRECT_MAX);
}

/** A thrown `fetch` → the typed error, cancellation bound to THIS request's signal (never the error's text). */
function transportError(args: FetchJsonArgs, cause: unknown): ProviderError {
  if (args.signal?.aborted === true) {
    return new ProviderError({ kind: "aborted", retryable: false, message: `${args.label}: request aborted`, cause });
  }
  return new ProviderError({ kind: "server", retryable: true, message: `${args.label}: transport failure`, cause });
}

function notJsonError(args: FetchJsonArgs, status: number, cause: unknown): ProviderError {
  return new ProviderError({
    kind: "server",
    retryable: true,
    message: `${args.label}: the endpoint answered ${status} with a body that is not JSON`,
    apiErrorStatus: status,
    cause,
  });
}

function parseJson(args: FetchJsonArgs, status: number, text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (cause) {
    throw notJsonError(args, status, cause);
  }
}

/** POST/GET JSON with the host pin and the capped, scrubbed error read. A 2xx whose body is not JSON is a
 *  `server` error (retryable) — never an empty success (#1400's defect class, one level up from the stream). */
export async function fetchJson(args: FetchJsonArgs): Promise<FetchJsonResult> {
  const method = args.method ?? "GET";
  const res = await args
    .fetch(args.url, {
      method,
      headers: { ...(args.body !== undefined ? { "content-type": JSON_CONTENT_TYPE } : {}), ...(args.headers ?? {}) },
      ...(args.body !== undefined ? { body: JSON.stringify(args.body) } : {}),
      redirect: "manual",
      ...(args.signal !== undefined ? { signal: args.signal } : {}),
    })
    .catch((cause: unknown) => {
      throw transportError(args, cause);
    });
  if (isRedirect(res)) {
    throw new ProviderError({
      kind: "invalid",
      retryable: false,
      message: `${args.label}: the endpoint answered ${res.status} with a redirect, which is never followed (host pin)`,
      apiErrorStatus: res.status,
    });
  }
  if (!res.ok) {
    const text = await safeErrorBody(res, args.secrets);
    const classified = classifyHttpStatus(res.status);
    throw new ProviderError({
      kind: classified.kind,
      retryable: classified.retryable,
      message: `${args.label}: HTTP ${res.status}${text.length > 0 ? ` — ${text}` : ""}`,
      apiErrorStatus: res.status,
    });
  }
  const text = await res.text();
  return { status: res.status, headers: res.headers, json: parseJson(args, res.status, text) };
}

/** The bearer + extra headers a connection's request carries; `null` secret ⇒ no Authorization header. */
export function authHeaders(secret: string | null, extra: Readonly<Record<string, string>> | undefined): Record<string, string> {
  return { ...(secret !== null && secret.length > 0 ? { authorization: `Bearer ${secret}` } : {}), ...(extra ?? {}) };
}

const TRAILING_SLASH_RE = /\/$/u;
const V1_SUFFIX_RE = /\/v1$/u;

/** `<baseUrl>/<path>` with the OpenAI `/v1` segment normalized: a hosted row's fixed URL already ends in
 *  `/v1`; an endpoint row's typed URL usually does not. */
export function openAiPath(baseUrl: string, path: string): string {
  const trimmed = baseUrl.replace(TRAILING_SLASH_RE, "");
  return `${V1_SUFFIX_RE.test(trimmed) ? trimmed : `${trimmed}/v1`}${path}`;
}
