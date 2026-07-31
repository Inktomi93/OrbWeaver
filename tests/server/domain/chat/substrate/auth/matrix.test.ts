// The typed per-verb authority matrix + default-deny (chat.md Part III §11/§12 inv #12).
import { describe } from "vitest";
import { authorityForSurface, CHAT_SURFACE_AUTHORITY, CHAT_VERB_AUTHORITY, DENY } from "../../../../../../packages/server/src/domain/chat/substrate/auth";
import { expect, test } from "../../../../../support/fixtures";

describe("CHAT_VERB_AUTHORITY — the per-verb matrix", () => {
  test("the chat.md §11 explicit classifications hold", () => {
    expect(CHAT_VERB_AUTHORITY.getChat).toBe("member");
    expect(CHAT_VERB_AUTHORITY.listMessages).toBe("member");
    expect(CHAT_VERB_AUTHORITY.send).toBe("member");
    expect(CHAT_VERB_AUTHORITY.replayStreamEvents).toBe("member");
    expect(CHAT_VERB_AUTHORITY.editMessage).toBe("author-or-host");
    expect(CHAT_VERB_AUTHORITY.deleteMessages).toBe("author-or-host");
    expect(CHAT_VERB_AUTHORITY.setGroupConfig).toBe("host");
    expect(CHAT_VERB_AUTHORITY.setRoomOverrides).toBe("host");
    expect(CHAT_VERB_AUTHORITY.addCharacterToChat).toBe("host");
    expect(CHAT_VERB_AUTHORITY.removeCharacterFromChat).toBe("host");
    expect(CHAT_VERB_AUTHORITY.kick).toBe("host");
    expect(CHAT_VERB_AUTHORITY.createInvite).toBe("host");
    expect(CHAT_VERB_AUTHORITY.nominateHostHandoff).toBe("host");
    expect(CHAT_VERB_AUTHORITY.forceCharacterTurn).toBe("host");
    expect(CHAT_VERB_AUTHORITY.reattributeMessages).toBe("host");
    // The RENDERED previews are host/admin: they resolve every member's card at FULL, so a plain member
    // reading one bypasses the D22 memberCardVisibility clamp (the verbs gate `requireHost`). `previewSection`
    // joined them 2026-08-01 — it was `member` while rendering an ARBITRARY section against the same ctx, and
    // `main_prompt` resolves `character.systemPrompt` (a `full`-only field): naming a section was the cheap
    // way around the two host-gated doors. RENDERED ⇒ host is the rule, not "whole prompt ⇒ host".
    expect(CHAT_VERB_AUTHORITY.previewAssembly).toBe("host");
    expect(CHAT_VERB_AUTHORITY.peekPrompt).toBe("host");
    expect(CHAT_VERB_AUTHORITY.previewSection).toBe("host");
    expect(CHAT_VERB_AUTHORITY.getShapeTrace).toBe("host"); // the content-free SHAPE inspector (PD-132)
    // The two survivors on the preview path stay `member` because neither hands back rendered ctx bytes:
    // `previewContextFit` returns the boundary id + budget NUMBERS, `getActivePresetConfig` the bare preset
    // config (no assemble ctx is built). Behavioral teeth: read.int.test.ts's sweep-classification pin.
    expect(CHAT_VERB_AUTHORITY.previewContextFit).toBe("member");
    expect(CHAT_VERB_AUTHORITY.getActivePresetConfig).toBe("member");
    // reattributePersona is author-or-host (NOT host-only like the character axis) — a member re-stamps their
    // OWN user lines; the host any (the per-row gate + role/ownership belts live in the verb). Task #60 / §5.
    expect(CHAT_VERB_AUTHORITY.reattributePersona).toBe("author-or-host");
    expect(CHAT_VERB_AUTHORITY.delete).toBe("host");
    expect(CHAT_VERB_AUTHORITY.moveMessage).toBe("host"); // the §11 "reorder" entry
    // setChatAnchorPersona: the manual Anchor (#4) re-pin — host-only (FINAL-Persona §A.6b gap #2)
    expect(CHAT_VERB_AUTHORITY.setChatAnchorPersona).toBe("host");
    expect(CHAT_VERB_AUTHORITY.getChatLineage).toBe("lineage-per-ancestor");
    // abort = the turn owner, never the host (rollback-theft defense)
    expect(CHAT_VERB_AUTHORITY.abort).toBe("turn-owner");
    // forkChat: HOST-authority (owner policy 2026-07-28) — a non-host may fork only a SOLO room (in-verb widening)
    expect(CHAT_VERB_AUTHORITY.forkChat).toBe("host");
  });

  test("non-membership verbs carry the explicit non-chat-scoped marker (their gate is elsewhere)", () => {
    expect(CHAT_VERB_AUTHORITY.startChat).toBe("non-chat-scoped");
    expect(CHAT_VERB_AUTHORITY.listChats).toBe("non-chat-scoped");
    expect(CHAT_VERB_AUTHORITY.redeemInvite).toBe("non-chat-scoped");
    expect(CHAT_VERB_AUTHORITY.acceptInvite).toBe("non-chat-scoped");
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
    expect(CHAT_SURFACE_AUTHORITY["chat-injection-write"]).toBe("host");
  });
});

describe("default-deny (inv §12 — an unlisted chatId surface defaults to deny)", () => {
  test("a known surface resolves; an unlisted surface is denied", () => {
    expect(authorityForSurface("sse-subscribe")).toBe("member");
    expect(authorityForSurface("totally-unknown-surface")).toBe(DENY);
    expect(authorityForSurface("")).toBe(DENY);
  });
});
