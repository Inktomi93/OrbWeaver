// Pair-input evidence must not change ordinary text embedding requests on either hosted SDK dialect, and an
// embedder keeps every input its server's stated window takes.

import type { EmbeddingBatchObservation } from "@orb/contracts/embeddings";
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

test.for([
  { model: "", prompt: 2, total: 2, knownPrompt: 2, knownModel: null },
  { model: "served-model", prompt: -1, total: 2, knownPrompt: null, knownModel: "served-model" },
  { model: "served-model", prompt: 2.5, total: 3, knownPrompt: null, knownModel: "served-model" },
])("SDK-accepted optional embedding metadata keeps valid siblings for model $model / prompt $prompt", async ({
  model,
  prompt,
  total,
  knownPrompt,
  knownModel,
}) => {
  const capability = synthesizeCapability("embedding", "other", {
    curated: curatedRows({ providerId: providerIdSchema.parse("openrouter"), model: "openai/text-embedding-3-small" }),
  }).capability;
  const connection = fakeResolved({
    task: "embed",
    providerId: "openrouter",
    model: "openai/text-embedding-3-small",
    capability,
    secret: fakeApiKeySecret("fixture-key"),
  });
  const receipts: EmbeddingBatchObservation[] = [];
  const deps = fakeDeps();
  const result = await runOpenAiCompatEmbed(
    {
      connection,
      input: "lighthouse keeper",
      dimensions: 2,
      embeddingAccounting: {
        recordBatch: (receipt) => {
          receipts.push(receipt);
          return Promise.resolve();
        },
        finish: () => Promise.resolve(),
      },
    },
    {
      log: deps.log,
      transport: {
        app: deps.app,
        fetch: () =>
          Promise.resolve(
            Response.json({
              object: "list",
              model,
              data: [{ object: "embedding", index: 0, embedding: [1, 0] }],
              usage: { ["prompt_tokens"]: prompt, ["total_tokens"]: total, cost: 0.125 },
            }),
          ),
      },
    },
  );
  expect(result.usage).toEqual({ promptTokens: knownPrompt, totalTokens: total });
  expect(receipts).toHaveLength(1);
  expect(receipts[0]).toMatchObject({
    servedModel: knownModel,
    usage: { promptTokens: knownPrompt, totalTokens: total },
    cost: { costUsd: 0.125, costProvenance: "measured" },
  });
  expect(Array.from(result.vectors[0] ?? [])).toEqual([1, 0]);
});

test.for([undefined, "MISS"])("absent raw embedding usage with cache status %s remains unknown, never SDK-manufactured or inferred zero", async (status) => {
  const capability = synthesizeCapability("embedding", "other", {
    curated: curatedRows({ providerId: providerIdSchema.parse("openrouter"), model: "openai/text-embedding-3-small" }),
  }).capability;
  const connection = fakeResolved({
    task: "embed",
    providerId: "openrouter",
    model: "openai/text-embedding-3-small",
    capability,
    secret: fakeApiKeySecret("fixture-key"),
  });
  const receipts: EmbeddingBatchObservation[] = [];
  const deps = fakeDeps();
  const result = await runOpenAiCompatEmbed(
    {
      connection,
      input: "lighthouse keeper",
      dimensions: 2,
      embeddingAccounting: {
        recordBatch: (receipt) => {
          receipts.push(receipt);
          return Promise.resolve();
        },
        finish: () => Promise.resolve(),
      },
    },
    {
      log: deps.log,
      transport: {
        app: deps.app,
        fetch: () =>
          Promise.resolve(
            Response.json(
              { object: "list", model: "served-model", data: [{ object: "embedding", index: 0, embedding: [1, 0] }] },
              { headers: status === undefined ? {} : { "x-openrouter-cache-status": status } },
            ),
          ),
      },
    },
  );
  expect(result.usage.promptTokens).toBeNull();
  expect(result.usage.totalTokens).toBeNull();
  expect(receipts[0]?.cost).toEqual({ costUsd: null, costDetails: null, costProvenance: "unrecorded" });
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

test.for([true, false])("two real SDK embedding POSTs retain individual cache facts and complete-count knownness %s", async (complete) => {
  const capability = synthesizeCapability("embedding", "other", {
    curated: curatedRows({ providerId: providerIdSchema.parse("openrouter"), model: "openai/text-embedding-3-small" }),
  }).capability;
  const connection = fakeResolved({
    task: "embed",
    providerId: "openrouter",
    model: "openai/text-embedding-3-small",
    capability,
    secret: fakeApiKeySecret("fixture-key"),
    declaredFeatures: { embedBatch: { maxTokens: 1, floorTokensPerSec: 1 } },
  });
  const receipts: EmbeddingBatchObservation[] = [];
  const deps = fakeDeps();
  const paths: string[] = [];
  const result = await runOpenAiCompatEmbed(
    {
      connection,
      input: ["lighthouse keeper", "unrelated desert"],
      dimensions: 2,
      embeddingAccounting: {
        recordBatch: (receipt): Promise<void> => {
          receipts.push(receipt);
          return Promise.resolve();
        },
        finish: () => Promise.resolve(),
      },
    },
    {
      log: deps.log,
      transport: {
        app: deps.app,
        fetch: (input): Promise<Response> => {
          paths.push(new URL(String(input)).pathname);
          const first = paths.length === 1;
          const cache = first
            ? { status: "HIT", source: "opaque_first", count: 0, cost: 0 }
            : { status: "MISS", source: "opaque_second", count: 2, cost: 0.125 };
          return Promise.resolve(
            Response.json(
              {
                object: "list",
                model: "served-model",
                data: [{ object: "embedding", index: 0, embedding: [1, 0] }],
                ...(first || complete ? { usage: { prompt_tokens: cache.count, total_tokens: cache.count, cost: cache.cost } } : {}),
              },
              { headers: { "x-openrouter-cache-status": cache.status, "x-openrouter-cache-source-id": cache.source } },
            ),
          );
        },
      },
    },
  );
  expect(paths).toEqual(["/api/v1/embeddings", "/api/v1/embeddings"]);
  expect(result.usage).toEqual({ promptTokens: complete ? 2 : null, totalTokens: complete ? 2 : null });
  expect(receipts).toHaveLength(2);
  expect(receipts[0]).toMatchObject({
    inputCount: 1,
    usage: { promptTokens: 0, totalTokens: 0, responseCache: { status: "hit", sourceGenerationId: "opaque_first" } },
    cost: { costUsd: 0 },
  });
  expect(receipts[1]).toMatchObject({
    inputCount: 1,
    usage: { promptTokens: complete ? 2 : null, totalTokens: complete ? 2 : null, responseCache: { status: "miss", sourceGenerationId: "opaque_second" } },
    cost: { costUsd: complete ? 0.125 : null },
  });
  expect(result.vectors.map((vector) => Array.from(vector ?? []))).toEqual([
    [1, 0],
    [1, 0],
  ]);
});

test.for([
  { cost: -1, upstream: 0.125, byok: false, known: null },
  { cost: 0, upstream: 0, byok: true, known: 0 },
])("installed OR embedding SDK heals optional price $cost/upstream $upstream without losing batch counts", async ({ cost, upstream, byok, known }) => {
  const connection = fakeResolved({
    task: "embed",
    providerId: "openrouter",
    model: "openai/text-embedding-3-small",
    capability: synthesizeCapability("embedding", "other", {
      curated: curatedRows({ providerId: providerIdSchema.parse("openrouter"), model: "openai/text-embedding-3-small" }),
    }).capability,
    secret: fakeApiKeySecret("fixture-key"),
  });
  const receipts: EmbeddingBatchObservation[] = [];
  const deps = fakeDeps();
  let posts = 0;
  const result = await runOpenAiCompatEmbed(
    {
      connection,
      input: "lighthouse keeper",
      dimensions: 2,
      embeddingAccounting: {
        recordBatch: (receipt): Promise<void> => {
          receipts.push(receipt);
          return Promise.resolve();
        },
        finish: () => Promise.resolve(),
      },
    },
    {
      log: deps.log,
      transport: {
        app: deps.app,
        fetch: (): Promise<Response> => {
          posts += 1;
          return Promise.resolve(
            Response.json({
              object: "list",
              model: "served-model",
              data: [{ object: "embedding", index: 0, embedding: [1, 0] }],
              usage: { prompt_tokens: 10, total_tokens: 10, cost, is_byok: byok, cost_details: { upstream_inference_cost: upstream } },
            }),
          );
        },
      },
    },
  );
  expect(posts).toBe(1);
  expect(result.usage).toEqual({ promptTokens: 10, totalTokens: 10 });
  expect(receipts).toHaveLength(1);
  expect(receipts[0]).toMatchObject({
    servedModel: "served-model",
    usage: { promptTokens: 10, totalTokens: 10 },
    cost: { costUsd: known, costProvenance: known === null ? "unrecorded" : "measured" },
  });
  expect(Array.from(result.vectors[0] ?? [])).toEqual([1, 0]);
});
