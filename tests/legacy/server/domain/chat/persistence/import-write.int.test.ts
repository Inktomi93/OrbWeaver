// Mirror int-test for domain/chat/persistence/createBulkImportChats (Option B) — the chat-OWNED bulk
// import WRITE over a real db: chats→messages→variants (D26) + founding roster + branch resolution, dup-skip
// by importHash, the ST author's-note → chat_injections landing, and the ownership precondition. The
// input is the canonical `BulkImportChatInput` (`@orb/contracts/chat`); the ST→canonical mapping is import's
// job (tested there), so these fixtures are chat-native.

import type { BulkImportChatInput } from "@orb/contracts/chat";
import { generationUsageLegSchema } from "@orb/contracts/inference";
import type { Db } from "@orb/db";
import {
  characters,
  chatGenerationObservations,
  chatImportClaims,
  chatInjections,
  chatParticipants,
  chats,
  messageAssets,
  messages,
  messageVariants,
  ownerStats,
  statsCanonVersions,
} from "@orb/db";
import type { BatchStmt } from "@orb/db/query";
import { chunkRows, rowsPerInsert } from "@orb/db/query";
import { databaseHandle } from "@orb/db/wiring-driver";
import { DomainNotFoundError } from "@orb/kit/errors";
import type {
  AssetId,
  CharacterHandle,
  CharacterId,
  ChatId,
  ChatInjectionId,
  ChatParticipantId,
  ChatTurnId,
  MessageAssetId,
  MessageId,
  MessageVariantId,
  UserId,
} from "@orb/kit/ids";
import { castId, ID_PREFIX } from "@orb/kit/ids";
import { createSeededIds } from "@orb/testkit/iso/ids.ts";
import { freshDb } from "@orb/testkit/node/db.ts";
import { makeGenerationUsage } from "@orb/testkit/node/factories/generation-usage.ts";
import { makeCharacter, seedAsset, seedCharacter, seedPersona, seedUser } from "@orb/testkit/node/factories/index.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { asc, eq } from "drizzle-orm";
import { describe } from "vitest";
import { selectOwnedAssetRefs } from "#server/domain/assets/persistence/queries.ts";
import { ChatOperationError } from "#server/domain/chat/contract/errors.ts";
import type { ChatImportContext } from "#server/domain/chat/contract/import.ts";
import { createBulkImportChats } from "#server/domain/chat/persistence/import-write.ts";
import { reconcileStats } from "#server/domain/stats/index.ts";
import { bumpStatsCanonVersion } from "#server/domain/stats/write/apply-delta.ts";

const NOW = 1_700_000_000_000;
const CHAT_CREATED = 1_699_999_990_000;
const CHAT_UPDATED = 1_699_999_995_000;
const MSG0_AT = 1_699_999_991_000;
const MSG1_AT = 1_699_999_992_000;
const JSONL_EXT = /\.jsonl$/i;
const OVER_BIND_CAPACITY = rowsPerInsert(1) + 1;
const CAPACITY_TIMEOUT_MS = 120_000;

/** Records every `mintSyntheticGroupCharacter` call so a test can pin BOTH the once-per-chat idempotency and
 *  the "a plain ST import never touches the synthetic namespace" byte-identity claim. */
interface MintSpy {
  readonly calls: { readonly chatId: ChatId }[];
  /** The synthetic row the stub minted (one per chat), keyed by chatId — find-or-mint, like the real verb. */
  readonly byChat: Map<string, CharacterId>;
}

/** A deterministic counter-minted `ChatImportContext` (no ambient clock/ids under tests/). */
function importCtx(db: Db, ownerId: UserId, spy: MintSpy = { calls: [], byChat: new Map() }): ChatImportContext {
  let n = 0;
  const turnIds = createSeededIds();
  const counter = (): string => {
    n += 1;
    return String(n).padStart(26, "0");
  };
  return {
    db,
    bumpStatsCanonVersion: (batch, opDb, versionOwnerId) => bumpStatsCanonVersion(batch as BatchStmt[], opDb, versionOwnerId),
    now: (): number => NOW,
    newChatId: (): ChatId => castId<ChatId>(`chat_${counter()}`),
    newChatTurnId: (): ChatTurnId => castId<ChatTurnId>(turnIds.next(ID_PREFIX.chatTurn)),
    newMessageId: (): MessageId => castId<MessageId>(`message_${counter()}`),
    newMessageVariantId: (): MessageVariantId => castId<MessageVariantId>(`message_variant_${counter()}`),
    newMessageAssetId: (): MessageAssetId => castId<MessageAssetId>(`message_asset_${counter()}`),
    newParticipantId: (): ChatParticipantId => castId<ChatParticipantId>(`chat_participant_${counter()}`),
    newChatInjectionId: (): ChatInjectionId => castId<ChatInjectionId>(`chat_injection_${counter()}`),
    // #67 — default "nothing exists" (these tests seed no attachments); the P-8 round-trip covers the
    // asset-existing path end-to-end.
    filterExistingAssetIds: (): Promise<readonly AssetId[]> => Promise.resolve([]),
    // Stands in for character's real find-or-mint: one synthetic row per chatId, re-found on a repeat call.
    mintSyntheticGroupCharacter: async ({ chatId }): Promise<{ characterId: CharacterId }> => {
      spy.calls.push({ chatId });
      const found = spy.byChat.get(chatId);
      if (found !== undefined) {
        return { characterId: found };
      }
      const row = await seedCharacter(db, { ownerId, name: "Group", handle: castId<CharacterHandle>(`__group__${chatId}`), synthetic: true });
      spy.byChat.set(chatId, row.id);
      return { characterId: row.id };
    },
  };
}

/** One canonical real_conversation chat (a greeting + a user turn). `over` tweaks the dedup/branch/note keys. */
function chatInput(importedFrom: string, over: Partial<BulkImportChatInput> = {}): BulkImportChatInput {
  return {
    title: importedFrom.replace(JSONL_EXT, ""),
    importedFrom,
    importHash: `hash-${importedFrom}`,
    anchorPersonaId: null,
    createdAt: CHAT_CREATED,
    updatedAt: CHAT_UPDATED,
    parentRef: null,
    isRealConversation: true,
    messages: [
      {
        role: "assistant",
        createdAt: MSG0_AT,
        personaId: null,
        selectedIdx: 0,
        variants: [
          {
            idx: 0,
            content: "Hello traveller.",
            model: null,
            provider: null,
            tokensOut: null,
            tokenProvenance: "unrecorded",
            reasoning: null,
            ttftMs: null,
            genStartedAt: null,
            genFinishedAt: null,
            metadata: null,
          },
        ],
      },
      {
        role: "user",
        createdAt: MSG1_AT,
        personaId: null,
        selectedIdx: 0,
        variants: [
          {
            idx: 0,
            content: "Hi Aria!",
            model: null,
            provider: null,
            tokensOut: null,
            tokenProvenance: "unrecorded",
            reasoning: null,
            ttftMs: null,
            genStartedAt: null,
            genFinishedAt: null,
            metadata: null,
          },
        ],
      },
    ],
    ...over,
  };
}

describe("createBulkImportChats", () => {
  test("inline asset references beyond the bind ceiling retain the owned tail without foreign retaining rows", { timeout: CAPACITY_TIMEOUT_MS }, async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const stranger = await seedUser(db);
    const primary = await seedCharacter(db, { ownerId: owner.id });
    const owned = await seedAsset(db, { ownerId: owner.id });
    const foreign = await seedAsset(db, { ownerId: stranger.id });
    const ids = createSeededIds();
    const refs = Array.from({ length: OVER_BIND_CAPACITY + 2 }, () => ids.next(ID_PREFIX.asset))
      .filter((id) => id !== owned.id && id !== foreign.id)
      .slice(0, OVER_BIND_CAPACITY);
    const base = chatInput("AssetCapacity.jsonl");
    const source = base.messages[0];
    const variant = source?.variants[0];
    if (source === undefined || variant === undefined) {
      throw new Error("chat fixture requires an assistant variant");
    }
    const content = [...refs, owned.id, owned.id, foreign.id].map((id) => `![image](asset:${id})`).join(" ");
    const ctx = {
      ...importCtx(db, owner.id),
      filterExistingAssetIds: async (ownerId: UserId, assetIds: readonly AssetId[]): Promise<readonly AssetId[]> =>
        (await selectOwnedAssetRefs(db, ownerId, assetIds)).map((row) => row.assetId),
    };
    const result = await createBulkImportChats({ ...ctx, db: databaseHandle(ctx.db) })({
      ownerId: owner.id,
      characterId: primary.id,
      chats: [{ ...base, messages: [{ ...source, variants: [{ ...variant, content }] }] }],
    });
    expect(result.messagesImported).toBe(1);
    expect((await db.select().from(messageVariants))[0]?.content).toBe(content);
    const attachments = await db.select({ messageId: messageAssets.messageId, assetId: messageAssets.assetId }).from(messageAssets);
    expect(attachments).toEqual([{ messageId: result.identities[0]?.messageIds[0], assetId: owned.id }]);
  });

  test("long named-speaker history imports every slot and reimports its exact canonical identity", { timeout: CAPACITY_TIMEOUT_MS }, async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const primary = await seedCharacter(db, { ownerId: owner.id });
    const second = await seedCharacter(db, { ownerId: owner.id });
    const base = chatInput("LongGroup.jsonl");
    const source = base.messages[0];
    const variant = source?.variants[0];
    if (source === undefined || variant === undefined) {
      throw new Error("chat fixture requires an assistant variant");
    }
    const input = {
      ...base,
      characterIds: [second.id],
      messages: Array.from({ length: OVER_BIND_CAPACITY }, (_, seq) => ({
        ...source,
        characterId: seq % 2 === 0 ? primary.id : second.id,
        ...(seq === OVER_BIND_CAPACITY - 1 ? { selectedIdx: 1, variants: [variant, { ...variant, idx: 1, content: "Tail alternative." }] } : {}),
      })),
    };
    const op = createBulkImportChats({ ...importCtx(db, owner.id), db: databaseHandle(db) });
    const args = { ownerId: owner.id, characterId: primary.id, chats: [input] };
    const first = await op(args);
    const identity = first.identities[0];
    if (identity === undefined) {
      throw new Error("long import requires its canonical identity");
    }
    expect(first.messagesImported).toBe(OVER_BIND_CAPACITY);
    const slots = await db
      .select({ id: messages.id, characterId: messages.characterId, selectedVariantId: messages.selectedVariantId })
      .from(messages)
      .where(eq(messages.chatId, identity.chatId))
      .orderBy(asc(messages.seq));
    expect(slots.map((slot) => slot.id)).toEqual(identity.messageIds);
    expect(slots.map((slot) => slot.characterId)).toEqual(input.messages.map((slot) => slot.characterId));
    expect(slots.map((slot) => slot.selectedVariantId)).toEqual(identity.variantIds.map((pool, index) => pool[input.messages[index]?.selectedIdx ?? 0]));
    const variants = await db
      .select({ id: messageVariants.id, content: messageVariants.content })
      .from(messageVariants)
      .innerJoin(messages, eq(messages.id, messageVariants.messageId))
      .where(eq(messages.chatId, identity.chatId))
      .orderBy(asc(messages.seq), asc(messageVariants.idx));
    expect(variants.map((row) => row.id)).toEqual(identity.variantIds.flat());
    expect(variants.map((row) => row.content)).toEqual(input.messages.flatMap((slot) => slot.variants.map((pool) => pool.content)));
    const again = await op(args);
    expect(again.identities).toEqual(first.identities);
    expect(again.written).toEqual([]);
    expect(again.chatsSkipped).toBe(1);
    expect(await db.select().from(chats)).toHaveLength(1);
  });

  test("a foreign speaker at the end of a long history refuses the entire run before canon", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const stranger = await seedUser(db);
    const primary = await seedCharacter(db, { ownerId: owner.id });
    const foreign = await seedCharacter(db, { ownerId: stranger.id });
    const base = chatInput("LateForeign.jsonl");
    const source = base.messages[0];
    if (source === undefined) {
      throw new Error("chat fixture requires an assistant slot");
    }
    const input = {
      ...base,
      messages: [...Array.from({ length: OVER_BIND_CAPACITY }, () => ({ ...source, characterId: primary.id })), { ...source, characterId: foreign.id }],
    };
    await expect(
      createBulkImportChats({ ...importCtx(db, owner.id), db: databaseHandle(db) })({
        ownerId: owner.id,
        characterId: primary.id,
        chats: [chatInput("EarlierValid.jsonl"), input],
      }),
    ).rejects.toMatchObject({ message: `character ${foreign.id} not found` });
    expect(await db.select().from(chats)).toEqual([]);
    expect(await db.select().from(chatImportClaims)).toEqual([]);
    expect(await db.select().from(chatParticipants)).toEqual([]);
    expect(await db.select().from(messages)).toEqual([]);
    expect(await db.select().from(messageVariants)).toEqual([]);
    expect(await db.select().from(statsCanonVersions)).toEqual([]);
  });

  test("distinct ownership populations beyond the bind ceiling retain every seat and refuse the first foreign id", {
    timeout: CAPACITY_TIMEOUT_MS,
  }, async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const stranger = await seedUser(db);
    const primary = await seedCharacter(db, { ownerId: owner.id });
    const foreign = await seedCharacter(db, { ownerId: stranger.id });
    const rows = Array.from({ length: OVER_BIND_CAPACITY }, () => makeCharacter({ ownerId: owner.id }));
    const sample = rows[0];
    if (sample === undefined) {
      throw new Error("capacity fixture requires character rows");
    }
    for (const chunk of chunkRows(rows, Object.keys(sample).length)) {
      await db.insert(characters).values(chunk);
    }
    const characterIds = rows.map((row) => row.id);
    const op = createBulkImportChats({ ...importCtx(db, owner.id), db: databaseHandle(db) });
    await expect(
      op({
        ownerId: owner.id,
        characterId: primary.id,
        chats: [chatInput("DistinctForeign.jsonl", { characterIds: [...characterIds, foreign.id, castId<CharacterId>("character_missing")], messages: [] })],
      }),
    ).rejects.toMatchObject({ message: `character ${foreign.id} not found` });
    expect(await db.select().from(chats)).toEqual([]);
    const result = await op({ ownerId: owner.id, characterId: primary.id, chats: [chatInput("DistinctOwned.jsonl", { characterIds, messages: [] })] });
    expect(result.chatsImported).toBe(1);
    const seats = await db.select({ characterId: chatParticipants.characterId }).from(chatParticipants).where(eq(chatParticipants.kind, "character"));
    expect(seats.map((seat) => seat.characterId).sort()).toEqual([primary.id, ...characterIds].sort());
  });

  test("a hash population beyond the bind ceiling preserves content and legacy duplicate identities", { timeout: CAPACITY_TIMEOUT_MS }, async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const character = await seedCharacter(db, { ownerId: owner.id });
    const op = createBulkImportChats({ ...importCtx(db, owner.id), db: databaseHandle(db) });
    const input = chatInput("LegacyEmpty.jsonl", { messages: [] });
    const tail = chatInput("TailLegacy.jsonl");
    const first = await op({ ownerId: owner.id, characterId: character.id, chats: [input, tail] });
    const candidates = Array.from({ length: OVER_BIND_CAPACITY }, (_, index) => ({ ...input, fileHash: `legacy-${index}` }));
    candidates.push({ ...input, importHash: "modern-content", fileHash: input.importHash });
    candidates.push({ ...tail, importHash: "tail-modern-content", fileHash: tail.importHash });
    const again = await op({ ownerId: owner.id, characterId: character.id, chats: candidates });
    expect(again.chatsImported).toBe(0);
    expect(again.chatsSkipped).toBe(candidates.length);
    expect(again.identities.slice(0, -1)).toEqual(candidates.slice(0, -1).map(() => first.identities[0]));
    expect(again.identities.at(-1)).toEqual(first.identities[1]);
    expect(again.identities.at(-1)?.messageIds).toHaveLength(tail.messages.length);
    expect(await db.select().from(chats)).toHaveLength(2);
  });

  test("native pending observations reconstruct local parents and groups once, retain zero/unknown facts and rebuild kept-data economics", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const character = await seedCharacter(db, { ownerId: owner.id, name: "Aria" });
    const leg = generationUsageLegSchema.parse({
      ...makeGenerationUsage(0.125, { tokensIn: 70, tokensOut: 2048 }),
      model: "gemini-3.1-pro-preview",
      provider: "google",
      wire: "google-generative-ai",
      observedAt: NOW,
      modelCalls: 1,
      contextWindow: null,
      maxOutputTokens: 2048,
      durationApiMs: 1,
      ttftMs: null,
      finishReason: "length",
      stopReason: "MAX_TOKENS",
      terminalReason: null,
      generationId: "source-generation",
    });
    const input = chatInput("NativePending.orb.json", {
      pendingGenerationObservations: [
        { turnIndex: 0, ordinal: 0, sourceMessageIndex: 0, sourceVariantIdx: 0, leg },
        { turnIndex: 0, ordinal: 1, sourceMessageIndex: 0, sourceVariantIdx: 0, leg: { ...leg, ...makeGenerationUsage(0, { tokensIn: 0, tokensOut: 0 }) } },
        {
          turnIndex: 1,
          ordinal: 0,
          sourceMessageIndex: null,
          sourceVariantIdx: null,
          leg: { ...leg, ...makeGenerationUsage(null, { tokensIn: null, tokensOut: null }) },
        },
      ],
    });
    const op = createBulkImportChats({ ...importCtx(db, owner.id), db: databaseHandle(db) });
    const args = { ownerId: owner.id, characterId: character.id, chats: [input] };
    const result = await op(args);
    const identity = result.identities[0];
    if (identity === undefined) {
      throw new Error("native import requires its canonical identity");
    }
    const facts = await db.select().from(chatGenerationObservations).orderBy(chatGenerationObservations.turnId, chatGenerationObservations.ordinal);
    expect(facts).toHaveLength(3);
    expect(facts[0]).toMatchObject({
      ...leg,
      chatId: identity.chatId,
      sourceMessageId: identity.messageIds[0],
      sourceVariantId: identity.variantIds[0]?.[0],
      funderUserId: owner.id,
      connectionId: null,
      connectionAttributionProvenance: "unrecorded",
    });
    expect(facts[1]).toMatchObject({ turnId: facts[0]?.turnId, ordinal: 1, costUsd: 0, tokensIn: 0, tokensOut: 0 });
    expect(facts[2]).toMatchObject({ sourceMessageId: null, sourceVariantId: null, ordinal: 0, costUsd: null, tokensIn: null, tokensOut: null });
    expect(facts[2]?.turnId).not.toBe(facts[0]?.turnId);
    await reconcileStats(databaseHandle(db), { ownerId: owner.id, now: () => NOW });
    expect((await db.select().from(ownerStats).where(eq(ownerStats.ownerId, owner.id)))[0]).toMatchObject({
      costUsd: 0.125,
      costSamples: 2,
      tokensIn: 70,
      tokensOut: 2048,
      tokensInMeasuredSamples: 2,
      tokensOutMeasuredSamples: 2,
      assistantTurns: 1,
      genSamples: 0,
    });
    expect((await op(args)).chatsImported).toBe(0);
    expect(await db.select().from(chatGenerationObservations).orderBy(chatGenerationObservations.turnId, chatGenerationObservations.ordinal)).toEqual(facts);
  });
  test.for([0, null])("native usage cost %s survives the real writer without inventing a local connection", async (costUsd) => {
    const db = await freshDb();
    const owner = await seedUser(db, {});
    const character = await seedCharacter(db, { ownerId: owner.id, name: "Aria" });
    const usage = makeGenerationUsage(costUsd, {
      tokensIn: 12,
      tokensOut: 17,
      servedModel: "served-model-version",
      reasoningTokens: null,
      cacheReadTokens: null,
      cacheWriteTokens: 0,
      tokenDetails: { output: [{ modality: "text", tokens: 8 }] },
      costProvenance: costUsd === null ? "unrecorded" : "estimated",
      costDetails: costUsd === null ? null : { totalUsd: costUsd, pricing: { inputPerMTok: 0, outputPerMTok: 0 } },
    });
    const base = chatInput("Native.orb.json");
    const source = base.messages[0];
    const variant = source?.variants[0];
    if (source === undefined || variant === undefined) {
      throw new Error("chat fixture has no assistant variant");
    }
    const input = {
      ...base,
      messages: [{ ...source, variants: [{ ...variant, tokensIn: usage.tokensIn, tokensOut: usage.tokensOut, tokenProvenance: "measured" as const, usage }] }],
    };
    const op = createBulkImportChats({ ...importCtx(db, owner.id), db: databaseHandle(db) });
    const args = { ownerId: owner.id, characterId: character.id, chats: [input] };
    const first = await op(args);
    const row = (await db.select().from(messageVariants))[0];
    expect(row).toMatchObject(usage);
    expect(row?.connectionId).toBeNull();
    expect(row?.connectionAttributionProvenance).toBe("unrecorded");
    const again = await op(args);
    expect(again.identities).toEqual(first.identities);
    expect(again.chatsImported).toBe(0);
    expect(await db.select().from(messageVariants)).toEqual([row]);
  });

  test("an imported asset background that GC already won cannot land as a dangling JSON reference", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, {});
    const character = await seedCharacter(db, { ownerId: owner.id, name: "Aria" });
    const missingAssetId = castId<AssetId>("asset_missingbackground");
    const file = chatInput("Aria.jsonl", {
      metadata: {
        background: {
          kind: "asset",
          externalUrl: "",
          assetId: missingAssetId,
          assetHash: "gone",
          mime: "image/png",
          provenanceUrl: "",
        },
      },
    });

    const err = await createBulkImportChats({ ...importCtx(db, owner.id), db: databaseHandle(db) })({
      ownerId: owner.id,
      characterId: character.id,
      chats: [file],
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ChatOperationError);
    expect((err as ChatOperationError).code).toBe("background_unavailable");
    expect(await db.select().from(chats)).toEqual([]);
    expect(await db.select().from(chatImportClaims)).toEqual([]);
  });

  test("concurrent identical imports converge on one character-scoped room", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, {});
    const character = await seedCharacter(db, { ownerId: owner.id, name: "Aria" });
    const attachment = await seedAsset(db, { ownerId: owner.id });
    let arrivals = 0;
    const { promise: together, resolve: release } = Promise.withResolvers<void>();
    const heldContext: ChatImportContext = {
      ...importCtx(db, owner.id),
      filterExistingAssetIds: async (_ownerId, assetIds) => {
        expect(assetIds).toEqual([attachment.id]);
        arrivals += 1;
        if (arrivals === 2) {
          release();
        }
        await together;
        return [];
      },
    };
    const base = chatInput("Aria.jsonl");
    const file = {
      ...base,
      messages: base.messages.map((message) => ({
        ...message,
        variants: message.variants.map((variant) => ({ ...variant, content: `${variant.content} ![attachment](asset:${attachment.id})` })),
      })),
    };

    const outcomes = await Promise.all([
      createBulkImportChats({ ...heldContext, db: databaseHandle(heldContext.db) })({ ownerId: owner.id, characterId: character.id, chats: [file] }),
      createBulkImportChats({ ...heldContext, db: databaseHandle(heldContext.db) })({ ownerId: owner.id, characterId: character.id, chats: [file] }),
    ]);

    expect(arrivals).toBe(2);
    expect(outcomes.map((result) => [result.chatsImported, result.chatsSkipped]).sort()).toEqual([
      [0, 1],
      [1, 0],
    ]);
    expect(await db.select().from(chats)).toHaveLength(1);
    expect(await db.select().from(chatImportClaims)).toHaveLength(1);
    expect(outcomes[0]?.identities).toEqual(outcomes[1]?.identities);
    expect(await db.select().from(chatParticipants)).toHaveLength(2);
    expect(await db.select().from(messages)).toHaveLength(file.messages.length);
    expect(await db.select().from(messageVariants)).toHaveLength(file.messages.length);
  });

  test("writes chats→messages→variants + founding roster; the carried prose plane lands as injections", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, {});
    const character = await seedCharacter(db, { ownerId: owner.id, name: "Aria" });
    const op = createBulkImportChats({ ...importCtx(db, owner.id), db: databaseHandle(db) });

    const result = await op({
      ownerId: owner.id,
      characterId: character.id,
      chats: [
        chatInput("Aria.jsonl", {
          injections: [{ position: "in_chat", depth: 4, role: "system", content: "stay in character", order: null, createdAt: CHAT_CREATED }],
        }),
      ],
    });

    expect(result.chatsImported).toBe(1);
    expect(result.messagesImported).toBe(2);
    expect(result.realConversationsWritten).toEqual(result.written.map((identity) => identity.chatId));
    expect((await db.select().from(statsCanonVersions).where(eq(statsCanonVersions.ownerId, owner.id)))[0]?.version).toBe(1);

    const chatRows = await db.select().from(chats);
    expect(chatRows).toHaveLength(1);
    expect(chatRows[0]?.updatedAt).toBe(CHAT_UPDATED);
    // The carried prose lands in the ONE per-chat prose door — `chat_injections` rows written VERBATIM (this
    // op holds no placement policy; the ST arm's mapper already resolved ST's knobs / the house register).
    // The `roomOverrides.authorsNote` twin was retired (owner ruling 2026-08-01), so `metadata` carries nothing.
    expect(chatRows[0]?.metadata).toBeNull();
    const injectionRows = await db.select().from(chatInjections);
    expect(injectionRows).toHaveLength(1);
    expect(injectionRows[0]).toMatchObject({
      chatId: chatRows[0]?.id,
      position: "in_chat",
      depth: 4,
      role: "system",
      content: "stay in character",
    });

    const roster = await db
      .select()
      .from(chatParticipants)
      .where(eq(chatParticipants.chatId, chatRows[0]?.id ?? castId("chat_x")));
    expect(roster.map((r) => r.kind).sort()).toEqual(["character", "human"]);
    expect(roster.find((r) => r.kind === "human")?.role).toBe("host");

    const slots = await db.select().from(messages);
    const variants = await db.select().from(messageVariants);
    expect(slots).toHaveLength(2);
    expect(variants).toHaveLength(2);
    expect(variants.map((variant) => variant.connectionAttributionProvenance)).toEqual(["unrecorded", "unrecorded"]);
    for (const s of slots) {
      expect(s.selectedVariantId).not.toBeNull();
    }
    expect(variants.map((v) => v.content).sort()).toEqual(["Hello traveller.", "Hi Aria!"]);
  });

  // Imported history was not typed in this app; the viewer's last-turn reads key on this stamp to skip it.
  test("every imported slot is born with the import initiator", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, {});
    const character = await seedCharacter(db, { ownerId: owner.id, name: "Aria" });

    await createBulkImportChats({ ...importCtx(db, owner.id), db: databaseHandle(db) })({
      ownerId: owner.id,
      characterId: character.id,
      chats: [chatInput("Aria.jsonl")],
    });

    const slots = await db.select({ role: messages.role, initiator: messages.initiator }).from(messages);
    expect(slots.map((slot) => slot.role).sort()).toEqual(["assistant", "user"]);
    expect(slots.map((slot) => slot.initiator)).toEqual(["import", "import"]);
  });

  test("dup-skip by importHash — a byte-identical re-import writes nothing", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, {});
    const character = await seedCharacter(db, { ownerId: owner.id, name: "Aria" });
    const op = createBulkImportChats({ ...importCtx(db, owner.id), db: databaseHandle(db) });
    const file = chatInput("Aria.jsonl");

    const first = await op({ ownerId: owner.id, characterId: character.id, chats: [file] });
    const again = await op({ ownerId: owner.id, characterId: character.id, chats: [file] });

    expect(again.chatsImported).toBe(0);
    expect(again.chatsSkipped).toBe(1);
    expect(await db.select().from(chats)).toHaveLength(1);
    expect(again.chatsPersonaHealed).toBe(0);
    expect(again.identities).toEqual(first.identities);
  });

  test("a row imported before the content identity (claimed under its byte hash) still dedups through `fileHash`", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, {});
    const character = await seedCharacter(db, { ownerId: owner.id, name: "Aria" });
    const op = createBulkImportChats({ ...importCtx(db, owner.id), db: databaseHandle(db) });
    const legacy = chatInput("Aria.jsonl");

    await op({ ownerId: owner.id, characterId: character.id, chats: [legacy] });
    // The same transcript, now carrying its content identity as `importHash` and the old byte hash as `fileHash`.
    const again = await op({
      ownerId: owner.id,
      characterId: character.id,
      chats: [{ ...legacy, importHash: "content-Aria", fileHash: legacy.importHash }],
    });

    expect(again.chatsImported).toBe(0);
    expect(again.chatsSkipped).toBe(1);
    expect(await db.select().from(chats)).toHaveLength(1);
  });

  // ── the dedup-skip arm's HEAL (owner ruling 2026-08-17, #163) ─────────────────────────────────────────
  //
  // The importer is idempotent by importHash, so a corpus imported BEFORE the mapper could resolve its user
  // persona would stay unattributed forever. The ordinary re-run is the repair path: the skip arm fills the
  // three persona planes — and ONLY where they are still NULL, because everything it touches is editable
  // after the import and a re-run is not authority over a choice a human made later.

  /** The three persona planes of one room, as the heal sees them. */
  async function personaPlanes(db: Db): Promise<{ anchor: string | null; seat: string | null; userTurns: (string | null)[] }> {
    const [chat] = await db.select({ anchorPersonaId: chats.anchorPersonaId }).from(chats);
    const seats = await db.select({ kind: chatParticipants.kind, activePersonaId: chatParticipants.activePersonaId }).from(chatParticipants);
    const rows = await db.select({ role: messages.role, seq: messages.seq, personaId: messages.personaId }).from(messages);
    return {
      anchor: chat?.anchorPersonaId ?? null,
      seat: seats.find((s) => s.kind === "human")?.activePersonaId ?? null,
      userTurns: rows
        .filter((r) => r.role === "user")
        .sort((a, b) => a.seq - b.seq)
        .map((r) => r.personaId),
    };
  }

  test("a re-import HEALS an already-imported room that landed with no persona (anchor + host seat + user turns)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, {});
    const character = await seedCharacter(db, { ownerId: owner.id, name: "Aria" });
    const persona = await seedPersona(db, { ownerId: owner.id, name: "Alex" });
    const op = createBulkImportChats({ ...importCtx(db, owner.id), db: databaseHandle(db) });

    // The FIRST import is the corpus's history: the mapper could not resolve a persona, so all three planes
    // landed null.
    await op({ ownerId: owner.id, characterId: character.id, chats: [chatInput("Aria.jsonl")] });
    expect(await personaPlanes(db)).toEqual({ anchor: null, seat: null, userTurns: [null] });

    // The SAME transcript, re-run once the mapper resolves its persona: dedup-skipped, but healed.
    const attributed = chatInput("Aria.jsonl", { anchorPersonaId: persona.id });
    const healed = await op({
      ownerId: owner.id,
      characterId: character.id,
      chats: [{ ...attributed, messages: attributed.messages.map((m) => (m.role === "user" ? { ...m, personaId: persona.id } : m)) }],
    });

    // The STORED planes lead: this is the user-visible defect (a room whose Members tab and whose user turns
    // name nobody), and the reported count is only its receipt.
    expect(await personaPlanes(db)).toEqual({ anchor: persona.id, seat: persona.id, userTurns: [persona.id] });
    expect(healed.chatsImported).toBe(0);
    expect(healed.chatsSkipped).toBe(1);
    expect(healed.chatsPersonaHealed).toBe(1);
    // The heal writes no new canon — one room, still.
    expect(await db.select().from(chats)).toHaveLength(1);
  });

  test("the heal NEVER overwrites a persona already on the row, and is a no-op on a second run", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, {});
    const character = await seedCharacter(db, { ownerId: owner.id, name: "Aria" });
    const chosen = await seedPersona(db, { ownerId: owner.id, name: "Chosen" });
    const imported = await seedPersona(db, { ownerId: owner.id, name: "Imported" });
    const op = createBulkImportChats({ ...importCtx(db, owner.id), db: databaseHandle(db) });

    // The room landed already attributed (or the owner picked its persona afterwards).
    await op({ ownerId: owner.id, characterId: character.id, chats: [chatInput("Aria.jsonl", { anchorPersonaId: chosen.id })] });

    const again = await op({ ownerId: owner.id, characterId: character.id, chats: [chatInput("Aria.jsonl", { anchorPersonaId: imported.id })] });
    expect(again.chatsPersonaHealed).toBe(0);
    expect((await personaPlanes(db)).anchor).toBe(chosen.id);
    expect((await personaPlanes(db)).seat).toBe(chosen.id);
  });

  test("a re-run that still resolves NO persona heals nothing (unmatched stays unattributed — owner ruling)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, {});
    const character = await seedCharacter(db, { ownerId: owner.id, name: "Aria" });
    const op = createBulkImportChats({ ...importCtx(db, owner.id), db: databaseHandle(db) });

    await op({ ownerId: owner.id, characterId: character.id, chats: [chatInput("Aria.jsonl")] });
    const again = await op({ ownerId: owner.id, characterId: character.id, chats: [chatInput("Aria.jsonl")] });

    expect(again.chatsPersonaHealed).toBe(0);
    expect(await personaPlanes(db)).toEqual({ anchor: null, seat: null, userTurns: [null] });
  });

  test("branch resolution — a child links parentChatId by the parent's source filename", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, {});
    const character = await seedCharacter(db, { ownerId: owner.id, name: "Aria" });
    const op = createBulkImportChats({ ...importCtx(db, owner.id), db: databaseHandle(db) });

    const parentName = "Aria.jsonl";
    await op({
      ownerId: owner.id,
      characterId: character.id,
      chats: [chatInput(parentName), chatInput("Aria - Branch #1.jsonl", { parentRef: parentName })],
    });

    const rows = await db.select({ id: chats.id, importedFrom: chats.importedFrom, parentChatId: chats.parentChatId }).from(chats);
    const parent = rows.find((r) => r.importedFrom === parentName);
    const child = rows.find((r) => r.importedFrom?.includes("Branch #1"));
    expect(child?.parentChatId).toBe(parent?.id);
    expect(parent?.parentChatId).toBeNull();
  });

  test("a non-owned / missing character throws DomainNotFoundError (the ownership precondition)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, {});
    const op = createBulkImportChats({ ...importCtx(db, owner.id), db: databaseHandle(db) });
    await expect(
      op({
        ownerId: owner.id,
        characterId: castId("character_missing"),
        chats: [],
      }),
    ).rejects.toBeInstanceOf(DomainNotFoundError);
  });

  // ── The MULTI-CHARACTER arm (roster / per-slot attribution / metadata / narrator). Every field is
  //    optional; the suite above IS the absent-field arm, and the first test here pins that the two arms
  //    are byte-identical on the columns the new fields touch.
  test("ABSENT-FIELD ARM: no roster/metadata/characterId/narrator ⇒ the pre-widening row shape exactly", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, {});
    const character = await seedCharacter(db, { ownerId: owner.id, name: "Aria" });
    const spy: MintSpy = { calls: [], byChat: new Map() };
    const op = createBulkImportChats({ ...importCtx(db, owner.id, spy), db: databaseHandle(db) });

    await op({ ownerId: owner.id, characterId: character.id, chats: [chatInput("Aria.jsonl")] });

    // metadata NULL, exactly one character seat (the primary), every assistant slot stamped with it, and the
    // synthetic-character namespace never touched — the four things the widening could have changed.
    expect((await db.select().from(chats))[0]?.metadata).toBeNull();
    const seats = await db.select().from(chatParticipants);
    expect(seats.filter((r) => r.kind === "character").map((r) => r.characterId)).toEqual([character.id]);
    const slots = await db.select().from(messages);
    expect(slots.find((s) => s.role === "assistant")?.characterId).toBe(character.id);
    expect(slots.find((s) => s.role === "user")?.characterId).toBeNull();
    expect(spy.calls).toEqual([]);
  });

  test("roster seats every extra character and each slot is voiced by its OWN named speaker", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, {});
    const primary = await seedCharacter(db, { ownerId: owner.id, name: "Aria" });
    const second = await seedCharacter(db, { ownerId: owner.id, name: "Bex" });
    const op = createBulkImportChats({ ...importCtx(db, owner.id), db: databaseHandle(db) });

    const base = chatInput("Group.jsonl");
    await op({
      ownerId: owner.id,
      characterId: primary.id,
      chats: [
        {
          ...base,
          characterIds: [second.id],
          messages: [base.messages[0] as (typeof base.messages)[number], { ...(base.messages[0] as (typeof base.messages)[number]), characterId: second.id }],
        },
      ],
    });

    const seats = await db.select().from(chatParticipants);
    expect(
      seats
        .filter((r) => r.kind === "character")
        .map((r) => r.characterId)
        .sort(),
    ).toEqual([primary.id, second.id].sort());
    const slots = await db.select().from(messages);
    expect(slots.map((s) => s.characterId)).toEqual([primary.id, second.id]);
  });

  // ── #1687 — the per-seat KNOB channel. ST's `disabled_members` is a per-member MUTE and orb has the column
  //    for it; before this the wire seated a flat id list and the flag could only be reported as lost.
  test("a seat named by seatKnobs is born MUTED; every unnamed seat keeps the column defaults", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, {});
    const primary = await seedCharacter(db, { ownerId: owner.id, name: "Aria" });
    const muted = await seedCharacter(db, { ownerId: owner.id, name: "Bex" });
    const op = createBulkImportChats({ ...importCtx(db, owner.id), db: databaseHandle(db) });

    const base = chatInput("Muted.jsonl");
    await op({
      ownerId: owner.id,
      characterId: primary.id,
      chats: [{ ...base, characterIds: [muted.id], seatKnobs: [{ characterId: muted.id, disabled: true }] }],
    });

    const seats = await db.select().from(chatParticipants);
    const seatFor = (characterId: CharacterId): (typeof seats)[number] | undefined => seats.find((r) => r.characterId === characterId);
    expect(seatFor(muted.id)?.disabled).toBe(true);
    // The unnamed seats are untouched: the knobs are SPREAD, never defaulted at the write, so a room with one
    // muted member is byte-identical to the pre-#1687 row everywhere else.
    expect(seatFor(primary.id)?.disabled).toBe(false);
    expect(seatFor(muted.id)?.talkativeness).toBe(seatFor(primary.id)?.talkativeness);
    expect(seats.find((r) => r.kind === "human")?.disabled).toBe(false);
  });

  test("a knob may name the PRIMARY, and a knob for an UNSEATED character refuses the whole run", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, {});
    const primary = await seedCharacter(db, { ownerId: owner.id, name: "Aria" });
    const unseated = await seedCharacter(db, { ownerId: owner.id, name: "Bex" });
    const op = createBulkImportChats({ ...importCtx(db, owner.id), db: databaseHandle(db) });

    const base = chatInput("PrimaryMute.jsonl");
    await op({ ownerId: owner.id, characterId: primary.id, chats: [{ ...base, seatKnobs: [{ characterId: primary.id, disabled: true }] }] });
    expect((await db.select().from(chatParticipants)).find((r) => r.characterId === primary.id)?.disabled).toBe(true);

    // An unseated (or foreign) knob is a caller defect, refused before any write — never a silent drop, which
    // would make "the mute travelled" unfalsifiable.
    await expect(
      op({
        ownerId: owner.id,
        characterId: primary.id,
        chats: [{ ...chatInput("GhostKnob.jsonl"), seatKnobs: [{ characterId: unseated.id, disabled: true }] }],
      }),
    ).rejects.toBeInstanceOf(DomainNotFoundError);
    expect(await db.select().from(chats)).toHaveLength(1);
  });

  test("a slot naming an owned-but-UNSEATED character is refused (no ghost speaker)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, {});
    const primary = await seedCharacter(db, { ownerId: owner.id, name: "Aria" });
    const unseated = await seedCharacter(db, { ownerId: owner.id, name: "Bex" });
    const op = createBulkImportChats({ ...importCtx(db, owner.id), db: databaseHandle(db) });

    const base = chatInput("Ghost.jsonl");
    await expect(
      op({
        ownerId: owner.id,
        characterId: primary.id,
        chats: [{ ...base, messages: [{ ...(base.messages[0] as (typeof base.messages)[number]), characterId: unseated.id }] }],
      }),
    ).rejects.toBeInstanceOf(DomainNotFoundError);
    expect(await db.select().from(chats)).toHaveLength(0);
  });

  test("CROSS-TENANT: a roster / speaker id owned by ANOTHER user refuses the whole run before any write", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, {});
    const stranger = await seedUser(db, {});
    const primary = await seedCharacter(db, { ownerId: owner.id, name: "Aria" });
    const foreign = await seedCharacter(db, { ownerId: stranger.id, name: "Not Yours" });
    const op = createBulkImportChats({ ...importCtx(db, owner.id), db: databaseHandle(db) });

    const base = chatInput("Foreign.jsonl");
    await expect(op({ ownerId: owner.id, characterId: primary.id, chats: [{ ...base, characterIds: [foreign.id] }] })).rejects.toBeInstanceOf(
      DomainNotFoundError,
    );
    await expect(
      op({
        ownerId: owner.id,
        characterId: primary.id,
        chats: [{ ...base, messages: [{ ...(base.messages[0] as (typeof base.messages)[number]), characterId: foreign.id }] }],
      }),
    ).rejects.toBeInstanceOf(DomainNotFoundError);
    // Fail-closed: neither attempt left a chat, a seat, or a slot behind.
    expect(await db.select().from(chats)).toHaveLength(0);
    expect(await db.select().from(chatParticipants)).toHaveLength(0);
    expect(await db.select().from(messages)).toHaveLength(0);
  });

  test("carried metadata lands through the column's OWN parser (a malformed sub-blob heals, siblings survive)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, {});
    const character = await seedCharacter(db, { ownerId: owner.id, name: "Aria" });
    const op = createBulkImportChats({ ...importCtx(db, owner.id), db: databaseHandle(db) });

    await op({
      ownerId: owner.id,
      characterId: character.id,
      chats: [
        {
          ...chatInput("Meta.jsonl"),
          // `opening` is a valid sub-blob; the deliberately-bogus `group.output` must heal to absent WITHOUT
          // taking `opening` with it — that is `parseChatMetadata`'s fault isolation, not a second spelling here.
          metadata: { opening: "greet-all", group: { output: "not-a-mode" } },
        },
      ],
    });

    const meta = (await db.select().from(chats))[0]?.metadata;
    expect(meta?.opening).toBe("greet-all");
    expect(meta?.group).toBeUndefined();
  });

  test("NARRATOR: the slot is authored by the room's synthetic identity, minted ONCE per chat", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, {});
    const primary = await seedCharacter(db, { ownerId: owner.id, name: "Aria" });
    const spy: MintSpy = { calls: [], byChat: new Map() };
    const op = createBulkImportChats({ ...importCtx(db, owner.id, spy), db: databaseHandle(db) });

    const base = chatInput("Narrator.jsonl");
    // The slot DECLARES its purpose (D129) — one field carries both "what this row is" and, from it, the
    // synthetic-identity attribution routing that a separate `narrator: true` flag used to carry alone.
    const narratorSlot = { ...(base.messages[0] as (typeof base.messages)[number]), kind: "narrator" as const };
    await op({
      ownerId: owner.id,
      characterId: primary.id,
      chats: [{ ...base, messages: [narratorSlot, base.messages[1] as (typeof base.messages)[number], narratorSlot] }],
    });

    // Minted once for the chat despite TWO narrator slots — the find-or-mint is per room, like the turn verb's.
    expect(spy.calls).toHaveLength(1);
    const chatId = (await db.select().from(chats))[0]?.id;
    expect(spy.calls[0]?.chatId).toBe(chatId);
    const narratorId = spy.byChat.get(chatId ?? "");
    const slots = await db.select().from(messages);
    expect(slots.filter((s) => s.role === "assistant").map((s) => s.characterId)).toEqual([narratorId, narratorId]);
    // …and the declaration is STORED, not just consumed for routing: the imported rows are narrator canon, so
    // every downstream plane (prompt label policy, memory label, render chrome, re-export) reads it directly.
    expect(slots.filter((s) => s.role === "assistant").map((s) => s.kind)).toEqual(["narrator", "narrator"]);
    expect(slots.filter((s) => s.role === "user").map((s) => s.kind)).toEqual(["standard"]);
    // The synthetic identity is a memory/authorship bucket, NOT a seat: the roster is unchanged.
    const seats = await db.select().from(chatParticipants);
    expect(seats.filter((r) => r.kind === "character").map((r) => r.characterId)).toEqual([primary.id]);
  });
});
