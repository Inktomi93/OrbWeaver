// verb: resolveChatAssetRefs (#67 co-participant render) — the CHAT-SCOPED render resolver. Attack-path proof
// that the gate is STRUCTURAL (a `message_assets` reference IN the chat + owner present + caller present), NOT
// bare chat-membership:
//   • a PRESENT co-participant resolves another present member's attachment (the feature);
//   • a NON-participant caller resolves nothing (leak-free);
//   • an asset OWNED by a present participant but NOT referenced by any `message_assets` row in this chat does
//     NOT resolve (membership is not sufficient — the structural reference is the gate);
//   • the owner's own attachment still resolves (the owner path via the chat-scoped call);
//   • once the OWNER leaves the chat, the attachment stops resolving (mirrors `resolve-image-ref.ts`).

import type { Db } from "@orb/db";
import type { AssetId, ChatId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { AssetsService } from "@orb/server/domain/assets";
import { createAssetsService } from "@orb/server/domain/assets";
import { describe, onTestFinished } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import type { AssetsHarness } from "../_support.ts";
import {
  makeHarness,
  pngBytes,
  principal,
  seedChatRow,
  seedMessage,
  seedMessageAsset,
  seedParticipant,
  seedUser,
} from "../_support.ts";

const PNG = "image/png";

interface AttachScenario {
  readonly svc: AssetsService;
  readonly owner: UserId;
  readonly member: UserId;
  readonly outsider: UserId;
  readonly chatId: ChatId;
  readonly assetId: AssetId;
  readonly hash: string;
}

// owner A uploads an attachment, sends a message in a shared chat, and that message links the asset via
// `message_assets`. B is a present co-participant; C is an outsider (never in the chat). The rosterings vary
// per case (that's what the gate keys on), so only the base facts are seeded here.
async function seedAttachment(db: Db, h: AssetsHarness): Promise<AttachScenario> {
  const svc = createAssetsService(h.ctx);
  const owner = await seedUser(db, { handle: "owner" });
  const member = await seedUser(db, { handle: "member" });
  const outsider = await seedUser(db, { handle: "outsider" });
  const stored = await svc.store({
    principal: principal(owner),
    bytes: pngBytes(1, 2, 3),
    kind: "attachment",
    mime: PNG,
  });
  const chatId = await seedChatRow(db, "chat_shared");
  const messageId = await seedMessage(db, chatId, { id: "message_a", seq: 0 });
  await seedMessageAsset(db, messageId, stored.assetId);
  return { svc, owner, member, outsider, chatId, assetId: stored.assetId, hash: stored.hash };
}

describe("resolveChatAssetRefs — #67 co-participant render", () => {
  test("a PRESENT co-participant resolves another present member's attachment", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const s = await seedAttachment(db, h);
    await seedParticipant(db, s.chatId, "human", { id: "cp_owner", userId: s.owner, role: "host" });
    await seedParticipant(db, s.chatId, "human", { id: "cp_member", userId: s.member });

    const refs = await s.svc.resolveChatAssetRefs(s.member, s.chatId, [s.assetId]);
    expect(refs.map((r) => [r.assetId, r.hash])).toEqual([[s.assetId, s.hash]]);
  });

  test("the OWNER resolves their own attachment via the chat-scoped path", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const s = await seedAttachment(db, h);
    await seedParticipant(db, s.chatId, "human", { id: "cp_owner", userId: s.owner, role: "host" });

    const refs = await s.svc.resolveChatAssetRefs(s.owner, s.chatId, [s.assetId]);
    expect(refs.map((r) => [r.assetId, r.hash])).toEqual([[s.assetId, s.hash]]);
  });

  test("a NON-participant caller resolves nothing (leak-free)", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const s = await seedAttachment(db, h);
    await seedParticipant(db, s.chatId, "human", { id: "cp_owner", userId: s.owner, role: "host" });
    // The member IS present, but the CALLER (outsider) is not — the caller-present gate fails.

    const refs = await s.svc.resolveChatAssetRefs(s.outsider, s.chatId, [s.assetId]);
    expect(refs).toEqual([]);
  });

  test("structural, not membership: a present member's asset NOT attached in this chat does NOT resolve", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const s = await seedAttachment(db, h);
    await seedParticipant(db, s.chatId, "human", { id: "cp_owner", userId: s.owner, role: "host" });
    await seedParticipant(db, s.chatId, "human", { id: "cp_member", userId: s.member });
    // The owner uploads a SECOND asset but never attaches it to any message in this chat — owner is a present
    // participant, yet the asset has no `message_assets` row here. Bare membership must NOT resolve it.
    const unattached = await s.svc.store({
      principal: principal(s.owner),
      bytes: pngBytes(9, 8, 7),
      kind: "attachment",
      mime: PNG,
    });

    const refs = await s.svc.resolveChatAssetRefs(s.member, s.chatId, [unattached.assetId]);
    expect(refs).toEqual([]);
  });

  test("owner-present gate: once the owner LEAVES the chat, the attachment stops resolving", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const s = await seedAttachment(db, h);
    // Owner has departed (leftSeq set); member is still present. Mirrors resolve-image-ref: a departed
    // member's upload no longer renders for the room.
    await seedParticipant(db, s.chatId, "human", {
      id: "cp_owner",
      userId: s.owner,
      role: "host",
      leftSeq: 5,
    });
    await seedParticipant(db, s.chatId, "human", { id: "cp_member", userId: s.member });

    const refs = await s.svc.resolveChatAssetRefs(s.member, s.chatId, [s.assetId]);
    expect(refs).toEqual([]);
  });

  test("an attachment referenced only in a DIFFERENT chat does not resolve here", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const s = await seedAttachment(db, h);
    // A second chat both users are present in — but the asset is attached only in the FIRST chat.
    const otherChat = await seedChatRow(db, "chat_other");
    await seedParticipant(db, otherChat, "human", {
      id: "cp_o_owner",
      userId: s.owner,
      role: "host",
    });
    await seedParticipant(db, otherChat, "human", { id: "cp_o_member", userId: s.member });

    const refs = await s.svc.resolveChatAssetRefs(s.member, otherChat, [s.assetId]);
    expect(refs).toEqual([]);
  });

  test("empty input + an unknown id both resolve to empty", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const s = await seedAttachment(db, h);
    await seedParticipant(db, s.chatId, "human", { id: "cp_member", userId: s.member });

    expect(await s.svc.resolveChatAssetRefs(s.member, s.chatId, [])).toEqual([]);
    expect(
      await s.svc.resolveChatAssetRefs(s.member, s.chatId, [castId<AssetId>("asset_missing")]),
    ).toEqual([]);
  });
});
