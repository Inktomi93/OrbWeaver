import type { Task } from "@orb/contracts/inference";
import { z } from "zod";
import { createGoogleBackend } from "../../../../packages/inference/src/backends/google/index.ts";
import { curatedRows } from "../../../../packages/inference/src/capability/sources/curated/loader.ts";
import { synthesizeCapability } from "../../../../packages/inference/src/capability/synthesize.ts";
import type { GoogleChatRequest } from "../../../../packages/inference/src/contract/chat.ts";
import type { Resolved } from "../../../../packages/inference/src/contract/resolved.ts";
import { expect, test } from "../../../support/fixtures.ts";
import { testProviderId } from "../../../support/inference-identities.ts";
import { wireSchema } from "../../../support/wire-ready.ts";
import { fakeApiKeySecret, fakeDeps, fakeResolved } from "../../_support.ts";

const SIGNATURE = "signed-native-tool-fixture";
const NOW = 1_700_000_000_000;
function connection<T extends Task>(task: T, model = "gemini-3-flash-preview"): Resolved<T> {
  const kind = task === "embed" || task === "imageEmbed" ? "embedding" : "generation";
  const capability = synthesizeCapability(kind, "google", {
    curated: curatedRows({ model, providerId: testProviderId("google"), wire: "google-generative-ai" }),
  }).capability;
  return fakeResolved({ task, providerId: testProviderId("google"), model, capability, secret: fakeApiKeySecret("native-test-key") });
}
function request(): GoogleChatRequest {
  return {
    api: "google-generative-ai",
    connection: connection("chat"),
    params: { effort: "low", maxOutputTokens: 256 },
    systemPrompt: { static: "Use the tool.", dynamic: "" },
    history: [{ role: "user", content: [{ type: "text", text: "Weather?" }] }],
    tools: [{ name: "weather", description: "Weather", parameters: { type: "object", properties: { city: { type: "string" } } } }],
  };
}
function backend(fetchImpl: typeof fetch): ReturnType<typeof createGoogleBackend> {
  return createGoogleBackend({ now: () => NOW, log: fakeDeps().log, fetch: fetchImpl });
}
function sse(parts: readonly object[], finishReason = "STOP"): Response {
  const chunks: object[] = parts.map((part) => ({ candidates: [{ content: { role: "model", parts: [part] } }] }));
  chunks.push({
    candidates: [{ content: { role: "model", parts: [] }, finishReason }],
    usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 4, totalTokenCount: 14 },
  });
  return new Response(chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join(""), { headers: { "content-type": "text/event-stream" } });
}

test("native signed tool replay survives with reasoning carry disabled and never uses the SDK sentinel", async () => {
  const bodies: Record<string, unknown>[] = [];
  const fetchImpl: typeof fetch = (_url, init) => {
    bodies.push(z.record(z.string(), z.unknown()).parse(JSON.parse(String(init?.body))));
    return Promise.resolve(
      bodies.length === 1 ? sse([{ functionCall: { name: "weather", args: { city: "Paris" } }, thoughtSignature: SIGNATURE }]) : sse([{ text: "18 C" }]),
    );
  };
  const native = backend(fetchImpl);
  const req = request();
  const first = await native.runChatTurn({ ...req, params: { effort: "low", carryReasoning: "off" }, toolChoice: { mode: "required" } });
  expect(first.toolCalls?.[0]?.thoughtSignature).toBe(SIGNATURE);
  const calls = first.toolCalls ?? [];
  const second = await native.runChatTurn({
    ...req,
    history: [
      ...req.history,
      { role: "assistant", content: calls.map((call) => ({ type: "tool-call", ...call })) },
      { role: "tool", content: calls.map((call) => ({ type: "tool-result", toolCallId: call.toolCallId, content: "18 C" })) },
    ],
  });
  expect(second.reply).toBe("18 C");
  expect(bodies[1]?.["contents"]).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        role: "model",
        parts: [expect.objectContaining({ thoughtSignature: SIGNATURE, functionCall: expect.objectContaining({ name: "weather" }) })],
      }),
    ]),
  );
  expect(JSON.stringify(bodies[1])).not.toContain("skip_thought_signature_validator");
  expect(bodies[0]?.["generationConfig"]).toMatchObject({ thinkingConfig: { thinkingLevel: "low" } });
});

test("native text embeddings retain slots, request exact width, normalize and preserve model identity", async () => {
  let body: Record<string, unknown> = {};
  const native = backend((_url, init) => {
    body = z.record(z.string(), z.unknown()).parse(JSON.parse(String(init?.body)));
    return Promise.resolve(Response.json({ embeddings: [{ values: [3, 4, ...new Array(1022).fill(0)] }, { values: [0, 0, 5, ...new Array(1021).fill(0)] }] }));
  });
  const result = await native.embed({
    connection: connection("embed", "gemini-embedding-001"),
    input: ["first", " ", "last"],
    dimensions: 1024,
    inputType: "query",
  });
  expect(result.vectors[1]).toBeNull();
  expect(result.vectors[0]?.[0]).toBeCloseTo(0.6);
  expect(result.vectors[2]?.[2]).toBe(1);
  expect(result.model).toBe("gemini-embedding-001");
  expect(body["requests"]).toMatchObject([
    { outputDimensionality: 1024, taskType: "RETRIEVAL_QUERY", content: { parts: [{ text: "first" }] } },
    { outputDimensionality: 1024, content: { parts: [{ text: "last" }] } },
  ]);
});

test("embedding2 uses shared retrieval scaffolds and multimodal per-value parts without taskType", async () => {
  const bodies: Record<string, unknown>[] = [];
  const native = backend((_url, init) => {
    const body = z.record(z.string(), z.unknown()).parse(JSON.parse(String(init?.body)));
    bodies.push(body);
    const width = z.number().parse(body["outputDimensionality"]);
    return Promise.resolve(Response.json({ embedding: { values: [1, ...new Array(width - 1).fill(0)] } }));
  });
  await native.embed({ connection: connection("embed", "gemini-embedding-2"), input: "red square", inputType: "query", dimensions: 1024 });
  await native.imageEmbed({
    connection: connection("imageEmbed", "gemini-embedding-2"),
    input: { kind: "multimodal", input: { image: "data:image/png;base64,AQID", text: "red square" } },
  });
  expect(bodies[0]).toMatchObject({ content: { parts: [{ text: "task: search result | query: red square" }] }, outputDimensionality: 1024 });
  expect(bodies[0]).not.toHaveProperty("taskType");
  // A request that names no width is asked at the connection's stated width — the owner's space.
  expect(bodies[1]).toMatchObject({
    content: { parts: [{ text: "red square" }, { inlineData: { mimeType: "image/png", data: "AQID" } }] },
    outputDimensionality: 3072,
  });
  expect(bodies[1]).not.toHaveProperty("taskType");
});

test("wrong native embedding count or width refuses instead of filling or truncating silently", async () => {
  for (const payload of [{ embeddings: [{ values: new Array(1024).fill(1) }] }, { embeddings: [{ values: [1] }, { values: [1] }] }]) {
    const native = backend(() => Promise.resolve(Response.json(payload)));
    await expect(native.embed({ connection: connection("embed", "gemini-embedding-001"), input: ["one", "two"], dimensions: 1024 })).rejects.toMatchObject({
      kind: "invalid",
      retryable: false,
    });
  }
});

// A non-MRL model cannot be cut to a shorter width: its prefix is not an embedding. A vector wider than the
// connection states is refused rather than stored truncated.
test("a non-MRL embedder whose vectors disagree with its stated width is refused, never cut", async () => {
  const base = connection("embed", "gemini-embedding-001");
  if (base.capability.kind !== "embedding") {
    throw new Error("the curated Google embedder is an embedding model");
  }
  const nonMrl = { ...base, capability: { kind: "embedding" as const, embedding: { ...base.capability.embedding, dims: 512, mrl: false } } };
  const native = backend(() => Promise.resolve(Response.json({ embedding: { values: Array.from({ length: 768 }, (_v, i) => (i % 5) + 1) } })));
  await expect(native.embed({ connection: nonMrl, input: "hello" })).rejects.toMatchObject({ kind: "invalid", retryable: false });
});

test("native safety finish is a refusal event and an aborted call remains typed", async () => {
  const blocked = await backend(() => Promise.resolve(sse([], "SAFETY"))).runChatTurn(request());
  expect(blocked.finishReason).toBe("filter");
  expect(blocked.events).toContainEqual(expect.objectContaining({ kind: "refusal", category: "SAFETY" }));
  const controller = new AbortController();
  controller.abort("network timeout secret reason");
  await expect(
    backend((_url, init) => {
      init?.signal?.throwIfAborted();
      throw new Error("Unexpected fetch");
    }).runChatTurn({ ...request(), signal: controller.signal }),
  ).rejects.toMatchObject({ kind: "aborted", retryable: false });
});

test("native structured output uses JSON schema and summary safety refuses", async () => {
  let body: Record<string, unknown> = {};
  const native = backend((_url, init) => {
    body = z.record(z.string(), z.unknown()).parse(JSON.parse(String(init?.body)));
    return Promise.resolve(sse([{ text: '{"ok":true}' }]));
  });
  const result = await native.structured({
    connection: connection("structured"),
    inputs: [{ systemPrompt: "Extract", userPrompt: "yes" }],
    responseFormat: { name: "result", schema: wireSchema({ type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] }) },
  });
  expect(result.items[0]?.text).toBe('{"ok":true}');
  expect(body["generationConfig"]).toMatchObject({ responseMimeType: "application/json" });
  const refused = backend(() => Promise.resolve(sse([], "SAFETY")));
  await expect(refused.summarize({ connection: connection("summarize"), inputs: [{ systemPrompt: "Summarize", userPrompt: "text" }] })).rejects.toMatchObject({
    kind: "refused",
  });
});

test("responseJsonSchema carries the gemini-schema scrub: a length bound becomes the note, a numeric bound stays; oneOf is refused", async () => {
  let body: Record<string, unknown> = {};
  const native = backend((_url, init) => {
    body = z.record(z.string(), z.unknown()).parse(JSON.parse(String(init?.body)));
    return Promise.resolve(sse([{ text: '{"name":"a","n":2}' }]));
  });
  await native.structured({
    connection: connection("structured"),
    inputs: [{ systemPrompt: "Extract", userPrompt: "yes" }],
    responseFormat: {
      name: "result",
      schema: wireSchema({
        type: "object",
        properties: { name: { type: "string", minLength: 2 }, n: { type: "integer", minimum: 1 } },
        required: ["name", "n"],
      }),
    },
  });
  const sent = (body["generationConfig"] as { readonly responseJsonSchema: { readonly properties: Record<string, unknown> } }).responseJsonSchema;
  expect(sent.properties["name"]).toEqual({ type: "string", description: "[Constraints: minLength: 2]" });
  expect(sent.properties["n"]).toEqual({ type: "integer", minimum: 1 });

  let called = false;
  const refusing = backend(() => {
    called = true;
    return Promise.resolve(Response.json({}));
  });
  const failure = await (async (): Promise<unknown> =>
    refusing.structured({
      connection: connection("structured"),
      inputs: [{ systemPrompt: "Extract", userPrompt: "yes" }],
      responseFormat: {
        name: "result",
        schema: wireSchema({ type: "object", properties: { pick: { oneOf: [{ type: "string" }, { type: "integer" }] } }, required: ["pick"] }),
      },
    }))().catch((err: unknown) => err);
  expect(called).toBe(false);
  expect(failure).toMatchObject({
    detail: "schema_rejected",
    violations: expect.arrayContaining([expect.objectContaining({ kind: "refused-keyword", keyword: "oneOf" })]),
  });
});

test("native image generation and edit send reference bytes and reject unsupported masks", async () => {
  const bodies: Record<string, unknown>[] = [];
  const native = backend((_url, init) => {
    bodies.push(z.record(z.string(), z.unknown()).parse(JSON.parse(String(init?.body))));
    return Promise.resolve(
      Response.json({
        candidates: [
          { content: { parts: [{ inlineData: { mimeType: "image/png", data: "AQID" }, thoughtSignature: "image-signature" }] }, finishReason: "STOP" },
        ],
      }),
    );
  });
  const connectionValue = connection("generateImage", "gemini-2.5-flash-image");
  const result = await native.generateImage({
    connection: connectionValue,
    prompt: "Make it blue",
    edit: { image: "data:image/png;base64,AQID" },
    size: { width: 1024, height: 1024 },
  });
  expect(result.images[0]).toMatchObject({ base64: "AQID", mediaType: "image/png" });
  expect(bodies[0]?.["contents"]).toMatchObject([{ role: "user", parts: [{ text: "Make it blue" }, { inlineData: { mimeType: "image/png", data: "AQID" } }] }]);
  expect(bodies[0]?.["generationConfig"]).toMatchObject({ responseModalities: ["TEXT", "IMAGE"], imageConfig: { aspectRatio: "1:1" } });
  await expect(
    native.generateImage({ connection: connectionValue, prompt: "Edit", edit: { image: "data:image/png;base64,AQID", mask: "data:image/png;base64,AQID" } }),
  ).rejects.toMatchObject({ kind: "invalid" });
  expect(bodies).toHaveLength(1);
});

test("native assistant image and text parts replay their exact signatures in order", async () => {
  const bodies: Record<string, unknown>[] = [];
  const native = backend((_url, init) => {
    bodies.push(z.record(z.string(), z.unknown()).parse(JSON.parse(String(init?.body))));
    return Promise.resolve(
      bodies.length === 1
        ? sse([
            { text: "A square.", thoughtSignature: "text-proof" },
            { inlineData: { mimeType: "image/png", data: "AQID" }, thoughtSignature: "image-proof" },
          ])
        : sse([{ text: "Changed." }]),
    );
  });
  const req = { ...request(), connection: connection("chat", "gemini-3.1-flash-image-preview"), params: { replyMedia: "text+image" as const } };
  const first = await native.runChatTurn(req);
  expect(first.textSignatures).toEqual([{ text: "A square.", thoughtSignature: "text-proof" }]);
  expect(first.images?.[0]?.thoughtSignature).toBe("image-proof");
  await native.runChatTurn({
    ...req,
    history: [
      ...req.history,
      {
        role: "assistant",
        content: [
          { type: "text", text: "A square.", thoughtSignature: "text-proof" },
          { type: "image", url: "data:image/png;base64,AQID", thoughtSignature: "image-proof" },
        ],
      },
      { role: "user", content: [{ type: "text", text: "Change it." }] },
    ],
  });
  expect(bodies[1]?.["contents"]).toMatchObject([
    {},
    {
      role: "model",
      parts: [
        { text: "A square.", thoughtSignature: "text-proof" },
        { inlineData: { mimeType: "image/png", data: "AQID" }, thoughtSignature: "image-proof" },
      ],
    },
    { role: "user" },
  ]);
});

test("native measured prefill sends an actual model prefix and returns only its continuation", async () => {
  let body: Record<string, unknown> = {};
  const native = backend((_url, init) => {
    body = z.record(z.string(), z.unknown()).parse(JSON.parse(String(init?.body)));
    return Promise.resolve(sse([{ text: " ORBIT." }]));
  });
  const req = request();
  const result = await native.runChatTurn({
    ...req,
    history: [...req.history, { role: "assistant", content: [{ type: "text", text: "The secret word is" }] }],
  });
  expect(body["contents"]).toMatchObject([{}, { role: "model", parts: [{ text: "The secret word is" }] }]);
  expect(result.reply).toBe(" ORBIT.");
});

test("native version-specific thinking, sampler and role options pass through the real SDK", async () => {
  for (const [model, effort, expected] of [
    ["gemini-3-flash-preview", "minimal", { thinkingLevel: "minimal" }],
    ["gemini-3.8-flash", "none", { thinkingLevel: "low" }],
    ["gemini-3.1-pro-preview", "medium", { thinkingLevel: "medium" }],
    ["gemini-3-pro-preview", "none", { thinkingLevel: "low" }],
    ["gemini-3.1-flash-image-preview", "none", { thinkingLevel: "minimal" }],
    ["gemini-2.5-flash", "none", { thinkingBudget: 0 }],
  ] as const) {
    let body: Record<string, unknown> = {};
    const native = backend((_url, init) => {
      body = z.record(z.string(), z.unknown()).parse(JSON.parse(String(init?.body)));
      return Promise.resolve(sse([{ text: "ok" }]));
    });
    const turn = await native.runChatTurn({
      ...request(),
      connection: connection("chat", model),
      systemPrompt: { static: "Stable instructions.", dynamic: "Turn instructions." },
      params: { effort, temperature: 0.7, topP: 0.8, topK: 24, maxOutputTokens: 256, seed: 7, stop: ["STOP"] },
    });
    expect(body["generationConfig"], model).toMatchObject({
      thinkingConfig: expected,
      temperature: 0.7,
      topP: 0.8,
      topK: 24,
      maxOutputTokens: 256,
      seed: 7,
      stopSequences: ["STOP"],
    });
    expect(body["systemInstruction"], model).toEqual({ parts: [{ text: "Stable instructions.\n\nTurn instructions." }] });
    expect(body["contents"], model).toMatchObject([{ role: "user", parts: [{ text: "Weather?" }] }]);
    expect(turn.reply).toBe("ok");
  }
});

test("native unsupported samplers and controlled extras are reported instead of silently overriding the funnel", async () => {
  let body: Record<string, unknown> = {};
  const native = backend((_url, init) => {
    body = z.record(z.string(), z.unknown()).parse(JSON.parse(String(init?.body)));
    return Promise.resolve(sse([{ text: "ok" }]));
  });
  const req = request();
  const result = await native.runChatTurn({
    ...req,
    connection: {
      ...connection("chat", "gemini-2.5-flash"),
      extras: { thinkingConfig: { thinkingBudget: 1 }, mediaResolution: "MEDIA_RESOLUTION_LOW", unrecognized: true },
    },
    params: { effort: "none", frequencyPenalty: 0.5, presencePenalty: 0.5, minP: 0.1 },
  });
  expect(body["generationConfig"]).toMatchObject({ thinkingConfig: { thinkingBudget: 0 }, mediaResolution: "MEDIA_RESOLUTION_LOW" });
  expect(body["generationConfig"]).not.toHaveProperty("frequencyPenalty");
  expect(result.events).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ kind: "warning", knob: "frequencyPenalty" }),
      expect.objectContaining({ kind: "warning", key: "thinkingConfig" }),
      expect.objectContaining({ kind: "warning", key: "unrecognized" }),
    ]),
  );
});

test("a non-thinking image model omits thinking configuration and obeys text-only reply mode", async () => {
  let body: Record<string, unknown> = {};
  const native = backend((_url, init) => {
    body = z.record(z.string(), z.unknown()).parse(JSON.parse(String(init?.body)));
    return Promise.resolve(sse([{ text: "Description." }]));
  });
  await native.runChatTurn({ ...request(), connection: connection("chat", "gemini-2.5-flash-image"), params: { effort: "none", replyMedia: "text" } });
  expect(body["generationConfig"]).not.toHaveProperty("thinkingConfig");
  expect(body["generationConfig"]).toMatchObject({ responseModalities: ["TEXT"] });
  expect(body).not.toHaveProperty("tools");
});

test("native 2.5 positive budgets clamp per model and utility calls choose off or the mandatory minimum", async () => {
  for (const [model, min, max, utility] of [
    ["gemini-2.5-flash", 1, 24_576, 0],
    ["gemini-2.5-flash-lite", 512, 24_576, 0],
    ["gemini-2.5-pro", 128, 32_768, 128],
  ] as const) {
    const bodies: Record<string, unknown>[] = [];
    const native = backend((url, init) => {
      bodies.push(z.record(z.string(), z.unknown()).parse(JSON.parse(String(init?.body))));
      return Promise.resolve(
        String(url).includes("streamGenerateContent")
          ? sse([{ text: "ok" }])
          : Response.json({ candidates: [{ content: { parts: [{ text: "ok" }] }, finishReason: "STOP" }] }),
      );
    });
    for (const budget of [0, 40_000]) {
      await native.runChatTurn({
        ...request(),
        connection: connection("chat", model),
        params: { effort: "high", thinkingBudgetTokens: budget, maxOutputTokens: 65_536 },
      });
    }
    await native.summarize({ connection: connection("summarize", model), inputs: [{ systemPrompt: "Summarize", userPrompt: "text" }] });
    await native.structured({
      connection: connection("structured", model),
      inputs: [{ systemPrompt: "Extract", userPrompt: "text" }],
      responseFormat: { name: "answer", schema: wireSchema({ type: "object", properties: {} }) },
    });
    expect(
      bodies.map((body) => body["generationConfig"]),
      model,
    ).toMatchObject([
      { thinkingConfig: { thinkingBudget: min } },
      { thinkingConfig: { thinkingBudget: max } },
      { thinkingConfig: { thinkingBudget: utility } },
      { thinkingConfig: { thinkingBudget: utility } },
    ]);
  }
});

test("utility calls pay for mandatory thinking in maxOutputTokens; an off call keeps its visible cap", async () => {
  const cap = 128;
  for (const [model, budget, maxOutputTokens] of [
    ["gemini-2.5-pro", 128, cap + 128],
    ["gemini-2.5-flash", 0, cap],
  ] as const) {
    const bodies: Record<string, unknown>[] = [];
    const native = backend((_url, init) => {
      bodies.push(z.record(z.string(), z.unknown()).parse(JSON.parse(String(init?.body))));
      return Promise.resolve(sse([{ text: "ok" }]));
    });
    await native.summarize({
      connection: connection("summarize", model),
      inputs: [{ systemPrompt: "Pick", userPrompt: "text" }],
      effort: "none",
      maxTokens: cap,
    });
    expect(bodies[0]?.["generationConfig"], model).toMatchObject({ maxOutputTokens, thinkingConfig: { thinkingBudget: budget } });
  }
});

test("a Utility preset that sets only a thinking budget runs Gemini 2.5 at that budget, with room for it", async () => {
  const cap = 128;
  const budget = 2048;
  for (const model of ["gemini-2.5-pro", "gemini-2.5-flash"]) {
    const bodies: Record<string, unknown>[] = [];
    const native = backend((_url, init) => {
      bodies.push(z.record(z.string(), z.unknown()).parse(JSON.parse(String(init?.body))));
      return Promise.resolve(sse([{ text: "ok" }]));
    });
    await native.summarize({
      connection: connection("summarize", model),
      inputs: [{ systemPrompt: "Pick", userPrompt: "text" }],
      thinkingBudgetTokens: budget,
      maxTokens: cap,
    });
    expect(bodies[0]?.["generationConfig"], model).toMatchObject({ maxOutputTokens: cap + budget, thinkingConfig: { thinkingBudget: budget } });
  }
});

test("native cached-content references and implicit cache usage keep the shared accounting shape", async () => {
  for (const cachedContent of [undefined, "cachedContents/test-reference"]) {
    let body: Record<string, unknown> = {};
    const native = backend((_url, init) => {
      body = z.record(z.string(), z.unknown()).parse(JSON.parse(String(init?.body)));
      const chunk = {
        candidates: [{ content: { parts: [{ text: "ok" }] }, finishReason: "STOP" }],
        usageMetadata: { promptTokenCount: 5000, candidatesTokenCount: 2, cachedContentTokenCount: 4096, totalTokenCount: 5002 },
      };
      return Promise.resolve(new Response(`data: ${JSON.stringify(chunk)}\n\n`, { headers: { "content-type": "text/event-stream" } }));
    });
    const req = request();
    const result = await native.runChatTurn({ ...req, connection: { ...req.connection, extras: cachedContent === undefined ? null : { cachedContent } } });
    expect(body["cachedContent"]).toBe(cachedContent);
    expect(body).not.toHaveProperty("cache_control");
    expect(result.usage).toMatchObject({ tokensIn: 5000, cacheReadTokens: 4096, cacheWriteTokens: 0 });
  }
});
