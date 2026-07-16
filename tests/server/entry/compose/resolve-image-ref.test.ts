// entry/compose/resolve-image-ref — the D45 asset→URL gate. Two things locked: (1) the ROW-ID→row resolve
// (the shipped bug passed the id where a hash was expected, dropping every asset image); (2) the D21
// reference-check — an asset resolves only if its owner is the turn HOST or a PRESENT participant of the
// referencing chat (a group member's own upload renders; a stranger's asset is refused), NOT a bare
// hash→any-owner oracle (PD-107).

import type { ContentImageRef } from "@orb/kit/content";
import type { ChatId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ImageRefAssets } from "@orb/server/entry/compose";
import { resolveImageRefToUrl } from "@orb/server/entry/compose";
import { describe, vi } from "vitest";
import { expect, test } from "../../../support/fixtures";

const HOST = castId<UserId>("u_host");
const MEMBER = castId<UserId>("u_member");
const STRANGER = castId<UserId>("u_stranger");
const CHAT = castId<ChatId>("chat_a");
const ASSET_ID = "asset_pic1";

const assetRef = (assetId = ASSET_ID): ContentImageRef => ({ kind: "asset", assetId });
const dataUri = (mime: string, bytes: number[]): string => `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;

/** Assets fake: the named owner + a fixed mime, with 1-byte content. `undefined` owner = a gone row. */
function assetsOwnedBy(owner: UserId | undefined): ImageRefAssets {
  return {
    assetCasRefById: () => Promise.resolve(owner === undefined ? undefined : { ownerId: owner, mime: "image/png" }),
    loadAssetBytes: () => Promise.resolve(new Uint8Array([7])),
  };
}
const present =
  (ids: readonly UserId[]) =>
  (userId: UserId, _chatId: ChatId): Promise<boolean> =>
    Promise.resolve(ids.includes(userId));

describe("resolveImageRefToUrl", () => {
  test("external ref passes through when NOT forbidden (assets never touched)", async () => {
    const url = await resolveImageRefToUrl(assetsOwnedBy(HOST), present([]), false, {
      ownerId: HOST,
      chatId: CHAT,
      ref: { kind: "external", url: "https://example.com/x.png" },
    });
    expect(url).toBe("https://example.com/x.png");
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
    expect(url).toBe(dataUri("image/png", [7]));
    expect(gate).not.toHaveBeenCalled();
  });

  test("asset ref is unaffected by forbidExternalMedia (the gate is external-only)", async () => {
    const url = await resolveImageRefToUrl(assetsOwnedBy(HOST), present([]), true, {
      ownerId: HOST,
      chatId: CHAT,
      ref: assetRef(),
    });
    expect(url).toBe(dataUri("image/png", [7]));
  });

  test("a present member's own asset resolves (the D21 in-room reference-check)", async () => {
    const gate = vi.fn(present([MEMBER]));
    const url = await resolveImageRefToUrl(assetsOwnedBy(MEMBER), gate, false, {
      ownerId: HOST,
      chatId: CHAT,
      ref: assetRef(),
    });
    expect(url).toBe(dataUri("image/png", [7]));
    expect(gate).toHaveBeenCalledWith(MEMBER, CHAT);
  });

  test("a non-participant owner's asset is refused → null (no cross-chat oracle)", async () => {
    const url = await resolveImageRefToUrl(assetsOwnedBy(STRANGER), present([MEMBER]), false, {
      ownerId: HOST,
      chatId: CHAT,
      ref: assetRef(),
    });
    expect(url).toBeNull();
  });

  test("a gone asset (no row) → null, without a membership read", async () => {
    const gate = vi.fn(present([MEMBER]));
    const url = await resolveImageRefToUrl(assetsOwnedBy(undefined), gate, false, {
      ownerId: HOST,
      chatId: CHAT,
      ref: assetRef(),
    });
    expect(url).toBeNull();
    expect(gate).not.toHaveBeenCalled();
  });
});
