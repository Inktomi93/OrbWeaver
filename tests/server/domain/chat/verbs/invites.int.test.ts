// The invite lifecycle + THE participant-insert chokepoint (chat.md Part III §2). Proves against a real
// libSQL db: the token is stored HASHED (never raw), the atomic redeem inserts a server-forced `member` at the
// canon head, the re-add upsert re-joins a previously-left member, revoke/decline flip status, and an invalid
// token is a leak-free NOT_FOUND. The `hashToken`/`newInviteId`/`loadParticipantViews` deps are faked (the
// root wires the real ones — see invites.ts FLAG[invite-deps-not-on-ctx]). The verbs are reached through the
// grouped-file BUNDLE (`createInvites(ctx, deps)`).

import type { ParticipantView } from "@orb/contracts/chat";
import type { NotificationEvent } from "@orb/contracts/notifications";
import type { Db } from "@orb/db";
import { chatInvites, chatParticipants } from "@orb/db";
import { DomainNotFoundError, DomainOperationError } from "@orb/kit/errors";
import type { ChatId, ChatInviteId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import { ChatOperationError } from "../../../../../packages/server/src/domain/chat/contract/errors";
import { createInvites } from "../../../../../packages/server/src/domain/chat/verbs/invites";
import { freshDb } from "../../../../support/db";
import { principal as makePrincipal } from "../../../../support/factories/principal.ts";
import { expect, test } from "../../../../support/fixtures";
import {
  FROZEN_AT,
  makeChatContext,
  makeLoadParticipantViews,
  seedChat,
  seedParticipant,
  seedUser,
} from "../_support";

let db: Db;
let emitted: number;
let loadParticipantViews: ReturnType<typeof makeLoadParticipantViews>;

beforeEach(async () => {
  db = await freshDb();
  emitted = 0;
  loadParticipantViews = makeLoadParticipantViews(db);
});

function principal(userId: UserId): ReturnType<typeof makePrincipal> {
  return makePrincipal(userId, { handle: castId<Handle>(userId) });
}

// hashToken/newInviteId now ride the ctx (PD-61) — makeChatContext supplies the same `h:${token}` fake
// hasher + a deterministic chat_invite minter; deps carry only the bus emit + the roster resolver.
function makeDeps(): {
  emit: () => Promise<void>;
  loadParticipantViews: (chatId: ChatId) => Promise<readonly ParticipantView[]>;
} {
  return {
    emit: (): Promise<void> => {
      emitted += 1;
      return Promise.resolve();
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

  test("a targeted-by-handle invite resolves the target and stores invitedUserId (PD-66)", async () => {
    const host = await seedUser(db, "host");
    const bob = await seedUser(db, "bob");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const invites = createInvites(
      makeChatContext(db, { resolveHandle: (h) => Promise.resolve(h === "bob" ? bob : null) }),
      makeDeps(),
    );

    const { invite } = await invites.createInvite({
      principal: principal(host),
      chatId,
      input: { invitedHandle: castId<Handle>("bob") },
    });
    expect(invite.invitedUserId).toBe(bob);
  });

  test("an unknown/disabled target handle is a coded invite_target_unknown refusal (PD-66)", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const invites = createInvites(
      makeChatContext(db, { resolveHandle: () => Promise.resolve(null) }),
      makeDeps(),
    );

    const err = await invites
      .createInvite({
        principal: principal(host),
        chatId,
        input: { invitedHandle: castId<Handle>("ghost") },
      })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DomainOperationError);
    expect((err as DomainOperationError).code).toBe("invite_target_unknown");
  });

  test("the reserved __agent__ handle is refused leak-free — resolveHandle is never even called (D60)", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    let resolveCalled = false;
    const invites = createInvites(
      makeChatContext(db, {
        resolveHandle: () => {
          resolveCalled = true;
          return Promise.resolve(null);
        },
      }),
      makeDeps(),
    );

    const err = await invites
      .createInvite({
        principal: principal(host),
        chatId,
        input: { invitedHandle: castId<Handle>("__agent__buddy__someone") },
      })
      .catch((e: unknown) => e);
    // Leak-free: the namespace belt refuses BEFORE resolution (never confirms the namespace exists) — agents
    // enter via seatAgent (AP3), never an invite.
    expect(err).toBeInstanceOf(DomainOperationError);
    expect((err as DomainOperationError).code).toBe("invite_target_unknown");
    expect(resolveCalled).toBe(false);
  });
});

describe("createInvite — PD-105 the targeted-invite notification", () => {
  function recordingCtx(notes: NotificationEvent[]): ReturnType<typeof makeChatContext> {
    return makeChatContext(db, {
      resolveHandle: (h) => Promise.resolve(h === "bob" ? castId<UserId>("user_bob") : null),
      emitNotification: (event) => {
        notes.push(event);
        return Promise.resolve();
      },
    });
  }

  test("a targeted invite emits `invite` AFTER persist, carrying inviteId + the host's handle", async () => {
    const host = await seedUser(db, "host");
    const bob = await seedUser(db, "bob");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const notes: NotificationEvent[] = [];
    const invites = createInvites(recordingCtx(notes), makeDeps());

    const { invite } = await invites.createInvite({
      principal: principal(host),
      chatId,
      input: { invitedHandle: castId<Handle>("bob") },
    });

    expect(invite.invitedUserId).toBe(bob);
    expect(notes).toEqual([
      {
        type: "invite",
        recipientUserId: bob,
        chatId,
        inviteId: invite.id,
        invitedByHandle: principal(host).handle,
      },
    ]);
    // The notification NEVER carries the raw token (type-level unrepresentable — the schema declares no
    // field for it); the row is already persisted (durable-first) by the time the notification fires.
    const [row] = await db.select().from(chatInvites).where(eq(chatInvites.id, invite.id));
    expect(row).toBeDefined();
  });

  test("a share-link invite (no invitedUserId) notifies nobody — no single recipient", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const notes: NotificationEvent[] = [];
    const invites = createInvites(recordingCtx(notes), makeDeps());

    const { invite } = await invites.createInvite({
      principal: principal(host),
      chatId,
      input: {},
    });

    expect(invite.invitedUserId).toBeNull();
    expect(notes).toEqual([]);
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

// Stickler F4: `redeemInvite` enforced `maxUses`/expiry but NOT the stored `invitedUserId`, while its siblings
// (`previewInvite`/`declineInvite`) did — so a targeted-invite token that reached the wrong user still joined
// them. The atomic redeem now carries the `(untargeted OR target=caller)` predicate: a non-target's claim
// matches nothing (never burns a use), and the verb surfaces the same leak-free NOT_FOUND an invalid token
// gives. An untargeted (share-link) invite is unaffected.
describe("redeemInvite — targeting (F4)", () => {
  test("a targeted invite redeemed by a NON-target is refused leak-free — and burns no use", async () => {
    const host = await seedUser(db, "host");
    const target = await seedUser(db, "target");
    const attacker = await seedUser(db, "attacker");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const inviteId = await seedInvite(chatId, "tok", { invitedUserId: target });
    const invites = createInvites(makeChatContext(db), makeDeps());

    // The token reached the wrong user (forwarded / mis-posted); the attacker redeems it directly.
    await expect(
      invites.redeemInvite({ principal: principal(attacker), input: { token: "tok" } }),
    ).rejects.toBeInstanceOf(DomainNotFoundError);

    // No membership was granted, and the atomic UPDATE never matched — the use count + status are untouched,
    // so the invite is still fully redeemable by its real target.
    const attackerRows = await db
      .select()
      .from(chatParticipants)
      .where(eq(chatParticipants.userId, attacker));
    expect(attackerRows).toHaveLength(0);
    const [inv] = await db.select().from(chatInvites).where(eq(chatInvites.id, inviteId));
    expect(inv?.uses).toBe(0);
    expect(inv?.status).toBe("pending");
  });

  test("the same targeted invite still redeems for its intended target", async () => {
    const host = await seedUser(db, "host");
    const target = await seedUser(db, "target");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedInvite(chatId, "tok", { invitedUserId: target });
    const invites = createInvites(makeChatContext(db), makeDeps());

    const result = await invites.redeemInvite({
      principal: principal(target),
      input: { token: "tok" },
    });

    expect(result.participant.userId).toBe(target);
    expect(result.participant.role).toBe("member");
  });

  test("an untargeted (share-link) invite still redeems for anyone", async () => {
    const host = await seedUser(db, "host");
    const anyone = await seedUser(db, "anyone");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedInvite(chatId, "tok"); // no invitedUserId ⇒ untargeted
    const invites = createInvites(makeChatContext(db), makeDeps());

    const result = await invites.redeemInvite({
      principal: principal(anyone),
      input: { token: "tok" },
    });

    expect(result.participant.userId).toBe(anyone);
    expect(result.participant.role).toBe("member");
  });
});

// Stickler F5: the atomic UPDATE incremented `uses` BEFORE `upsertMemberOnJoin` no-oped for an already-present
// member, so a bookmarked /join re-fire ate a finite invite's remaining use. The redeem now carries a
// `caller-not-already-present` predicate: a present member's re-redeem matches nothing (no burn, no status
// flip) and the verb recovers their existing membership, leaving the invite's remaining uses for real joiners.
describe("redeemInvite — idempotent re-redeem does not burn a use (F5)", () => {
  test("maxUses:2 — a present member re-redeems: uses stays 1, status pending, a second joiner still gets in", async () => {
    const host = await seedUser(db, "host");
    const first = await seedUser(db, "first");
    const second = await seedUser(db, "second");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const inviteId = await seedInvite(chatId, "tok", { maxUses: 2 });
    const invites = createInvites(makeChatContext(db), makeDeps());

    // First joiner redeems (uses 0 → 1) and joins.
    await invites.redeemInvite({ principal: principal(first), input: { token: "tok" } });
    // The bookmarked /join re-fires while `first` is still present — this must NOT burn the second use.
    const again = await invites.redeemInvite({
      principal: principal(first),
      input: { token: "tok" },
    });
    expect(again.participant.userId).toBe(first); // recovered their existing membership, not a phantom error

    const [inv] = await db.select().from(chatInvites).where(eq(chatInvites.id, inviteId));
    expect(inv?.uses).toBe(1); // NOT 2 — the re-redeem burned nothing
    expect(inv?.status).toBe("pending"); // still redeemable

    // The intended second joiner still gets in (they would have been locked out if the re-fire had exhausted it).
    const secondResult = await invites.redeemInvite({
      principal: principal(second),
      input: { token: "tok" },
    });
    expect(secondResult.participant.userId).toBe(second);
    const [after] = await db.select().from(chatInvites).where(eq(chatInvites.id, inviteId));
    expect(after?.uses).toBe(2);
    expect(after?.status).toBe("accepted"); // exhausted by the two DISTINCT joiners
  });

  test("a previously-LEFT member still re-redeems + re-joins (the not-present predicate only guards PRESENT members)", async () => {
    const host = await seedUser(db, "host");
    const back = await seedUser(db, "back");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "b", userId: back, role: "member", leftSeq: 3 });
    const inviteId = await seedInvite(chatId, "tok", { maxUses: 2 });
    const invites = createInvites(makeChatContext(db), makeDeps());

    await invites.redeemInvite({ principal: principal(back), input: { token: "tok" } });

    const [row] = await db.select().from(chatParticipants).where(eq(chatParticipants.userId, back));
    expect(row?.leftSeq).toBeNull(); // re-joined
    const [inv] = await db.select().from(chatInvites).where(eq(chatInvites.id, inviteId));
    expect(inv?.uses).toBe(1); // a genuine (re)join DOES consume a use
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
