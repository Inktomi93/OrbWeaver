// Pair-input evidence must not change ordinary text embedding requests on either hosted SDK dialect, and an
// embedder keeps every input its server's stated window takes.
import { providerIdSchema } from "@orb/contracts/inference";
import { createInferenceRuntime } from "@orb/inference";
import { runOpenAiCompatEmbed } from "../../../../packages/inference/src/backends/openai-compat/embed.ts";
import { curatedRows } from "../../../../packages/inference/src/capability/sources/curated/loader.ts";
import { synthesizeCapability } from "../../../../packages/inference/src/capability/synthesize.ts";
import type { Resolved } from "../../../../packages/inference/src/contract/resolved.ts";
import type { InferenceLog } from "../../../../packages/inference/src/contract/runtime.ts";
import { principal } from "../../../support/factories/principal.ts";
import { expect, test } from "../../../support/fixtures.ts";
import { fakeApiKeySecret, fakeConnection, fakeDeps, fakeResolved, memoryStores, newUserId } from "../../_support.ts";
import type { RecordedRequest } from "../_hosted-support.ts";
import { scriptedJsonFetch } from "../_hosted-support.ts";

test.each([undefined, "true", "false"])("OpenRouter embedding replay header %s reaches the physical embeddings endpoint", async (enabled) => {
  const model = "openai/text-embedding-3-small";
  const capability = synthesizeCapability("embedding", "other", {
    curated: curatedRows({ providerId: providerIdSchema.parse("openrouter"), model }),
  }).capability;
  const connection = fakeResolved({
    task: "embed",
    providerId: "openrouter",
    model,
    capability,
    secret: fakeApiKeySecret("test-key"),
    transport: { headers: { "X-Trace-Control": "kept", ...(enabled !== undefined ? { "X-OpenRouter-Cache": enabled } : {}) } },
  });
  const requests: Request[] = [];
  const sdkFetch: typeof fetch = (input, init) => {
    requests.push(new Request(input, init));
    return Promise.resolve(
      Response.json({ object: "list", model, data: [{ object: "embedding", index: 0, embedding: [3, 4] }], usage: { prompt_tokens: 2, total_tokens: 2 } }),
    );
  };
  const deps = fakeDeps();
  const result = await runOpenAiCompatEmbed(
    { connection, input: "lighthouse keeper", dimensions: 2 },
    { log: deps.log, transport: { fetch: sdkFetch, app: deps.app } },
  );
  expect(Array.from(result.vectors[0] ?? [])).toEqual([expect.closeTo(0.6), expect.closeTo(0.8)]);
  expect(requests).toHaveLength(1);
  const request = requests[0];
  expect(new URL(request?.url ?? "").pathname).toBe("/api/v1/embeddings");
  expect(request?.method).toBe("POST");
  expect(request?.headers.get("x-openrouter-cache")).toBe(enabled ?? "false");
  expect(request?.headers.has("x-openrouter-cache-clear")).toBe(false);
  expect(request?.headers.get("x-trace-control")).toBe("kept");
  expect(await request?.json()).toMatchObject({ model, input: ["lighthouse keeper"], dimensions: 2 });
});

test.each([
  { providerId: "openai", model: "text-embedding-3-small" },
  { providerId: "openrouter", model: "openai/text-embedding-3-small" },
])("$providerId text embeddings keep their existing input and provider model stamp", async ({ providerId, model }) => {
  const capability = synthesizeCapability("embedding", "other", { curated: curatedRows({ providerId: providerIdSchema.parse(providerId), model }) }).capability;
  const connection = fakeResolved({ task: "embed", providerId, model, capability, secret: fakeApiKeySecret("test-key") });
  const recorded: RecordedRequest[] = [];
  const fetch = scriptedJsonFetch(
    [JSON.stringify({ object: "list", model, data: [{ object: "embedding", index: 0, embedding: [3, 4] }], usage: { prompt_tokens: 2, total_tokens: 2 } })],
    recorded,
  );
  const deps = fakeDeps();
  const result = await runOpenAiCompatEmbed({ connection, input: "lighthouse keeper", dimensions: 2 }, { log: deps.log, transport: { fetch, app: deps.app } });
  expect(recorded).toHaveLength(1);
  expect(recorded[0]?.body).toMatchObject({ model, input: ["lighthouse keeper"], dimensions: 2 });
  expect(recorded[0]?.body).not.toHaveProperty("messages");
  expect(result.model).toBe(model);
  expect(Array.from(result.vectors[0] ?? [])).toEqual([expect.closeTo(0.6), expect.closeTo(0.8)]);
});

/** An OpenAI-compatible server whose list states one embedder's window; records each `/v1/embeddings` body. */
function windowedEmbedServer(window: number): { readonly fetch: typeof fetch; readonly posted: { readonly input: readonly string[] }[] } {
  const posted: { readonly input: readonly string[] }[] = [];
  const fetchImpl: typeof fetch = (input, init) => {
    const path = new URL(String(input)).pathname;
    if (path === "/v1/models") {
      return Promise.resolve(Response.json({ data: [{ id: "private-embed", ["context_length"]: window }] }));
    }
    if (path === "/v1/embeddings") {
      posted.push(JSON.parse(String(init?.body)) as { readonly input: readonly string[] });
      return Promise.resolve(Response.json({ data: [{ index: 0, embedding: [1, 0, 0] }], usage: { ["prompt_tokens"]: 1, ["total_tokens"]: 1 } }));
    }
    return Promise.resolve(Response.json({ error: "not found" }, { status: 404 }));
  };
  return { fetch: fetchImpl, posted };
}

async function resolvedPrivateEmbedder(
  server: ReturnType<typeof windowedEmbedServer>,
): Promise<{ readonly connection: Resolved<"embed">; readonly deps: ReturnType<typeof fakeDeps> }> {
  const stores = memoryStores();
  const ownerId = newUserId();
  const row = fakeConnection({
    ownerId,
    providerId: "custom-openai",
    model: "private-embed",
    baseUrl: "http://embed.test",
    declared: { kind: "embedding", embedding: { dims: 3 }, features: { detectServer: false } },
  });
  stores.connections.rows.set(row.id, row);
  const deps = fakeDeps({ stores, fetch: server.fetch });
  const runtime = await createInferenceRuntime(deps);
  const { resolved } = await runtime.resolve({ task: "embed", principal: principal(ownerId), connectionId: row.id });
  if (!isEmbedTask(resolved)) {
    throw new Error(`resolved for ${resolved.task}, not embed`);
  }
  return { connection: resolved, deps };
}

function isEmbedTask(resolved: Resolved): resolved is Resolved<"embed"> {
  return resolved.task === "embed";
}

test("an embedder whose server states its window keeps every input that fits it", async () => {
  const server = windowedEmbedServer(8192);
  const { connection, deps } = await resolvedPrivateEmbedder(server);
  expect(connection.capability.kind === "embedding" && connection.capability.embedding).toMatchObject({ maxInputTokens: 8192 });
  expect(connection.capability.kind === "embedding" && connection.capability.embedding.windowEstimated).toBeFalsy();
  const input = "alpha beta gamma delta ".repeat(300);

  await runOpenAiCompatEmbed({ connection, input }, { log: deps.log, transport: { fetch: server.fetch, app: deps.app } });

  expect(server.posted[0]?.input[0]).toBe(input);
});

test("an input past the stated window is cut to it, and the cut is reported", async () => {
  const server = windowedEmbedServer(8192);
  const lines: { readonly level: string; readonly fields: Readonly<Record<string, unknown>> }[] = [];
  const record =
    (level: string): InferenceLog["warn"] =>
    (fields): void => {
      lines.push({ level, fields });
    };
  const log: InferenceLog = { debug: record("debug"), info: record("info"), warn: record("warn"), error: record("error") };
  const { connection, deps } = await resolvedPrivateEmbedder(server);
  const input = "alpha beta gamma delta ".repeat(3000);

  await runOpenAiCompatEmbed({ connection, input }, { log, transport: { fetch: server.fetch, app: deps.app } });

  const sent = server.posted[0]?.input[0] ?? "";
  expect(sent.length).toBeLessThan(input.length);
  expect(input.startsWith(sent)).toBe(true);
  expect(lines.find((line) => line.level === "warn")?.fields).toMatchObject({
    event: "provider.embed-clamped",
    chars: input.length,
    clampedToChars: sent.length,
  });
});
