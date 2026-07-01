// The invite lifecycle + THE participant-insert chokepoint (chat.md Part III §2). Proves against a real
// libSQL db: the token is stored HASHED (never raw), the atomic redeem inserts a server-forced `member` at the
// canon head, the re-add upsert re-joins a previously-left member, revoke/decline flip status, and an invalid
// token is a leak-free NOT_FOUND. The `hashToken`/`newInviteId`/`loadParticipantViews` deps are faked (the
// root wires the real ones — see invites.ts FLAG[invite-deps-not-on-ctx]). The verbs are reached through the
// grouped-file BUNDLE (`createInvites(ctx, deps)`).

import type { ParticipantView } from "@orb/contracts/chat";
import type { Principal } from "@orb/contracts/identity";
import type { Db } from "@orb/db";
import { chatInvites, chatParticipants } from "@orb/db";
import { DomainNotFoundError, DomainOperationError } from "@orb/kit/errors";
import type { ChatId, ChatInviteId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { and, eq, isNull } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import { ChatOperationError } from "../../../../../packages/server/src/domain/chat/contract/errors";
import { createInvites } from "../../../../../packages/server/src/domain/chat/verbs/invites";
import { freshDb } from "../../../../support/db";
import { expect, test } from "../../../../support/fixtures";
import { FROZEN_AT, makeChatContext, seedChat, seedParticipant, seedUser } from "../_support";

let db: Db;
let emitted: number;

beforeEach(async () => {
  db = await freshDb();
  emitted = 0;
});

function principal(userId: UserId): Principal {
  return { userId, role: "user", handle: castId<Handle>(userId), externalId: null, via: "cookie" };
}

/** A fake roster resolver — maps present `chat_participants` rows to minimal `ParticipantView`s (the root
 *  resolves the real `users` publics; here the handle/name derive from the id). */
async function loadParticipantViews(chatId: ChatId): Promise<readonly ParticipantView[]> {
  const rows = await db
    .select()
    .from(chatParticipants)
    .where(and(eq(chatParticipants.chatId, chatId), isNull(chatParticipants.leftSeq)));
  return rows.map((r) => ({
    id: r.id,
    chatId: r.chatId,
    kind: r.kind,
    userId: r.userId,
    characterId: r.characterId,
    role: r.role,
    activePersonaId: r.activePersonaId,
    talkativeness: r.talkativeness,
    disabled: r.disabled,
    joinedAt: r.joinedAt,
    joinSeq: r.joinSeq,
    leftSeq: r.leftSeq,
    joinHistoryVisibility: r.joinHistoryVisibility,
    displayName: r.userId ?? r.characterId ?? "",
    handle: r.userId === null ? null : castId<Handle>(r.userId),
    avatarAssetId: null,
  }));
}

let inviteCounter = 0;
function makeDeps(): {
  emit: () => Promise<void>;
  hashToken: (token: string) => string;
  newInviteId: () => ChatInviteId;
  loadParticipantViews: (chatId: ChatId) => Promise<readonly ParticipantView[]>;
} {
  inviteCounter = 0;
  return {
    emit: (): Promise<void> => {
      emitted += 1;
      return Promise.resolve();
    },
    hashToken: (token: string): string => `h:${token}`,
    newInviteId: (): ChatInviteId => {
      inviteCounter += 1;
      return castId<ChatInviteId>(`chat_invite_${inviteCounter}`);
    },
    loadParticipantViews,
  };
}

/** Seed a pending invite with the fake-hashed token. */
async function seedInvite(
  chatId: ChatId,
  token: string,
  opts: { readonly invitedUserId?: UserId; readonly maxUses?: number | null } = {},
): Promise<ChatInviteId> {
  const id = castId<ChatInviteId>(`chat_invite_seed_${token}`);
  await db.insert(chatInvites).values({
    id,
    chatId,
    tokenHash: `h:${token}`,
    maxUses: opts.maxUses ?? null,
    uses: 0,
    expiresAt: null,
    invitedUserId: opts.invitedUserId ?? null,
    status: "pending",
    createdAt: FROZEN_AT,
  });
  return id;
}

describe("createInvite — host mints a share-link; the token is stored HASHED", () => {
  test("the raw token is returned ONCE; only its hash is persisted", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const invites = createInvites(makeChatContext(db), makeDeps());

    const { invite, token } = await invites.createInvite({
      principal: principal(host),
      chatId,
      input: {},
    });

    expect(token.length).toBeGreaterThan(0);
    expect(invite.status).toBe("pending");
    const [row] = await db.select().from(chatInvites).where(eq(chatInvites.id, invite.id));
    expect(row?.tokenHash).toBe(`h:${token}`); // hashed
    expect(row?.tokenHash).not.toBe(token); // never the raw token
  });

  test("a plain member is refused with not_host", async () => {
    const host = await seedUser(db, "host");
    const member = await seedUser(db, "member");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    const invites = createInvites(makeChatContext(db), makeDeps());

    const err = await invites
      .createInvite({ principal: principal(member), chatId, input: {} })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChatOperationError);
    expect((err as ChatOperationError).code).toBe("not_host");
  });

  test("a targeted-by-handle invite is rejected (resolver not wired)", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const invites = createInvites(makeChatContext(db), makeDeps());

    await expect(
      invites.createInvite({
        principal: principal(host),
        chatId,
        input: { invitedHandle: castId<Handle>("bob") },
      }),
    ).rejects.toBeInstanceOf(DomainOperationError);
  });
});

describe("redeemInvite — THE participant-insert chokepoint", () => {
  test("a fresh redeem inserts a server-forced member at the canon head + bumps uses", async () => {
    const host = await seedUser(db, "host");
    const joiner = await seedUser(db, "joiner");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedInvite(chatId, "tok");
    const invites = createInvites(makeChatContext(db), makeDeps());

    const result = await invites.redeemInvite({
      principal: principal(joiner),
      input: { token: "tok" },
    });

    expect(result.chat.id).toBe(chatId);
    expect(result.participant.userId).toBe(joiner);
    expect(result.participant.role).toBe("member");
    const [row] = await db
      .select()
      .from(chatParticipants)
      .where(eq(chatParticipants.userId, joiner));
    expect(row?.role).toBe("member");
    expect(row?.leftSeq).toBeNull();
    const [inv] = await db.select().from(chatInvites).where(eq(chatInvites.chatId, chatId));
    expect(inv?.uses).toBe(1);
    expect(emitted).toBe(1); // chatUpdated
  });

  test("the re-add upsert re-joins a previously-left member", async () => {
    const host = await seedUser(db, "host");
    const back = await seedUser(db, "back");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    // back left earlier (leftSeq set) — the redeem upsert must re-join them.
    await seedParticipant(db, { chatId, key: "b", userId: back, role: "member", leftSeq: 3 });
    await seedInvite(chatId, "tok");
    const invites = createInvites(makeChatContext(db), makeDeps());

    await invites.redeemInvite({ principal: principal(back), input: { token: "tok" } });

    const [row] = await db.select().from(chatParticipants).where(eq(chatParticipants.userId, back));
    expect(row?.leftSeq).toBeNull();
    expect(row?.role).toBe("member");
  });

  test("an invalid token is a leak-free NOT_FOUND", async () => {
    const joiner = await seedUser(db, "joiner");
    const invites = createInvites(makeChatContext(db), makeDeps());
    await expect(
      invites.redeemInvite({ principal: principal(joiner), input: { token: "nope" } }),
    ).rejects.toBeInstanceOf(DomainNotFoundError);
  });
});

describe("revokeInvite / declineInvite — status transitions", () => {
  test("the host revokes a pending invite", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const inviteId = await seedInvite(chatId, "tok");
    const invites = createInvites(makeChatContext(db), makeDeps());

    await invites.revokeInvite({ principal: principal(host), chatId, inviteId });

    const [row] = await db.select().from(chatInvites).where(eq(chatInvites.id, inviteId));
    expect(row?.status).toBe("revoked");
  });

  test("the targeted user declines their invite", async () => {
    const host = await seedUser(db, "host");
    const target = await seedUser(db, "target");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const inviteId = await seedInvite(chatId, "tok", { invitedUserId: target });
    const invites = createInvites(makeChatContext(db), makeDeps());

    await invites.declineInvite({ principal: principal(target), inviteId });

    const [row] = await db.select().from(chatInvites).where(eq(chatInvites.id, inviteId));
    expect(row?.status).toBe("declined");
  });
});

describe("previewInvite — minimal preview-then-confirm", () => {
  test("returns room name / host handle / member count / mode label only", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a", { title: "The Tavern" });
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedInvite(chatId, "tok");
    const outsider = await seedUser(db, "outsider");
    const invites = createInvites(makeChatContext(db), makeDeps());

    const preview = await invites.previewInvite({
      principal: principal(outsider),
      input: { token: "tok" },
    });

    expect(preview.chatId).toBe(chatId);
    expect(preview.roomName).toBe("The Tavern");
    expect(preview.hostHandle).toBe(host); // the fake resolver maps handle from the host's id
    expect(preview.memberCount).toBe(1);
    expect(preview.modeLabel).toBe("per-speaker · natural");
  });
});
