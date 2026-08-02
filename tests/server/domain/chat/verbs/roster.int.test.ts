// The roster / group-config / room-override / membership-lifecycle verbs (chat.md Part III §1/§9/§11). Proves
// against a real libSQL db: the host-authority gate (member denied with `not_host`), the persistence effect,
// the emitted `chatUpdated` bus event, and the kick `kicked` notification — with the REAL admin `can()`. The
// verbs are reached through the grouped-file BUNDLE (`createRoster(ctx, { emit })`).

import type { CharacterCard } from "@orb/contracts/character";
import type { ChatBusEvent, RoomOverrides } from "@orb/contracts/chat";
import { roomOverridesSchema } from "@orb/contracts/chat";
import type { Principal } from "@orb/contracts/identity";
import type { NotificationEvent } from "@orb/contracts/notifications";
import type { ThemeBackground } from "@orb/contracts/theme";
import type { Db } from "@orb/db";
import { characters, chatParticipants, chats } from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import { batchMany } from "@orb/db/kit";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { CharacterId, ChatId, ChatParticipantId, DocumentId, Handle, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import type { AuditEntry } from "@orb/server/foundation/observability";
import { and, eq, isNull } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import { ChatNotFoundError, ChatOperationError } from "../../../../../packages/server/src/domain/chat/contract/errors";
import { getToolRecurseLimit } from "../../../../../packages/server/src/domain/chat/contract/metadata";
import { createRoster, setParticipantActivePersona } from "../../../../../packages/server/src/domain/chat/verbs/roster";
import { freshDb } from "../../../../support/db";
import { principal as makePrincipal } from "../../../../support/factories/principal.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeChatContext, seedCharacter, seedChat, seedParticipant, seedPersona, seedUser } from "../_support";

let db: Db;
let emitted: ChatBusEvent[];

beforeEach(async () => {
  db = await freshDb();
  emitted = [];
});

/** A recording emit-op fake that HONORS the PD-24 contract: it records the event AND commits the producer's
 *  unexecuted co-statements (the op owns the commit — without this the membership transition never lands). */
function recordingEmit(notes: NotificationEvent[]): (event: NotificationEvent, coStatements?: readonly unknown[]) => Promise<void> {
  return async (event, coStatements) => {
    notes.push(event);
    if (coStatements !== undefined && coStatements.length > 0) {
      await db.batch(batchMany(coStatements as BatchStmt[]));
    }
  };
}

const emit = (event: ChatBusEvent): Promise<void> => {
  emitted.push(event);
  return Promise.resolve();
};

function principal(userId: UserId): Principal {
  return makePrincipal(userId, { handle: castId<Handle>("h") });
}

const card = (name: string): CharacterCard => ({ name, avatarAssetId: null }) as unknown as CharacterCard;

/** An owner-scoped `getCard` fake mirroring the REAL one (D28 — `loadOwnedCharacterRow`): the card resolves
 *  only for its OWNER, `null` for a non-owner. The handoff cast-drop resolver (D64 / F4) calls this per seated
 *  character to decide which seats the NEW host doesn't own (→ dropped); the harness default is a bare `null`. */
function ownedCard(): (params: { readonly ownerId: UserId; readonly characterId: CharacterId }) => Promise<CharacterCard | null> {
  return async ({ ownerId, characterId }) => {
    const [row] = await db.select().from(characters).where(eq(characters.id, characterId));
    return row !== undefined && row.ownerId === ownerId ? card(row.name) : null;
  };
}

describe("setGroupConfig — host-only metadata write", () => {
  test("the host writes a fully-defaulted GroupConfig + emits chatUpdated", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const roster = createRoster(makeChatContext(db), { emit });

    const result = await roster.setGroupConfig({
      principal: principal(host),
      chatId,
      config: { output: "per-speaker", policy: "natural" },
    });

    expect(result.output).toBe("per-speaker");
    // cardScope only exists on the per-speaker arm — narrow in the expect arg (no conditional-expect).
    expect(result.output === "per-speaker" ? result.cardScope : undefined).toBe("merged");
    const [row] = await db.select().from(chats).where(eq(chats.id, chatId));
    expect(row?.metadata?.group?.output).toBe("per-speaker");
    expect(emitted).toEqual([{ type: "chatUpdated", chatId }]);
  });

  test("a plain member is refused with not_host", async () => {
    const host = await seedUser(db, "host");
    const member = await seedUser(db, "member");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    const roster = createRoster(makeChatContext(db), { emit });

    const err = await roster
      .setGroupConfig({
        principal: principal(member),
        chatId,
        config: { output: "per-speaker", policy: "natural" },
      })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChatOperationError);
    expect((err as ChatOperationError).code).toBe("not_host");
    expect(emitted).toEqual([]);
  });
});

describe("setRoomOverrides — the four-field allowlist", () => {
  test("the host writes the allowed fields", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const roster = createRoster(makeChatContext(db), { emit });

    const result = await roster.setRoomOverrides({
      principal: principal(host),
      chatId,
      overrides: { scenario: "a tavern" },
    });
    expect(result).toEqual({ scenario: "a tavern" });
    const [row] = await db.select().from(chats).where(eq(chats.id, chatId));
    expect(row?.metadata?.roomOverrides).toEqual({ scenario: "a tavern" });
  });

  test("a stray field is default-denied with forbidden_override", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const roster = createRoster(makeChatContext(db), { emit });

    const err = await roster
      .setRoomOverrides({
        principal: principal(host),
        chatId,
        overrides: { scenario: "ok", evil: "system prompt" } as unknown as RoomOverrides,
      })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChatOperationError);
    expect((err as ChatOperationError).code).toBe("forbidden_override");
  });
});

describe("setChatDocumentVisibility — host-only databank visibility override (D85)", () => {
  test("the host writes the hidden set (set-semantics), persists it, and emits chatUpdated", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const roster = createRoster(makeChatContext(db), { emit });
    const docA = mintTypeId(ID_PREFIX.document);
    const docB = mintTypeId(ID_PREFIX.document);

    const result = await roster.setChatDocumentVisibility({ principal: principal(host), chatId, visibility: { hidden: [docA, docB] } });
    expect(result).toEqual({ hidden: [docA, docB] });
    const [row] = await db.select().from(chats).where(eq(chats.id, chatId));
    expect(row?.metadata?.databankVisibility).toEqual({ hidden: [docA, docB] });
    expect(emitted).toEqual([{ type: "chatUpdated", chatId }]);

    // Set-semantics: a second write REPLACES the whole list (a re-shown doc is not stranded as hidden).
    await roster.setChatDocumentVisibility({ principal: principal(host), chatId, visibility: { hidden: [docA] } });
    const [row2] = await db.select().from(chats).where(eq(chats.id, chatId));
    expect(row2?.metadata?.databankVisibility).toEqual({ hidden: [docA] });
  });

  test("the write MERGES into sibling sub-blobs — it never nukes roomOverrides", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const roster = createRoster(makeChatContext(db), { emit });
    await roster.setRoomOverrides({ principal: principal(host), chatId, overrides: { scenario: "a tavern" } });
    const docA = mintTypeId(ID_PREFIX.document);

    await roster.setChatDocumentVisibility({ principal: principal(host), chatId, visibility: { hidden: [docA] } });
    const [row] = await db.select().from(chats).where(eq(chats.id, chatId));
    expect(row?.metadata?.roomOverrides).toEqual({ scenario: "a tavern" });
    expect(row?.metadata?.databankVisibility).toEqual({ hidden: [docA] });
  });

  test("a plain member is refused with not_host — no write", async () => {
    const host = await seedUser(db, "host");
    const member = await seedUser(db, "member");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    const roster = createRoster(makeChatContext(db), { emit });

    const err = await roster.setChatDocumentVisibility({ principal: principal(member), chatId, visibility: { hidden: [] } }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChatOperationError);
    expect((err as ChatOperationError).code).toBe("not_host");
    expect(emitted).toEqual([]);
  });

  test("a malformed hidden id is default-denied with forbidden_override (trust-boundary validation)", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const roster = createRoster(makeChatContext(db), { emit });

    const err = await roster
      // FABRICATION-OK: a malformed (non-TypeID) hidden id is exactly the invalid input the verb must reject.
      .setChatDocumentVisibility({ principal: principal(host), chatId, visibility: { hidden: ["not-a-document-id"] } as unknown as { hidden: DocumentId[] } })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChatOperationError);
    expect((err as ChatOperationError).code).toBe("forbidden_override");
  });
});

describe("setChatBackground — host-only per-chat carried background (BG-C)", () => {
  // A full source-only ThemeBackground from a partial (the wire schema fills these defaults at the transport;
  // the service param type is the full `ThemeBackground`, so the test spells the whole shape).
  const bg = (o: Partial<ThemeBackground>): ThemeBackground => ({
    kind: "none",
    seededId: "",
    externalUrl: "",
    assetId: "",
    assetHash: "",
    mime: "",
    provenanceUrl: "",
    ...o,
  });

  test("an EXTERNAL source is MATERIALIZED server-side into an owned asset (F-P0-2): persists kind:asset + provenanceUrl, emits chatUpdated", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const url = "https://cdn.example/bg.jpg";
    const storedAssetId = mintTypeId(ID_PREFIX.asset);
    const roster = createRoster(
      makeChatContext(db, {
        // The compose op fetches → magic-belts → stores the URL under the host; the stub returns the stored asset.
        materializeBackground: () => Promise.resolve({ ok: true, asset: { assetId: storedAssetId, assetHash: "hash_ext", mime: "image/png" } }),
        // The freshly-stored asset is the host's OWN, so the ownership gate passes.
        filterOwnedAssetIds: () => Promise.resolve([storedAssetId]),
      }),
      { emit },
    );

    const result = await roster.setChatBackground({ principal: principal(host), chatId, background: bg({ kind: "external", externalUrl: url }) });
    // A raw external URL can never paint (CSP); it is persisted as a same-origin `asset` with the URL as provenance.
    expect(result).toEqual({
      kind: "asset",
      seededId: "",
      externalUrl: "",
      assetId: storedAssetId,
      assetHash: "hash_ext",
      mime: "image/png",
      provenanceUrl: url,
    });
    const [row] = await db.select().from(chats).where(eq(chats.id, chatId));
    expect(row?.metadata?.background).toEqual(result);
    expect(emitted).toEqual([{ type: "chatUpdated", chatId }]);
  });

  test("an EXTERNAL source whose URL can't be materialized is refused background_unavailable — no write, no emit", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const roster = createRoster(makeChatContext(db, { materializeBackground: () => Promise.resolve({ ok: false, reason: "not-image" }) }), { emit });

    const err = await roster
      .setChatBackground({ principal: principal(host), chatId, background: bg({ kind: "external", externalUrl: "https://cdn.example/notimage.txt" }) })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChatOperationError);
    expect((err as ChatOperationError).code).toBe("background_unavailable");
    const [row] = await db.select().from(chats).where(eq(chats.id, chatId));
    expect(row?.metadata?.background).toBeUndefined();
    expect(emitted).toEqual([]);
  });

  test("kind:none clears the background (replace-semantics) and MERGES into siblings — never nukes roomOverrides", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const roster = createRoster(makeChatContext(db), { emit });
    await roster.setRoomOverrides({ principal: principal(host), chatId, overrides: { scenario: "a tavern" } });

    await roster.setChatBackground({ principal: principal(host), chatId, background: bg({ kind: "seeded", seededId: "dusk" }) });
    await roster.setChatBackground({ principal: principal(host), chatId, background: bg({ kind: "none" }) });
    const [row] = await db.select().from(chats).where(eq(chats.id, chatId));
    expect(row?.metadata?.background?.kind).toBe("none");
    expect(row?.metadata?.roomOverrides).toEqual({ scenario: "a tavern" });
  });

  test("a plain member is refused with not_host — no write", async () => {
    const host = await seedUser(db, "host");
    const member = await seedUser(db, "member");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    const roster = createRoster(makeChatContext(db), { emit });

    const err = await roster.setChatBackground({ principal: principal(member), chatId, background: bg({ kind: "none" }) }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChatOperationError);
    expect((err as ChatOperationError).code).toBe("not_host");
    expect(emitted).toEqual([]);
  });

  test("an asset background referencing an asset the host does NOT own is forbidden_override — no write (cross-user GC-root guard)", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    // The default `filterOwnedAssetIds` stub owns nothing → the asset-ownership gate refuses.
    const roster = createRoster(makeChatContext(db), { emit });
    const assetId = mintTypeId(ID_PREFIX.asset);

    const err = await roster
      .setChatBackground({ principal: principal(host), chatId, background: bg({ kind: "asset", assetId, assetHash: "h" }) })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChatOperationError);
    expect((err as ChatOperationError).code).toBe("forbidden_override");
    expect(emitted).toEqual([]);
  });

  test("an asset background the host DOES own is written", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const assetId = mintTypeId(ID_PREFIX.asset);
    const roster = createRoster(makeChatContext(db, { filterOwnedAssetIds: () => Promise.resolve([assetId]) }), { emit });

    const result = await roster.setChatBackground({
      principal: principal(host),
      chatId,
      background: bg({ kind: "asset", assetId, assetHash: "hash1", mime: "image/png" }),
    });
    expect(result.kind).toBe("asset");
    const [row] = await db.select().from(chats).where(eq(chats.id, chatId));
    expect(row?.metadata?.background?.assetId).toBe(assetId);
  });

  test("a non-asset kind carrying a populated assetId persists CLEAN — asset fields emptied, no foreign GC-root smuggle", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    // The default `filterOwnedAssetIds` stub owns NOTHING, so a real ownership check on this id would refuse.
    // It must NOT be reached: canonicalization empties the asset ref for a non-asset kind BEFORE the ownership
    // gate, so the write SUCCEEDS with a clean shape and the persisted assetId is "" — never GC-rooting the
    // smuggled (potentially foreign) id through `chats.metadata.background.assetId`.
    const foreign = mintTypeId(ID_PREFIX.asset);
    const roster = createRoster(makeChatContext(db), { emit });

    const result = await roster.setChatBackground({
      principal: principal(host),
      chatId,
      background: bg({ kind: "none", assetId: foreign, assetHash: "h", mime: "image/png" }),
    });
    expect(result).toEqual({ kind: "none", seededId: "", externalUrl: "", assetId: "", assetHash: "", mime: "", provenanceUrl: "" });
    const [row] = await db.select().from(chats).where(eq(chats.id, chatId));
    expect(row?.metadata?.background?.assetId).toBe("");
    expect(emitted).toEqual([{ type: "chatUpdated", chatId }]);
  });
});

describe("setToolRecurseLimit — host-only per-chat tool-recurse cap", () => {
  test("the host writes the cap, persists it into metadata, and emits chatUpdated", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const roster = createRoster(makeChatContext(db), { emit });

    const result = await roster.setToolRecurseLimit({ principal: principal(host), chatId, limit: 12 });
    expect(result).toBe(12);
    const [row] = await db.select().from(chats).where(eq(chats.id, chatId));
    expect(getToolRecurseLimit(row?.metadata)).toBe(12);
    expect(emitted).toEqual([{ type: "chatUpdated", chatId }]);
  });

  test("the write MERGES — a sibling sub-blob (roomOverrides) survives", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const roster = createRoster(makeChatContext(db), { emit });

    await roster.setRoomOverrides({ principal: principal(host), chatId, overrides: { scenario: "a tavern" } });
    await roster.setToolRecurseLimit({ principal: principal(host), chatId, limit: 3 });
    const [row] = await db.select().from(chats).where(eq(chats.id, chatId));
    expect(row?.metadata?.roomOverrides).toEqual({ scenario: "a tavern" });
    expect(row?.metadata?.toolRecurseLimit).toBe(3);
  });

  test("an out-of-range value is refused forbidden_override (no write)", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const roster = createRoster(makeChatContext(db), { emit });

    const err = await roster.setToolRecurseLimit({ principal: principal(host), chatId, limit: 999 }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChatOperationError);
    expect((err as ChatOperationError).code).toBe("forbidden_override");
    const [row] = await db.select().from(chats).where(eq(chats.id, chatId));
    expect(row?.metadata?.toolRecurseLimit).toBeUndefined();
  });

  test("a plain member is refused with not_host — no write", async () => {
    const host = await seedUser(db, "host");
    const member = await seedUser(db, "member");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    const roster = createRoster(makeChatContext(db), { emit });

    const err = await roster.setToolRecurseLimit({ principal: principal(member), chatId, limit: 5 }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChatOperationError);
    expect((err as ChatOperationError).code).toBe("not_host");
    expect(emitted).toEqual([]);
  });
});

describe("get group config for chat — member read", () => {
  test("an absent group sub-blob resolves to the canonical default", async () => {
    const member = await seedUser(db, "member");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    const roster = createRoster(makeChatContext(db), { emit });

    const cfg = await roster.getGroupConfigForChat({ principal: principal(member), chatId });
    expect(cfg.output).toBe("per-speaker");
    expect(cfg.policy).toBe("natural");
  });
});

describe("remove character from chat — the symmetric drop (rpg scene-cast prune consumer, 07 §2.2)", () => {
  test("the host removes a present character seat — leftSeq stamped + chatUpdated emitted", async () => {
    const host = await seedUser(db, "host");
    const characterId = await seedCharacter(db, host, "aria");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const roster = createRoster(makeChatContext(db, { getCard: ownedCard() }), { emit });
    await roster.addCharacterToChat({ principal: principal(host), chatId, characterId });
    emitted.length = 0; // ignore the add emit

    await roster.removeCharacterFromChat({ principal: principal(host), chatId, characterId });

    const rows = await db
      .select()
      .from(chatParticipants)
      .where(and(eq(chatParticipants.chatId, chatId), eq(chatParticipants.characterId, characterId)));
    expect(rows[0]?.leftSeq).not.toBeNull();
    expect(emitted).toEqual([{ type: "chatUpdated", chatId }]);
  });

  test("a plain member is refused — no stamp, no emit", async () => {
    const host = await seedUser(db, "host");
    const member = await seedUser(db, "member");
    const characterId = await seedCharacter(db, host, "aria");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    const roster = createRoster(makeChatContext(db, { getCard: ownedCard() }), { emit });
    await roster.addCharacterToChat({ principal: principal(host), chatId, characterId });
    emitted.length = 0;

    await expect(roster.removeCharacterFromChat({ principal: principal(member), chatId, characterId })).rejects.toThrow();
    const rows = await db
      .select()
      .from(chatParticipants)
      .where(and(eq(chatParticipants.chatId, chatId), eq(chatParticipants.characterId, characterId)));
    expect(rows[0]?.leftSeq).toBeNull();
    expect(emitted).toEqual([]);
  });

  test("removing an absent character is an idempotent no-op — no emit", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const roster = createRoster(makeChatContext(db, { getCard: ownedCard() }), { emit });

    await roster.removeCharacterFromChat({ principal: principal(host), chatId, characterId: castId<CharacterId>("character_absent") });
    expect(emitted).toEqual([]);
  });

  test("the prune is SURGICAL — a sibling character seat stays present (the distinct post-fork act, D64)", async () => {
    const host = await seedUser(db, "host");
    const aria = await seedCharacter(db, host, "aria");
    const brann = await seedCharacter(db, host, "brann");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const roster = createRoster(makeChatContext(db, { getCard: ownedCard() }), { emit });
    await roster.addCharacterToChat({ principal: principal(host), chatId, characterId: aria });
    await roster.addCharacterToChat({ principal: principal(host), chatId, characterId: brann });

    await roster.removeCharacterFromChat({ principal: principal(host), chatId, characterId: aria });

    const present = await db
      .select()
      .from(chatParticipants)
      .where(and(eq(chatParticipants.chatId, chatId), eq(chatParticipants.kind, "character"), isNull(chatParticipants.leftSeq)));
    expect(present.map((r) => r.characterId)).toEqual([brann]);
  });
});

describe("add character to chat — the participant-insert chokepoint", () => {
  test("the host adds a character; the row is inserted + the view resolves the card", async () => {
    const host = await seedUser(db, "host");
    const characterId = await seedCharacter(db, host, "aria");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const roster = createRoster(makeChatContext(db, { getCard: () => Promise.resolve(card("Aria")) }), {
      emit,
    });

    const view = await roster.addCharacterToChat({
      principal: principal(host),
      chatId,
      characterId,
    });

    expect(view.kind).toBe("character");
    expect(view.characterId).toBe(characterId);
    expect(view.role).toBe("member");
    expect(view.displayName).toBe("Aria");
    const rows = await db
      .select()
      .from(chatParticipants)
      .where(and(eq(chatParticipants.chatId, chatId), eq(chatParticipants.characterId, characterId)));
    expect(rows).toHaveLength(1);
    expect(emitted).toEqual([{ type: "chatUpdated", chatId }]);
  });

  test("a foreign/unknown character is refused NOT_FOUND — no ghost seat (PD-21)", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    // The owner-scoped card read: a foreign character resolves null (foreign == missing, leak-free).
    const roster = createRoster(makeChatContext(db, { getCard: () => Promise.resolve(null) }), {
      emit,
    });

    await expect(
      roster.addCharacterToChat({
        principal: principal(host),
        chatId,
        characterId: castId<CharacterId>("character_foreign"),
      }),
    ).rejects.toBeInstanceOf(DomainNotFoundError);
    const rows = await db.select().from(chatParticipants).where(eq(chatParticipants.kind, "character"));
    expect(rows).toHaveLength(0);
    expect(emitted).toEqual([]);
  });

  test("a double-add is IDEMPOTENT — the second call returns the existing seat, never a duplicate row (F2)", async () => {
    const host = await seedUser(db, "host");
    const characterId = await seedCharacter(db, host, "aria");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const roster = createRoster(makeChatContext(db, { getCard: () => Promise.resolve(card("Aria")) }), { emit });

    const first = await roster.addCharacterToChat({ principal: principal(host), chatId, characterId });
    const second = await roster.addCharacterToChat({ principal: principal(host), chatId, characterId });

    // The character half has no (chatId,userId) unique — the present-seat floor is what prevents the dup row.
    expect(second.id).toBe(first.id);
    const rows = await db
      .select()
      .from(chatParticipants)
      .where(and(eq(chatParticipants.chatId, chatId), eq(chatParticipants.characterId, characterId)));
    expect(rows).toHaveLength(1);
  });

  test("after a double-add a knob verb updates the SINGLE row (no multi-row fan-out) (F2)", async () => {
    const host = await seedUser(db, "host");
    const characterId = await seedCharacter(db, host, "aria");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const roster = createRoster(makeChatContext(db, { getCard: () => Promise.resolve(card("Aria")) }), { emit });

    const seat = await roster.addCharacterToChat({ principal: principal(host), chatId, characterId });
    await roster.addCharacterToChat({ principal: principal(host), chatId, characterId });
    await roster.setSeatKnobs({ principal: principal(host), chatId, participantId: seat.id, patch: { talkativeness: 0.9 } });

    const rows = await db.select().from(chatParticipants).where(eq(chatParticipants.characterId, characterId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.talkativeness).toBe(0.9);
  });
});

describe("setSeatKnobs — the ONE participantId-keyed AI-seat knob write (D80)", () => {
  test("the host mutes a present character seat; the column + view reflect it, chatUpdated emits", async () => {
    const host = await seedUser(db, "host");
    const characterId = await seedCharacter(db, host, "aria");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const participantId = await seedParticipant(db, { chatId, key: "c", characterId, role: "member" });
    const roster = createRoster(makeChatContext(db, { getCard: () => Promise.resolve(card("Aria")) }), { emit });

    const view = await roster.setSeatKnobs({ principal: principal(host), chatId, participantId, patch: { disabled: true } });
    expect(view.disabled).toBe(true);
    expect(view.displayName).toBe("Aria");
    const [row] = await db.select().from(chatParticipants).where(eq(chatParticipants.characterId, characterId));
    expect(row?.disabled).toBe(true);
    expect(emitted).toEqual([{ type: "chatUpdated", chatId }]);
  });

  test("the host sets a character seat's 0–1 talkativeness in the SAME patch shape", async () => {
    const host = await seedUser(db, "host");
    const characterId = await seedCharacter(db, host, "aria");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const participantId = await seedParticipant(db, { chatId, key: "c", characterId, role: "member" });
    const roster = createRoster(makeChatContext(db, { getCard: () => Promise.resolve(card("Aria")) }), { emit });

    const view = await roster.setSeatKnobs({ principal: principal(host), chatId, participantId, patch: { talkativeness: 0.8 } });
    expect(view.talkativeness).toBe(0.8);
    const [row] = await db.select().from(chatParticipants).where(eq(chatParticipants.characterId, characterId));
    expect(row?.talkativeness).toBe(0.8);
  });

  test("an empty patch is an idempotent no-op that still returns the current view (applyToChat re-apply floor)", async () => {
    const host = await seedUser(db, "host");
    const characterId = await seedCharacter(db, host, "aria");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const participantId = await seedParticipant(db, { chatId, key: "c", characterId, role: "member", disabled: true });
    const roster = createRoster(makeChatContext(db, { getCard: () => Promise.resolve(card("Aria")) }), { emit });

    const view = await roster.setSeatKnobs({ principal: principal(host), chatId, participantId, patch: {} });
    expect(view.disabled).toBe(true); // unchanged
    expect(view.characterId).toBe(characterId);
  });

  test("a non-host member is refused with not_host — no mutation", async () => {
    const host = await seedUser(db, "host");
    const member = await seedUser(db, "member");
    const characterId = await seedCharacter(db, host, "aria");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    const participantId = await seedParticipant(db, { chatId, key: "c", characterId, role: "member" });
    const roster = createRoster(makeChatContext(db), { emit });

    await expect(roster.setSeatKnobs({ principal: principal(member), chatId, participantId, patch: { disabled: true } })).rejects.toMatchObject({
      code: "not_host",
    });
    expect(emitted).toEqual([]);
  });

  test("a participantId that is not a PRESENT AI seat is refused with participant_not_found", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const roster = createRoster(makeChatContext(db), { emit });

    const err = await roster
      .setSeatKnobs({ principal: principal(host), chatId, participantId: castId<ChatParticipantId>("chat_participant_ghost"), patch: { disabled: true } })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChatOperationError);
    expect((err as ChatOperationError).code).toBe("participant_not_found");
    expect(emitted).toEqual([]);
  });

  test("a HUMAN seat carries no arbitration knobs — participant_not_found (AI-driven scope is teeth)", async () => {
    const host = await seedUser(db, "host");
    const member = await seedUser(db, "member");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const memberSeatId = await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    const roster = createRoster(makeChatContext(db), { emit });

    const err = await roster
      .setSeatKnobs({ principal: principal(host), chatId, participantId: memberSeatId, patch: { disabled: true } })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChatOperationError);
    expect((err as ChatOperationError).code).toBe("participant_not_found");
    const [row] = await db.select().from(chatParticipants).where(eq(chatParticipants.userId, member));
    expect(row?.disabled).toBe(false);
    expect(emitted).toEqual([]);
  });
});

// The D16 join-history policy SETTER — the write path the confidentiality mechanism spent its life without
// (the column was reachable only by a manual SQL edit). The round-trip against the real read clamp lives in
// read.int.test.ts's D16 block; these are the setter's own gates + persistence.
describe("setMemberHistoryVisibility — the host's per-member join-history write (D16)", () => {
  test("the host restricts a member to from-join: the column flips + chatUpdated is emitted", async () => {
    const host = await seedUser(db, "host");
    const member = await seedUser(db, "member");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member", joinSeq: 4 });
    const roster = createRoster(makeChatContext(db), { emit });

    await roster.setMemberHistoryVisibility({ principal: principal(host), chatId, userId: member, visibility: "from-join" });

    const [row] = await db.select().from(chatParticipants).where(eq(chatParticipants.userId, member));
    expect(row?.joinHistoryVisibility).toBe("from-join");
    // The restriction is a READ policy, not a re-join: the member's join point is untouched.
    expect(row?.joinSeq).toBe(4);
    expect(emitted).toEqual([{ type: "chatUpdated", chatId }]);
  });

  test("re-setting the value the row already carries is a no-op (idempotent)", async () => {
    const host = await seedUser(db, "host");
    const member = await seedUser(db, "member");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member", joinHistoryVisibility: "from-join" });
    const roster = createRoster(makeChatContext(db), { emit });

    await roster.setMemberHistoryVisibility({ principal: principal(host), chatId, userId: member, visibility: "from-join" });

    const [row] = await db.select().from(chatParticipants).where(eq(chatParticipants.userId, member));
    expect(row?.joinHistoryVisibility).toBe("from-join");
  });

  test("a plain MEMBER cannot set it — not even on themselves (the confidentiality policy is the host's)", async () => {
    const host = await seedUser(db, "host");
    const member = await seedUser(db, "member");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member", joinHistoryVisibility: "from-join" });
    const roster = createRoster(makeChatContext(db), { emit });

    const err = await roster.setMemberHistoryVisibility({ principal: principal(member), chatId, userId: member, visibility: "full" }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ChatOperationError);
    expect((err as ChatOperationError).code).toBe("not_host");
    // A clamped member cannot self-unclamp — the row is untouched and nothing was announced.
    const [row] = await db.select().from(chatParticipants).where(eq(chatParticipants.userId, member));
    expect(row?.joinHistoryVisibility).toBe("from-join");
    expect(emitted).toEqual([]);
  });

  // A CHARACTER seat carries a NULL userId (and no reader floor at all — its joinSeq/leftSeq are the
  // WITNESSING interval, a different axis), so the userId key can never resolve one. Pinned with the
  // character's OWN participant id cast to a UserId: even that hand-forged key finds nothing.
  test("a character seat is unreachable through the userId key", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    const characterId = await seedCharacter(db, host, "Aria");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const seatId = await seedParticipant(db, { chatId, key: "c", characterId, role: "member" });
    const roster = createRoster(makeChatContext(db), { emit });

    const err = await roster
      // FABRICATION-OK: a participant id forged into the userId slot — the point is that no key reaches a character seat.
      .setMemberHistoryVisibility({ principal: principal(host), chatId, userId: castId<UserId>(seatId), visibility: "from-join" })
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ChatOperationError);
    expect((err as ChatOperationError).code).toBe("participant_not_found");
    const [row] = await db.select().from(chatParticipants).where(eq(chatParticipants.id, seatId));
    expect(row?.joinHistoryVisibility).toBe("full");
    expect(emitted).toEqual([]);
  });

  test("a member who has LEFT is not a target (present-only roster)", async () => {
    const host = await seedUser(db, "host");
    const member = await seedUser(db, "member");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member", leftSeq: 2 });
    const roster = createRoster(makeChatContext(db), { emit });

    const err = await roster
      .setMemberHistoryVisibility({ principal: principal(host), chatId, userId: member, visibility: "from-join" })
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ChatOperationError);
    expect((err as ChatOperationError).code).toBe("participant_not_found");
  });
});

describe("kick — host removes a member", () => {
  test("the member's leftSeq is stamped + a kicked notification is delivered", async () => {
    const host = await seedUser(db, "host");
    const member = await seedUser(db, "member");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    const notes: NotificationEvent[] = [];
    const roster = createRoster(
      makeChatContext(db, {
        emitNotification: recordingEmit(notes),
      }),
      { emit },
    );

    await roster.kick({ principal: principal(host), chatId, userId: member });

    const [row] = await db.select().from(chatParticipants).where(eq(chatParticipants.userId, member));
    expect(row?.leftSeq).not.toBeNull();
    expect(emitted).toEqual([{ type: "chatUpdated", chatId }]);
    expect(notes).toEqual([{ type: "kicked", recipientUserId: member, chatId }]);
  });
});

describe("selfLeave — a sole-host self-leave archives the room", () => {
  test("a host leaving with no successor archives (never refused)", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const roster = createRoster(makeChatContext(db), { emit });

    await roster.selfLeave({ principal: principal(host), chatId });

    const [row] = await db.select().from(chats).where(eq(chats.id, chatId));
    expect(row?.archived).toBe(true);
    const [p] = await db.select().from(chatParticipants).where(eq(chatParticipants.userId, host));
    expect(p?.leftSeq).not.toBeNull();
  });
});

describe("nominateHostHandoff — host nominates a present member (step 1)", () => {
  test("the host nominates a member: pendingHostUserId is set + the nominee is notified", async () => {
    const host = await seedUser(db, "host");
    const member = await seedUser(db, "member");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    const notes: NotificationEvent[] = [];
    const roster = createRoster(
      makeChatContext(db, {
        emitNotification: recordingEmit(notes),
      }),
      { emit },
    );

    await roster.nominateHostHandoff({ principal: principal(host), chatId, userId: member });

    const [row] = await db.select().from(chats).where(eq(chats.id, chatId));
    expect(row?.pendingHostUserId).toBe(member);
    expect(emitted).toEqual([{ type: "chatUpdated", chatId }]);
    expect(notes).toEqual([{ type: "handoff-nominated", recipientUserId: member, chatId }]);
  });

  test("a plain member nominating is refused with not_host (no nomination written)", async () => {
    const host = await seedUser(db, "host");
    const member = await seedUser(db, "member");
    const other = await seedUser(db, "other");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    await seedParticipant(db, { chatId, key: "o", userId: other, role: "member" });
    const roster = createRoster(makeChatContext(db), { emit });

    const err = await roster.nominateHostHandoff({ principal: principal(member), chatId, userId: other }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChatOperationError);
    expect((err as ChatOperationError).code).toBe("not_host");
    const [row] = await db.select().from(chats).where(eq(chats.id, chatId));
    expect(row?.pendingHostUserId).toBeNull();
    expect(emitted).toEqual([]);
  });

  test("nominating a non-member is rejected leak-free (not found); no nomination written", async () => {
    const host = await seedUser(db, "host");
    const stranger = await seedUser(db, "stranger");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const roster = createRoster(makeChatContext(db), { emit });

    const err = await roster.nominateHostHandoff({ principal: principal(host), chatId, userId: stranger }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChatNotFoundError);
    const [row] = await db.select().from(chats).where(eq(chats.id, chatId));
    expect(row?.pendingHostUserId).toBeNull();
    expect(emitted).toEqual([]);
  });
});

describe("acceptHostHandoff — the nominee self-action (step 2)", () => {
  test("the nominee accepts: roles swap, the nomination clears, the old host is notified", async () => {
    const host = await seedUser(db, "host");
    const member = await seedUser(db, "member");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    const notes: NotificationEvent[] = [];
    const roster = createRoster(
      makeChatContext(db, {
        emitNotification: recordingEmit(notes),
      }),
      { emit },
    );
    await roster.nominateHostHandoff({ principal: principal(host), chatId, userId: member });
    emitted.length = 0;
    notes.length = 0;

    await roster.acceptHostHandoff({ principal: principal(member), chatId });

    const rows = await db.select().from(chatParticipants).where(eq(chatParticipants.chatId, chatId));
    expect(rows.find((r) => r.userId === host)?.role).toBe("member");
    expect(rows.find((r) => r.userId === member)?.role).toBe("host");
    const [chatRow] = await db.select().from(chats).where(eq(chats.id, chatId));
    expect(chatRow?.pendingHostUserId).toBeNull();
    expect(emitted).toEqual([{ type: "chatUpdated", chatId }]);
    expect(notes).toEqual([
      {
        type: "handoff-accepted",
        recipientUserId: host,
        chatId,
        newHostHandle: principal(member).handle,
      },
    ]);
  });

  test("a non-nominee accept is refused with not_turn_owner (the self-promotion hole stays closed)", async () => {
    const host = await seedUser(db, "host");
    const member = await seedUser(db, "member");
    const attacker = await seedUser(db, "attacker");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    await seedParticipant(db, { chatId, key: "x", userId: attacker, role: "member" });
    const roster = createRoster(makeChatContext(db), { emit });
    await roster.nominateHostHandoff({ principal: principal(host), chatId, userId: member });
    emitted.length = 0;

    const err = await roster.acceptHostHandoff({ principal: principal(attacker), chatId }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChatOperationError);
    expect((err as ChatOperationError).code).toBe("not_turn_owner");
    // Roles untouched; the nomination still stands for the real nominee; nothing emitted.
    const rows = await db.select().from(chatParticipants).where(eq(chatParticipants.chatId, chatId));
    expect(rows.find((r) => r.userId === host)?.role).toBe("host");
    expect(rows.find((r) => r.userId === attacker)?.role).toBe("member");
    const [chatRow] = await db.select().from(chats).where(eq(chats.id, chatId));
    expect(chatRow?.pendingHostUserId).toBe(member);
    expect(emitted).toEqual([]);
  });

  test("accept with no pending nomination is refused with not_turn_owner", async () => {
    const host = await seedUser(db, "host");
    const member = await seedUser(db, "member");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    const roster = createRoster(makeChatContext(db), { emit });

    const err = await roster.acceptHostHandoff({ principal: principal(member), chatId }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChatOperationError);
    expect((err as ChatOperationError).code).toBe("not_turn_owner");
  });

  // D64 (F4/PD-21 ruling): host authority MOVES to a non-card-owner — the handoff SUCCEEDS, transferring the
  // room + history but DROPPING the outgoing host's character seats (leaving the humans; the new owner adds
  // their own). Driven at the verb layer with seeded non-owner principals (multi-human membership is unwired).
  test("handoff to a non-owner SUCCEEDS: the outgoing host's characters are dropped, the owner's kept, humans remain", async () => {
    const host = await seedUser(db, "host");
    const member = await seedUser(db, "member");
    // Single-owner cast (D28): aria belongs to the OUTGOING host, bella to the NOMINEE. After the handoff the
    // new host (member) resolves bella but NOT aria → aria's seat drops, bella's stays.
    const aria = await seedCharacter(db, host, "aria");
    const bella = await seedCharacter(db, member, "bella");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    await seedParticipant(db, { chatId, key: "ca", characterId: aria, role: "member" });
    await seedParticipant(db, { chatId, key: "cb", characterId: bella, role: "member" });
    const notes: NotificationEvent[] = [];
    const roster = createRoster(makeChatContext(db, { getCard: ownedCard(), emitNotification: recordingEmit(notes) }), { emit });
    await roster.nominateHostHandoff({ principal: principal(host), chatId, userId: member });
    emitted.length = 0;
    notes.length = 0;

    await roster.acceptHostHandoff({ principal: principal(member), chatId });

    const rows = await db.select().from(chatParticipants).where(eq(chatParticipants.chatId, chatId));
    // Host authority transferred; both humans remain present.
    expect(rows.find((r) => r.userId === host)?.role).toBe("member");
    expect(rows.find((r) => r.userId === host)?.leftSeq).toBeNull();
    expect(rows.find((r) => r.userId === member)?.role).toBe("host");
    expect(rows.find((r) => r.userId === member)?.leftSeq).toBeNull();
    // The outgoing host's character seat is DROPPED (leftSeq stamped); the new host's is KEPT present.
    expect(rows.find((r) => r.characterId === aria)?.leftSeq).not.toBeNull();
    expect(rows.find((r) => r.characterId === bella)?.leftSeq).toBeNull();
    const [chatRow] = await db.select().from(chats).where(eq(chats.id, chatId));
    expect(chatRow?.pendingHostUserId).toBeNull();
    expect(emitted).toEqual([{ type: "chatUpdated", chatId }]);
  });

  // F1 (stickler 2026-08-03) — the rpg heal is an INJECTED op returning UNEXECUTED statements, and its whole
  // point is atomicity: it must ride the accept's own batch, so a crash can never promote a host while leaving
  // the game's GM voice pointed at the previous host's private preset. Chat's half is what this proves — the op
  // is asked about the NOMINEE (the incoming authority, never the caller-as-old-host) and its statements commit
  // with the swap. The rpg-side verdict lives in `tests/server/domain/rpg/chat-ops/handoff-heal.int.test.ts`;
  // the two are joined composed-real in `tests/server/entry/compose/rpg.int.test.ts`.
  test("the injected rpg handoff-heal statements are folded into the swap batch, asked about the NOMINEE", async () => {
    const host = await seedUser(db, "host");
    const member = await seedUser(db, "member");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    const asked: { chatId: string; newHostUserId: string }[] = [];
    // The returned statement stands in for the rpg write (chat commits it blind); `chats.title` is the observable.
    // FABRICATION-OK: minimal ChatRpgOps stub — the accept reaches ONLY `handoffHealStatements`.
    const rpg = {
      handoffHealStatements: (id: ChatId, newHostUserId: UserId): Promise<unknown[]> => {
        asked.push({ chatId: id, newHostUserId });
        return Promise.resolve([db.update(chats).set({ title: "healed" }).where(eq(chats.id, id))]);
      },
    } as unknown as NonNullable<NonNullable<Parameters<typeof makeChatContext>[1]>["rpg"]>;
    const notes: NotificationEvent[] = [];
    const roster = createRoster(makeChatContext(db, { rpg, emitNotification: recordingEmit(notes) }), { emit });
    await roster.nominateHostHandoff({ principal: principal(host), chatId, userId: member });

    await roster.acceptHostHandoff({ principal: principal(member), chatId });

    expect(asked).toEqual([{ chatId, newHostUserId: member }]);
    const [chatRow] = await db.select().from(chats).where(eq(chats.id, chatId));
    expect(chatRow?.title).toBe("healed");
    expect(chatRow?.pendingHostUserId).toBeNull();
  });

  // F2 (stickler 2026-08-03) — the D51 anchor is the room's stable `{{user}}` POV, and `chats.anchorPersonaId`
  // is resolved under the HOST's principal (owner-scoped `persona.get`). A handoff moves the host, so an anchor
  // the NEW host cannot read becomes a dead id: the POV silently falls through to the speaker's active persona
  // while the knob keeps serving an unreadable id (`ChatDetail.anchorPersonaId`) and `exportChat` still reads
  // its NAME by id. The heal is the `resolveForkGmPreset` twin — null it IN THE SWAP BATCH, conditional on
  // readability, so the null-anchor→active fallback takes over honestly.
  test("an anchor persona the new host cannot read is NULLED in the swap batch", async () => {
    const host = await seedUser(db, "host");
    const member = await seedUser(db, "member");
    const anchor = await seedPersona(db, host, "hostpov");
    const chatId = await seedChat(db, "a", { anchorPersonaId: anchor });
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    const notes: NotificationEvent[] = [];
    const roster = createRoster(makeChatContext(db, { emitNotification: recordingEmit(notes) }), { emit });
    await roster.nominateHostHandoff({ principal: principal(host), chatId, userId: member });

    await roster.acceptHostHandoff({ principal: principal(member), chatId });

    const [chatRow] = await db.select().from(chats).where(eq(chats.id, chatId));
    expect(chatRow?.anchorPersonaId).toBeNull();
    // The heal rides the SAME batch as the swap — never a second write that a crash could skip.
    expect(chatRow?.pendingHostUserId).toBeNull();
    const rows = await db.select().from(chatParticipants).where(eq(chatParticipants.chatId, chatId));
    expect(rows.find((r) => r.userId === member)?.role).toBe("host");
  });

  test("an anchor persona the NOMINEE owns survives the handoff (the POV is still readable)", async () => {
    const host = await seedUser(db, "host");
    const member = await seedUser(db, "member");
    // The room was already anchored on the nominee's own persona (the verb permits any present human's) —
    // the new host resolves it, so healing it would DESTROY a live pin. Conditional, exactly like the fork gate.
    const anchor = await seedPersona(db, member, "memberpov");
    const chatId = await seedChat(db, "a", { anchorPersonaId: anchor });
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    const notes: NotificationEvent[] = [];
    const roster = createRoster(makeChatContext(db, { emitNotification: recordingEmit(notes) }), { emit });
    await roster.nominateHostHandoff({ principal: principal(host), chatId, userId: member });

    await roster.acceptHostHandoff({ principal: principal(member), chatId });

    const [chatRow] = await db.select().from(chats).where(eq(chats.id, chatId));
    expect(chatRow?.anchorPersonaId).toBe(anchor);
  });

  test("a nominee who owns the WHOLE seated cast keeps every character seat on handoff", async () => {
    const host = await seedUser(db, "host");
    const member = await seedUser(db, "member");
    // The nominee owns the seated character → the new host resolves it, so no seat drops.
    const characterId = await seedCharacter(db, member, "aria");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    await seedParticipant(db, { chatId, key: "c", characterId, role: "member" });
    const notes: NotificationEvent[] = [];
    const roster = createRoster(makeChatContext(db, { getCard: ownedCard(), emitNotification: recordingEmit(notes) }), { emit });
    await roster.nominateHostHandoff({ principal: principal(host), chatId, userId: member });

    await roster.acceptHostHandoff({ principal: principal(member), chatId });

    const rows = await db.select().from(chatParticipants).where(eq(chatParticipants.chatId, chatId));
    expect(rows.find((r) => r.userId === host)?.role).toBe("member");
    expect(rows.find((r) => r.userId === member)?.role).toBe("host");
    // The nominee-owned character seat is retained (present).
    expect(rows.find((r) => r.characterId === characterId)?.leftSeq).toBeNull();
    const [chatRow] = await db.select().from(chats).where(eq(chats.id, chatId));
    expect(chatRow?.pendingHostUserId).toBeNull();
  });
});

describe("audit wiring — the membership/config mutations write best-effort audit rows", () => {
  interface RecordedAudit {
    readonly entry: AuditEntry;
    readonly at: number;
  }

  function auditRecorder(rows: RecordedAudit[]): (entry: AuditEntry, at: number) => Promise<void> {
    return (entry, at) => {
      rows.push({ entry, at });
      return Promise.resolve();
    };
  }

  test("kick writes chat.kick with the target AFTER the transition committed", async () => {
    const host = await seedUser(db, "host");
    const member = await seedUser(db, "member");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    const rows: RecordedAudit[] = [];
    const notes: NotificationEvent[] = [];
    const roster = createRoster(makeChatContext(db, { emitNotification: recordingEmit(notes), audit: auditRecorder(rows) }), { emit });

    await roster.kick({ principal: principal(host), chatId, userId: member });

    expect(rows).toEqual([
      {
        entry: {
          actorUserId: host,
          action: "chat.kick",
          entityType: "chat",
          entityId: chatId,
          metadata: { targetUserId: member },
        },
        at: expect.any(Number),
      },
    ]);
  });

  test("an idempotent no-op kick (target not present) writes NO audit row", async () => {
    const host = await seedUser(db, "host");
    const ghost = await seedUser(db, "ghost");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const rows: RecordedAudit[] = [];
    const roster = createRoster(makeChatContext(db, { audit: auditRecorder(rows) }), { emit });

    await roster.kick({ principal: principal(host), chatId, userId: ghost });

    expect(rows).toEqual([]);
  });

  test("nominate + accept write the two handoff rows (nominee / previous host)", async () => {
    const host = await seedUser(db, "host");
    const member = await seedUser(db, "member");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    const rows: RecordedAudit[] = [];
    const notes: NotificationEvent[] = [];
    const roster = createRoster(makeChatContext(db, { emitNotification: recordingEmit(notes), audit: auditRecorder(rows) }), { emit });

    await roster.nominateHostHandoff({ principal: principal(host), chatId, userId: member });
    await roster.acceptHostHandoff({ principal: principal(member), chatId });

    expect(rows.map((r) => r.entry.action)).toEqual(["chat.nominateHostHandoff", "chat.acceptHostHandoff"]);
    expect(rows.at(0)?.entry.metadata).toEqual({ nomineeUserId: member });
    // The heal FLAGS ride the accept row (F1/F2) — an un-anchored, non-game room heals nothing.
    expect(rows.at(1)?.entry.metadata).toEqual({ previousHostUserId: host, healedAnchorPersona: false, healedGmPreset: false });
    expect(rows.at(1)?.entry.actorUserId).toBe(member);
  });

  test("setGroupConfig logs output/policy; setRoomOverrides logs FIELD LABELS only (never bodies)", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const rows: RecordedAudit[] = [];
    const roster = createRoster(makeChatContext(db, { audit: auditRecorder(rows) }), { emit });

    await roster.setGroupConfig({
      principal: principal(host),
      chatId,
      config: { output: "per-speaker", policy: "natural" },
    });
    await roster.setRoomOverrides({
      principal: principal(host),
      chatId,
      overrides: { scenario: "a SECRET scenario body" },
    });

    expect(rows.at(0)?.entry.action).toBe("chat.setGroupConfig");
    expect(rows.at(0)?.entry.metadata).toEqual({ output: "per-speaker", policy: "natural" });
    expect(rows.at(1)?.entry.action).toBe("chat.setRoomOverrides");
    // The override BODY must never reach the log row — labels only (Part III §9).
    expect(rows.at(1)?.entry.metadata).toEqual({ fields: ["scenario"] });
    expect(JSON.stringify(rows.at(1)?.entry)).not.toContain("SECRET");
  });

  test("a refused write (member calling a host verb) writes NO audit row", async () => {
    const host = await seedUser(db, "host");
    const member = await seedUser(db, "member");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    const rows: RecordedAudit[] = [];
    const roster = createRoster(makeChatContext(db, { audit: auditRecorder(rows) }), { emit });

    await roster.kick({ principal: principal(member), chatId, userId: host }).catch((e: unknown) => e);

    expect(rows).toEqual([]);
  });
});

describe("setParticipantActivePersona — the chat-domain write persona.setActivePersona calls (PD-120)", () => {
  test("flips a present human's activePersonaId + emits personaSwitched with from/to", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const personaId = await seedPersona(db, host, "a");

    await setParticipantActivePersona(db, emit, { chatId, targetUserId: host, personaId });

    const [row] = await db.select().from(chatParticipants).where(eq(chatParticipants.userId, host));
    expect(row?.activePersonaId).toBe(personaId);
    expect(emitted).toEqual([{ type: "personaSwitched", chatId, from: null, to: personaId }]);
  });

  test("reports the prior persona as `from` on a second switch", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    const first = await seedPersona(db, host, "a");
    const second = await seedPersona(db, host, "b");
    await seedParticipant(db, {
      chatId,
      key: "h",
      userId: host,
      role: "host",
      activePersonaId: first,
    });

    await setParticipantActivePersona(db, emit, { chatId, targetUserId: host, personaId: second });

    expect(emitted).toEqual([{ type: "personaSwitched", chatId, from: first, to: second }]);
  });

  test("clearing back to null is a valid switch (to: null)", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    const personaId = await seedPersona(db, host, "a");
    await seedParticipant(db, {
      chatId,
      key: "h",
      userId: host,
      role: "host",
      activePersonaId: personaId,
    });

    await setParticipantActivePersona(db, emit, { chatId, targetUserId: host, personaId: null });

    const [row] = await db.select().from(chatParticipants).where(eq(chatParticipants.userId, host));
    expect(row?.activePersonaId).toBeNull();
    expect(emitted).toEqual([{ type: "personaSwitched", chatId, from: personaId, to: null }]);
  });

  test("a target that is not a PRESENT participant is refused with participant_not_found — no emit", async () => {
    const host = await seedUser(db, "host");
    const stranger = await seedUser(db, "stranger");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const personaId = await seedPersona(db, host, "a");

    const err = await setParticipantActivePersona(db, emit, {
      chatId,
      targetUserId: stranger,
      personaId,
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ChatOperationError);
    expect((err as ChatOperationError).code).toBe("participant_not_found");
    expect(emitted).toEqual([]);
  });

  test("a LEFT participant (leftSeq set) is treated as not-present — refused, no emit", async () => {
    const host = await seedUser(db, "host");
    const former = await seedUser(db, "former");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "f", userId: former, role: "member", leftSeq: 3 });
    const personaId = await seedPersona(db, former, "a");

    const err = await setParticipantActivePersona(db, emit, {
      chatId,
      targetUserId: former,
      personaId,
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ChatOperationError);
    expect((err as ChatOperationError).code).toBe("participant_not_found");
    expect(emitted).toEqual([]);
  });
});

// ── D121-E: the display-tier room OPTION (owner ruling 2026-08-02) ──────────────────────────────────────
// A HOST option in the D121-B grammar: default off, host-only, and RENDER-only — it governs what the room
// LOOKS like, never what the model sees or what anyone types. The read-back arm matters as much as the
// write: `ChatDetail.hostDisplayScripts` is what the host's switch and the viewer's render tier both read.
describe("setHostDisplayScripts — the host's display-tier broadcast option", () => {
  test("defaults OFF, and the host can turn it on (merging, never nuking, the sibling sub-blobs)", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const roster = createRoster(makeChatContext(db), { emit });

    // Seed a sibling sub-blob first — the write must not eat it.
    await roster.setRoomOverrides({ principal: principal(host), chatId, overrides: roomOverridesSchema.parse({ scenario: "keep me" }) });
    emitted.length = 0;

    expect(await roster.setHostDisplayScripts({ principal: principal(host), chatId, enabled: true })).toBe(true);

    const [row] = await db.select().from(chats).where(eq(chats.id, chatId));
    const metadata = row?.metadata as { hostDisplayScripts?: boolean; roomOverrides?: { scenario?: string } };
    expect(metadata.hostDisplayScripts).toBe(true);
    expect(metadata.roomOverrides?.scenario).toBe("keep me");
    expect(emitted).toEqual([{ type: "chatUpdated", chatId }]);
  });

  test("turning it back OFF is a real write (absent must never be read as ON)", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const roster = createRoster(makeChatContext(db), { emit });

    await roster.setHostDisplayScripts({ principal: principal(host), chatId, enabled: true });
    expect(await roster.setHostDisplayScripts({ principal: principal(host), chatId, enabled: false })).toBe(false);

    const [row] = await db.select().from(chats).where(eq(chats.id, chatId));
    expect((row?.metadata as { hostDisplayScripts?: boolean }).hostDisplayScripts).toBe(false);
  });

  test("a plain MEMBER is refused with not_host — no write, no emit", async () => {
    const host = await seedUser(db, "host");
    const member = await seedUser(db, "member");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    const roster = createRoster(makeChatContext(db), { emit });

    const err = await roster.setHostDisplayScripts({ principal: principal(member), chatId, enabled: true }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChatOperationError);
    expect((err as ChatOperationError).code).toBe("not_host");
    const [row] = await db.select().from(chats).where(eq(chats.id, chatId));
    // A never-written metadata column is NULL, not an empty object — either way the option is absent.
    expect((row?.metadata as { hostDisplayScripts?: boolean } | null)?.hostDisplayScripts).toBeUndefined();
    expect(emitted).toEqual([]);
  });
});
