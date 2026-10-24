// @subject tests/support/node/corpus-image-variants.ts
// @subject tests/support/node/corpus-image-wire.ts
import { randomBytes } from "node:crypto";
import { assertReferentialIntegrity } from "@orb/db";
import { CORPUS_VARIANT_EDIT_INSTRUCTION, CORPUS_VARIANT_FREE_PROMPT, CORPUS_VARIANT_OVERRIDE, seedCorpusImageVariants } from "./corpus-image-variants.ts";
import { CORPUS_VARIANT_EDIT_MODEL, CORPUS_VARIANT_IMAGE_MODEL, CORPUS_VARIANT_PROMPT, createCorpusImageWire } from "./corpus-image-wire.ts";
import { CORPUS_EMBED_MODEL, CORPUS_EMBEDDING_VECTOR, CORPUS_STRUCTURED_REPLIES, CORPUS_TEXT_MODEL, createCorpusProviderExecution } from "./corpus-provider.ts";
import { seedCorpusActors } from "./corpus-seed.ts";
import { expect, test } from "./fixtures.ts";
import { createServerHarness } from "./server.ts";

const OWNER_PASSWORD = "synthetic-image-variant-owner-password";

test("native image admission and funded output variants preserve short-edge skips, unknown accounting, multipart edit and owner-only provenance", async () => {
  const wire = await createCorpusImageWire();
  const fallback = createCorpusProviderExecution({
    modelIds: [CORPUS_TEXT_MODEL, CORPUS_EMBED_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: CORPUS_VARIANT_PROMPT,
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  await using root = await createServerHarness({
    env: { ["AUTH_MODE"]: "local", ["AUTH_FALLBACK"]: "deny" },
    providerFetch: wire.wrap(fallback.execute),
    secretBoxKey: randomBytes(32),
  });
  await seedCorpusActors(root);
  const caller = await root.internalCallerFor(root.ownerId);
  await caller.admin.resetPassword({ userId: root.ownerId, password: OWNER_PASSWORD });
  const result = await seedCorpusImageVariants(root, wire, OWNER_PASSWORD);
  expect(result.skipPostsAfter).toEqual(result.skipPostsBefore);
  expect(result.skips.map(({ first }) => first.skip)).toMatchObject([
    { reason: "below-dimension-floor", width: 8, height: 8 },
    { reason: "below-dimension-floor", width: 8, height: 64 },
  ]);
  for (const { asset, first, repeated, forced } of result.skips) {
    expect(first).toMatchObject({ result: null, vectors: [], analysis: undefined, skip: { assetId: asset.id } });
    expect(repeated).toEqual(first);
    expect(forced).toEqual(first);
    expect(asset.ownerId).toBe(root.ownerId);
  }
  expect(result.previews.extracted.output).toMatchObject({ source: "extracted", mode: "scenario" });
  expect(result.previews.captioned.output).toMatchObject({ source: "captioned", mode: "character_multimodal", prompt: CORPUS_VARIANT_PROMPT });
  expect(result.previews.captioned.output.costUsd).toBeGreaterThan(0);
  expect(result.free.picture).toMatchObject({
    prompt: CORPUS_VARIANT_FREE_PROMPT,
    promptSource: "user",
    mode: "free",
    costUsd: null,
    reused: false,
    warnings: [],
  });
  expect(result.captioned.picture).toMatchObject({ promptSource: "captioned", mode: "character_multimodal", costUsd: null, reused: false, warnings: [] });
  expect(result.warning.picture).toMatchObject({
    prompt: CORPUS_VARIANT_OVERRIDE,
    promptSource: "user",
    mode: "character",
    warnings: [{ code: "image_edit_dropped" }],
  });
  expect(result.warning.picture.warnings[0]?.detail).toContain(CORPUS_VARIANT_IMAGE_MODEL);
  expect(result.edited.picture).toMatchObject({
    prompt: CORPUS_VARIANT_EDIT_INSTRUCTION,
    promptSource: "user",
    mode: "free",
    model: CORPUS_VARIANT_EDIT_MODEL,
    costUsd: null,
    reused: false,
    warnings: [],
  });
  expect(result.free.generations).toMatchObject([
    {
      tokensIn: null,
      tokensOut: null,
      cacheReadTokens: null,
      cacheWriteTokens: null,
      reasoningTokens: null,
      tokenDetails: null,
      costDetails: null,
      costProvenance: "unrecorded",
      edited: false,
      subjectCharacterId: null,
      identityHash: null,
    },
  ]);
  expect(result.captioned.generations).toMatchObject([
    {
      tokensIn: 19,
      tokensOut: 7,
      cacheReadTokens: null,
      cacheWriteTokens: null,
      reasoningTokens: null,
      tokenDetails: {
        input: [
          { modality: "text", tokens: 4 },
          { modality: "image", tokens: 12 },
        ],
        output: [{ modality: "image", tokens: 5 }],
      },
      subjectCharacterId: result.character.id,
      edited: false,
    },
  ]);
  expect(result.captioned.generations[0]?.identityHash).not.toBeNull();
  expect(result.warning.generations).toMatchObject([
    {
      tokensIn: 0,
      tokensOut: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: null,
      reasoningTokens: 0,
      tokenDetails: {
        input: [
          { modality: "text", tokens: 0 },
          { modality: "image", tokens: 0 },
        ],
        output: [{ modality: "image", tokens: 0 }],
      },
      edited: false,
    },
  ]);
  expect(result.edited.generations).toMatchObject([
    {
      tokensIn: 23,
      tokensOut: 11,
      cacheReadTokens: 2,
      cacheWriteTokens: null,
      reasoningTokens: null,
      tokenDetails: {
        input: [
          { modality: "text", tokens: 3 },
          { modality: "image", tokens: 17 },
        ],
        output: [{ modality: "image", tokens: 9 }],
      },
      edited: true,
      negativePrompt: null,
      subjectCharacterId: null,
      identityHash: null,
      chatId: result.room.chat.id,
    },
  ]);
  expect(result.rows).toHaveLength(4);
  expect(new Set(result.rows.map((row) => row.assetId)).size).toBe(4);
  expect(new Set(result.rows.map((row) => row.callId)).size).toBe(4);
  expect(result.rows.every((row) => row.costUsd === null && row.costProvenance === "unrecorded" && row.provider === "custom-openai")).toBe(true);
  expect(result.assetRows.every((row) => row.ownerId === root.ownerId)).toBe(true);
  expect(
    [...result.free.generations, ...result.captioned.generations, ...result.warning.generations].every(
      (row) => row.connectionId === result.connections[0]?.id && row.model === CORPUS_VARIANT_IMAGE_MODEL,
    ),
  ).toBe(true);
  expect(result.edited.generations).toMatchObject([{ connectionId: result.connections[1]?.id, model: CORPUS_VARIANT_EDIT_MODEL }]);
  const cohorts = [result.free, result.captioned, result.warning, result.edited];
  for (const [index, cohort] of cohorts.entries()) {
    const row = cohort.generations[0];
    expect(result.provenance[index]?.output).toMatchObject({
      generationId: row?.id,
      assetId: row?.assetId,
      prompt: row?.prompt,
      mode: row?.mode,
      model: row?.model,
      edited: row?.edited,
      costUsd: row?.costUsd,
      subjectCharacterId: row?.subjectCharacterId,
      identityHash: row?.identityHash,
      usage: {
        tokensIn: row?.tokensIn,
        tokensOut: row?.tokensOut,
        cacheReadTokens: row?.cacheReadTokens,
        cacheWriteTokens: row?.cacheWriteTokens,
        reasoningTokens: row?.reasoningTokens,
        tokenDetails: row?.tokenDetails,
        costDetails: row?.costDetails,
        costProvenance: row?.costProvenance,
      },
    });
  }
  expect(result.nullProvenance.map((read) => read.output)).toEqual([null, null, null]);
  expect(result.refusals.map(({ status, code }) => ({ status, code }))).toEqual([
    { status: 400, code: "BAD_REQUEST" },
    { status: 404, code: "NOT_FOUND" },
    { status: 404, code: "NOT_FOUND" },
    { status: 404, code: "NOT_FOUND" },
    { status: 404, code: "NOT_FOUND" },
  ]);
  expect(result.refusals[0]?.message).toContain("cannot edit images");
  expect(result.afterRefusals).toEqual(result.beforeRefusals);
  expect(result.physical.images.map(({ path, model, sourceBytes }) => [path, model, sourceBytes !== null])).toEqual([
    ["/v1/images/generations", CORPUS_VARIANT_IMAGE_MODEL, false],
    ["/v1/images/generations", CORPUS_VARIANT_IMAGE_MODEL, false],
    ["/v1/images/generations", CORPUS_VARIANT_IMAGE_MODEL, false],
    ["/v1/images/edits", CORPUS_VARIANT_EDIT_MODEL, true],
  ]);
  const sourceId = result.free.picture.images[0]?.assetId;
  if (sourceId === undefined) {
    throw new Error("native free output lost its edit source");
  }
  expect(result.physical.images[3]?.sourceBytes).toEqual(
    new Uint8Array((await root.app.assets.readOwnedAssetBytes(await root.principalFor(root.ownerId), sourceId)).bytes),
  );
  expect(result.physical.images[3]?.sourceMime).toBe("image/png");
  expect(result.physical.images[3]).toMatchObject({ prompt: CORPUS_VARIANT_EDIT_INSTRUCTION, n: 1 });
  expect(result.physical.captions).toHaveLength(3);
  expect(result.physical.captions.every(({ authenticated }) => authenticated)).toBe(true);
  expect(result.physical.images.every(({ authenticated }) => authenticated)).toBe(true);
  expect(result.physical.remaining).toBe(0);
  expect(result.bindings.after.map(({ task, binding }) => [task, binding?.connectionId ?? null])).toEqual(
    result.bindings.before.map(({ task, binding }) => [task, binding?.connectionId ?? null]),
  );
  await assertReferentialIntegrity(root.db);
});
