// The openai-compat diagnostics: `probe` (credential health by a cheap authenticated read), the three
// OpenRouter-only plain-fetch surfaces (`accountCredits` → `GET /credits`, `generationCost` → `GET
// /generation?id=`, and the enriched `listModels` → `GET /models`), the `/v1/models` list for every other row,
// and the "Test endpoint" INSPECTOR — the ACTUAL shaped 1-token request with the row's transforms applied,
// redacted request + raw (scrubbed, over-read-then-cut, #1820) response back, never a throw.

import type { CredentialHealth } from "@orb/contracts/credentials";
import type { ModelCatalogEntry, ModelListing } from "@orb/contracts/inference";
import type { AccountCredits, EndpointInspection, GenerationCost } from "@orb/contracts/providers";
import { errorMessage } from "@orb/kit/error-message";
import { z } from "zod";
import { fetchEndpointModels } from "../../catalog/endpoint.ts";
import { fetchOpenRouterCatalog } from "../../catalog/openrouter.ts";
import type { AccountCreditsRequest, GenerationCostRequest, InspectRequest, ListModelsRequest, ProbeRequest } from "../../contract/diagnostics.ts";
import type { ProviderScrubSet } from "../../contract/errors.ts";
import { ProviderError } from "../../contract/errors.ts";
import type { Resolved } from "../../contract/resolved.ts";
import { authHeaders, fetchJson, openAiPath } from "../kit/fetch-json.ts";
import { bareCatalogEntry, failedListing, listingOf } from "../kit/model-listing.ts";
import { applyIncludeExclude, redactHeaders, redactSecretsFromText, secretScrubOverhang } from "../kit/openai-body.ts";
import { resolvedScrubSet, sanitizeApiError } from "../kit/sanitize.ts";

const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const PING_CONTENT = "ping";
const PING_MAX_TOKENS = 1;
const BODY_PREVIEW_LIMIT = 4000;
const JSON_CONTENT_TYPE = "application/json";
const CHAT_COMPLETIONS_PATH = "/chat/completions";
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
 *  elsewhere. Success → `ok`; a typed HTTP 401/403 → `revoked`; anything else → `unreachable`. Upstream
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
    const authFailure = err instanceof ProviderError && (err.apiErrorStatus === HTTP_UNAUTHORIZED || err.apiErrorStatus === HTTP_FORBIDDEN);
    return authFailure ? { status: "revoked", checkedAt, reason } : { status: "unreachable", checkedAt, reason };
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

function inspectionRequest(
  url: string,
  headers: Record<string, string>,
  body: Record<string, unknown>,
  secrets: ProviderScrubSet,
): EndpointInspection["request"] {
  return {
    url: redactSecretsFromText(url, secrets),
    headers: redactHeaders(headers, secrets),
    body: redactSecretsFromText(JSON.stringify(body, null, 2), secrets),
  };
}

/** The 1-token probe against the row's endpoint: the SAME body a real turn would send with the row's
 *  `includeBody`/`excludeBody` applied, host-pinned, the response scrubbed BEFORE it is display-eligible. */
export async function inspectOpenAiCompatEndpoint(req: InspectRequest, deps: DiagnosticsDeps): Promise<EndpointInspection> {
  const { connection } = req;
  const baseUrl = requireBaseUrl(connection, "endpoint inspector");
  const secrets = resolvedScrubSet(connection);
  const body = applyIncludeExclude(
    { model: connection.model, messages: [{ role: "user", content: PING_CONTENT }], stream: false, max_tokens: PING_MAX_TOKENS },
    connection.transport?.includeBody ?? null,
    connection.transport?.excludeBody ?? null,
  );
  const headers: Record<string, string> = { "content-type": JSON_CONTENT_TYPE, ...authHeaders(connection.credential.secret, connection.transport?.headers) };
  const url = openAiPath(baseUrl, CHAT_COMPLETIONS_PATH);
  const request = inspectionRequest(url, headers, body, secrets);
  try {
    const res = await deps.fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      redirect: "manual",
      ...(req.signal !== undefined ? { signal: req.signal } : {}),
    });
    // @orb-waive caught-failure-ownership(readBodyPreview): a preview read failure degrades to an explicit empty preview while status and headers remain inspectable. Precedent: the gate mustPass fixture tooling/src/probe/unproven-outcome.ts proves the same degraded inspection result. Ends if preview bytes become authoritative.
    const text = await readBodyPreview(res, secretScrubOverhang(secrets)).catch((): string => "");
    return {
      ok: res.ok,
      request,
      response: {
        status: res.status,
        statusText: redactSecretsFromText(res.statusText, secrets),
        bodyPreview: redactSecretsFromText(text, secrets).slice(0, BODY_PREVIEW_LIMIT),
      },
    };
  } catch (err) {
    return { ok: false, request, response: null, error: sanitizeApiError(redactSecretsFromText(errorMessage(err), secrets)) };
  }
}
