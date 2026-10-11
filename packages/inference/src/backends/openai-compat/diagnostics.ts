// The openai-compat diagnostics: `probe` (credential health by a cheap authenticated read), the three
// OpenRouter-only plain-fetch surfaces (`accountCredits` → `GET /credits`, `generationCost` → `GET
// /generation?id=`, and the enriched `listModels` → `GET /models`), the `/v1/models` list for every other row,
// and the "Test endpoint" INSPECTOR — one 1-token chat call on the route chat uses, the redacted request + raw
// (scrubbed, over-read-then-cut, #1820) response back, never a throw.

import type { CredentialHealth } from "@orb/contracts/credentials";
import type { ModelCatalogEntry, ModelListing } from "@orb/contracts/inference";
import { foldFeatures } from "@orb/contracts/inference";
import type { AccountCredits, EndpointInspection, GenerationCost } from "@orb/contracts/providers";
import { errorMessage } from "@orb/kit/error-message";
import { z } from "zod";
import { fetchEndpointModels, fetchOpenRouterCatalog } from "#catalog";
import type { AccountCreditsRequest, GenerationCostRequest, InspectRequest, ListModelsRequest, ProbeRequest, ProviderScrubSet, Resolved } from "#contract";
import { ProviderError } from "#contract";
import { authHeaders, fetchJson, openAiPath } from "../http/fetch-json.ts";
import { turnAbortSignal } from "../http/idle-timeout.ts";
import { resolvedScrubSet, sanitizeApiError } from "../http/sanitize.ts";
import { bareCatalogEntry, failedListing, listingOf } from "../wire/model-listing.ts";
import { redactHeaders, redactSecretsFromText, secretScrubOverhang } from "../wire/openai-body.ts";
import type { TransportDeps } from "./model.ts";
import { languageModelFor } from "./model.ts";

const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const PING_CONTENT = "ping";
const PING_MAX_TOKENS = 1;
const BODY_PREVIEW_LIMIT = 4000;
const INSPECT_LABEL = "endpoint inspector";
const INSPECT_API = "chat-completions";
const CREDITS_PATH = "/credits";
const GENERATION_PATH = "/generation";

export interface DiagnosticsDeps {
  readonly fetch: typeof fetch;
  readonly now: () => number;
}

const creditsSchema = z.object({ data: z.object({ total_credits: z.number(), total_usage: z.number() }).loose() }).loose();
const generationSchema = z
  .object({
    data: z.object({ total_cost: z.number(), tokens_prompt: z.number().nullable().optional(), tokens_completion: z.number().nullable().optional() }).loose(),
  })
  .loose();

function requireBaseUrl(connection: Pick<Resolved, "baseUrl">, label: string): string {
  if (connection.baseUrl === null) {
    throw new ProviderError({ kind: "invalid", retryable: false, message: `${label}: the connection carries no base URL` });
  }
  return connection.baseUrl;
}

function requireOpenRouter(connection: Resolved, label: string): string {
  if (connection.provider.dialect !== "openrouter") {
    throw new ProviderError({ kind: "invalid", retryable: false, message: `${label}: only the openrouter transport serves this diagnostic` });
  }
  return requireBaseUrl(connection, label);
}

interface ReadArgs {
  readonly connection: Resolved;
  readonly path: string;
  readonly label: string;
  readonly signal: AbortSignal | undefined;
}

async function authenticatedRead(deps: DiagnosticsDeps, args: ReadArgs): Promise<unknown> {
  const { connection, path, label, signal } = args;
  const baseUrl = requireBaseUrl(connection, label);
  const url = connection.provider.dialect === "openrouter" ? `${baseUrl.replace(/\/$/u, "")}${path}` : openAiPath(baseUrl, path);
  const result = await fetchJson({
    fetch: deps.fetch,
    url,
    headers: authHeaders(connection.credential.secret, connection.transport?.headers),
    secrets: resolvedScrubSet(connection),
    label,
    ...(signal !== undefined ? { signal } : {}),
  });
  return result.json;
}

/** Credential health by the cheapest authenticated read the row admits: `/credits` on openrouter, `/models`
 *  elsewhere. Success → `ok`; a typed HTTP 401/403 → `revoked`; anything else → `unreachable`, carrying the
 *  status when the server answered. Upstream
 *  prose is never classification evidence: a 5xx body may mention another request's invalid API key. */
export async function probeOpenAiCompat(req: ProbeRequest, deps: DiagnosticsDeps): Promise<CredentialHealth> {
  const checkedAt = deps.now();
  const { connection } = req;
  const path = connection.provider.dialect === "openrouter" ? CREDITS_PATH : "/models";
  try {
    await authenticatedRead(deps, { connection, path, label: "credential probe", signal: req.signal });
    return { status: "ok", checkedAt };
    // @orb-waive caught-failure-ownership(err): credential probes own failures as typed revoked/unreachable health with a sanitized reason. Precedent: the gate mustPass fixture packages/server/src/domain/probe/failed-status.ts proves the same explicit failure result. Ends if the returned health stops carrying that disposition.
  } catch (err) {
    const reason = sanitizeApiError(redactSecretsFromText(errorMessage(err), resolvedScrubSet(connection)));
    const httpStatus = err instanceof ProviderError ? err.apiErrorStatus : undefined;
    if (httpStatus === HTTP_UNAUTHORIZED || httpStatus === HTTP_FORBIDDEN) {
      return { status: "revoked", checkedAt, reason };
    }
    // A status means the server answered: up, but this request failed (a wrong path is a 404, not a dead box).
    return httpStatus === undefined ? { status: "unreachable", checkedAt, reason } : { status: "unreachable", checkedAt, reason, httpStatus };
  }
}

export async function openRouterCredits(req: AccountCreditsRequest, deps: DiagnosticsDeps): Promise<AccountCredits> {
  requireOpenRouter(req.connection, "openrouter credits");
  const parsed = creditsSchema.parse(
    await authenticatedRead(deps, { connection: req.connection, path: CREDITS_PATH, label: "openrouter credits", signal: req.signal }),
  );
  return { total: parsed.data.total_credits, used: parsed.data.total_usage };
}

/** MUST be called with the key that billed the generation, else OpenRouter 404s — surfaced as the typed error. */
export async function openRouterGenerationCost(req: GenerationCostRequest, deps: DiagnosticsDeps): Promise<GenerationCost> {
  requireOpenRouter(req.connection, "openrouter generation");
  const path = `${GENERATION_PATH}?id=${encodeURIComponent(req.generationId)}`;
  const parsed = generationSchema.parse(
    await authenticatedRead(deps, { connection: req.connection, path, label: "openrouter generation", signal: req.signal }),
  );
  return { totalCost: parsed.data.total_cost, tokensPrompt: parsed.data.tokens_prompt ?? null, tokensCompletion: parsed.data.tokens_completion ?? null };
}

/** The model list by the row's dialect: the enriched openrouter catalog, else the `/v1/models` ids. A failed
 *  or empty list is `{ listed: false, reason }` — the pane offers a typed id and says why. */
export async function listOpenAiCompatModels(req: ListModelsRequest, deps: DiagnosticsDeps): Promise<ModelListing> {
  const { connection } = req;
  const baseUrl = requireBaseUrl(connection, "list models");
  const secrets = resolvedScrubSet(connection);
  try {
    const models: ModelCatalogEntry[] =
      connection.provider.dialect === "openrouter"
        ? await fetchOpenRouterCatalog({ fetch: deps.fetch, baseUrl, ...(req.signal !== undefined ? { signal: req.signal } : {}) })
        : (
            await fetchEndpointModels({
              fetch: deps.fetch,
              baseUrl,
              secret: connection.credential.secret,
              headers: connection.transport?.headers,
              secrets,
              // The provider row's reader: a catalog target carries the row, not the folded features.
              modelInfoApi: foldFeatures(connection.provider.features).modelInfoApi,
              ...(req.signal !== undefined ? { signal: req.signal } : {}),
            })
          ).map((row) => bareCatalogEntry(row));
    return listingOf(models);
    // @orb-waive caught-failure-ownership(err): optional model discovery owns refusal as `listed:false` with the scrubbed reason; generation remains usable with an explicit model. Precedent: the gate mustPass fixture packages/server/src/domain/probe/failed-status.ts proves the same explicit failure result. Ends if callers require a successful catalog.
  } catch (err) {
    return failedListing(err, secrets);
  }
}

// ── the inspector ─────────────────────────────────────────────────────────────────────────────────────────

/** Read at most `BODY_PREVIEW_LIMIT + overhang` UTF-16 code units and cancel the rest — the over-read lets
 *  the by-value scrub see a credential the endpoint reflected ACROSS the cut (#1820), one unit throughout. */
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

function inspectionRequest(url: string, headers: Record<string, string>, body: unknown, secrets: ProviderScrubSet): EndpointInspection["request"] {
  return {
    url: redactSecretsFromText(url, secrets),
    headers: redactHeaders(headers, secrets),
    body: redactSecretsFromText(JSON.stringify(body, null, 2), secrets),
  };
}

/** What the inspector's call needs beyond the diagnostics deps: the app identity the model factory sends. */
export interface InspectDeps {
  readonly fetch: typeof fetch;
  readonly app: TransportDeps["app"];
}

/** The one send the model factory made, as the server received it, and its reply as the server sent it. */
interface Observed {
  request?: { readonly url: string; readonly headers: Record<string, string>; readonly body: unknown };
  reply?: Response;
}

function urlOf(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === "string") {
    return input;
  }
  return input instanceof URL ? input.toString() : input.url;
}

// The factory always sends a JSON string it serialised itself, so the parse cannot fail here.
function sentBody(body: RequestInit["body"]): unknown {
  return typeof body === "string" ? JSON.parse(body) : "";
}

/** Sits under the factory's `wrapFetch` (and under a native route's rewrite), so it sees the final URL, headers
 *  and body, and keeps a copy of the reply before any translation reads it. */
function observingFetch(inner: typeof fetch, observed: Observed): typeof fetch {
  return async (input, init): Promise<Response> => {
    observed.request = { url: urlOf(input), headers: Object.fromEntries(new Headers(init?.headers)), body: sentBody(init?.body) };
    const res = await inner(input, init);
    observed.reply = res.clone();
    return res;
  };
}

/**
 * The "Send a test request" probe, one 1-token chat call through the same model factory and route a chat turn
 * uses (D310). On an own-server row it takes the `nativeChat` route and the openai-compat body shaper: `extras`,
 * the include/exclude pair and the row's feature rules. It does not exercise dialect placement (the openrouter
 * extras `openRouterShape` places in `chat.ts`) or turn-derived shaping (preset samplers, reasoning, prefill,
 * tools, structured output, cache markers). `ok` means the call came back as a reply the chat path reads. The
 * request is shown as sent, and the response as the server sent it, scrubbed before it is display-eligible.
 */
export async function inspectOpenAiCompatEndpoint(req: InspectRequest, deps: InspectDeps): Promise<EndpointInspection> {
  const { connection } = req;
  requireBaseUrl(connection, INSPECT_LABEL);
  const secrets = resolvedScrubSet(connection);
  const observed: Observed = {};
  const model = languageModelFor({
    connection,
    deps: { fetch: observingFetch(deps.fetch, observed), app: deps.app },
    label: INSPECT_LABEL,
    api: INSPECT_API,
    plan: null,
    prefillAllowed: false,
    templateThinking: undefined,
    templatePreserveReasoning: undefined,
    foldSameRole: false,
    replyImages: false,
    warnings: [],
  });
  // The row's own idle bound, as chat arms it: a hung endpoint fails the test when it would fail a turn.
  const idle = turnAbortSignal(req.signal, connection.features.requestTimeoutMs);
  try {
    await model.doGenerate({
      prompt: [{ role: "user", content: [{ type: "text", text: PING_CONTENT }] }],
      maxOutputTokens: PING_MAX_TOKENS,
      abortSignal: idle.signal,
    });
    return await inspectionOf(observed, secrets, undefined);
  } catch (err) {
    return { ...(await inspectionOf(observed, secrets, err)), ok: false, error: sanitizeApiError(redactSecretsFromText(errorMessage(err), secrets)) };
  } finally {
    idle.dispose();
  }
}

/** The inspection of the send `observed` saw; `failure` is what the chat call threw, if it threw. */
async function inspectionOf(observed: Observed, secrets: ProviderScrubSet, failure: unknown): Promise<EndpointInspection> {
  const sent = observed.request ?? { url: "", headers: {}, body: "" };
  const request = inspectionRequest(sent.url, sent.headers, sent.body, secrets);
  const reply = observed.reply;
  if (reply === undefined) {
    return { ok: false, request, response: null };
  }
  // @orb-waive caught-failure-ownership(readBodyPreview): a preview read failure degrades to an explicit empty preview while status and headers remain inspectable. Precedent: the gate mustPass fixture tooling/src/probe/unproven-outcome.ts proves the same degraded inspection result. Ends if preview bytes become authoritative.
  const text = await readBodyPreview(reply, secretScrubOverhang(secrets)).catch((): string => "");
  return {
    ok: failure === undefined && reply.ok,
    request,
    response: {
      status: reply.status,
      statusText: redactSecretsFromText(reply.statusText, secrets),
      bodyPreview: redactSecretsFromText(text, secrets).slice(0, BODY_PREVIEW_LIMIT),
    },
  };
}
