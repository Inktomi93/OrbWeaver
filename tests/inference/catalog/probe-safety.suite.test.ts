// The per-model probes load or wake a model (Ollama's render-only chat loads before it checks render-only), so a
// plain listing never runs them and the resolve warm runs them for the connection's own model only, releasing it
// at once. And neither new fetch follows a redirect (host pin #25): a 3xx would replay the transport headers and
// a POST body to another origin, and that origin's answer would decide the shared detect cache.

import { createInferenceRuntime } from "@orb/inference";
import { NO_PROVIDER_SECRETS } from "../../../packages/inference/src/backends/kit/sanitize.ts";
import { detectServer } from "../../../packages/inference/src/catalog/detect.ts";
import { fetchEndpointModels } from "../../../packages/inference/src/catalog/endpoint.ts";
import { principal } from "../../support/factories/principal.ts";
import { expect, test } from "../../support/fixtures.ts";
import { fakeConnection, fakeDeps, memoryStores, newUserId } from "../_support.ts";
import { localServerFetch, transcriptFetch } from "./_local-servers-fetch.ts";

const BASE_URL = "http://127.0.0.1:1/v1";
const ELSEWHERE = "http://elsewhere.test/";
const RENDERED = { ["_debug_info"]: { ["rendered_template"]: "<|im_start|>assistant\nPREFILLMARK" } };

interface Posted {
  readonly url: string;
  readonly body: Record<string, unknown>;
}

/** The rig's Ollama, with every `/api/chat` POST recorded. */
function ollamaRecording(chats: Posted[]): typeof fetch {
  const inner = localServerFetch("ollama", { "api-chat": RENDERED });
  return ((input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    if (String(input).endsWith("/api/chat")) {
      chats.push({ url: String(input), body: JSON.parse(String(init?.body)) as Record<string, unknown> });
    }
    return inner(input, init);
  }) as typeof fetch;
}

test("listing an Ollama server's models for the add flow renders none of them", async () => {
  const chats: Posted[] = [];
  const stores = memoryStores();
  const runtime = await createInferenceRuntime(fakeDeps({ stores, fetch: ollamaRecording(chats) }));
  const listing = await runtime.catalogs.models({
    principal: principal(newUserId()),
    providerId: "ollama" as never,
    secret: { credentialId: null },
    baseUrl: BASE_URL,
  });
  expect(listing.listed).toBe(true);
  expect(chats).toEqual([]);
});

test("a cold-mirror resolve renders the connection's own model once, and releases it", async () => {
  const chats: Posted[] = [];
  const stores = memoryStores();
  const ownerId = newUserId();
  const row = fakeConnection({ ownerId, providerId: "ollama", model: "qwen2.5:0.5b", baseUrl: BASE_URL });
  stores.connections.rows.set(row.id, row);
  const runtime = await createInferenceRuntime(fakeDeps({ stores, fetch: ollamaRecording(chats) }));
  const { resolved } = await runtime.resolve({ task: "chat", principal: principal(ownerId), connectionId: row.id });
  expect(chats).toHaveLength(1);
  expect(chats[0]?.body).toMatchObject({ model: "qwen2.5:0.5b", ["_debug_render_only"]: true, stream: false, ["keep_alive"]: 0 });
  expect(resolved.capability).toMatchObject({ kind: "generation", generation: { turns: { assistantPrefill: true } } });
});

/** A fetch that does what a WHATWG fetch does with a redirecting server: follow it unless told `manual`. */
function redirecting(calls: string[], landing: unknown): typeof fetch {
  return ((input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    calls.push(String(input));
    if (init?.redirect !== "manual") {
      calls.push(ELSEWHERE);
      return Promise.resolve(Response.json(landing));
    }
    return Promise.resolve(new Response(null, { status: 307, headers: { location: ELSEWHERE } }));
  }) as typeof fetch;
}

test("a redirecting server is no answer to detection: one request per probe, none to the other origin", async () => {
  const calls: string[] = [];
  const verdict = await detectServer({ fetch: redirecting(calls, { result: "KoboldCpp" }), baseUrl: BASE_URL, secret: "sk-test" });
  expect(verdict).toEqual({ server: null });
  expect(calls).toHaveLength(4);
  expect(calls).not.toContain(ELSEWHERE);
});

test("a redirecting server is no answer to a model probe either", async () => {
  const calls: string[] = [];
  const recorded = transcriptFetch("llamacpp-embed");
  const posts = redirecting(calls, { error: { code: 400, message: '"input" or "content" must be provided' } });
  const fetchImpl = ((input: string | URL | Request, init?: RequestInit): Promise<Response> =>
    init?.method === "POST" ? posts(input, init) : recorded(input, init)) as typeof fetch;
  const rows = await fetchEndpointModels({
    fetch: fetchImpl,
    baseUrl: BASE_URL,
    secret: "sk-test",
    secrets: NO_PROVIDER_SECRETS,
    modelInfoApi: "llama-cpp",
    probeModel: "/models/nomic-embed-text-v1.5.Q8_0.gguf",
  });
  expect(calls).not.toContain(ELSEWHERE);
  expect(rows[0]?.kind).toBeUndefined();
});

test.each([
  { server: "koboldcpp", path: "/api/extra/version", answer: { result: "KoboldCpp", version: "future" }, requests: 1 },
  { server: "llama-cpp", path: "/props", answer: { build_info: "build", unrelated: true }, requests: 2 },
  { server: "ollama", path: "/api/version", answer: { version: "0.35.1", unrelated: true }, requests: 3 },
  { server: "vllm", path: "/v1/models", answer: { data: [{ owned_by: "vllm", id: "model" }] }, requests: 4 },
] as const)("detection retains the concrete $server identity schema and ordered first-match behavior", async (fixture) => {
  const calls: string[] = [];
  const fetchImpl = ((input: string | URL | Request): Promise<Response> => {
    const url = String(input);
    calls.push(url);
    return Promise.resolve(Response.json(url.endsWith(fixture.path) ? fixture.answer : {}));
  }) as typeof fetch;
  expect(await detectServer({ fetch: fetchImpl, baseUrl: BASE_URL, secret: null })).toEqual({ server: fixture.server });
  expect(calls).toHaveLength(fixture.requests);
  expect(calls.at(-1)).toBe(`http://127.0.0.1:1${fixture.path}`);
});

test("coincident fields with malformed native identities do not detect a server", async () => {
  const fetchImpl = (() => Promise.resolve(Response.json({ result: "foreign", build_info: 1, version: 1, data: [{ owned_by: "foreign" }] }))) as typeof fetch;
  expect(await detectServer({ fetch: fetchImpl, baseUrl: BASE_URL, secret: null })).toEqual({ server: null });
});
