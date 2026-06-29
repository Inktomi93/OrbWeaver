// The typed per-verb authority matrix + default-deny (chat.md Part III §11/§12 inv #12).
import { describe, expect, test } from "vitest";
import {
  authorityForSurface,
  CHAT_SURFACE_AUTHORITY,
  CHAT_VERB_AUTHORITY,
  DENY,
} from "../../../../../../packages/server/src/domain/chat/substrate/auth";

describe("CHAT_VERB_AUTHORITY — the per-verb matrix", () => {
  test("the chat.md §11 explicit classifications hold", () => {
    // read/stream/post → member
    expect(CHAT_VERB_AUTHORITY.getChat).toBe("member");
    expect(CHAT_VERB_AUTHORITY.listMessages).toBe("member");
    expect(CHAT_VERB_AUTHORITY.send).toBe("member");
    expect(CHAT_VERB_AUTHORITY.replayStreamEvents).toBe("member");
    // edit/delete → author-or-host
    expect(CHAT_VERB_AUTHORITY.editMessage).toBe("author-or-host");
    expect(CHAT_VERB_AUTHORITY.deleteMessages).toBe("author-or-host");
    // host-only roster/config/lifecycle mutation
    expect(CHAT_VERB_AUTHORITY.setGroupConfig).toBe("host");
    expect(CHAT_VERB_AUTHORITY.setRoomOverrides).toBe("host");
    expect(CHAT_VERB_AUTHORITY.addCharacterToChat).toBe("host");
    expect(CHAT_VERB_AUTHORITY.kick).toBe("host");
    expect(CHAT_VERB_AUTHORITY.createInvite).toBe("host");
    expect(CHAT_VERB_AUTHORITY.nominateHostHandoff).toBe("host");
    expect(CHAT_VERB_AUTHORITY.forceCharacterTurn).toBe("host");
    expect(CHAT_VERB_AUTHORITY.reattributeMessages).toBe("host");
    expect(CHAT_VERB_AUTHORITY.delete).toBe("host");
    expect(CHAT_VERB_AUTHORITY.moveMessage).toBe("host"); // the §11 "reorder" entry
    // lineage walked + gated independently
    expect(CHAT_VERB_AUTHORITY.getChatLineage).toBe("lineage-per-ancestor");
    // abort = the turn owner, never the host (rollback-theft defense)
    expect(CHAT_VERB_AUTHORITY.abort).toBe("turn-owner");
    // forkChat: a member may fork the source (the fork is a new chat where the forker is host)
    expect(CHAT_VERB_AUTHORITY.forkChat).toBe("member");
  });

  test("non-membership verbs carry the explicit non-chat-scoped marker (their gate is elsewhere)", () => {
    expect(CHAT_VERB_AUTHORITY.startChat).toBe("non-chat-scoped");
    expect(CHAT_VERB_AUTHORITY.listChats).toBe("non-chat-scoped");
    expect(CHAT_VERB_AUTHORITY.redeemInvite).toBe("non-chat-scoped");
    expect(CHAT_VERB_AUTHORITY.previewInvite).toBe("non-chat-scoped");
    expect(CHAT_VERB_AUTHORITY.declineInvite).toBe("non-chat-scoped");
    expect(CHAT_VERB_AUTHORITY.reapTemporaryChats).toBe("non-chat-scoped");
  });

  test("every verb is classified (no silent gap — the born-compliant Record is non-empty + total)", () => {
    const values = Object.values(CHAT_VERB_AUTHORITY);
    expect(values.length).toBeGreaterThanOrEqual(62);
    expect(values.every((v) => typeof v === "string" && v.length > 0)).toBe(true);
  });
});

describe("CHAT_SURFACE_AUTHORITY — the non-verb chatId surfaces (inv §12)", () => {
  test("the §12-named surfaces route through the chokepoint", () => {
    expect(CHAT_SURFACE_AUTHORITY["sse-subscribe"]).toBe("member");
    expect(CHAT_SURFACE_AUTHORITY["bus-delivery"]).toBe("member");
    expect(CHAT_SURFACE_AUTHORITY["lineage-walk"]).toBe("lineage-per-ancestor");
    expect(CHAT_SURFACE_AUTHORITY["roster-card-read"]).toBe("member-card");
    expect(CHAT_SURFACE_AUTHORITY["anchor-reassignment"]).toBe("host");
    expect(CHAT_SURFACE_AUTHORITY["chat-injection-write"]).toBe("host");
  });
});

describe("default-deny (inv §12 — an unlisted chatId surface defaults to deny)", () => {
  test("a known surface resolves; an unlisted surface is denied", () => {
    expect(authorityForSurface("sse-subscribe")).toBe("member");
    expect(authorityForSurface("anchor-reassignment")).toBe("host");
    expect(authorityForSurface("totally-unknown-surface")).toBe(DENY);
    expect(authorityForSurface("")).toBe(DENY);
  });
});
