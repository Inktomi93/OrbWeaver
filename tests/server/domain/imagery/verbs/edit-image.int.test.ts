// verb: editImage — explicit edit of an owned image (imagery-design/02 §4). Proves against a real libSQL db:
// the source bytes are resolved (owned asset via readAsset, or direct upload bytes), the CAPABILITY GATE
// throws `ImageEditUnsupportedError` on a non-edit model (the asymmetric posture — doc 01 §3.4), and a
// successful edit stores a `kind:"generated"` asset + an `imagery_generations` row (`edited:true`,
// `mode:"free"`, `identityHash` null — never reuse-gated) with the instruction as the verbatim prompt.

import type { ResolvedCredential } from "@orb/contracts/credentials";
import type { Db } from "@orb/db";
import { assets, imageryGenerations } from "@orb/db";
import type { AssetId, ModelId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ImageGenerateRequest, ImageryContext } from "@orb/server/domain/imagery";
import { createImageryService, ImageEditUnsupportedError } from "@orb/server/domain/imagery";
import { passthroughImageNormalizer } from "@orb/server/infra/providers/backends/kit";
import { runGenerateImage } from "@orb/server/infra/providers/backends/openrouter";
import { eq } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import { freshDb } from "../../../../support/db";
import { expect, test } from "../../../../support/fixtures";
import { makeHarness, PNG_BYTES, principal, resolutionWith, seedOwner } from "../_support";

let db: Db;

beforeEach(async () => {
  db = await freshDb();
});

const SOURCE_ASSET = castId<AssetId>("asset_source");

describe("editImage — the capability gate (doc 03 §1)", () => {
  test("a non-edit model throws ImageEditUnsupportedError — no asset, no row", async () => {
    const owner = await seedOwner(db, "owner");
    const { ctx } = makeHarness(db, { resolveGenerateImage: resolutionWith(false) });

    await expect(
      createImageryService(ctx).editImage({
        caller: principal(owner),
        source: { assetId: SOURCE_ASSET },
        instruction: "make it night",
      }),
    ).rejects.toThrow(ImageEditUnsupportedError);

    expect(await db.select().from(imageryGenerations)).toHaveLength(0);
    // No GENERATED asset was written (the source is read, never stored by this verb).
    expect(await db.select().from(assets)).toHaveLength(0);
  });
});

describe("editImage — the edit path (doc 02 §4)", () => {
  test("an owned-asset source is read via readAsset, edited, and stored (edited:true, mode:free, no identity hash)", async () => {
    const owner = await seedOwner(db, "owner");
    const editReqs: ImageGenerateRequest[] = [];
    const { ctx, readAssetCalls } = makeHarness(db, {
      resolveGenerateImage: resolutionWith(true),
      generateImage: (req) => {
        editReqs.push(req);
        return Promise.resolve({
          images: [{ base64: Buffer.from(PNG_BYTES).toString("base64"), mediaType: "image/png", url: undefined }],
          model: "edit-model",
          usage: { costUsd: 0.04 },
          warnings: [],
        });
      },
    });

    const result = await createImageryService(ctx).editImage({
      caller: principal(owner),
      source: { assetId: SOURCE_ASSET },
      instruction: "make it night",
    });

    // The source rode the owner-gated readAsset port and became the edit init image.
    expect(readAssetCalls).toContain(SOURCE_ASSET);
    expect(editReqs).toHaveLength(1);
    expect(editReqs[0]?.edit?.image).toEqual(PNG_BYTES);
    expect(editReqs[0]?.prompt).toBe("make it night");

    expect(result.promptSource).toBe("user");
    expect(result.mode).toBe("free");
    expect(result.reused).toBe(false);
    expect(result.costUsd).toBe(0.04);

    const rows = await db.select().from(imageryGenerations);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ mode: "free", prompt: "make it night", edited: true });
    expect(rows[0]?.identityHash).toBeNull();
    expect(rows[0]?.subjectCharacterId).toBeNull();
    const assetRows = await db.select().from(assets).where(eq(assets.ownerId, owner));
    expect(assetRows[0]?.kind).toBe("generated");
  });

  test("an upload-bytes source is used directly — readAsset is never called; a mask rides the edit payload", async () => {
    const owner = await seedOwner(db, "owner");
    const editReqs: ImageGenerateRequest[] = [];
    const maskBytes = Uint8Array.from([9, 9, 9, 9]);
    const { ctx, readAssetCalls } = makeHarness(db, {
      resolveGenerateImage: resolutionWith(true),
      generateImage: (req) => {
        editReqs.push(req);
        return Promise.resolve({
          images: [{ base64: Buffer.from(PNG_BYTES).toString("base64"), mediaType: "image/png", url: undefined }],
          model: "edit-model",
          usage: { costUsd: 0.04 },
          warnings: [],
        });
      },
    });

    await createImageryService(ctx).editImage({
      caller: principal(owner),
      source: { bytes: PNG_BYTES, mime: "image/png" },
      instruction: "add a scar",
      mask: { bytes: maskBytes, mime: "image/png" },
    });

    expect(readAssetCalls).toHaveLength(0);
    expect(editReqs[0]?.edit?.image).toEqual(PNG_BYTES);
    expect(editReqs[0]?.edit?.mask).toEqual(maskBytes);
  });

  test("a runner belt warning (e.g. a dropped mask) surfaces onto the result", async () => {
    const owner = await seedOwner(db, "owner");
    const { ctx } = makeHarness(db, {
      resolveGenerateImage: resolutionWith(true),
      generateImage: () =>
        Promise.resolve({
          images: [{ base64: Buffer.from(PNG_BYTES).toString("base64"), mediaType: "image/png", url: undefined }],
          model: "edit-model",
          usage: { costUsd: 0.04 },
          warnings: [{ code: "image_edit_dropped", detail: "edit-model: the mask was dropped" }],
        }),
    });

    const result = await createImageryService(ctx).editImage({
      caller: principal(owner),
      source: { bytes: PNG_BYTES, mime: "image/png" },
      instruction: "add a scar",
      mask: { bytes: Uint8Array.from([1, 2]), mime: "image/png" },
    });

    expect(result.warnings).toEqual([{ code: "image_edit_dropped", detail: "edit-model: the mask was dropped" }]);
  });
});

// ── composed-real: the resolved capability must ride domain → the REAL openrouter runner edit-strip belt ──
// The domain suites above assert against a FAKE `generateImage` that records the request and never runs the
// belt — so a missing `capability` on the request was invisible (the graduation-audit finding). These tests
// wire the domain to the REAL `runGenerateImage` through the EXACT compose bridge (real runner + the
// ResolvedWarning→ImageryWarning map) and assert BOTH belt directions on the wire the provider would see.

const GEN_MODEL = "openrouter/image-gen";
const OK_RESPONSE = {
  choices: [{ finishReason: "stop", index: 0, message: { role: "assistant", images: [{ imageUrl: { url: "data:image/png;base64,AAAA" } }] } }],
  created: 0,
  id: "g",
  model: GEN_MODEL,
  systemFingerprint: null,
  usage: { promptTokens: 1, completionTokens: 0, totalTokens: 1, cost: 0.04 },
};

type GenClient = Parameters<typeof runGenerateImage>[0];

interface ContentPart {
  readonly type?: string;
  readonly imageUrl?: { readonly url?: string };
  readonly text?: string;
}
interface UserMessage {
  readonly role?: string;
  readonly content?: string | readonly ContentPart[];
}

/** A fake OpenRouter chat client that captures the built `chatRequest` and returns one image. */
function capturingGenClient(): { client: GenClient; captured: { body: Record<string, unknown> | undefined } } {
  const captured: { body: Record<string, unknown> | undefined } = { body: undefined };
  // FABRICATION-OK: chat.send is the ONLY client surface runGenerateImage touches; the cast bridges the partial fake.
  const client = {
    chat: {
      send: (req: { chatRequest: Record<string, unknown> }): Promise<unknown> => {
        captured.body = req.chatRequest;
        return Promise.resolve(OK_RESPONSE);
      },
    },
  } as unknown as GenClient;
  return { client, captured };
}

/** The built user-message content the runner put on the wire. */
function userContent(body: Record<string, unknown> | undefined): string | readonly ContentPart[] {
  const messages = (body?.["messages"] ?? []) as readonly UserMessage[];
  return messages.find((m) => m.role === "user")?.content ?? [];
}

/** The EXACT compose `generateImage` op: the REAL openrouter runner + the ResolvedWarning→ImageryWarning map
 *  (`entry/compose/services.ts`). The domain request rides through unchanged, so a dropped `capability` would
 *  strip every edit here just as it would in production. */
function realRunnerBridge(client: GenClient): ImageryContext["generateImage"] {
  return async (req) => {
    const result = await runGenerateImage(client, req, passthroughImageNormalizer);
    return {
      images: result.images,
      model: result.model,
      usage: result.usage,
      warnings: result.warnings.flatMap((w) => (w.code === "image_edit_dropped" ? [{ code: "image_edit_dropped" as const, detail: w.message }] : [])),
    };
  };
}

describe("editImage — composed-real: the resolved capability rides domain → the real runner belt (graduation-audit finding 1)", () => {
  test("(a) an edit-capable model: the edit init image SURVIVES to the wire, no image_edit_dropped warning", async () => {
    const owner = await seedOwner(db, "owner");
    const { client, captured } = capturingGenClient();
    const { ctx } = makeHarness(db, {
      resolveGenerateImage: resolutionWith(true),
      generateImage: realRunnerBridge(client),
    });

    const result = await createImageryService(ctx).editImage({
      caller: principal(owner),
      source: { bytes: PNG_BYTES, mime: "image/png" },
      instruction: "make it night",
    });

    const content = userContent(captured.body);
    const parts = (Array.isArray(content) ? content : []) as readonly ContentPart[];
    // The edit init image reached the wire as an image_url part BEFORE the instruction text — the belt saw
    // `capability.input.imageEdit === true` (forwarded by the verb) and let the edit through.
    expect(parts[0]?.type).toBe("image_url");
    expect(parts[0]?.imageUrl?.url?.startsWith("data:image/png;base64,")).toBe(true);
    expect(parts.at(-1)).toEqual({ type: "text", text: "make it night" });
    // The belt did NOT strip → zero warnings surfaced (pre-fix, capability was undefined → strip + warning).
    expect(result.warnings).toEqual([]);
  });

  test("(b) a non-edit capability: the same real bridge strips the edit + surfaces the mapped image_edit_dropped warning", async () => {
    const { client, captured } = capturingGenClient();
    const bridge = realRunnerBridge(client);

    const result = await bridge({
      // FABRICATION-OK: minimal request — the runner reads model/prompt/edit/capability only.
      credential: {} as unknown as ResolvedCredential,
      model: castId<ModelId>("img-model"),
      prompt: "make it night",
      // FABRICATION-OK: the runner belt reads only `capability.input.imageEdit`.
      capability: { input: { vision: false, imageEdit: false } } as unknown as ImageGenerateRequest["capability"],
      edit: { image: PNG_BYTES },
    });

    // Stripped: the wire fell back to the plain instruction string (no image parts).
    expect(userContent(captured.body)).toBe("make it night");
    // The runner's ResolvedWarning mapped onto the domain ImageryWarning shape ({code,detail}).
    expect(result.warnings).toEqual([{ code: "image_edit_dropped", detail: expect.stringContaining("image-edit") }]);
  });
});
