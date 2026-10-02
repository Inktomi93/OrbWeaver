// Authorized stored media is prepared before wire encoding. Refused references never reach byte processing.

import type { ContentImageRef } from "@orb/kit/content";
import type { AssetId, ChatId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ResolvedMediaRef } from "@orb/server/domain/chat";
import type { ImageRefAssets } from "@orb/server/entry/compose";
import { resolveImageRefToUrl } from "@orb/server/entry/compose";
import { describe, vi } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";

const HOST = castId<UserId>("u_host");
const MEMBER = castId<UserId>("u_member");
const STRANGER = castId<UserId>("u_stranger");
const CHAT = castId<ChatId>("chat_a");
const ASSET_ID = castId<AssetId>("asset_pic1");

const assetRef = (assetId = ASSET_ID): ContentImageRef => ({ kind: "asset", assetId });
const dataUri = (mime: string, bytes: number[] | Uint8Array): string => `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;

async function materialized(ref: ResolvedMediaRef | null): Promise<ResolvedMediaRef | null> {
  return ref === null ? null : { ...ref, url: typeof ref.url === "string" ? ref.url : await ref.url() };
}

/** Assets fake: the named owner + a fixed mime/bytes. `undefined` owner = a gone row. */
function assetsOwnedBy(owner: UserId | undefined, mime = "image/png", bytes: Uint8Array = new Uint8Array([7])): ImageRefAssets {
  return {
    frameCount: vi.fn(() => Promise.resolve(2)),
    prepareVideo: vi.fn((input: Uint8Array) => Promise.resolve(input)),
    assetCasRefById: () => Promise.resolve(owner === undefined ? undefined : { ownerId: owner, mime }),
    loadAssetBytes: vi.fn(() => Promise.resolve(bytes)),
  };
}
const present =
  (ids: readonly UserId[]) =>
  (userId: UserId, chatId: ChatId): Promise<boolean> =>
    Promise.resolve(chatId === CHAT && ids.includes(userId));

describe("resolveImageRefToUrl", () => {
  test("static GIF is an image while animated GIF is converted before data URI encoding", async () => {
    const bytes = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0, 0, 0]);
    const transformed = new Uint8Array([1, 2, 3]);
    const prepare = vi.fn(() => Promise.resolve(transformed));
    const media = { frameCount: () => Promise.resolve(1), prepareVideo: prepare };
    const params = { ownerId: HOST, chatId: CHAT, ref: assetRef() };
    expect(await resolveImageRefToUrl({ ...assetsOwnedBy(HOST, "image/gif", bytes), ...media }, present([]), false, params)).toEqual({
      media: "image",
      url: dataUri("image/gif", bytes),
    });
    expect(prepare).not.toHaveBeenCalled();
    const animated = await resolveImageRefToUrl(
      { ...assetsOwnedBy(HOST, "image/gif", bytes), ...media, frameCount: () => Promise.resolve(2) },
      present([]),
      false,
      params,
    );
    expect(prepare).not.toHaveBeenCalled();
    expect(await materialized(animated)).toEqual({ media: "video", url: dataUri("video/mp4", transformed) });
    expect(prepare).toHaveBeenCalledWith(bytes, "image/gif", "720", { signal: undefined });
  });
  test("external ref passes through when NOT forbidden (assets never touched)", async () => {
    const url = await resolveImageRefToUrl(assetsOwnedBy(HOST), present([]), false, {
      ownerId: HOST,
      chatId: CHAT,
      ref: { kind: "external", url: "https://example.com/x.png" },
    });
    expect(url).toEqual({ url: "https://example.com/x.png", media: "image" });
  });

  test("F7a: external ref is BLOCKED → null when forbidExternalMedia is set (D44 §12.3)", async () => {
    const gate = vi.fn(present([]));
    const url = await resolveImageRefToUrl(assetsOwnedBy(HOST), gate, true, {
      ownerId: HOST,
      chatId: CHAT,
      ref: { kind: "external", url: "https://example.com/x.png" },
    });
    expect(url).toBeNull();
    // The gate is an ASSET-owner reference-check; an external block never touches assets/membership.
    expect(gate).not.toHaveBeenCalled();
  });

  test("host-owned asset resolves WITHOUT a membership read (owner === host short-circuit)", async () => {
    const gate = vi.fn(present([]));
    const url = await resolveImageRefToUrl(assetsOwnedBy(HOST), gate, false, {
      ownerId: HOST,
      chatId: CHAT,
      ref: assetRef(),
    });
    expect(url).toEqual({ url: dataUri("image/png", [7]), media: "image" });
    expect(gate).not.toHaveBeenCalled();
  });

  test("asset ref is unaffected by forbidExternalMedia (the gate is external-only)", async () => {
    const url = await resolveImageRefToUrl(assetsOwnedBy(HOST), present([]), true, {
      ownerId: HOST,
      chatId: CHAT,
      ref: assetRef(),
    });
    expect(url).toEqual({ url: dataUri("image/png", [7]), media: "image" });
  });

  test("a present member's own asset resolves (the D21 in-room reference-check)", async () => {
    const gate = vi.fn(present([MEMBER]));
    const gifBytes = Uint8Array.from(Buffer.from("GIF89a"));
    const assets = assetsOwnedBy(MEMBER, "image/gif", gifBytes);
    const url = await resolveImageRefToUrl(assets, gate, false, {
      ownerId: HOST,
      chatId: CHAT,
      ref: assetRef(),
    });
    expect(assets.prepareVideo).not.toHaveBeenCalled();
    expect(await materialized(url)).toEqual({ url: dataUri("video/mp4", gifBytes), media: "video" });
    expect(gate).toHaveBeenCalledWith(MEMBER, CHAT);
    expect(assets.loadAssetBytes).toHaveBeenCalledExactlyOnceWith(ASSET_ID);
    expect(assets.frameCount).toHaveBeenCalledExactlyOnceWith(gifBytes);
    expect(assets.prepareVideo).toHaveBeenCalledExactlyOnceWith(gifBytes, "image/gif", "720", { signal: undefined });
  });

  // ── #317 media-kind classification (the video twin) ─────────────────────────────────────────────

  test("a video/mp4 asset classifies media:'video' (the data URI keeps the stored mime)", async () => {
    const bytes = new Uint8Array([9, 9, 9]);
    const url = await resolveImageRefToUrl(assetsOwnedBy(HOST, "video/mp4", bytes), present([]), false, {
      ownerId: HOST,
      chatId: CHAT,
      ref: assetRef(),
    });
    expect(await materialized(url)).toEqual({ url: dataUri("video/mp4", bytes), media: "video" });
  });

  test("a video/webm asset classifies media:'video'", async () => {
    const url = await resolveImageRefToUrl(assetsOwnedBy(HOST, "video/webm"), present([]), false, {
      ownerId: HOST,
      chatId: CHAT,
      ref: assetRef(),
    });
    expect(url?.media).toBe("video");
  });

  test("an animated GIF uses the video preparation path and MP4 wire label", async () => {
    // Real GIF magic so kit's sniff recognizes it ("GIF89a" + trailing bytes).
    const gifBytes = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0, 0, 0]);
    const url = await resolveImageRefToUrl(assetsOwnedBy(HOST, "image/gif", gifBytes), present([]), false, {
      ownerId: HOST,
      chatId: CHAT,
      ref: assetRef(),
    });
    expect(await materialized(url)).toEqual({ url: dataUri("video/mp4", gifBytes), media: "video" });
  });

  test("a claimed-gif mime whose BYTES are not a gif stays media:'image' (the sniff, not the label, decides motion)", async () => {
    const url = await resolveImageRefToUrl(assetsOwnedBy(HOST, "image/gif", new Uint8Array([7])), present([]), false, {
      ownerId: HOST,
      chatId: CHAT,
      ref: assetRef(),
    });
    expect(url?.media).toBe("image");
  });

  test("a non-participant owner's asset is refused → null (no cross-chat oracle)", async () => {
    const assets = assetsOwnedBy(STRANGER, "image/gif", Uint8Array.from(Buffer.from("GIF89a")));
    const url = await resolveImageRefToUrl(assets, present([MEMBER]), false, {
      ownerId: HOST,
      chatId: CHAT,
      ref: assetRef(),
    });
    expect(url).toBeNull();
    expect(assets.loadAssetBytes).not.toHaveBeenCalled();
    expect(assets.frameCount).not.toHaveBeenCalled();
    expect(assets.prepareVideo).not.toHaveBeenCalled();
  });

  test("a gone asset (no row) → null, without a membership read", async () => {
    const gate = vi.fn(present([MEMBER]));
    const assets = assetsOwnedBy(undefined, "image/gif", Uint8Array.from(Buffer.from("GIF89a")));
    const url = await resolveImageRefToUrl(assets, gate, false, {
      ownerId: HOST,
      chatId: CHAT,
      ref: assetRef(),
    });
    expect(url).toBeNull();
    expect(gate).not.toHaveBeenCalled();
    expect(assets.loadAssetBytes).not.toHaveBeenCalled();
    expect(assets.frameCount).not.toHaveBeenCalled();
    expect(assets.prepareVideo).not.toHaveBeenCalled();
  });
});
