// Headless persisted-app cache probe; every physical POST is guarded and captured before any retry.
// A deliberate first-response transfer loss exercises the actual pre-commit prepared-request retry.
import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import type { Principal } from "@orb/contracts/identity";
import { clampRoleHandling, responseCacheSchema, turnsLevelFor } from "@orb/contracts/inference";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { Db } from "@orb/db";
import { closeDb, messages, messageVariants } from "@orb/db";
import { ProviderError } from "@orb/inference";
import { castId } from "@orb/kit/ids";
import type { JsonValue } from "@orb/kit/json";
import { jsonValueSchema } from "@orb/kit/json";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { redactSecretsFromText } from "../../../packages/inference/src/backends/kit/openai-body.ts";
import { responseCacheOf } from "../../../packages/inference/src/backends/kit/response-cache.ts";
import { NO_PROVIDER_SECRETS, resolvedScrubSet } from "../../../packages/inference/src/backends/kit/sanitize.ts";
import type { ProviderScrubSet } from "../../../packages/inference/src/contract/errors.ts";
import { anthropicTextStream, openAiTextStream, scriptedSseFetch } from "../../../tests/inference/backends/_hosted-support.ts";
import { freshDb } from "../../../tests/support/db.ts";
import { seedUser } from "../../../tests/support/factories/user.ts";
import { readEnvKey } from "../openrouter/_kit.ts";
import { appendEvidence } from "./evidence.ts";
import type { Scenario } from "./scenario.ts";
import { LIVE_POST_LIMIT, PREPARED_SOURCE_PATHS, SCENARIO_POST_LIMIT, SCENARIOS } from "./scenario.ts";

const LIVE = process.argv.includes("--live");
const OUT = LIVE ? "scripts/probes/caching/results.jsonl" : join(tmpdir(), `k-caching-scripted-${Date.now()}.jsonl`);
const jsonObjectSchema = z.record(z.string(), jsonValueSchema);
type JsonObject = z.infer<typeof jsonObjectSchema>;
if (readEnvKey("ORB_ENV_NO_FILE") !== "1") {
  throw new Error("The probe requires ORB_ENV_NO_FILE=1 so the headless app cannot load production configuration");
}
const { createServices, NO_SHARE_RELAY, UNSUPERVISED_RESTART } = await import("@orb/server/entry/compose");
const SSE_DATA_PREFIX = "data: ";
const REQUEST_TIMEOUT_MS = 120_000;
const SECRET_BOX_BYTES = 32;
const ERROR_TEXT_CHARS = 2048;
const RUN = new Date().toISOString();
const SAFE_VALUE_KEYS = new Set(["role", "model", "type", "mode", "ttl", "name", "order", "finish_reason", "finishReason", "stop_reason"]);
const ALLOWED_HOSTS = new Set(["api.anthropic.com", "api.openai.com", "generativelanguage.googleapis.com", "openrouter.ai"]);

function hash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}
function append(row: object, secrets: ProviderScrubSet): void {
  appendEvidence(OUT, { run: RUN, live: LIVE, ...row }, secrets);
}
function sourceHash(): string {
  return hash(PREPARED_SOURCE_PATHS.map((path) => `${path}\n${readFileSync(path, "utf8")}`).join("\n"));
}
const FROZEN_SOURCE = sourceHash();
let physicalPosts = existsSync(OUT)
  ? readFileSync(OUT, "utf8")
      .split(/\r?\n/u)
      .filter((line) => line !== "")
      .map((line) => jsonObjectSchema.parse(JSON.parse(line)))
      .filter((row) => row["kind"] === "physical-post-start").length
  : 0;

function bodyShape(value: JsonValue, key = ""): JsonValue {
  if (typeof value === "string") {
    return SAFE_VALUE_KEYS.has(key) ? value : { chars: value.length, sha256: hash(value) };
  }
  if (Array.isArray(value)) {
    return value.map((item) => bodyShape(item, key));
  }
  return value !== null && typeof value === "object" ? Object.fromEntries(Object.entries(value).map(([name, item]) => [name, bodyShape(item, name)])) : value;
}

function rawFrames(text: string): JsonObject[] {
  const chunks = text.startsWith("{")
    ? [text]
    : text
        .split(/\r?\n/u)
        .filter((line) => line.startsWith(SSE_DATA_PREFIX))
        .map((line) => line.slice(SSE_DATA_PREFIX.length));
  return chunks.filter((chunk) => chunk !== "[DONE]").map((chunk) => jsonObjectSchema.parse(JSON.parse(chunk)));
}
function frameFacts(frame: JsonObject, secrets: ProviderScrubSet): JsonObject {
  const message = jsonObjectSchema.safeParse(frame["message"]);
  const initial = message.success ? message.data : {};
  const finish = frame["choices"] ?? frame["candidates"] ?? frame["delta"] ?? frame["stop_reason"] ?? null;
  return {
    type: frame["type"] ?? null,
    id: frame["id"] ?? frame["responseId"] ?? initial["id"] ?? null,
    model: frame["model"] ?? frame["modelVersion"] ?? initial["model"] ?? null,
    provider: frame["provider"] ?? null,
    usage: frame["usage"] ?? initial["usage"] ?? null,
    usageMetadata: frame["usageMetadata"] ?? null,
    finish: bodyShape(finish, "stop_reason"),
    error: frame["error"] === undefined ? null : redactSecretsFromText(JSON.stringify(frame["error"]), secrets),
    upstream: frame["debug"] === undefined ? null : bodyShape(frame["debug"]),
  };
}

function objectOf(value: JsonValue | undefined): JsonObject {
  const parsed = jsonObjectSchema.safeParse(value);
  return parsed.success ? parsed.data : {};
}
function objectsOf(value: JsonValue | undefined): JsonObject[] {
  return Array.isArray(value) ? value.map(objectOf) : [];
}
function textOf(frame: JsonObject): string {
  const delta = objectOf(frame["delta"]);
  const text: string[] = typeof delta["text"] === "string" ? [delta["text"]] : [];
  for (const choice of objectsOf(frame["choices"])) {
    const content = objectOf(choice["delta"])["content"];
    if (typeof content === "string") {
      text.push(content);
    }
  }
  for (const candidate of objectsOf(frame["candidates"])) {
    for (const part of objectsOf(objectOf(candidate["content"])["parts"])) {
      if (typeof part["text"] === "string") {
        text.push(part["text"]);
      }
    }
  }
  return text.join("");
}
function wireFacts(text: string, secrets: ProviderScrubSet): JsonObject {
  const frames = rawFrames(text);
  const reply = frames.map(textOf).join("");
  return {
    frames: frames.map((frame) => frameFacts(frame, secrets)),
    replyChars: reply.length,
    replySha256: hash(reply),
    bytes: Buffer.byteLength(text),
    sha256: hash(text),
  };
}

function firstNumber(values: readonly (JsonValue | undefined)[]): number | null {
  return values.find((value): value is number => typeof value === "number") ?? null;
}
function lastNumber(values: readonly (JsonValue | undefined)[]): number | null {
  return values.findLast((value): value is number => typeof value === "number") ?? null;
}
function resultSummary(result: JsonObject): JsonObject {
  const facts = objectOf(result["facts"]);
  const frames = objectsOf(facts["frames"]);
  const usages = frames.map((frame) => objectOf(frame["usage"]));
  const google = frames.map((frame) => objectOf(frame["usageMetadata"]));
  const input = firstNumber([...usages.map((usage) => usage["prompt_tokens"]), ...google.map((usage) => usage["promptTokenCount"])]);
  const read = firstNumber([
    ...usages.map((usage) => objectOf(usage["prompt_tokens_details"])["cached_tokens"]),
    ...usages.map((usage) => usage["cache_read_input_tokens"]),
    ...google.map((usage) => usage["cachedContentTokenCount"]),
  ]);
  const write = firstNumber([
    ...usages.map((usage) => objectOf(usage["prompt_tokens_details"])["cache_write_tokens"]),
    ...usages.map((usage) => usage["cache_creation_input_tokens"]),
  ]);
  const ordinary = firstNumber(usages.map((usage) => usage["input_tokens"]));
  const anthropicInput = ordinary !== null && read !== null && write !== null ? ordinary + read + write : null;
  const tokensIn = input ?? anthropicInput;
  const headers = objectOf(result["cacheHeaders"]);
  const ids = frames.map((frame) => frame["id"]).filter((id): id is string => typeof id === "string");
  return {
    generationId: headers["x-generation-id"] ?? ids[0] ?? null,
    responseCache: result["responseCache"] ?? null,
    providersObserved: [...new Set(frames.map((frame) => frame["provider"]).filter((provider): provider is string => typeof provider === "string"))],
    inputTokensReported: tokensIn,
    inputCountSource: input === null && anthropicInput !== null ? "sum-of-reported-anthropic-input-axes" : "reported-total-or-unknown",
    cacheReadTokensReported: read,
    cacheWriteTokensReported: write,
    outputTokensReported:
      firstNumber(usages.map((usage) => usage["completion_tokens"])) ??
      lastNumber(usages.map((usage) => usage["output_tokens"])) ??
      lastNumber(google.map((usage) => usage["candidatesTokenCount"])),
    totalTokensReported: firstNumber(usages.map((usage) => usage["total_tokens"])) ?? lastNumber(google.map((usage) => usage["totalTokenCount"])),
    cacheCounterAxesOverlap: tokensIn !== null && read !== null && write !== null ? read + write > tokensIn : null,
    costReported: firstNumber(usages.map((usage) => usage["cost"])),
    replyChars: facts["replyChars"] ?? null,
    replySha256: facts["replySha256"] ?? null,
    requestCacheEnabled: result["requestCacheEnabled"] ?? null,
    requestCacheRefresh: result["requestCacheRefresh"] ?? null,
  };
}

function scenarioVerdict(capture: Capture): object {
  const summaries = capture.results.map(resultSummary);
  const [cold = {}, warm = {}, third = {}] = summaries;
  const readPositive = summaries.some((summary) => typeof summary["cacheReadTokensReported"] === "number" && summary["cacheReadTokensReported"] > 0);
  const common = {
    kind: "scenario-verdict",
    scenario: capture.scenario.id,
    posts: capture.posts,
    identicalPreparedRetry: capture.bodies[0] === capture.bodies[1],
    thirdBodyChanged: capture.bodies[2] !== capture.bodies[1],
    summaries,
  };
  if (!capture.scenario.replay) {
    if (capture.bodies[2] === capture.bodies[1]) {
      throw new Error("The actual appended turn did not change its request body");
    }
    return {
      ...common,
      prefix: readPositive ? "observed-cache-read" : "bounded-miss-or-unconfirmed-eligibility",
      documentedMinimum: capture.scenario.minimum,
      sdkCountsAreNotWireAuthority: true,
    };
  }
  const coldCache = responseCacheSchema.nullable().parse(cold["responseCache"] ?? null);
  const warmCache = responseCacheSchema.nullable().parse(warm["responseCache"] ?? null);
  const identities =
    typeof cold["generationId"] === "string" &&
    typeof warm["generationId"] === "string" &&
    cold["generationId"] !== warm["generationId"] &&
    warmCache?.sourceGenerationId === cold["generationId"];
  const reportedCounters = [warm["inputTokensReported"], warm["outputTokensReported"], warm["totalTokensReported"]].filter(
    (value): value is number => typeof value === "number",
  );
  const zeroCounters = reportedCounters.length > 0 ? reportedCounters.every((value) => value === 0) : null;
  const free = warm["costReported"] === 0 || (warm["costReported"] === null && warmCache?.status === "hit");
  const fresh = third["requestCacheEnabled"] === "false" && third["requestCacheRefresh"] === null && objectOf(third["responseCache"])["status"] !== "hit";
  const nonemptyReplay = typeof warm["replyChars"] === "number" && warm["replyChars"] > 0 && warm["replySha256"] === cold["replySha256"];
  return {
    ...common,
    responseReplay:
      coldCache?.status === "miss" && warmCache?.status === "hit" && identities && zeroCounters && free && fresh && nonemptyReplay
        ? "confirmed-miss-hit-and-fresh-bypass"
        : "not-confirmed-see-wire-facts",
    identities,
    zeroCounters,
    reportedCounterCount: reportedCounters.length,
    free,
    fresh,
    nonemptyReplay,
  };
}

interface Capture {
  readonly scenario: Scenario;
  readonly key: string;
  secrets: ProviderScrubSet;
  posts: number;
  lost: boolean;
  readonly bodies: string[];
  readonly results: JsonObject[];
}

function scriptedResponse(url: URL, init: RequestInit | undefined, capture: Capture): Promise<Response> {
  const text = "READY";
  if (url.pathname.includes(":streamGenerateContent")) {
    const frame = {
      candidates: [{ content: { role: "model", parts: [{ text }] }, finishReason: "STOP" }],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 1, totalTokenCount: 11 },
    };
    return Promise.resolve(new Response(`data: ${JSON.stringify(frame)}\n\n`, { headers: { "content-type": "text/event-stream" } }));
  }
  const headers =
    capture.scenario.replay && new Headers(init?.headers).get("x-openrouter-cache") === "true"
      ? {
          "x-openrouter-cache-status": capture.posts === 1 ? "MISS" : "HIT",
          "x-openrouter-cache-source-id": "scripted-source",
          "x-openrouter-cache-age": "0",
          "x-openrouter-cache-ttl": "300",
        }
      : {};
  return scriptedSseFetch([url.pathname.endsWith("/messages") ? anthropicTextStream(text) : openAiTextStream(text)], [], headers)(url.href, init);
}

function networkResponse(input: Parameters<typeof fetch>[0], init: RequestInit | undefined, capture: Capture): Promise<Response> {
  const inherited = init?.signal === undefined || init.signal === null ? [] : [init.signal];
  return LIVE
    ? fetch(input, { ...init, signal: AbortSignal.any([...inherited, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]) })
    : scriptedResponse(new URL(String(input)), init, capture);
}

async function captureResponse(response: Response, capture: Capture, ordinal: number, init: RequestInit | undefined): Promise<void> {
  const raw = await response.clone().text();
  let facts: JsonObject;
  try {
    facts = wireFacts(raw, capture.secrets);
  } catch (error) {
    facts = {
      decoderError: redactSecretsFromText(String(error), capture.secrets),
      errorText: redactSecretsFromText(raw, capture.secrets).slice(0, ERROR_TEXT_CHARS),
      bytes: Buffer.byteLength(raw),
      sha256: hash(raw),
      frames: [],
    };
  }
  const result = jsonObjectSchema.parse({
    kind: "physical-post-result",
    scenario: capture.scenario.id,
    ordinal,
    status: response.status,
    cacheHeaders: Object.fromEntries(
      [...response.headers].filter(
        ([name]) => name.startsWith("x-openrouter-cache") || name === "request-id" || name === "x-request-id" || name === "x-generation-id",
      ),
    ),
    facts,
    responseCache: capture.scenario.provider === "openrouter" ? (responseCacheOf(Object.fromEntries(response.headers), capture.secrets) ?? null) : null,
    requestCacheEnabled: new Headers(init?.headers).get("x-openrouter-cache"),
    requestCacheRefresh: new Headers(init?.headers).get("x-openrouter-cache-clear"),
  });
  capture.results.push(result);
  append(result, capture.secrets);
}

async function executeCapturedPost(input: Parameters<typeof fetch>[0], init: RequestInit | undefined, capture: Capture): Promise<Response> {
  if (physicalPosts >= LIVE_POST_LIMIT || capture.posts >= SCENARIO_POST_LIMIT || sourceHash() !== FROZEN_SOURCE) {
    throw new ProviderError({ kind: "invalid", retryable: false, message: "Probe physical POST/source-freeze guard refused the request" });
  }
  const url = new URL(String(input));
  const bytes = typeof init?.body === "string" ? init.body : "";
  const body = jsonObjectSchema.parse(JSON.parse(bytes));
  capture.secrets = resolvedScrubSet({
    credential: { secret: capture.key },
    transport: { headers: Object.fromEntries(new Headers(init?.headers)), includeBody: body },
  });
  physicalPosts += 1;
  capture.posts += 1;
  capture.bodies.push(hash(bytes));
  const ordinal = physicalPosts;
  append(
    {
      kind: "physical-post-start",
      scenario: capture.scenario.id,
      ordinal,
      scenarioOrdinal: capture.posts,
      endpoint: `${url.origin}${url.pathname}`,
      stream: body["stream"] === true || url.pathname.includes(":streamGenerateContent"),
      bodySha256: hash(bytes),
      body: bodyShape(body),
      cacheHeaders: Object.fromEntries([...new Headers(init?.headers)].filter(([name]) => name.startsWith("x-openrouter-cache"))),
    },
    capture.secrets,
  );
  let response: Response;
  try {
    response = await networkResponse(input, init, capture);
    await captureResponse(response, capture, ordinal, init);
  } catch (error) {
    append({ kind: "physical-post-network-error", scenario: capture.scenario.id, ordinal, error: String(error) }, capture.secrets);
    throw error;
  }
  if (!capture.lost && response.ok) {
    capture.lost = true;
    append(
      {
        kind: "local-transfer-loss",
        scenario: capture.scenario.id,
        ordinal,
        reason: "Deliberate loss before SDK/UI first delta; the next attempt must be the same prepared body",
      },
      capture.secrets,
    );
    return Response.json({ error: { type: "overloaded_error", message: "Deliberate pre-commit transfer loss for cache probe" } }, { status: 503 });
  }
  return response;
}

function capturedFetch(capture: Capture): typeof fetch {
  return (input, init): Promise<Response> => {
    const url = new URL(String(input));
    if (!ALLOWED_HOSTS.has(url.hostname)) {
      return Promise.reject(new ProviderError({ kind: "invalid", retryable: false, message: "Probe refused a non-admitted endpoint" }));
    }
    if ((init?.method ?? "GET") === "POST") {
      return executeCapturedPost(input, init, capture);
    }
    return LIVE ? fetch(input, init) : Promise.resolve(Response.json({ data: [{ id: "qwen/qwen3-coder-plus", ["context_length"]: 1_000_000 }], models: [] }));
  };
}

async function runScenario(scenario: Scenario): Promise<void> {
  const key = LIVE ? scenario.keyNames.map(readEnvKey).find((value) => value.length > 0) : "scripted-probe-key";
  if (key === undefined) {
    append({ kind: "scenario-blocked", scenario: scenario.id, reason: "No configured existing credential" }, NO_PROVIDER_SECRETS);
    return;
  }
  const capture: Capture = {
    scenario,
    key,
    secrets: resolvedScrubSet({ credential: { secret: key }, transport: null }),
    posts: 0,
    lost: false,
    bodies: [],
    results: [],
  };
  let db: Db | undefined;
  let dir: string | undefined;
  const live = new AbortController();
  try {
    db = await freshDb();
    dir = await mkdtemp(join(tmpdir(), "orb-k-cache-probe-"));
    const host = await seedUser(db, { handle: castId("cacheprobehost") });
    const member = await seedUser(db, { handle: castId("cacheprobemember") });
    const principal = (user: typeof host): Principal => ({ userId: user.id, handle: user.handle, role: user.role, externalId: null, via: "header" });
    const hostPrincipal = principal(host);
    const memberPrincipal = principal(member);
    const frozenNow = Date.now();
    const app = await createServices({
      serverRestart: UNSUPERVISED_RESTART,
      share: NO_SHARE_RELAY,
      db,
      now: () => frozenNow,
      ownerId: host.id,
      secretBoxKey: randomBytes(SECRET_BOX_BYTES),
      casDir: join(dir, "cas"),
      variantDir: join(dir, "variants"),
      importStagingDir: join(dir, "staging"),
      sessionSecret: "cache-probe-session-secret-at-least-32-characters",
      providerSeams: { sdkFetch: capturedFetch(capture) },
    });
    const { services } = app;
    app.presence.connect(host.id, live.signal);
    await services.settings.updateUserSettingsSection({ principal: hostPrincipal, input: { section: "memory", patch: { enabled: false } } });
    const credential = await services.credentials.add({ principal: hostPrincipal, provider: scenario.provider, key });
    const connection = await services.connection.create({
      principal: hostPrincipal,
      providerId: scenario.provider,
      credentialId: credential.id,
      baseUrl: null,
      model: scenario.model,
      api: scenario.api,
      promptCache: scenario.settings,
    });
    await services.connection.setBinding({ principal: hostPrincipal, task: "chat", connectionId: connection.id });
    const reference = Array.from(
      { length: 360 },
      (_, index) =>
        `[${RUN}/${scenario.id}/${index}] Field note ${index}: the ashen road bends north past the salt weirs, and the ledger keeper records every toll paid in coin or in name.`,
    ).join("\n");
    const preset = await services.preset.create({
      userId: host.id,
      name: "Caching probe reference",
      kind: "custom",
      config: {
        ...DEFAULT_PROMPT_CONFIG,
        sections: [
          { type: "literal", id: "cache-reference", name: "Reference", role: "system", content: reference, enabled: true },
          ...DEFAULT_PROMPT_CONFIG.sections,
        ],
        params: { effort: "none", maxOutputTokens: 2048, advanced: { roleHandling: "strict" }, responseCache: { enabled: scenario.replay } },
      },
    });
    await services.settings.updateUserSettingsSection({ principal: hostPrincipal, input: { section: "seeds", patch: { defaultPresetId: preset.id } } });
    const resolved = await services.connection.resolveChatCacheContext({ principal: hostPrincipal });
    const effective = await services.preset.resolveEffective({ principal: hostPrincipal, id: preset.id });
    append(
      {
        kind: "applied-cache-readback",
        scenario: scenario.id,
        resolved,
        effective,
        settings: scenario.settings,
        effectiveFloor:
          resolved.capability.kind === "generation"
            ? clampRoleHandling(turnsLevelFor(resolved.capability.generation, "strict").roleHandlingFloor, "strict")
            : null,
      },
      capture.secrets,
    );
    const character = await services.character.create({
      principal: hostPrincipal,
      input: {
        handle: castId("cachekeeper"),
        name: "Keeper",
        description: "You keep the reference journal. Answer briefly.",
        greetings: [{ text: "The journal is ready. What would you like to know?" }],
      },
    });
    const { chat } = await services.chat.startChat({ principal: hostPrincipal, characterIds: [character.id], opening: "first-message" });
    const { token } = await services.chat.createInvite({ principal: hostPrincipal, chatId: chat.id, input: {} });
    await services.chat.redeemInvite({ principal: memberPrincipal, input: { token } });
    append(
      {
        kind: "scenario-start",
        scenario: scenario.id,
        model: scenario.model,
        api: scenario.api,
        cohort: "2H-1C",
        names: "default",
        requestedFloor: "strict",
        minimum: scenario.minimum,
        expectedPhysicalPosts: 3,
        sourceSha256: FROZEN_SOURCE,
        managedResources: false,
      },
      capture.secrets,
    );
    await services.chat.send({ principal: memberPrincipal, chatId: chat.id, content: "Acknowledge the journal with exactly READY. Do not call a tool." });
    append(
      { kind: "prepared-retry-identity", scenario: scenario.id, identical: capture.bodies[0] === capture.bodies[1], posts: capture.posts },
      capture.secrets,
    );
    if (capture.bodies.length !== 2 || capture.bodies[0] !== capture.bodies[1]) {
      throw new Error("The real prepared-request retry did not preserve exact body bytes");
    }
    if (scenario.replay) {
      const rows = await db
        .select({ id: messages.id })
        .from(messages)
        .where(and(eq(messages.chatId, chat.id), eq(messages.role, "assistant")))
        .orderBy(asc(messages.seq));
      const reply = rows.at(-1);
      if (reply === undefined) {
        throw new Error("The real app did not commit its generation");
      }
      await services.chat.swipe({ principal: hostPrincipal, chatId: chat.id, messageId: reply.id });
    } else {
      await services.chat.send({
        principal: memberPrincipal,
        chatId: chat.id,
        content: "New turn: confirm the journal is still available. Reply exactly READY.",
      });
    }
    const retained = await db
      .select({
        id: messageVariants.id,
        messageId: messageVariants.messageId,
        model: messageVariants.model,
        provider: messageVariants.provider,
        generationId: messageVariants.generationId,
        tokensIn: messageVariants.tokensIn,
        tokensOut: messageVariants.tokensOut,
        cacheReadTokens: messageVariants.cacheReadTokens,
        cacheWriteTokens: messageVariants.cacheWriteTokens,
        tokenProvenance: messageVariants.tokenProvenance,
        costUsd: messageVariants.costUsd,
        costProvenance: messageVariants.costProvenance,
        costDetails: messageVariants.costDetails,
        metadata: messageVariants.metadata,
        finishReason: messageVariants.finishReason,
      })
      .from(messageVariants)
      .innerJoin(messages, eq(messages.id, messageVariants.messageId))
      .where(eq(messages.chatId, chat.id));
    append(
      {
        kind: "retained-app-projection",
        scenario: scenario.id,
        baseline: "K uncombined; H ordered-leg/private response-cache retention pending",
        variants: retained,
      },
      capture.secrets,
    );
    append(scenarioVerdict(capture), capture.secrets);
    console.log(`${scenario.id}: complete (${capture.posts} physical POSTs)`);
  } catch (error) {
    append({ kind: "scenario-error", scenario: scenario.id, posts: capture.posts, message: String(error) }, capture.secrets);
    console.log(`${scenario.id}: error (${capture.posts} physical POSTs); see captured evidence`);
  } finally {
    live.abort();
    if (db !== undefined) {
      closeDb(db);
    }
    if (dir !== undefined) {
      await rm(dir, { recursive: true, force: true });
    }
  }
}

if (process.argv.includes("--report")) {
  const rows = readFileSync("scripts/probes/caching/results.jsonl", "utf8")
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => jsonObjectSchema.parse(JSON.parse(line)));
  const results = rows.filter((row) => row["kind"] === "physical-post-result");
  console.log(
    JSON.stringify(
      {
        kind: "offline-wire-summary",
        physicalPosts: results.length,
        results: results.map((row) => ({ run: row["run"], scenario: row["scenario"], ordinal: row["ordinal"], status: row["status"], ...resultSummary(row) })),
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

append(
  {
    kind: "battery-start",
    sourceSha256: FROZEN_SOURCE,
    physicalPostLimit: LIVE_POST_LIMIT,
    alreadySpent: physicalPosts,
    scenarios: SCENARIOS.map((scenario) => ({ id: scenario.id, expectedPhysicalPosts: SCENARIO_POST_LIMIT })),
  },
  NO_PROVIDER_SECRETS,
);
for (const scenario of SCENARIOS) {
  await runScenario(scenario);
}
append({ kind: "battery-complete", physicalPosts }, NO_PROVIDER_SECRETS);
console.log(`${LIVE ? "LIVE" : "SCRIPTED"} capture complete: ${physicalPosts}/${LIVE_POST_LIMIT} physical POSTs; ${OUT}`);
