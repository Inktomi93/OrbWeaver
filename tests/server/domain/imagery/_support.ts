// Shared imagery test harness: a fake ImageryContext over a real db, with recording spies for the injected
// ops (generate/fetch/store/extract/caption/stats). The infra executor + role resolver + CAS write + the
// chat/character/assets ops are stubs — imagery declares their ports; the composition root binds the real infra.

import type { Principal } from "@orb/contracts/identity";
import { DEFAULT_CAPTION_INSTRUCTIONS, DEFAULT_PROMPT_TEMPLATES, IMAGERY_NEGATIVE_SLOT_ID } from "@orb/contracts/imagery";
import { modelIdSchema, providerIdSchema } from "@orb/contracts/inference";
import { PROSE_SLOTS } from "@orb/contracts/prose";
import type { StatsDelta } from "@orb/contracts/stats";
import type { Db } from "@orb/db";
import { assets, userConnections, users } from "@orb/db";
import type { Resolved } from "@orb/inference";
import { generationOf } from "@orb/inference";
import { handleKey } from "@orb/kit/handle-key";
import type { AssetId, Handle, ImageryGenerationId, ModelId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ImageGenerateRequest, ImageryContext } from "@orb/server/domain/imagery";
import { makeResolved, TEST_CONNECTION_ID } from "../../../support/factories/resolved-connection.ts";
import { createSeededIds } from "../../../support/ids.ts";

const FROZEN_AT = 1_750_000_000_000;

/** A tiny valid PNG header — sniffMime resolves it to image/png. */
export const PNG_BYTES = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_BASE64 = Buffer.from(PNG_BYTES).toString("base64");

export async function seedOwner(db: Db, handle: Handle): Promise<UserId> {
  const id = castId<UserId>(`user_${handle}`);
  await db.insert(users).values({ id, handle: castId<Handle>(handle), handleKey: handleKey(castId<Handle>(handle)), role: "user", enabled: true });
  return id;
}

/** Seed the owner plus the exact connection the harness resolves for generation. Kept separate from
 *  `seedOwner` so reader-only principals cannot silently collide on the shared test connection id. */
export async function seedGenerationOwner(db: Db, handle: Handle): Promise<UserId> {
  const ownerId = await seedOwner(db, handle);
  await db.insert(userConnections).values({
    id: TEST_CONNECTION_ID,
    ownerId,
    label: "image generator",
    providerId: providerIdSchema.parse("openrouter"),
    model: modelIdSchema.parse("img-model"),
  });
  return ownerId;
}

export function principal(userId: UserId): Principal {
  return { userId, role: "user", handle: castId<Handle>("h"), externalId: null, via: "cookie" };
}

/** A `resolveGenerateImage` override whose resolved model advertises a concrete `input.imageEdit` capability
 *  (the harness default is opaque `{}`) — drives the B3 avatar-reference gate + the editImage capability gate. */
export function resolutionWith(imageEdit: boolean): ImageryContext["resolveGenerateImage"] {
  const connection = makeResolved({
    task: "generateImage",
    providerId: "openrouter",
    model: castId<ModelId>("img-model"),
    generation: { imageEdit, output: { maxTokens: { min: 1, max: 8192 }, modalities: ["image"] } },
  });
  return () => Promise.resolve({ connection, capability: generationOf(connection) });
}

/** The card fields imagery reads — `avatarAssetId` (caption/B3) + `contentHash` (the I3 identity hash). */
type ImageryCardDouble = Awaited<ReturnType<ImageryContext["getCard"]>>;

/** A minimal imagery card double — only `avatarAssetId` (caption path) + `contentHash` (reuse gate) are read. */
export function fakeCard(avatarAssetId: AssetId | null, contentHash = "hash_aria"): ImageryCardDouble {
  // @orb-waive no-test-fabrication(unknown): minimal card double — imagery reads only name + avatarAssetId + contentHash. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  return { name: "Aria", avatarAssetId, contentHash } as unknown as ImageryCardDouble;
}

export interface ImageryHarness {
  readonly ctx: ImageryContext;
  readonly recordedStats: StatsDelta[];
  readonly generateCalls: number[];
  /** The full requests handed to the executor — used to assert the resolved `edit` payload. */
  readonly generateRequests: ImageGenerateRequest[];
  readonly fetchImageCalls: string[];
  readonly extractInstructions: string[];
  readonly captionInstructions: string[];
  readonly readAssetCalls: AssetId[];
}

export function makeHarness(db: Db, overrides: Partial<ImageryContext> = {}): ImageryHarness {
  const ids = createSeededIds();
  const recordedStats: StatsDelta[] = [];
  const generateCalls: number[] = [];
  const generateRequests: ImageGenerateRequest[] = [];
  const fetchImageCalls: string[] = [];
  const extractInstructions: string[] = [];
  const captionInstructions: string[] = [];
  const readAssetCalls: AssetId[] = [];
  const connection: Resolved<"generateImage"> = makeResolved({
    task: "generateImage",
    providerId: "openrouter",
    model: castId<ModelId>("img-model"),
    generation: { output: { maxTokens: { min: 1, max: 8192 }, modalities: ["image"] } },
  });
  const ctx: ImageryContext = {
    db,
    now: () => FROZEN_AT,
    newGenerationId: (): ImageryGenerationId => castId<ImageryGenerationId>(ids.next("imagery_generation")),
    resolveGenerateImage: () => Promise.resolve({ connection, capability: generationOf(connection) }),
    generateImage: (req) => {
      generateCalls.push(req.n ?? 1);
      generateRequests.push(req);
      return Promise.resolve({
        images: [{ base64: PNG_BASE64, mediaType: "image/png", url: undefined }],
        model: "img-model",
        usage: { costUsd: 0.02 },
        warnings: [],
      });
    },
    fetchImage: (url) => {
      fetchImageCalls.push(url);
      return Promise.resolve(null);
    },
    storeAsset: async (caller, bytes, kind, mime) => {
      const assetId = castId<AssetId>(ids.next("asset"));
      await db.insert(assets).values({ id: assetId, ownerId: caller.userId, kind, mime, size: bytes.length, hash: ids.next("hash") });
      return { assetId, hash: "h", size: bytes.length, created: true };
    },
    extractQuiet: (p) => {
      extractInstructions.push(p.instruction);
      return Promise.resolve({ text: "keyword one, keyword two", costUsd: 0.005 });
    },
    captionImage: (p) => {
      captionInstructions.push(p.instruction);
      return Promise.resolve({ text: "caption alpha, caption beta", costUsd: 0.003 });
    },
    readAsset: (_caller, assetId) => {
      readAssetCalls.push(assetId);
      return Promise.resolve({ bytes: PNG_BYTES, mime: "image/png" });
    },
    getCard: () => Promise.resolve(fakeCard(castId<AssetId>("asset_avatar"))),
    // ⑫ — the default resolvers return the shipped catalog byte-identically (no user override in the harness);
    // a test can inject overrides to exercise the per-user path. Mirrors the compose resolver's default arm.
    resolvePromptTemplate: (_caller, mode) => Promise.resolve(DEFAULT_PROMPT_TEMPLATES[mode]),
    resolveCaptionInstruction: (_caller, mode) => Promise.resolve(DEFAULT_CAPTION_INSTRUCTIONS[mode]),
    // PROSE-1 census 88 — no user override ⇒ the shipped catalog base, the same bytes the verb shipped before.
    resolveNegativeBase: () => Promise.resolve(PROSE_SLOTS[IMAGERY_NEGATIVE_SLOT_ID].text),
    recordStats: (delta) => {
      recordedStats.push(delta);
      return Promise.resolve();
    },
    ...overrides,
  };
  return { ctx, recordedStats, generateCalls, generateRequests, fetchImageCalls, extractInstructions, captionInstructions, readAssetCalls };
}
