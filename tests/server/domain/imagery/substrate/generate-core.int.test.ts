import { makeGenerationUsage } from "../../../../support/factories/generation-usage.ts";
// substrate/runGeneration + sumCost — the spend-and-persist tail both generatePicture and editImage run
// (their round-trip through the real store/provenance path is pinned by the verb-level int tests). This
// file pins the claims the verb tests don't isolate: zero decodable images (neither base64 nor a
// successfully-fetched url) THROWS `GenerationFailedError` rather than silently returning an empty set, a
// fanned-out (n>1) generation shares ONE `createdAt` across every provenance row, and `sumCost`'s
// null-propagating sum (doc 02 §8 — an unknown component makes the total null, never a fabricated partial).

import { closeDb, imageryGenerations, modelStats, ownerStats, userConnections } from "@orb/db";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { GenerationFailedError } from "@orb/server/domain/imagery";
import { applyStatsDelta, reconcileStats } from "@orb/server/domain/stats";
import { describe } from "vitest";
import { passthroughImageNormalizer } from "../../../../../packages/inference/src/backends/kit/image-normalize.ts";
import { runOpenAiCompatGenerateImage } from "../../../../../packages/inference/src/backends/openai-compat/images.ts";
import { runGeneration, sumCost } from "../../../../../packages/server/src/domain/imagery/substrate/generate-core.ts";
import { fakeApiKeySecret, fakeDeps, fakeResolved } from "../../../../inference/_support.ts";
import { freshDb } from "../../../../support/db.ts";
import { makeCapability, makeGenerationCapability, makeResolved } from "../../../../support/factories/resolved-connection.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeHarness, PNG_BYTES, principal, seedGenerationOwner } from "../_support.ts";

/** The request shape `runGeneration` takes, named so the deliberate fabrication below has a ONE-LINE
 *  assertion position the waiver can anchor on (a multi-line `Parameters<…>` slice cannot be a marker). */
type GenerationRequest = Parameters<typeof runGeneration>[1];

// @orb-waive no-test-fabrication(GenerationRequest): a minimal runGeneration request double — this file pins the spend/persist tail only, which never reads credential/capability internals. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
const REQ = {
  connection: makeResolved({ task: "generateImage", providerId: "openrouter" }),
  model: "img-model",
  prompt: "test",
  capability: {},
} as GenerationRequest;
const PROV = {
  chatId: null,
  mode: "free" as const,
  subjectCharacterId: null,
  identityHash: null,
  prompt: "a dragon",
  negativePrompt: null,
  edited: false,
};

describe("sumCost", () => {
  test("both known sums normally", () => {
    expect(sumCost(1, 2)).toBe(3);
  });
  test("either side unknown (null) makes the WHOLE total null — never a fabricated partial", () => {
    expect(sumCost(null, 2)).toBeNull();
    expect(sumCost(1, null)).toBeNull();
    expect(sumCost(null, null)).toBeNull();
  });
});

describe("runGeneration", () => {
  test.for([
    { sourceId: "opaque-source", expectedSource: "opaque-source" },
    { sourceId: "fixture-key", expectedSource: null },
  ])("actual image SDK source $sourceId preserves canonical economics without retained credential bytes", async ({ sourceId, expectedSource }) => {
    const db = await freshDb();
    const owner = await seedGenerationOwner(db, castId<Handle>("image_usage_owner"));
    const connection = fakeResolved({
      task: "generateImage",
      providerId: "openrouter",
      model: "openai/gpt-image-2.5",
      ownerId: owner,
      capability: makeCapability(makeGenerationCapability()),
      secret: fakeApiKeySecret("fixture-key"),
      declaredFeatures: { images: "images-api" },
    });
    await db
      .insert(userConnections)
      .values({ id: connection.connectionId, ownerId: owner, providerId: connection.providerId, model: connection.model, label: "Image" });
    const deps = fakeDeps();
    const paths: string[] = [];
    const { ctx } = makeHarness(db, {
      applyStatsDelta,
      generateImage: async (request) => {
        const result = await runOpenAiCompatGenerateImage(request, {
          normalize: passthroughImageNormalizer,
          transport: {
            app: deps.app,
            fetch: (input) => {
              paths.push(new URL(String(input)).pathname);
              return Promise.resolve(
                Response.json(
                  {
                    data: [{ ["b64_json"]: Buffer.from(PNG_BYTES).toString("base64") }, { ["b64_json"]: Buffer.from(PNG_BYTES).toString("base64") }],
                    usage: {
                      ["prompt_tokens"]: 70,
                      ["completion_tokens"]: 1434,
                      ["total_tokens"]: 1504,
                      cost: 0.125,
                      ["completion_tokens_details"]: { ["image_tokens"]: 1120 },
                    },
                  },
                  {
                    headers: {
                      "x-openrouter-cache-status": "HIT",
                      "x-openrouter-cache-source-id": sourceId,
                      "x-openrouter-cache-age": "0",
                      "x-openrouter-cache-ttl": "240",
                    },
                  },
                ),
              );
            },
          },
        });
        return {
          ...result,
          warnings: result.warnings.flatMap((warning) => (warning.code === "image_edit_dropped" ? [{ code: warning.code, detail: warning.message }] : [])),
        };
      },
    });
    const outcome = await runGeneration(ctx, { ...REQ, connection, model: connection.model }, { ...PROV, owner: principal(owner) });
    expect(paths).toEqual(["/api/v1/images"]);
    expect(outcome.costUsd).toBe(0.125);
    const rows = await db.select().from(imageryGenerations);
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((row) => row.callId)).size).toBe(1);
    for (const row of rows) {
      expect(row).toMatchObject({
        tokensIn: 70,
        tokensOut: 1434,
        reasoningTokens: null,
        servedModel: null,
        costUsd: 0.125,
        costProvenance: "measured",
        tokenDetails: { output: [{ modality: "image", tokens: 1120 }] },
        responseCache: { status: "hit", sourceGenerationId: expectedSource, ageSeconds: 0, ttlSeconds: 240 },
      });
    }
    const live = await db.select().from(ownerStats);
    expect(live).toHaveLength(1);
    expect(live[0]).toMatchObject({ costUsd: 0.125, costSamples: 1 });
    expect(await db.select().from(modelStats)).toMatchObject([{ generations: 2, costUsd: 0.125, costSamples: 1 }]);
    await reconcileStats(db, { ownerId: owner, now: ctx.now });
    expect(await db.select().from(ownerStats)).toEqual(live);
    closeDb(db);
  });
  test("imagery_generations.model refuses a blank provider-reported model before persistence", async () => {
    const db = await freshDb();
    const owner = await seedGenerationOwner(db, castId<Handle>("owner"));
    const base64 = Buffer.from(PNG_BYTES).toString("base64");
    const { ctx } = makeHarness(db, {
      generateImage: () =>
        Promise.resolve({ images: [{ base64, mediaType: "image/png", url: undefined }], model: "   ", usage: makeGenerationUsage(null), warnings: [] }),
    });

    await expect(runGeneration(ctx, REQ, { ...PROV, owner: principal(owner) })).rejects.toThrow();
    expect(await db.select().from(imageryGenerations)).toEqual([]);
  });

  test("zero decodable images (no base64, fetch returns null) throws GenerationFailedError", async () => {
    const db = await freshDb();
    const owner = await seedGenerationOwner(db, castId<Handle>("owner"));
    const { ctx } = makeHarness(db, {
      generateImage: () =>
        Promise.resolve({
          images: [{ base64: undefined, mediaType: "image/png", url: "https://example.com/x.png" }],
          model: "img-model",
          usage: makeGenerationUsage(0.01),
          warnings: [],
        }),
      fetchImage: () => Promise.resolve(null),
    });

    await expect(runGeneration(ctx, REQ, { ...PROV, owner: principal(owner) })).rejects.toThrow(GenerationFailedError);
  });

  test("a fanned-out (n>1) generation shares ONE createdAt and ONE call id across every provenance row", async () => {
    const db = await freshDb();
    const owner = await seedGenerationOwner(db, castId<Handle>("owner"));
    const base64 = Buffer.from(PNG_BYTES).toString("base64");
    const { ctx } = makeHarness(db, {
      generateImage: () =>
        Promise.resolve({
          images: [
            { base64, mediaType: "image/png", url: undefined },
            { base64, mediaType: "image/png", url: undefined },
          ],
          model: "img-model",
          usage: makeGenerationUsage(0.02),
          warnings: [],
        }),
    });

    const outcome = await runGeneration(ctx, REQ, { ...PROV, owner: principal(owner) });

    expect(outcome.images).toHaveLength(2);
    const rows = await db
      .select({
        createdAt: imageryGenerations.createdAt,
        callId: imageryGenerations.callId,
        provider: imageryGenerations.provider,
        connectionId: imageryGenerations.connectionId,
        model: imageryGenerations.model,
        costUsd: imageryGenerations.costUsd,
      })
      .from(imageryGenerations);
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.createdAt)).size).toBe(1);
    // The call id is what the stats rebuild counts one priced generation by.
    expect(rows[0]?.callId).not.toBeNull();
    expect(rows).toEqual([
      {
        createdAt: rows[0]?.createdAt,
        callId: rows[0]?.callId,
        provider: REQ.connection.providerId,
        connectionId: REQ.connection.connectionId,
        model: "img-model",
        costUsd: 0.02,
      },
      {
        createdAt: rows[0]?.createdAt,
        callId: rows[0]?.callId,
        provider: REQ.connection.providerId,
        connectionId: REQ.connection.connectionId,
        model: "img-model",
        costUsd: 0.02,
      },
    ]);
  });
});
