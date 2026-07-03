// The membership chokepoint integration (chat.md Part III §11/§12) — the guard wires `loadMemberChat` to the
// pure deciders against a real libSQL db. Proves: member allowed, non-member denied (leak-free), host-only
// refusal to a member, author-or-host, and lineage gated independently per-ancestor.
import type { Principal } from "@orb/contracts/identity";
import type { Db } from "@orb/db";
import type { ChatId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { can } from "@orb/server/domain/admin";
import { beforeEach, describe } from "vitest";
import {
  ChatNotFoundError,
  ChatOperationError,
} from "../../../../packages/server/src/domain/chat/contract/errors";
import {
  gateLineagePerAncestor,
  requireAuthorOrHost,
  requireHost,
  requireParticipant,
} from "../../../../packages/server/src/domain/chat/guard";
import { freshDb } from "../../../support/db";
import { expect, test } from "../../../support/fixtures";
import { seedChat, seedParticipant, seedUser } from "./_support";

let db: Db;

beforeEach(async () => {
  db = await freshDb();
});

function principal(userId: UserId): Principal {
  return {
    userId,
    role: "user",
    handle: castId<Handle>("h"),
    externalId: null,
    via: "cookie",
  };
}

// The guard's deps: the real db + the REAL admin `can()` (PD-1 — the unified seam, injected as the root will
// wire it; chat never imports admin in src, only the test composes them).
const ctx = (): { db: Db; can: typeof can } => ({ db, can });

describe("requireParticipant — present membership", () => {
  test("a present member loads (row + role returned)", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a", { title: "Room" });
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });

    const m = await requireParticipant(ctx(), principal(host), chatId);
    expect(m.role).toBe("host");
    expect(m.chat.id).toBe(chatId);
  });

  test("a non-member is denied with a leak-free not-found", async () => {
    const outsider = await seedUser(db, "outsider");
    const chatId = await seedChat(db, "a");
    await expect(requireParticipant(ctx(), principal(outsider), chatId)).rejects.toBeInstanceOf(
      ChatNotFoundError,
    );
  });

  test("a LEFT member (leftSeq set) is no longer present → denied", async () => {
    const gone = await seedUser(db, "gone");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "g", userId: gone, role: "member", leftSeq: 5 });
    await expect(requireParticipant(ctx(), principal(gone), chatId)).rejects.toBeInstanceOf(
      ChatNotFoundError,
    );
  });
});

describe("requireHost — host authority", () => {
  test("the host passes", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await expect(requireHost(ctx(), principal(host), chatId)).resolves.toBeDefined();
  });

  test("a plain member is refused with not_host (NOT not-found — existence is known to a member)", async () => {
    const host = await seedUser(db, "host");
    const member = await seedUser(db, "member");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });

    const err = await requireHost(ctx(), principal(member), chatId).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChatOperationError);
    expect((err as ChatOperationError).code).toBe("not_host");
  });

  test("a non-member hitting a host-only surface still leaks nothing (not-found)", async () => {
    const outsider = await seedUser(db, "outsider");
    const chatId = await seedChat(db, "a");
    await expect(requireHost(ctx(), principal(outsider), chatId)).rejects.toBeInstanceOf(
      ChatNotFoundError,
    );
  });
});

describe("requireAuthorOrHost — edit/delete", () => {
  let host: UserId;
  let member: UserId;
  let chatId: ChatId;

  beforeEach(async () => {
    host = await seedUser(db, "host");
    member = await seedUser(db, "member");
    chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
  });

  test("the host may act on a foreign slot", async () => {
    await expect(
      requireAuthorOrHost(ctx(), principal(host), chatId, member),
    ).resolves.toBeDefined();
  });

  test("a member may act on their own slot", async () => {
    await expect(
      requireAuthorOrHost(ctx(), principal(member), chatId, member),
    ).resolves.toBeDefined();
  });

  test("a member is refused a foreign slot with not_author (PD-1: no longer collapsed onto not_host)", async () => {
    const err = await requireAuthorOrHost(ctx(), principal(member), chatId, host).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ChatOperationError);
    expect((err as ChatOperationError).code).toBe("not_author");
  });
});

describe("gateLineagePerAncestor — each ancestor gated independently (a fork grants no parent membership)", () => {
  test("only the ancestors the caller is a present member of are returned", async () => {
    const user = await seedUser(db, "walker");
    const parent = await seedChat(db, "parent");
    const grandparent = await seedChat(db, "grandparent");
    // The caller is a member of the parent only — NOT the grandparent.
    await seedParticipant(db, { chatId: parent, key: "p", userId: user, role: "member" });

    const visible = await gateLineagePerAncestor(ctx(), principal(user), [parent, grandparent]);
    expect(visible).toEqual([parent]);
  });
});
