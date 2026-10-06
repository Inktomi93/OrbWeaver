// Live Google image and embedding roles through disposable production composition, never the owner's database.
// Evidence retains configuration, provider usage and validated read-back, but no credentials or HTTP headers.

import assert, { deepStrictEqual, strictEqual } from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { appendFileSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import type { Principal } from "@orb/contracts/identity";
import { characterEmbeddings, embeddingCalls } from "@orb/db";
import type { CharacterHandle, Handle, UserConnectionId, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { sniffMime } from "@orb/kit/image-sniff";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { createServices, NO_SHARE_RELAY, UNSUPERVISED_RESTART } from "../../../packages/server/src/entry/compose/index.ts";
import { createImageAdapter } from "../../../packages/server/src/infra/image/index.ts";
import { freshDb } from "../../../tests/support/db.ts";
import { seedUser } from "../../../tests/support/factories/user.ts";
import { readEnvKey } from "../openrouter/_kit.ts";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const RESULTS = readEnvKey("GEMINI_ROLE_RESULTS") || path.join(DIR, "gemini-role-results.jsonl");
const KEY = readEnvKey("GEMINI_PROBE_KEY");
assert(KEY.length > 0, "GEMINI_PROBE_KEY is not set");
const RUN_SUFFIX_LENGTH = 8;
const SECRET_BOX_KEY_BYTES = 32;
const HTTP_OK = 200;
const NORM_TOLERANCE = 0.000_01;
const CORPUS_SIZE = 2;
const RUN = mintTypeId(ID_PREFIX.chatTurn).slice(-RUN_SUFFIX_LENGTH);
const HEAD = execFileSync("git", ["rev-parse", "HEAD"], { cwd: DIR, encoding: "utf8" }).trim();
const OWNER = castId<UserId>(`user_gemini_roles_${RUN}`);
const WIDTH = 768;
const EMBEDDING_MODEL = "gemini-embedding-2";
const IMAGE_MODELS = ["gemini-3.1-flash-image", "gemini-3-pro-image"] as const;
const ROOT = mkdtempSync(path.join(tmpdir(), "h-gemini-roles-"));
const principal: Principal = { userId: OWNER, role: "owner", handle: castId<Handle>("gemini_roles_owner"), externalId: null, via: "header" };
const usageSchema = z.object({
  promptTokenCount: z.number().optional(),
  candidatesTokenCount: z.number().optional(),
  thoughtsTokenCount: z.number().optional(),
  totalTokenCount: z.number().optional(),
  cachedContentTokenCount: z.number().optional(),
  toolUsePromptTokenCount: z.number().optional(),
  promptTokensDetails: z.array(z.object({ modality: z.string(), tokenCount: z.number() })).optional(),
  cacheTokensDetails: z.array(z.object({ modality: z.string(), tokenCount: z.number() })).optional(),
  candidatesTokensDetails: z.array(z.object({ modality: z.string(), tokenCount: z.number() })).optional(),
});
const embeddingResponseSchema = z.object({ values: z.array(z.number()) });
const responseSchema = z
  .object({
    modelVersion: z.string().optional(),
    usageMetadata: usageSchema.optional(),
    embedding: embeddingResponseSchema.optional(),
    embeddings: z.array(embeddingResponseSchema).optional(),
  })
  .transform(({ modelVersion, usageMetadata, embedding, embeddings }) => ({
    modelVersion,
    usageMetadata,
    vectorWidths: [...(embedding === undefined ? [] : [embedding.values.length]), ...(embeddings ?? []).map((value) => value.values.length)],
  }));
const contentSummarySchema = z
  .object({
    parts: z.array(
      z.object({
        inlineData: z.object({ mimeType: z.string(), data: z.string().min(1) }).optional(),
      }),
    ),
  })
  .transform(({ parts }) => ({ imageParts: parts.filter((part) => part.inlineData?.mimeType.startsWith("image/") === true).length }));
const requestSchema = z.object({
  generationConfig: z
    .object({
      responseModalities: z.array(z.string()).optional(),
      imageConfig: z.object({ aspectRatio: z.string().optional(), imageSize: z.string().optional() }).optional(),
    })
    .optional(),
  outputDimensionality: z.number().optional(),
  taskType: z.string().optional(),
  content: contentSummarySchema.optional(),
  requests: z
    .array(z.object({ outputDimensionality: z.number().optional(), taskType: z.string().optional(), content: contentSummarySchema.optional() }))
    .optional(),
});
const calls: {
  model: string;
  status: number;
  ms: number;
  config: z.infer<typeof requestSchema> | null;
  usage: z.infer<typeof usageSchema> | null;
  modelVersion: string | null;
  vectorWidths: readonly number[];
  error: string | null;
}[] = [];

function row(fields: object): void {
  appendFileSync(RESULTS, `${JSON.stringify({ run: RUN, at: new Date().toISOString(), head: HEAD, ...fields })}\n`);
}

const observedFetch: typeof fetch = async (input, init) => {
  const started = performance.now();
  const url = typeof input === "string" || input instanceof URL ? String(input) : input.url;
  const model = /\/models\/([^/:?]+):/u.exec(url)?.[1] ?? "catalog";
  const config = typeof init?.body === "string" ? requestSchema.safeParse(JSON.parse(init.body)) : null;
  const response = await globalThis.fetch(input, init);
  const text = await response.clone().text();
  const parsed = response.ok ? responseSchema.safeParse(JSON.parse(text)) : null;
  calls.push({
    model,
    status: response.status,
    ms: Math.round(performance.now() - started),
    config: config?.success === true ? config.data : null,
    usage: parsed?.success === true ? (parsed.data.usageMetadata ?? null) : null,
    modelVersion: parsed?.success === true ? (parsed.data.modelVersion ?? null) : null,
    vectorWidths: parsed?.success === true ? parsed.data.vectorWidths : [],
    error: response.ok ? null : text.replaceAll(KEY, "[redacted]"),
  });
  return response;
};

const db = await freshDb();
const app = await createServices({
  db,
  ownerId: OWNER,
  now: () => Date.now(),
  secretBoxKey: randomBytes(SECRET_BOX_KEY_BYTES),
  sessionSecret: "gemini-roles-disposable-session",
  casDir: path.join(ROOT, "cas"),
  variantDir: path.join(ROOT, "variants"),
  importStagingDir: path.join(ROOT, "staging"),
  serverRestart: UNSUPERVISED_RESTART,
  share: NO_SHARE_RELAY,
  providerSeams: { sdkFetch: observedFetch },
});
await seedUser(db, { id: OWNER, handle: principal.handle, role: "owner" });
const credential = await app.services.credentials.add({ principal, provider: "google", key: KEY });
const imageAdapter = createImageAdapter();
let imageBytes: Uint8Array | null = null;
let failures = 0;

for (const model of IMAGE_MODELS) {
  const mark = calls.length;
  try {
    const connection = await app.services.connection.create({ principal, providerId: "google", model, credentialId: credential.id, baseUrl: null });
    await app.services.connection.setBinding({ principal, task: "generateImage", connectionId: connection.id });
    const resolved = await app.runtime.resolve({ task: "generateImage", principal });
    const picture = await app.services.imagery.generatePicture({
      caller: principal,
      mode: "free",
      prompt: "One bright yellow banana on a plain cobalt blue background. Simple flat vector poster. No text, no people.",
      n: 1,
      size: "square",
    });
    strictEqual(picture.images.length, 1);
    const image = picture.images[0];
    assert(image !== undefined);
    const stored = await app.assets.readOwnedAssetBytes(principal, image.assetId);
    const info = await imageAdapter.probe(stored.bytes);
    strictEqual(sniffMime(stored.bytes), stored.mime);
    assert(info.width > 0 && info.height > 0);
    await imageAdapter.transform(stored.bytes, { format: "png" });
    const provenance = await app.services.imagery.readProvenance({ caller: principal, assetId: image.assetId });
    assert(provenance !== null);
    const response = calls.slice(mark).find((call) => call.model === model && call.status === HTTP_OK);
    assert(response !== undefined);
    strictEqual(provenance.usage.servedModel, response.modelVersion);
    strictEqual(provenance.usage.tokensIn, response.usage?.promptTokenCount ?? null);
    const promptTokens = response.usage?.promptTokenCount;
    const totalTokens = response.usage?.totalTokenCount;
    strictEqual(provenance.usage.tokensOut, promptTokens !== undefined && totalTokens !== undefined ? totalTokens - promptTokens : null);
    strictEqual(provenance.usage.reasoningTokens, response.usage?.thoughtsTokenCount ?? null);
    strictEqual(provenance.usage.cacheReadTokens, response.usage?.cachedContentTokenCount ?? null);
    if (response.usage?.promptTokensDetails !== undefined) {
      deepStrictEqual(
        provenance.usage.tokenDetails?.input,
        response.usage.promptTokensDetails.map((detail) => ({ modality: detail.modality.toLowerCase(), tokens: detail.tokenCount })),
      );
    }
    if (response.usage?.candidatesTokensDetails !== undefined) {
      deepStrictEqual(
        provenance.usage.tokenDetails?.output,
        response.usage.candidatesTokensDetails.map((detail) => ({ modality: detail.modality.toLowerCase(), tokens: detail.tokenCount })),
      );
    }
    strictEqual(provenance.costUsd, null);
    strictEqual(provenance.usage.costProvenance, "unrecorded");
    const saved = path.join(ROOT, `${model}.${info.format}`);
    mkdirSync(ROOT, { recursive: true });
    writeFileSync(saved, stored.bytes);
    imageBytes = stored.bytes;
    row({
      kind: "image",
      model,
      pass: true,
      connectionId: connection.id,
      capability: resolved.resolved.capability,
      imageRole: "generateImage",
      picture,
      bytes: stored.bytes.length,
      mime: stored.mime,
      info,
      saved,
      provenance,
      calls: calls.slice(mark),
    });
    console.log(`${model}: PASS stored ${stored.bytes.length} bytes ${info.format} ${info.width}x${info.height}`);
  } catch (error) {
    failures += 1;
    const message = String(error).replaceAll(KEY, "[redacted]");
    row({ kind: "image", model, pass: false, error: message, calls: calls.slice(mark) });
    console.log(`${model}: FAIL ${message}`);
  }
}

const mark = calls.length;
try {
  const relevant = await app.services.character.create({
    principal,
    input: {
      handle: castId<CharacterHandle>("gemini-banana-grower"),
      name: "Banana Grower",
      description: "A tropical fruit farmer who grows ripe yellow bananas, harvests banana bunches and ships fruit from the plantation.",
    },
  });
  const unrelated = await app.services.character.create({
    principal,
    input: {
      handle: castId<CharacterHandle>("gemini-quantum-physicist"),
      name: "Quantum Physicist",
      description: "A theoretical physicist who studies electron spin, quantum wave functions and superconducting laboratory circuits.",
    },
  });
  const connection = await app.services.connection.create({
    principal,
    providerId: "google",
    model: EMBEDDING_MODEL,
    credentialId: credential.id,
    baseUrl: null,
    allowBackground: true,
    declared: { embedding: { dims: WIDTH } },
  });
  await app.services.connection.setBinding({ principal, task: "embed", connectionId: connection.id });
  const resolved = await app.runtime.resolve({ task: "embed", principal });
  const sweep = await app.embeddings.embedCorpus({ ownerId: OWNER, force: false, signal: new AbortController().signal });
  const generation = await app.embeddings.resolveGeneration(OWNER, "embed");
  assert(generation !== null);
  await app.embeddings.purgeDocumentVectors({ ownerId: OWNER, generation });
  await app.embeddings.purgeMemoryVectors({ ownerId: OWNER, generation });
  const stored = await db.select().from(characterEmbeddings);
  strictEqual(stored.length, CORPUS_SIZE);
  assert(stored.every((vector) => vector.dim === WIDTH && vector.embedding.length === WIDTH && vector.embedding.every(Number.isFinite)));
  assert(stored.every((vector) => Math.abs(Math.hypot(...vector.embedding) - 1) < NORM_TOLERANCE));
  strictEqual(new Set(stored.map((vector) => vector.generationId)).size, 1);
  strictEqual(new Set(stored.map((vector) => vector.model)).size, 1);
  const hits = await app.services.search.findCharacters({ ownerId: OWNER, query: "Who grows and harvests ripe yellow bananas?", topN: 2, rerank: false });
  strictEqual(hits[0]?.characterId, relevant.id);
  strictEqual(hits[1]?.characterId, unrelated.id);
  const canon = await db.select().from(embeddingCalls).where(eq(embeddingCalls.ownerId, OWNER));
  const physicalCalls = calls.slice(mark).filter((call) => call.model === EMBEDDING_MODEL && call.status === HTTP_OK);
  strictEqual(canon.length, physicalCalls.length);
  assert(physicalCalls.every((call) => call.vectorWidths.every((width) => width === WIDTH)));
  strictEqual(
    canon.reduce((sum, call) => sum + call.inputCount, 0),
    physicalCalls.reduce((sum, call) => sum + call.vectorWidths.length, 0),
  );
  assert(
    physicalCalls.every((call) =>
      (call.config?.requests ?? [call.config]).every((request) => request?.outputDimensionality === WIDTH && request.taskType === undefined),
    ),
  );
  deepStrictEqual(canon.map((call) => call.promptTokens).sort(), physicalCalls.map((call) => call.usage?.promptTokenCount ?? null).sort());
  assert(canon.every((call) => call.totalTokens === null && call.servedModel === null && call.costUsd === null && call.outcome === "completed"));
  row({
    kind: "embedding",
    model: EMBEDDING_MODEL,
    pass: true,
    width: WIDTH,
    connectionId: connection.id,
    capability: resolved.resolved.capability,
    sweep,
    hits,
    stored: stored.map((vector) => ({
      characterId: vector.characterId,
      generationId: vector.generationId,
      space: vector.model,
      dim: vector.dim,
      finite: vector.embedding.every(Number.isFinite),
      norm: Math.hypot(...vector.embedding),
    })),
    canon,
    calls: calls.slice(mark),
  });
  console.log(`${EMBEDDING_MODEL}: PASS persisted same-space vectors; relevant banana grower ranks first`);
  if (imageBytes === null) {
    failures += 1;
    row({
      kind: "image-embedding",
      model: EMBEDDING_MODEL,
      pass: false,
      called: false,
      error: "No generated image was available for the image embedding control",
    });
  } else {
    await proveImageEmbedding(connection.id, imageBytes);
  }
} catch (error) {
  failures += 1;
  const message = String(error).replaceAll(KEY, "[redacted]");
  row({ kind: "embedding", model: EMBEDDING_MODEL, pass: false, error: message, calls: calls.slice(mark) });
  console.log(`${EMBEDDING_MODEL}: FAIL ${message}`);
}
row({ kind: "summary", failures, fixtureRoot: ROOT });
process.exit(failures === 0 ? 0 : 1);

async function proveImageEmbedding(connectionId: UserConnectionId, bytes: Uint8Array): Promise<void> {
  const imageMark = calls.length;
  await app.services.connection.setBinding({ principal, task: "imageEmbed", connectionId });
  const roles = await app.roleClientsFor(OWNER);
  const embedded = await roles.imageEmbed({ kind: "image", input: bytes });
  const vector = embedded.vectors[0];
  assert(vector !== undefined && vector !== null && vector.length === WIDTH && vector.every(Number.isFinite));
  assert(Math.abs(Math.hypot(...vector) - 1) < NORM_TOLERANCE);
  const imageCanon = (await db.select().from(embeddingCalls).where(eq(embeddingCalls.ownerId, OWNER))).filter((call) => call.task === "imageEmbed");
  const imageCalls = calls.slice(imageMark).filter((call) => call.model === EMBEDDING_MODEL && call.status === HTTP_OK);
  strictEqual(imageCanon.length, imageCalls.length);
  assert(imageCalls.every((call) => call.vectorWidths.every((width) => width === WIDTH)));
  assert(
    imageCalls.every((call) =>
      (call.config?.requests ?? [call.config]).every(
        (request) => request?.outputDimensionality === WIDTH && request.taskType === undefined && (request.content?.imageParts ?? 0) > 0,
      ),
    ),
  );
  deepStrictEqual(imageCanon.map((call) => call.promptTokens).sort(), imageCalls.map((call) => call.usage?.promptTokenCount ?? null).sort());
  strictEqual(embedded.usage.promptTokens, imageCalls[0]?.usage?.promptTokenCount ?? null);
  strictEqual(embedded.usage.totalTokens, null);
  assert(imageCanon.every((call) => call.totalTokens === null && call.servedModel === null && call.costUsd === null && call.outcome === "completed"));
  row({
    kind: "image-embedding",
    model: EMBEDDING_MODEL,
    pass: true,
    width: vector.length,
    finite: true,
    norm: Math.hypot(...vector),
    usage: embedded.usage,
    canon: imageCanon,
    calls: calls.slice(imageMark),
  });
  console.log(`${EMBEDDING_MODEL}: PASS real image input through imageEmbed role`);
}
