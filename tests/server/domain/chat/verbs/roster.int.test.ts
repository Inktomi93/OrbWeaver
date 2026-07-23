// The roster / group-config / room-override / membership-lifecycle verbs (chat.md Part III §1/§9/§11). Proves
// against a real libSQL db: the host-authority gate (member denied with `not_host`), the persistence effect,
// the emitted `chatUpdated` bus event, and the kick `kicked` notification — with the REAL admin `can()`. The
// verbs are reached through the grouped-file BUNDLE (`createRoster(ctx, { emit })`).

import type { CharacterCard } from "@orb/contracts/character";
import type { ChatBusEvent, ParticipantView, RoomOverrides } from "@orb/contracts/chat";
import type { Principal } from "@orb/contracts/identity";
import type { NotificationEvent } from "@orb/contracts/notifications";
import type { ThemeBackground } from "@orb/contracts/theme";
import type { Db } from "@orb/db";
import { characters, chatParticipants, chats, rpgGames } from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import { batchMany } from "@orb/db/kit";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { CharacterId, ChatId, ChatParticipantId, DocumentId, Handle, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import type { AuditEntry } from "@orb/server/foundation/observability";
import { and, eq, isNull } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import type { ChatContext } from "../../../../../packages/server/src/domain/chat/context";
import { ChatNotFoundError, ChatOperationError } from "../../../../../packages/server/src/domain/chat/contract/errors";
import { createRoster, setParticipantActivePersona } from "../../../../../packages/server/src/domain/chat/verbs/roster";
import { createResolveGmSeatHolder } from "../../../../../packages/server/src/domain/rpg/index.ts";
import { freshDb } from "../../../../support/db";
import { seedGame } from "../../../../support/factories/index.ts";
import { principal as makePrincipal } from "../../../../support/factories/principal.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeRpgContext, rpgRealIdentity } from "../../../../support/rpg-context.ts";
import { FROZEN_AT, makeChatContext, seedAgent, seedCharacter, seedChat, seedParticipant, seedPersona, seedUser } from "../_support";

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

/** A `ChatContext` whose injected rpg bundle wires the REAL F5 seal read (`resolveGmSeatHolderKind` = the rpg
 *  `createResolveGmSeatHolder` factory over the SAME db) — the other ChatRpgOps are inert no-ops. Proves the seal
 *  end-to-end: a real rpg_games row's `gmUserId` FK-walk drives chat.setGroupConfig's refusal, chat rpg-blind. */
function gameChatContext(): ChatContext {
  const rpgCtx = makeRpgContext(db, { identity: rpgRealIdentity(db) });
  return makeChatContext(db, {
    rpg: {
      resolvePresetOverride: async () => null,
      gatherTurnContext: async () => null,
      markDicePreRollEligible: () => undefined,
      onUserCommit: async () => undefined,
      onTurnCompleted: async () => undefined,
      onTurnAborted: async () => undefined,
      resolveGmSeatHolderKind: createResolveGmSeatHolder(rpgCtx),
    },
  });
}

/** An owner-scoped `getCard` fake mirroring the REAL one (D28 — `loadOwnedCharacterRow`): the card resolves
 *  only for its OWNER, `null` for a non-owner. The handoff cast-drop resolver (D64 / F4) calls this per seated
 *  character to decide which seats the NEW host doesn't own (→ dropped); the harness default is a bare `null`. */
function ownedCard(): (params: { readonly ownerId: UserId; readonly characterId: CharacterId }) => Promise<CharacterCard | null> {
  return async ({ ownerId, characterId }) => {
    const [row] = await db.select().from(characters).where(eq(characters.id, characterId));
    return row !== undefined && row.ownerId === ownerId ? card(row.name) : null;
  };
}

/** The agent display-name resolvers a seat-verb return now walks (R10): the AgentCardView soul (null here =
 *  unhatched) → the `sourceKind` label fallback ("buddy" → "Buddy"). Injected wherever a verb returns an
 *  agent ParticipantView, so the row carries a name (never "", never the raw ULID). */
const AGENT_NAME_STUBS = {
  resolveAgentCardView: (): Promise<null> => Promise.resolve(null),
  resolveAgentSourceKind: (): Promise<"buddy"> => Promise.resolve("buddy"),
} as const;

/** Seat a `kind:'agent'` participant directly (seatAgent's own chokepoint is exercised in its describe below;
 *  these helpers need only a present agent row to drive the mute / nominate refusals). */
async function seatAgentRow(chatId: ChatId, agentUserId: UserId, over: { disabled?: boolean } = {}): Promise<void> {
  await db.insert(chatParticipants).values({
    id: castId<ChatParticipantId>(`chat_participant_agent_${agentUserId}`),
    chatId,
    kind: "agent",
    userId: agentUserId,
    role: "member",
    joinedAt: FROZEN_AT,
    joinSeq: 0,
    disabled: over.disabled ?? false,
  });
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

  test("F5 seal: an agent-GM game REFUSES a per-speaker flip (no write) but ALLOWS narrator (assignGmSeat's own path)", async () => {
    const host = await seedUser(db, "host");
    const agent = await seedAgent(db, host, "buddy");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedGame(db, { chatId, gmUserId: agent }); // the agent HOLDS the GM seat
    const roster = createRoster(gameChatContext(), { emit });

    const err = await roster
      .setGroupConfig({ principal: principal(host), chatId, config: { output: "per-speaker", policy: "natural" } })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChatOperationError);
    expect((err as ChatOperationError).code).toBe("agent_gm_seat_config_locked");
    // No write, no emit — the seal throws BEFORE the metadata update.
    const [row] = await db.select().from(chats).where(eq(chats.id, chatId));
    expect(row?.metadata?.group?.output).not.toBe("per-speaker");
    expect(emitted).toEqual([]);

    // narrator+merged is the config assignGmSeat itself sets for an agent GM — it MUST stay writable (no deadlock).
    const ok = await roster.setGroupConfig({ principal: principal(host), chatId, config: { output: "narrator", policy: "natural" } });
    expect(ok.output).toBe("narrator");
  });

  test("F5 seal: releases once the agent GM is unseated (seat → AI narrator), and never fires for a non-game chat", async () => {
    const host = await seedUser(db, "host");
    const agent = await seedAgent(db, host, "buddy");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const game = await seedGame(db, { chatId, gmUserId: agent });
    const roster = createRoster(gameChatContext(), { emit });

    // Unseat: return the GM seat to the AI narrator (assignGmSeat(null)'s effect — proven live in the rpg suite).
    await db.update(rpgGames).set({ gmUserId: null }).where(eq(rpgGames.id, game.id));
    const flipped = await roster.setGroupConfig({ principal: principal(host), chatId, config: { output: "per-speaker", policy: "natural" } });
    expect(flipped.output).toBe("per-speaker");

    // A non-game chat (no rpg_games row) — the seal read returns null, so the flip is byte-identical to pre-F5.
    const plainChatId = await seedChat(db, "b");
    await seedParticipant(db, { chatId: plainChatId, key: "h2", userId: host, role: "host" });
    const plain = await roster.setGroupConfig({ principal: principal(host), chatId: plainChatId, config: { output: "per-speaker", policy: "natural" } });
    expect(plain.output).toBe("per-speaker");
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

describe("setRpgGamePointer — the opaque rpg game-pointer stamp (GAP #4)", () => {
  test("host stamps metadata.rpg, MERGES into siblings, emits chatUpdated", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const roster = createRoster(makeChatContext(db), { emit });
    await roster.setRoomOverrides({ principal: principal(host), chatId, overrides: { scenario: "a tavern" } });

    const gameId = mintTypeId(ID_PREFIX.rpgGame);
    await roster.setRpgGamePointer({ principal: principal(host), chatId, gameId });
    const [row] = await db.select().from(chats).where(eq(chats.id, chatId));
    expect(row?.metadata?.rpg).toEqual({ gameId });
    expect(row?.metadata?.roomOverrides).toEqual({ scenario: "a tavern" }); // the sibling sub-blob is intact
    expect(emitted).toContainEqual({ type: "chatUpdated", chatId });
  });

  test("a member is refused (host-only)", async () => {
    const host = await seedUser(db, "host");
    const member = await seedUser(db, "member");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    const roster = createRoster(makeChatContext(db), { emit });
    await expect(roster.setRpgGamePointer({ principal: principal(member), chatId, gameId: mintTypeId(ID_PREFIX.rpgGame) })).rejects.toThrow();
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
  const Agent = castId<UserId>("user_buddy");

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

  // The gap D80 closes: agent talkativeness was UNSETTABLE (the retired fork had a mute arm but no
  // talkativeness arm). The unified verb writes BOTH knobs on an agent seat through the same path.
  test("the host tunes a present AGENT seat's talkativeness AND mute (formerly unsettable); the row + agent view round-trip", async () => {
    const host = await seedUser(db, "host");
    await seedAgent(db, host, "buddy");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seatAgentRow(chatId, Agent);
    const agentSeatId = castId<ChatParticipantId>(`chat_participant_agent_${Agent}`);
    const roster = createRoster(makeChatContext(db, { ...AGENT_NAME_STUBS }), { emit });

    const tuned = await roster.setSeatKnobs({ principal: principal(host), chatId, participantId: agentSeatId, patch: { talkativeness: 0.9, disabled: true } });
    expect(tuned.kind).toBe("agent");
    expect(tuned.userId).toBe(Agent);
    expect(tuned.characterId).toBeNull();
    expect(tuned.talkativeness).toBe(0.9);
    expect(tuned.disabled).toBe(true);
    // R10: the seat-verb return carries the resolved soul name (label fallback for an unhatched buddy), never "".
    expect(tuned.displayName).toBe("Buddy");
    const [row] = await db
      .select()
      .from(chatParticipants)
      .where(and(eq(chatParticipants.userId, Agent), eq(chatParticipants.kind, "agent")));
    expect(row?.talkativeness).toBe(0.9);
    expect(row?.disabled).toBe(true);
    expect(emitted).toEqual([{ type: "chatUpdated", chatId }]);
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

  // D60, doc 06 §4: the chat-side agent-kind pre-check. An agent holds no Principal, can never accept a
  // handoff — refuse HONESTLY at the verb (cannot_nominate_agent), BEFORE the notifications belt would
  // fail-close it downstream as the opaque `agent_recipient`. No pending write, no notification, no bus event.
  test("nominating a SEATED AGENT is refused with cannot_nominate_agent — nothing written, no notification", async () => {
    const host = await seedUser(db, "host");
    const owner = await seedUser(db, "owner");
    const agent = await seedAgent(db, owner, "buddy");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "o", userId: owner, role: "member" });
    await seatAgentRow(chatId, agent);
    const notes: NotificationEvent[] = [];
    const roster = createRoster(makeChatContext(db, { emitNotification: recordingEmit(notes) }), { emit });

    const err = await roster.nominateHostHandoff({ principal: principal(host), chatId, userId: agent }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChatOperationError);
    expect((err as ChatOperationError).code).toBe("cannot_nominate_agent");
    const [row] = await db.select().from(chats).where(eq(chats.id, chatId));
    expect(row?.pendingHostUserId).toBeNull();
    expect(notes).toEqual([]);
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
    expect(rows.at(1)?.entry.metadata).toEqual({ previousHostUserId: host });
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

describe("seatAgent — the ONE agent-seat chokepoint (D60, doc 04 §3)", () => {
  const Agent = castId<UserId>("user_buddy");

  /** A roster bundle whose agent ops are stubbed (the real mint is tested in sessions' provision-agent
   *  int-test; here we exercise the VERB — owner-presence, containment, the seat upsert, the view). */
  function seatRoster(opts: { enabled?: boolean } = {}): ReturnType<typeof createRoster> {
    const ctx = makeChatContext(db, {
      provisionAgentPrincipal: () => Promise.resolve({ agentUserId: Agent, created: true }),
      // The ONE agent kill-switch read: an AgentActor whose `enabled` drives the seat containment refusal
      // (ownerUserId is unread by seatAgent — a placeholder in this double).
      resolveAgentActor: () => Promise.resolve({ kind: "agent", userId: Agent, ownerUserId: Agent, enabled: opts.enabled ?? true }),
      // The seat-verb return resolves the agent's display name via the SAME rule as the roster read (R10);
      // unhatched here (AgentCardView null) → the sourceKind label, so the view carries "Buddy", never "".
      ...AGENT_NAME_STUBS,
    });
    return createRoster(ctx, { emit });
  }

  const agentRows = async (chatId: ChatId): Promise<(typeof chatParticipants.$inferSelect)[]> =>
    await db
      .select()
      .from(chatParticipants)
      .where(and(eq(chatParticipants.chatId, chatId), eq(chatParticipants.kind, "agent")));

  test("the host seats their OWN agent (owner==host): a kind='agent' member row + chatUpdated", async () => {
    const host = await seedUser(db, "host");
    await seedAgent(db, host, "buddy");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });

    const view = await seatRoster().seatAgent({
      principal: principal(host),
      chatId,
      ownerUserId: host,
      sourceKind: "buddy",
    });

    expect(view.kind).toBe("agent");
    expect(view.userId).toBe(Agent);
    expect(view.characterId).toBeNull();
    expect(view.role).toBe("member");
    const rows = await agentRows(chatId);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.userId).toBe(Agent);
    expect(rows[0]?.leftSeq).toBeNull();
    expect(emitted).toContainEqual({ type: "chatUpdated", chatId });
  });

  test("the host seats a present member's agent when the owner is not the host", async () => {
    const host = await seedUser(db, "host");
    const friend = await seedUser(db, "friend");
    await seedAgent(db, friend, "buddy");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "f", userId: friend, role: "member" });

    const view = await seatRoster().seatAgent({
      principal: principal(host),
      chatId,
      ownerUserId: friend,
      sourceKind: "buddy",
    });
    expect(view.userId).toBe(Agent);
    expect(await agentRows(chatId)).toHaveLength(1);
  });

  test("a non-host member is refused (not_host) — no seat", async () => {
    const host = await seedUser(db, "host");
    const member = await seedUser(db, "member");
    await seedAgent(db, member, "buddy");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });

    await expect(
      seatRoster().seatAgent({
        principal: principal(member),
        chatId,
        ownerUserId: member,
        sourceKind: "buddy",
      }),
    ).rejects.toMatchObject({ code: "not_host" });
    expect(await agentRows(chatId)).toHaveLength(0);
  });

  test("an owner who is NOT a present member is refused (owner_not_present)", async () => {
    const host = await seedUser(db, "host");
    const stranger = await seedUser(db, "stranger");
    await seedAgent(db, stranger, "buddy");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });

    await expect(
      seatRoster().seatAgent({
        principal: principal(host),
        chatId,
        ownerUserId: stranger, // owns an agent but is not in the room
        sourceKind: "buddy",
      }),
    ).rejects.toMatchObject({ code: "owner_not_present" });
    expect(await agentRows(chatId)).toHaveLength(0);
  });

  test("a DISABLED agent principal is refused the seat (agent_disabled) — containment", async () => {
    const host = await seedUser(db, "host");
    await seedAgent(db, host, "buddy");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });

    await expect(
      seatRoster({ enabled: false }).seatAgent({
        principal: principal(host),
        chatId,
        ownerUserId: host,
        sourceKind: "buddy",
      }),
    ).rejects.toMatchObject({ code: "agent_disabled" });
    expect(await agentRows(chatId)).toHaveLength(0);
  });

  test("re-seat of a KICKED agent re-joins (leftSeq cleared); a double-seat is idempotent", async () => {
    const host = await seedUser(db, "host");
    await seedAgent(db, host, "buddy");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const roster = seatRoster();
    const seat = (): Promise<ParticipantView> =>
      roster.seatAgent({
        principal: principal(host),
        chatId,
        ownerUserId: host,
        sourceKind: "buddy",
      });

    await seat();
    // Double-seat while present → idempotent (still exactly one row, present).
    await seat();
    expect(await agentRows(chatId)).toHaveLength(1);

    // Kick the agent (stamp leftSeq), then re-seat → the SAME row re-joins (leftSeq cleared), no duplicate.
    await db
      .update(chatParticipants)
      .set({ leftSeq: 5 })
      .where(and(eq(chatParticipants.chatId, chatId), eq(chatParticipants.userId, Agent)));
    await seat();
    const rows = await agentRows(chatId);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.leftSeq).toBeNull();
  });
});

describe("requestAgentSeat — the owner≠host consent request (D60, doc 04 §3)", () => {
  test("a present member requests THEIR OWN agent: a durable agent-seat-requested notification to the host; no bus event", async () => {
    const host = await seedUser(db, "host");
    const owner = await seedUser(db, "owner");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "o", userId: owner, role: "member" });
    const notes: NotificationEvent[] = [];
    const roster = createRoster(makeChatContext(db, { emitNotification: recordingEmit(notes) }), { emit });

    await roster.requestAgentSeat({ principal: principal(owner), chatId, ownerUserId: owner, sourceKind: "buddy" });

    // The request is ADVISORY — it delivers only the durable notification (to the HUMAN host), never a
    // roster mutation or a chat bus event.
    expect(notes).toEqual([
      {
        type: "agent-seat-requested",
        recipientUserId: host,
        chatId,
        ownerUserId: owner,
        sourceKind: "buddy",
        requestedByHandle: principal(owner).handle,
      },
    ]);
    expect(emitted).toEqual([]);
  });

  test("a non-member is refused leak-free (NOT_FOUND); no notification", async () => {
    const host = await seedUser(db, "host");
    const stranger = await seedUser(db, "stranger");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const notes: NotificationEvent[] = [];
    const roster = createRoster(makeChatContext(db, { emitNotification: recordingEmit(notes) }), { emit });

    await expect(roster.requestAgentSeat({ principal: principal(stranger), chatId, ownerUserId: stranger, sourceKind: "buddy" })).rejects.toBeInstanceOf(
      ChatNotFoundError,
    );
    expect(notes).toEqual([]);
  });

  test("a member requesting SOMEONE ELSE'S agent is refused (not_agent_owner) — the owner-consent arm", async () => {
    const host = await seedUser(db, "host");
    const member = await seedUser(db, "member");
    const other = await seedUser(db, "other");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    await seedParticipant(db, { chatId, key: "o", userId: other, role: "member" });
    const notes: NotificationEvent[] = [];
    const roster = createRoster(makeChatContext(db, { emitNotification: recordingEmit(notes) }), { emit });

    const err = await roster.requestAgentSeat({ principal: principal(member), chatId, ownerUserId: other, sourceKind: "buddy" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChatOperationError);
    expect((err as ChatOperationError).code).toBe("not_agent_owner");
    expect(notes).toEqual([]);
  });
});

describe("kick — unseats an agent seat (no inbox → no notification; doc 06 §3/§4)", () => {
  const Agent = castId<UserId>("user_buddy");

  test("kicking a seated agent stamps leftSeq WITHOUT delivering a notification (the agent-recipient refusal never fires)", async () => {
    const host = await seedUser(db, "host");
    const owner = await seedUser(db, "owner");
    await seedAgent(db, owner, "buddy");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "o", userId: owner, role: "member" });
    // A ctx whose emitNotification THROWS on any call — mirroring notifications.record's agent-recipient
    // refusal. If kick wrongly tried to deliver a `kicked` notification to the agent, this test would throw.
    const ctx = makeChatContext(db, {
      provisionAgentPrincipal: () => Promise.resolve({ agentUserId: Agent, created: true }),
      resolveAgentActor: () => Promise.resolve({ kind: "agent", userId: Agent, ownerUserId: owner, enabled: true }),
      emitNotification: () => Promise.reject(new Error("kick must not deliver a notification to an agent (no inbox — doc 06 §3)")),
      ...AGENT_NAME_STUBS,
    });
    const roster = createRoster(ctx, { emit });
    await roster.seatAgent({ principal: principal(host), chatId, ownerUserId: owner, sourceKind: "buddy" });
    emitted.length = 0;

    await roster.kick({ principal: principal(host), chatId, userId: Agent });

    const [row] = await db
      .select()
      .from(chatParticipants)
      .where(and(eq(chatParticipants.userId, Agent), eq(chatParticipants.kind, "agent")));
    expect(row?.leftSeq).not.toBeNull();
    expect(emitted).toEqual([{ type: "chatUpdated", chatId }]);
  });
});

describe("unseatAgent — the symmetric agent-unseat verb (host-gated; the seatAgent twin, works single-human)", () => {
  const Agent = castId<UserId>("user_buddy");

  const agentRow = async (chatId: ChatId, agentUserId: UserId = Agent): Promise<typeof chatParticipants.$inferSelect | undefined> => {
    const [row] = await db
      .select()
      .from(chatParticipants)
      .where(and(eq(chatParticipants.chatId, chatId), eq(chatParticipants.userId, agentUserId), eq(chatParticipants.kind, "agent")));
    return row;
  };

  test("round-trip: a seated agent is unseated — leftSeq stamped, chatUpdated emitted", async () => {
    const host = await seedUser(db, "host");
    await seedAgent(db, host, "buddy");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seatAgentRow(chatId, Agent);
    const roster = createRoster(makeChatContext(db), { emit });

    expect((await agentRow(chatId))?.leftSeq).toBeNull();
    await roster.unseatAgent({ principal: principal(host), chatId, agentUserId: Agent });

    expect((await agentRow(chatId))?.leftSeq).not.toBeNull();
    expect(emitted).toContainEqual({ type: "chatUpdated", chatId });
  });

  test("a non-host member is refused (not_host) — the seat stays present", async () => {
    const host = await seedUser(db, "host");
    const member = await seedUser(db, "member");
    await seedAgent(db, host, "buddy");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    await seatAgentRow(chatId, Agent);
    const roster = createRoster(makeChatContext(db), { emit });

    await expect(roster.unseatAgent({ principal: principal(member), chatId, agentUserId: Agent })).rejects.toMatchObject({ code: "not_host" });
    expect((await agentRow(chatId))?.leftSeq).toBeNull();
    expect(emitted).toEqual([]);
  });

  test("a stranger (non-member) is refused leak-free NOT_FOUND — the requireHost membership collapse; the seat is untouched", async () => {
    const host = await seedUser(db, "host");
    const stranger = await seedUser(db, "stranger");
    await seedAgent(db, host, "buddy");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seatAgentRow(chatId, Agent);
    const roster = createRoster(makeChatContext(db), { emit });

    await expect(roster.unseatAgent({ principal: principal(stranger), chatId, agentUserId: Agent })).rejects.toBeInstanceOf(ChatNotFoundError);
    expect((await agentRow(chatId))?.leftSeq).toBeNull();
  });

  test("target-only: unseating a HUMAN member's userId is refused (participant_not_found) — the kind='agent' WHERE scope is teeth; the human row is untouched", async () => {
    const host = await seedUser(db, "host");
    const member = await seedUser(db, "member");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    const roster = createRoster(makeChatContext(db), { emit });

    await expect(roster.unseatAgent({ principal: principal(host), chatId, agentUserId: member })).rejects.toMatchObject({ code: "participant_not_found" });
    const [m] = await db
      .select()
      .from(chatParticipants)
      .where(and(eq(chatParticipants.chatId, chatId), eq(chatParticipants.userId, member)));
    expect(m?.leftSeq).toBeNull();
    expect(emitted).toEqual([]);
  });

  test("no notification is delivered (agents have no inbox) — an emitNotification that THROWS never fires", async () => {
    const host = await seedUser(db, "host");
    await seedAgent(db, host, "buddy");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seatAgentRow(chatId, Agent);
    // If unseatAgent wrongly tried to notify the agent, this rejecting op would surface the bug.
    const ctx = makeChatContext(db, {
      emitNotification: () => Promise.reject(new Error("unseatAgent must not deliver a notification to an agent (no inbox — doc 06 §3)")),
    });
    const roster = createRoster(ctx, { emit });

    await roster.unseatAgent({ principal: principal(host), chatId, agentUserId: Agent });
    expect((await agentRow(chatId))?.leftSeq).not.toBeNull();
  });

  test("kick-path parity: kick(agent) and unseatAgent(agent) leave byte-identical row state", async () => {
    const host = await seedUser(db, "host");
    const agentA = await seedAgent(db, host, "buddyA");
    const agentB = await seedAgent(db, host, "buddyB");
    const chatA = await seedChat(db, "a");
    const chatB = await seedChat(db, "b");
    await seedParticipant(db, { chatId: chatA, key: "ha", userId: host, role: "host" });
    await seedParticipant(db, { chatId: chatB, key: "hb", userId: host, role: "host" });
    await seatAgentRow(chatA, agentA);
    await seatAgentRow(chatB, agentB);
    const roster = createRoster(makeChatContext(db), { emit });

    await roster.kick({ principal: principal(host), chatId: chatA, userId: agentA });
    await roster.unseatAgent({ principal: principal(host), chatId: chatB, agentUserId: agentB });

    const kicked = await agentRow(chatA, agentA);
    const unseated = await agentRow(chatB, agentB);
    expect(kicked?.leftSeq).not.toBeNull();
    // Both stamp leftSeq = loadMaxMessageSeq (0 here, no messages); every other column is unchanged.
    expect(unseated?.leftSeq).toBe(kicked?.leftSeq);
    expect(unseated?.kind).toBe(kicked?.kind);
    expect(unseated?.role).toBe(kicked?.role);
    expect(unseated?.disabled).toBe(kicked?.disabled);
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
