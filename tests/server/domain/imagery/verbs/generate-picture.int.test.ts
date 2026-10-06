import { makeGenerationUsage } from "../../../../support/factories/generation-usage.ts";
// verb: generatePicture — the P5 free-mode orchestrator. Proves against a real libSQL
// db: a returned base64 image is decoded, stored as a `kind:"generated"` asset (via the injected CAS write),
// a matching `imagery_generations` provenance row is written (store-THEN-provenance), one economics delta is
// recorded, and the `GeneratedPicture` carries a D44 media block. The infra executor + role resolver + CAS
// write are stubs (imagery declares their port; the composition root binds the real infra).

import type { Db } from "@orb/db";
import { assets, characters, chats, galleryItems, imageryGenerations } from "@orb/db";
import type { AssetId, CharacterId, ChatId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { sniffMime } from "@orb/kit/image-sniff";
import type { AssetsService } from "@orb/server/domain/assets";
import { createAssetsService } from "@orb/server/domain/assets";
import type { ImageryContext } from "@orb/server/domain/imagery";
import { createImageryService } from "@orb/server/domain/imagery";
import { eq } from "drizzle-orm";
import { beforeEach, describe, onTestFinished } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { makeCharacter } from "../../../../support/factories/character.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeHarness as makeAssetsHarness } from "../../assets/_support.ts";
import { fakeCard, makeHarness, PNG_BYTES, principal, resolutionWith, seedGenerationOwner, seedOwner } from "../_support.ts";

let db: Db;

beforeEach(async () => {
  db = await freshDb();
});

describe("generatePicture (free mode)", () => {
  test("stores one generated asset + one provenance row + returns a media block", async () => {
    const owner = await seedGenerationOwner(db, castId<Handle>("owner"));
    const { ctx, recordedStats, generateCalls } = makeHarness(db);

    const result = await createImageryService(ctx).generatePicture({
      caller: principal(owner),
      mode: "free",
      prompt: "a dragon over a castle",
    });

    // fan-out via n, never a per-image loop.
    expect(generateCalls).toEqual([1]);

    expect(result.images).toHaveLength(1);
    expect(result.promptSource).toBe("user");
    expect(result.reused).toBe(false);
    expect(result.mode).toBe("free");
    expect(result.model).toBe("img-model");
    expect(result.costUsd).toBe(0.02);
    const block = result.images[0]?.block;
    expect(block).toMatchObject({ kind: "media", media: "image", src: { kind: "asset" } });

    const assetRows = await db.select().from(assets).where(eq(assets.ownerId, owner));
    expect(assetRows).toHaveLength(1);
    expect(assetRows[0]?.kind).toBe("generated");

    const genRows = await db.select().from(imageryGenerations);
    expect(genRows).toHaveLength(1);
    expect(genRows[0]).toMatchObject({
      mode: "free",
      prompt: "a dragon over a castle",
      model: "img-model",
      costUsd: 0.02,
      edited: false,
    });
    expect(genRows[0]?.assetId).toBe(assetRows[0]?.id);

    expect(recordedStats).toHaveLength(1);
    expect(recordedStats[0]).toMatchObject({ ownerId: owner, modelGenerations: 1 });
  });

  test("zero decodable images → GenerationFailedError (no asset, no row)", async () => {
    const owner = await seedGenerationOwner(db, castId<Handle>("owner"));
    const { ctx } = makeHarness(db, {
      generateImage: () => Promise.resolve({ images: [], model: "img-model", usage: makeGenerationUsage(null), warnings: [] }),
    });

    await expect(
      createImageryService(ctx).generatePicture({
        caller: principal(owner),
        mode: "free",
        prompt: "nothing",
      }),
    ).rejects.toThrow();

    expect(await db.select().from(imageryGenerations)).toHaveLength(0);
    expect(await db.select().from(assets)).toHaveLength(0);
  });

  test("a provider URL image is downloaded via the SSRF-safe fetchImage port, then stored", async () => {
    const owner = await seedGenerationOwner(db, castId<Handle>("owner"));
    const url = "https://cdn.example/generated/dragon.png";
    const { ctx, fetchImageCalls } = makeHarness(db, {
      generateImage: () =>
        Promise.resolve({
          images: [{ url, base64: undefined, mediaType: "image/png" }],
          model: "img-model",
          usage: makeGenerationUsage(0.01),
          warnings: [],
        }),
      fetchImage: (u) => {
        fetchImageCalls.push(u);
        return Promise.resolve(PNG_BYTES);
      },
    });

    const result = await createImageryService(ctx).generatePicture({
      caller: principal(owner),
      mode: "free",
      prompt: "a dragon over a castle",
    });

    // The provider-controlled URL rode the injected port (→ safeFetch), never a raw fetch.
    expect(fetchImageCalls).toEqual([url]);
    expect(result.images).toHaveLength(1);
    const assetRows = await db.select().from(assets).where(eq(assets.ownerId, owner));
    expect(assetRows).toHaveLength(1);
    expect(assetRows[0]?.kind).toBe("generated");
  });

  test("a URL the SSRF-safe port rejects (null) is dropped → GenerationFailedError, no asset/row", async () => {
    const owner = await seedGenerationOwner(db, castId<Handle>("owner"));
    // fetchImage returns null for an SSRF-blocked / non-2xx / oversized / failed download (the harness
    // default) — the only image drops, so the generation fails closed and nothing is persisted.
    const { ctx, fetchImageCalls } = makeHarness(db, {
      generateImage: () =>
        Promise.resolve({
          images: [{ url: "http://169.254.169.254/latest/meta-data/", base64: undefined }],
          model: "img-model",
          usage: makeGenerationUsage(null),
          warnings: [],
        }),
    });

    await expect(
      createImageryService(ctx).generatePicture({
        caller: principal(owner),
        mode: "free",
        prompt: "exfiltrate",
      }),
    ).rejects.toThrow();

    expect(fetchImageCalls).toEqual(["http://169.254.169.254/latest/meta-data/"]);
    expect(await db.select().from(imageryGenerations)).toHaveLength(0);
    expect(await db.select().from(assets)).toHaveLength(0);
  });

  test('"free" mode with no prompt is refused (free requires the user\'s literal words)', async () => {
    const owner = await seedGenerationOwner(db, castId<Handle>("owner"));
    const { ctx } = makeHarness(db);

    await expect(createImageryService(ctx).generatePicture({ caller: principal(owner), mode: "free" })).rejects.toThrow();
  });
});

const CHAT = castId<ChatId>("chat_room");

/** A bare chat row so the provenance FK (`imagery_generations.chat_id → chats.id`) resolves. */
async function seedChat(): Promise<void> {
  await db.insert(chats).values({ id: CHAT });
}

describe("generatePicture — prompt resolution (extraction / caption, doc 02 §1 step 3-4)", () => {
  test("an extraction mode runs chat's shaper, prefixes the keywords, sums the cost", async () => {
    const owner = await seedGenerationOwner(db, castId<Handle>("owner"));
    const { ctx, extractInstructions, recordedStats } = makeHarness(db);
    await seedChat();

    const result = await createImageryService(ctx).generatePicture({ caller: principal(owner), chatId: CHAT, mode: "character" });

    // The RAW template (macros unresolved — chat resolves {{char}}) is what imagery hands the shaper.
    expect(extractInstructions).toHaveLength(1);
    expect(extractInstructions[0]).toContain("{{char}}");
    expect(extractInstructions[0]).toContain("Begin your reply with: full body portrait,");

    expect(result.promptSource).toBe("extracted");
    // Step 4 prefix belt: the shaper's keywords open with the mode's required prefix.
    expect(result.prompt).toBe("full body portrait, keyword one, keyword two");
    // Null-propagating sum: extraction 0.005 + generation 0.02.
    expect(result.costUsd).toBeCloseTo(0.025, 5);
    // Stats records the GENERATION spend only (a different model bucket).
    expect(recordedStats[0]).toMatchObject({ modelGenerations: 1 });

    const genRows = await db.select().from(imageryGenerations);
    expect(genRows[0]).toMatchObject({ mode: "character", prompt: "full body portrait, keyword one, keyword two" });
  });

  test("a prompt override on a template mode is used verbatim — the shaper is never called", async () => {
    const owner = await seedGenerationOwner(db, castId<Handle>("owner"));
    const { ctx, extractInstructions } = makeHarness(db);
    await seedChat();

    const result = await createImageryService(ctx).generatePicture({ caller: principal(owner), chatId: CHAT, mode: "character", prompt: "a specific vision" });

    expect(extractInstructions).toHaveLength(0);
    expect(result.promptSource).toBe("user");
    expect(result.prompt).toBe("a specific vision");
    // User-prompt spend is generation-only.
    expect(result.costUsd).toBe(0.02);
  });

  test("a multimodal mode captions the avatar (source captioned)", async () => {
    const owner = await seedGenerationOwner(db, castId<Handle>("owner"));
    const { ctx, captionInstructions, extractInstructions } = makeHarness(db);
    await seedChat();
    await db.insert(characters).values(makeCharacter({ id: castId<CharacterId>("character_aria"), ownerId: owner }));

    const result = await createImageryService(ctx).generatePicture({
      caller: principal(owner),
      chatId: CHAT,
      mode: "character_multimodal",
      subjectCharacterId: castId("character_aria"),
    });

    expect(captionInstructions).toHaveLength(1);
    expect(extractInstructions).toHaveLength(0);
    expect(result.promptSource).toBe("captioned");
    expect(result.prompt).toBe("full body portrait, caption alpha, caption beta");
  });

  test("a multimodal mode with NO avatar falls back to text extraction of the sibling mode", async () => {
    const owner = await seedGenerationOwner(db, castId<Handle>("owner"));
    // getCard returns a card with no avatar → captionAvatar returns null → extractText(character).
    const { ctx, captionInstructions, extractInstructions } = makeHarness(db, { getCard: () => Promise.resolve(fakeCard(null)) });
    await seedChat();
    await db.insert(characters).values(makeCharacter({ id: castId<CharacterId>("character_aria"), ownerId: owner }));

    const result = await createImageryService(ctx).generatePicture({
      caller: principal(owner),
      chatId: CHAT,
      mode: "face_multimodal",
      subjectCharacterId: castId("character_aria"),
    });

    expect(captionInstructions).toHaveLength(0);
    expect(extractInstructions).toHaveLength(1);
    expect(extractInstructions[0]).toContain("Begin your reply with: close up facial portrait,");
    expect(result.promptSource).toBe("extracted");
  });

  test("an empty extraction result raises PromptExtractionFailedError — no asset, no row", async () => {
    const owner = await seedGenerationOwner(db, castId<Handle>("owner"));
    const { ctx } = makeHarness(db, { extractQuiet: () => Promise.resolve({ text: "()[]{}", costUsd: 0.001 }) });

    await expect(createImageryService(ctx).generatePicture({ caller: principal(owner), chatId: CHAT, mode: "scenario" })).rejects.toThrow();
    expect(await db.select().from(imageryGenerations)).toHaveLength(0);
    expect(await db.select().from(assets)).toHaveLength(0);
  });

  test("an extraction mode with no chatId is refused (the shaper needs a history scope)", async () => {
    const owner = await seedGenerationOwner(db, castId<Handle>("owner"));
    const { ctx } = makeHarness(db);

    await expect(createImageryService(ctx).generatePicture({ caller: principal(owner), mode: "scenario" })).rejects.toThrow();
  });

  test("cost null-propagates: an unknown extraction cost makes the total null (generation still lands in stats)", async () => {
    const owner = await seedGenerationOwner(db, castId<Handle>("owner"));
    const { ctx, recordedStats } = makeHarness(db, { extractQuiet: () => Promise.resolve({ text: "keyword one", costUsd: null }) });
    await seedChat();

    const result = await createImageryService(ctx).generatePicture({ caller: principal(owner), chatId: CHAT, mode: "background" });

    expect(result.costUsd).toBeNull();
    // The generation spend is still recorded (a fabricated partial total is worse than an honest null).
    expect(recordedStats[0]).toMatchObject({ modelGenerations: 1 });
  });
});

// F4 — imagery derives the claimed mime from `@orb/kit/image-sniff`, the SAME signature table assets'
// `enforceMagic:true` re-checks against (the forked local copy DIVERGED — e.g. a 4-byte "GIF8" prefix vs the
// kit's strict GIF87a/89a — and could send a mismatch into a PAID store). The default harness fakes storeAsset
// without magic-checking, so that integration point was never exercised; these tests store through a fake that
// mirrors the real `enforceMagic` (re-sniff the bytes via the shared table; reject an unrecognized signature /
// a claimed-vs-sniffed mismatch — assets/persistence/queries.ts `storeBlob`).
const OCTET_STREAM = "application/octet-stream";
const MAGIC_ERROR = /magic/;

/** A storeAsset fake that mirrors assets' real `enforceMagic:true` (re-sniff via the SHARED kit table; reject
 *  an unrecognized signature / a claimed-vs-sniffed mismatch) — the integration point the default harness fakes
 *  away (F4). */
function enforcingStoreAsset(): ImageryContext["storeAsset"] {
  let n = 0;
  return async (caller, bytes, kind, mime) => {
    const sniffed = sniffMime(bytes);
    if (sniffed === OCTET_STREAM) {
      throw new Error(`assets.store: unrecognized magic bytes — claimed ${mime}`);
    }
    if (sniffed !== mime) {
      throw new Error(`assets.store: magic-byte mismatch — claimed ${mime}, sniffed ${sniffed}`);
    }
    n += 1;
    const assetId = castId<AssetId>(`asset_${n}`);
    await db.insert(assets).values({
      id: assetId,
      ownerId: caller.userId,
      kind,
      mime,
      size: bytes.length,
      hash: `h${n}`,
    });
    return { assetId, hash: `h${n}`, size: bytes.length, created: true };
  };
}

describe("generatePicture — sniff ↔ assets.enforceMagic agreement (F4)", () => {
  test("a real PNG: the claimed mime matches the shared magic check → stored (agreement)", async () => {
    const owner = await seedGenerationOwner(db, castId<Handle>("owner"));
    const { ctx } = makeHarness(db, { storeAsset: enforcingStoreAsset() });

    const result = await createImageryService(ctx).generatePicture({
      caller: principal(owner),
      mode: "free",
      prompt: "a dragon",
    });

    expect(result.images).toHaveLength(1);
    const rows = await db.select().from(assets).where(eq(assets.ownerId, owner));
    expect(rows).toHaveLength(1);
    // The claimed mime is what the shared kit table sniffs — so it passes `enforceMagic` byte-for-byte.
    expect(rows[0]?.mime).toBe("image/png");
  });

  test("an unrecognized signature (e.g. AVIF) is coherently rejected by the shared check, not silently stored", async () => {
    const owner = await seedGenerationOwner(db, castId<Handle>("owner"));
    // Bytes the shared table does NOT recognize (kit → octet-stream); the provider claims image/avif. The
    // caller-policy fallback claims that mediaType, and the SAME magic check assets runs rejects it — a coherent
    // rejection at the store boundary, never a wrong-typed asset slipped through a divergent local table.
    const garbage = Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    const { ctx } = makeHarness(db, {
      storeAsset: enforcingStoreAsset(),
      generateImage: () =>
        Promise.resolve({
          images: [
            {
              base64: Buffer.from(garbage).toString("base64"),
              mediaType: "image/avif",
              url: undefined,
            },
          ],
          model: "img-model",
          usage: makeGenerationUsage(0.03),
          warnings: [],
        }),
    });

    await expect(
      createImageryService(ctx).generatePicture({
        caller: principal(owner),
        mode: "free",
        prompt: "avif art",
      }),
    ).rejects.toThrow(MAGIC_ERROR);
    // No wrong-typed asset landed.
    expect(await db.select().from(assets).where(eq(assets.ownerId, owner))).toHaveLength(0);
  });
});

const ARIA = castId<CharacterId>("character_aria");

/** Seed the chat + the subject character the portrait path's provenance FKs need. */
async function seedPortraitFixtures(owner: UserId): Promise<void> {
  await seedChat();
  await db.insert(characters).values(makeCharacter({ id: ARIA, ownerId: owner }));
}

describe("generatePicture — B2 reuse gate (doc 03 §4.4)", () => {
  test("a repeat portrait request reuses the prior generation — zero new provider calls", async () => {
    const owner = await seedGenerationOwner(db, castId<Handle>("owner"));
    await seedPortraitFixtures(owner);
    const { ctx, generateCalls } = makeHarness(db);
    const svc = createImageryService(ctx);

    const first = await svc.generatePicture({ caller: principal(owner), chatId: CHAT, mode: "character", subjectCharacterId: ARIA });
    expect(first.reused).toBe(false);
    expect(generateCalls).toEqual([1]);

    const second = await svc.generatePicture({ caller: principal(owner), chatId: CHAT, mode: "character", subjectCharacterId: ARIA });
    expect(second.reused).toBe(true);
    expect(second.costUsd).toBeNull();
    // No second provider call; the reused image is the first generation's stored asset.
    expect(generateCalls).toEqual([1]);
    expect(second.images[0]?.assetId).toBe(first.images[0]?.assetId);
    // Still exactly one provenance row.
    expect(await db.select().from(imageryGenerations)).toHaveLength(1);
  });

  test('reuse:"never" regenerates (the regenerate affordance) — a new row, no short-circuit', async () => {
    const owner = await seedGenerationOwner(db, castId<Handle>("owner"));
    await seedPortraitFixtures(owner);
    const { ctx, generateCalls } = makeHarness(db);
    const svc = createImageryService(ctx);

    await svc.generatePicture({ caller: principal(owner), chatId: CHAT, mode: "character", subjectCharacterId: ARIA });
    const regen = await svc.generatePicture({ caller: principal(owner), chatId: CHAT, mode: "character", subjectCharacterId: ARIA, reuse: "never" });

    expect(regen.reused).toBe(false);
    expect(generateCalls).toEqual([1, 1]);
    expect(await db.select().from(imageryGenerations)).toHaveLength(2);
  });

  test("a prompt override bypasses the gate and stores no identity hash (not the card's canonical portrait)", async () => {
    const owner = await seedGenerationOwner(db, castId<Handle>("owner"));
    await seedPortraitFixtures(owner);
    const { ctx, generateCalls } = makeHarness(db);
    const svc = createImageryService(ctx);

    await svc.generatePicture({ caller: principal(owner), chatId: CHAT, mode: "character", subjectCharacterId: ARIA });
    const override = await svc.generatePicture({
      caller: principal(owner),
      chatId: CHAT,
      mode: "character",
      subjectCharacterId: ARIA,
      prompt: "a custom vision",
    });

    expect(override.reused).toBe(false);
    expect(generateCalls).toEqual([1, 1]);
    const rows = await db.select().from(imageryGenerations);
    const overrideRow = rows.find((r) => r.prompt === "a custom vision");
    // Recorded as a portrait of the subject, but with a null identity hash → never reuse-matched.
    expect(overrideRow?.subjectCharacterId).toBe("character_aria");
    expect(overrideRow?.identityHash).toBeNull();
  });

  test("the miss path stores the subject + identity hash so the NEXT prefer-call hits", async () => {
    const owner = await seedGenerationOwner(db, castId<Handle>("owner"));
    await seedPortraitFixtures(owner);
    const { ctx } = makeHarness(db);

    await createImageryService(ctx).generatePicture({ caller: principal(owner), chatId: CHAT, mode: "character", subjectCharacterId: ARIA });

    const rows = await db.select().from(imageryGenerations);
    expect(rows[0]?.subjectCharacterId).toBe("character_aria");
    expect(rows[0]?.identityHash).not.toBeNull();
  });
});

// The free-mode external-hash passthrough (docs/plans/rpg/design.md): a non-character consumer (rpg NPC portraits)
// stores its OWN precomputed reuse hash on the provenance so its own gate can short-circuit later via
// readProvenance. Additive-only — the existing free path (no hash) is byte-identical (identityHash null).
describe("generatePicture — free-mode external identity hash (08 §2 widening)", () => {
  test("a free-mode call with identityHash stores it on the provenance + readProvenance round-trips it", async () => {
    const owner = await seedGenerationOwner(db, castId<Handle>("owner"));
    const { ctx } = makeHarness(db);
    const svc = createImageryService(ctx);

    const result = await svc.generatePicture({ caller: principal(owner), mode: "free", prompt: "an npc portrait", identityHash: "rpg-npc-hash-1" });

    const rows = await db.select().from(imageryGenerations);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.identityHash).toBe("rpg-npc-hash-1");
    // The composed-real read seam rpg's short-circuit uses.
    const assetId = result.images[0]?.assetId;
    expect(assetId).toBeDefined();
    const prov = await svc.readProvenance({ caller: principal(owner), assetId: castId(assetId ?? "") });
    expect(prov?.identityHash).toBe("rpg-npc-hash-1");
  });

  test("a free-mode call WITHOUT identityHash is byte-identical — the provenance hash stays null", async () => {
    const owner = await seedGenerationOwner(db, castId<Handle>("owner"));
    const { ctx } = makeHarness(db);

    await createImageryService(ctx).generatePicture({ caller: principal(owner), mode: "free", prompt: "a plain scene" });

    const rows = await db.select().from(imageryGenerations);
    expect(rows[0]?.identityHash).toBeNull();
  });

  test("identityHash is IGNORED on a subject-portrait mode — the internal reuse gate's hash wins", async () => {
    const owner = await seedGenerationOwner(db, castId<Handle>("owner"));
    await seedPortraitFixtures(owner);
    const { ctx } = makeHarness(db);

    await createImageryService(ctx).generatePicture({
      caller: principal(owner),
      chatId: CHAT,
      mode: "character",
      subjectCharacterId: ARIA,
      identityHash: "rpg-should-be-ignored",
    });

    const rows = await db.select().from(imageryGenerations);
    // The portrait mode owns reuse — the gate's card-derived hash is stored, never the external literal.
    expect(rows[0]?.identityHash).not.toBe("rpg-should-be-ignored");
    expect(rows[0]?.identityHash).not.toBeNull();
  });
});

describe("generatePicture — B3 avatar-reference gate (doc 03 §3)", () => {
  test("an edit-capable model reads the avatar as the init image + marks the row edited (no warning)", async () => {
    const owner = await seedGenerationOwner(db, castId<Handle>("owner"));
    await seedPortraitFixtures(owner);
    const { ctx, readAssetCalls } = makeHarness(db, { resolveGenerateImage: resolutionWith(true) });

    const result = await createImageryService(ctx).generatePicture({
      caller: principal(owner),
      chatId: CHAT,
      mode: "character",
      subjectCharacterId: ARIA,
      useAvatarReference: true,
    });

    // The avatar bytes rode the owner-gated readAsset port as the edit init image.
    expect(readAssetCalls).toContain(castId<AssetId>("asset_avatar"));
    expect(result.warnings).toEqual([]);
    const rows = await db.select().from(imageryGenerations);
    expect(rows[0]?.edited).toBe(true);
  });

  test("an edit-capable model routes the avatar to the img2img init (references absent)", async () => {
    const owner = await seedGenerationOwner(db, castId<Handle>("owner"));
    await seedPortraitFixtures(owner);
    const { ctx, generateRequests } = makeHarness(db, { resolveGenerateImage: resolutionWith(true) });

    await createImageryService(ctx).generatePicture({
      caller: principal(owner),
      chatId: CHAT,
      mode: "character",
      subjectCharacterId: ARIA,
      useAvatarReference: true,
    });

    const req = generateRequests[0];
    expect(req?.edit?.image).toBeDefined();
    expect(req?.edit?.references).toBeUndefined();
  });

  test("a non-edit model DROPS the reference with an image_edit_dropped warning (never throws), row not edited", async () => {
    const owner = await seedGenerationOwner(db, castId<Handle>("owner"));
    await seedPortraitFixtures(owner);
    const { ctx, readAssetCalls } = makeHarness(db, { resolveGenerateImage: resolutionWith(false) });

    const result = await createImageryService(ctx).generatePicture({
      caller: principal(owner),
      chatId: CHAT,
      mode: "character",
      subjectCharacterId: ARIA,
      useAvatarReference: true,
    });

    // The generation still succeeded (drop-with-warning, the asymmetric posture) — just without the reference.
    expect(result.images).toHaveLength(1);
    expect(result.warnings).toEqual([{ code: "image_edit_dropped", detail: expect.stringContaining("without the avatar reference") }]);
    // The gate short-circuits before touching the avatar bytes.
    expect(readAssetCalls).not.toContain(castId<AssetId>("asset_avatar"));
    const rows = await db.select().from(imageryGenerations);
    expect(rows[0]?.edited).toBe(false);
  });

  test("useAvatarReference on a non-subject mode (free) is ignored — no reference read, no warning", async () => {
    const owner = await seedGenerationOwner(db, castId<Handle>("owner"));
    const { ctx, readAssetCalls } = makeHarness(db, { resolveGenerateImage: resolutionWith(true) });

    const result = await createImageryService(ctx).generatePicture({
      caller: principal(owner),
      mode: "free",
      prompt: "a lone tower",
      useAvatarReference: true,
    });

    expect(result.warnings).toEqual([]);
    expect(readAssetCalls).toHaveLength(0);
    const rows = await db.select().from(imageryGenerations);
    expect(rows[0]?.edited).toBe(false);
  });
});

describe("generatePicture — runner warnings surface onto the result (doc 03 §2)", () => {
  test("a runner edit-strip belt warning flows up into GeneratedPicture.warnings", async () => {
    const owner = await seedGenerationOwner(db, castId<Handle>("owner"));
    const { ctx } = makeHarness(db, {
      generateImage: () =>
        Promise.resolve({
          images: [{ base64: Buffer.from(PNG_BYTES).toString("base64"), mediaType: "image/png", url: undefined }],
          model: "img-model",
          usage: makeGenerationUsage(0.02),
          warnings: [{ code: "image_edit_dropped", detail: "img-model: the mask was dropped" }],
        }),
    });

    const result = await createImageryService(ctx).generatePicture({ caller: principal(owner), mode: "free", prompt: "an edit" });

    expect(result.warnings).toEqual([{ code: "image_edit_dropped", detail: "img-model: the mask was dropped" }]);
  });
});

describe("generatePicture — gallery auto-add", () => {
  /** A real assets service over the same db: the add runs the real owner gates, so a refusal is a real one. */
  async function realGallery(): Promise<Pick<ImageryContext, "addToGallery"> & { readonly svc: AssetsService }> {
    const assetsHarness = await makeAssetsHarness(db);
    onTestFinished(assetsHarness.cleanup);
    const svc = createAssetsService(assetsHarness.ctx);
    return {
      svc,
      addToGallery: async (caller, assetId, subjectCharacterId): Promise<void> => {
        await svc.addToGallery({ principal: caller, assetId, subjectCharacterId });
      },
    };
  }

  test("a picture generated for an owned character joins that character's gallery", async () => {
    const owner = await seedGenerationOwner(db, castId<Handle>("owner"));
    const aria = castId<CharacterId>("character_aria");
    await db.insert(characters).values(makeCharacter({ id: aria, ownerId: owner }));
    const gallery = await realGallery();
    const { ctx } = makeHarness(db, {
      addToGallery: gallery.addToGallery,
      generateImage: () =>
        Promise.resolve({
          images: [
            { base64: Buffer.from(PNG_BYTES).toString("base64"), mediaType: "image/png", url: undefined },
            { base64: Buffer.from([...PNG_BYTES, 1]).toString("base64"), mediaType: "image/png", url: undefined },
          ],
          model: "img-model",
          usage: makeGenerationUsage(0.02),
          warnings: [],
        }),
    });

    const result = await createImageryService(ctx).generatePicture({
      caller: principal(owner),
      mode: "free",
      prompt: "a lighthouse",
      n: 2,
      gallery: { subjectCharacterId: aria },
    });

    expect(result.images).toHaveLength(2);
    const items = await gallery.svc.listGallery({ principal: principal(owner), subjectCharacterId: aria, limit: 100 });
    expect(items.map((item) => item.assetId).toSorted()).toEqual(result.images.map((image) => image.assetId).toSorted());
  });

  test("no gallery request adds nothing", async () => {
    const owner = await seedGenerationOwner(db, castId<Handle>("owner"));
    const aria = castId<CharacterId>("character_aria");
    await db.insert(characters).values(makeCharacter({ id: aria, ownerId: owner }));
    const { ctx, galleryAdds } = makeHarness(db);

    await createImageryService(ctx).generatePicture({ caller: principal(owner), mode: "free", prompt: "a lighthouse" });

    expect(galleryAdds).toEqual([]);
    expect(await db.select().from(galleryItems)).toEqual([]);
  });

  test("cross-tenant: a generator who does not own the character gets the picture and no gallery row anywhere", async () => {
    const host = await seedOwner(db, castId<Handle>("host"));
    const guest = await seedGenerationOwner(db, castId<Handle>("guest"));
    const hostsCharacter = castId<CharacterId>("character_hosts");
    await db.insert(characters).values(makeCharacter({ id: hostsCharacter, ownerId: host }));
    const gallery = await realGallery();
    const { ctx, generateCalls } = makeHarness(db, { addToGallery: gallery.addToGallery });

    const result = await createImageryService(ctx).generatePicture({
      caller: principal(guest),
      mode: "free",
      prompt: "a lighthouse",
      gallery: { subjectCharacterId: hostsCharacter },
    });

    // The picture exists and is the generator's own.
    expect(generateCalls).toEqual([1]);
    const assetId = result.images[0]?.assetId;
    expect(assetId).toBeDefined();
    const stored = await db
      .select()
      .from(assets)
      .where(eq(assets.id, assetId ?? castId<AssetId>("asset_missing")));
    expect(stored[0]?.ownerId).toBe(guest);
    // Neither principal's gallery holds it.
    expect(await db.select().from(galleryItems)).toEqual([]);
    expect(await gallery.svc.listGallery({ principal: principal(host), limit: 100 })).toEqual([]);
    expect(await gallery.svc.listGallery({ principal: principal(guest), limit: 100 })).toEqual([]);
  });

  test("a reused portrait joins the gallery too", async () => {
    const owner = await seedGenerationOwner(db, castId<Handle>("owner"));
    await seedPortraitFixtures(owner);
    const { ctx, galleryAdds, generateCalls } = makeHarness(db);
    const svc = createImageryService(ctx);

    const first = await svc.generatePicture({ caller: principal(owner), chatId: CHAT, mode: "character", subjectCharacterId: ARIA });
    const reused = await svc.generatePicture({
      caller: principal(owner),
      chatId: CHAT,
      mode: "character",
      subjectCharacterId: ARIA,
      gallery: { subjectCharacterId: ARIA },
    });

    expect(reused.reused).toBe(true);
    expect(generateCalls).toEqual([1]);
    expect(galleryAdds).toEqual([{ ownerId: owner, assetId: first.images[0]?.assetId, subjectCharacterId: ARIA }]);
  });
});

describe("generatePicture — a room picture runs as the room host (D298)", () => {
  /** Which principal each funding and styling op was keyed on, in call order. */
  interface KeyedOn {
    readonly connection: UserId[];
    readonly template: UserId[];
    readonly negative: UserId[];
    readonly extraction: { readonly viewer: UserId; readonly funder: UserId }[];
  }

  function keyedHarness(): { readonly harness: ReturnType<typeof makeHarness>; readonly keyedOn: KeyedOn } {
    const keyedOn: KeyedOn = { connection: [], template: [], negative: [], extraction: [] };
    const base = makeHarness(db);
    const harness = makeHarness(db, {
      resolveGenerateImage: (runAs) => {
        keyedOn.connection.push(runAs.userId);
        return base.ctx.resolveGenerateImage(runAs);
      },
      resolvePromptTemplate: (runAs, mode) => {
        keyedOn.template.push(runAs.userId);
        return base.ctx.resolvePromptTemplate(runAs, mode);
      },
      resolveNegativeBase: (runAs) => {
        keyedOn.negative.push(runAs.userId);
        return base.ctx.resolveNegativeBase(runAs);
      },
      extractQuiet: (p) => {
        keyedOn.extraction.push({ viewer: p.caller.userId, funder: p.funderUserId });
        return Promise.resolve({ text: "keyword one", costUsd: 0.001 });
      },
    });
    return { harness, keyedOn };
  }

  async function seedRoom(): Promise<{ readonly host: UserId; readonly member: UserId }> {
    const host = await seedGenerationOwner(db, castId<Handle>("host"));
    const member = await seedOwner(db, castId<Handle>("member"));
    await db.insert(characters).values(makeCharacter({ id: ARIA, ownerId: host }));
    await seedChat();
    return { host, member };
  }

  test("a member's /imagine extraction uses the host's connection, template, negative base and Utility funder", async () => {
    const { host, member } = await seedRoom();
    const { harness, keyedOn } = keyedHarness();

    await createImageryService(harness.ctx).generatePicture({
      caller: principal(member),
      runAsUserId: host,
      chatId: CHAT,
      mode: "scenario",
      gallery: { subjectCharacterId: ARIA },
    });

    expect(keyedOn).toEqual({ connection: [host], template: [host], negative: [host], extraction: [{ viewer: member, funder: host }] });
    expect(harness.generateRequests.map((req) => req.owner)).toEqual([host]);
    // The bytes, the spend and the gallery row are the host's; the member owns nothing new.
    expect((await db.select().from(assets)).map((row) => row.ownerId)).toEqual([host]);
    expect(harness.recordedStats.map((delta) => delta.ownerId)).toEqual([host]);
    expect(harness.galleryAdds.map((add) => add.ownerId)).toEqual([host]);
  });

  test("a member's free-mode reply picture uses the host's connection and negative base, and spends no extraction", async () => {
    const { host, member } = await seedRoom();
    const { harness, keyedOn } = keyedHarness();

    await createImageryService(harness.ctx).generatePicture({ caller: principal(member), runAsUserId: host, chatId: CHAT, mode: "free", prompt: "a lantern" });

    expect(keyedOn).toEqual({ connection: [host], template: [], negative: [host], extraction: [] });
    expect((await db.select().from(assets)).map((row) => row.ownerId)).toEqual([host]);
  });

  test("outside a room the picture stays the caller's", async () => {
    const owner = await seedGenerationOwner(db, castId<Handle>("owner"));
    const { harness, keyedOn } = keyedHarness();

    await createImageryService(harness.ctx).generatePicture({ caller: principal(owner), mode: "free", prompt: "a lantern" });

    expect(keyedOn).toEqual({ connection: [owner], template: [], negative: [owner], extraction: [] });
    expect((await db.select().from(assets)).map((row) => row.ownerId)).toEqual([owner]);
    expect(harness.recordedStats.map((delta) => delta.ownerId)).toEqual([owner]);
  });
});
