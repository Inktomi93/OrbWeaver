// Only host or present-owner assets reach byte processing, and an attached asset's message_assets link row
// records its attached origin.
// @subject packages/server/src/entry/compose/imagery.ts

import { DEFAULT_ATTACHMENT_QUALITY } from "@orb/contracts/inference";
import { messageAssets } from "@orb/db";
import { databaseHandle } from "@orb/db/wiring-driver";
import { createResolveMediaRef } from "@orb/server/domain/chat";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness, seedCorpusActors } from "@orb/testkit/node/composed";
import { seedChatRows, seedMessageRows } from "@orb/testkit/node/rows";
import { eq } from "drizzle-orm";
import { vi } from "vitest";
import { seatMember } from "../verbs/media-and-imagery-authority.fixtures.ts";

test("only host or PRESENT owner assets reach byte processing; conversion remains deferred with caller quality and signal", async () => {
  await using root = await createServerHarness();
  // The host's chat binding funds the member's committed attachment line.
  const { owner: host, secondUserId } = await seedCorpusActors(root);
  const member = await root.principalFor(secondUserId);
  const { services, db } = root;
  const { row: room } = await seedChatRows(root, { principal: host, characterIds: [] });
  await seatMember(root, host, room.id, member);
  const bytes = new Uint8Array([9, 8, 7]);
  const asset = await services.assets.store({ principal: member, bytes, kind: "attachment", mime: "video/webm" });
  // The member's own attachment link places the clip in the room; this case pins presence and deferral.
  const attachedIn = await seedMessageRows(root, {
    principal: member,
    chatId: room.id,
    content: `![clip](asset:${asset.assetId})`,
    attachmentAssetIds: [asset.assetId],
  });
  expect((await db.select().from(messageAssets).where(eq(messageAssets.messageId, attachedIn.slot.id))).map((link) => link.origin)).toEqual(["attached"]);
  const prepareVideo = vi.fn<Parameters<typeof createResolveMediaRef>[0]["mediaProcessing"]["prepareVideo"]>(() => Promise.resolve(bytes));
  const read = vi.spyOn(services.assets, "loadAssetBytes");
  let forbidden = false;
  const resolve = createResolveMediaRef({
    db: databaseHandle(db),
    assets: services.assets,
    mediaProcessing: { frameCount: () => Promise.resolve(1), prepareVideo },
    forbidExternalMedia: () => forbidden,
  });
  const signal = new AbortController().signal;
  const resolved = await resolve({
    ownerId: host.userId,
    chatId: room.id,
    ref: { kind: "asset", assetId: asset.assetId },
    quality: { ...DEFAULT_ATTACHMENT_QUALITY, videoMaxResolution: "original" },
    signal,
  });
  expect(resolved?.media).toBe("video");
  expect(prepareVideo).not.toHaveBeenCalled();
  if (resolved === null || typeof resolved.url !== "function") {
    throw new Error("expected deferred conversion");
  }
  expect(await resolved.url()).toBe(`data:video/webm;base64,${Buffer.from(bytes).toString("base64")}`);
  expect(prepareVideo).toHaveBeenCalledWith(expect.any(Uint8Array), "video/webm", "original", { signal });
  expect(Array.from(prepareVideo.mock.calls[0]?.[0] ?? [])).toEqual(Array.from(bytes));
  await services.chat.selfLeave({ principal: member, chatId: room.id });
  read.mockClear();
  const refused = await resolve({ ownerId: host.userId, chatId: room.id, ref: { kind: "asset", assetId: asset.assetId } });
  let emitted: string | null = null;
  if (refused !== null) {
    emitted = typeof refused.url === "function" ? await refused.url() : refused.url;
  }
  expect(emitted).toBeNull();
  expect(prepareVideo).toHaveBeenCalledTimes(1);
  expect(read).not.toHaveBeenCalled();
  expect(await resolve({ ownerId: member.userId, chatId: room.id, ref: { kind: "asset", assetId: asset.assetId } })).not.toBeNull();
  forbidden = true;
  expect(await resolve({ ownerId: host.userId, chatId: room.id, ref: { kind: "external", url: "https://cdn.example/image" } })).toBeNull();
  forbidden = false;
  expect(await resolve({ ownerId: host.userId, chatId: room.id, ref: { kind: "external", url: "https://cdn.example/image" } })).toEqual({
    media: "image",
    url: "https://cdn.example/image",
  });
});
