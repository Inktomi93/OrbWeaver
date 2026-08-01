// Mirror int-test for domain/chat/persistence/createBulkImportChats (Option B; PD-77) — the chat-OWNED bulk
// import WRITE over a real db: chats→messages→variants (D26) + founding roster + branch resolution, dup-skip
// by importHash, the ST author's-note → chat_injections landing, and the ownership precondition. The
// input is the canonical `BulkImportChatInput` (`@orb/contracts/chat`); the ST→canonical mapping is import's
// job (tested there), so these fixtures are chat-native.

import type { BulkImportChatInput } from "@orb/contracts/chat";
import type { Db } from "@orb/db";
import { chatInjections, chatParticipants, chats, messages, messageVariants } from "@orb/db";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { AssetId, ChatId, ChatInjectionId, ChatParticipantId, MessageAssetId, MessageId, MessageVariantId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import type { ChatImportContext } from "../../../../../packages/server/src/domain/chat/contract/import.ts";
import { createBulkImportChats } from "../../../../../packages/server/src/domain/chat/persistence/import-write.ts";
import { freshDb } from "../../../../support/db.ts";
import { seedCharacter, seedUser } from "../../../../support/factories/index.ts";
import { expect, test } from "../../../../support/fixtures";

const NOW = 1_700_000_000_000;
const CHAT_CREATED = 1_699_999_990_000;
const CHAT_UPDATED = 1_699_999_995_000;
const MSG0_AT = 1_699_999_991_000;
const MSG1_AT = 1_699_999_992_000;
const JSONL_EXT = /\.jsonl$/i;

/** A deterministic counter-minted `ChatImportContext` (no ambient clock/ids under tests/). */
function importCtx(db: Db): ChatImportContext {
  let n = 0;
  const counter = (): string => {
    n += 1;
    return String(n).padStart(26, "0");
  };
  return {
    db,
    now: (): number => NOW,
    newChatId: (): ChatId => castId<ChatId>(`chat_${counter()}`),
    newMessageId: (): MessageId => castId<MessageId>(`message_${counter()}`),
    newMessageVariantId: (): MessageVariantId => castId<MessageVariantId>(`message_variant_${counter()}`),
    newMessageAssetId: (): MessageAssetId => castId<MessageAssetId>(`message_asset_${counter()}`),
    newParticipantId: (): ChatParticipantId => castId<ChatParticipantId>(`chat_participant_${counter()}`),
    newChatInjectionId: (): ChatInjectionId => castId<ChatInjectionId>(`chat_injection_${counter()}`),
    // #67 — default "nothing exists" (these tests seed no attachments); the P-8 round-trip covers the
    // asset-existing path end-to-end.
    filterExistingAssetIds: (): Promise<readonly AssetId[]> => Promise.resolve([]),
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
    authorsNote: null,
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
  test("writes chats→messages→variants + founding roster; the ST author's-note lands as an injection", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, {});
    const character = await seedCharacter(db, { ownerId: owner.id, name: "Aria" });
    const op = createBulkImportChats(importCtx(db));

    const result = await op({
      ownerId: owner.id,
      characterId: character.id,
      chats: [chatInput("Aria.jsonl", { authorsNote: "stay in character" })],
    });

    expect(result.chatsImported).toBe(1);
    expect(result.messagesImported).toBe(2);
    expect(result.realConversationWritten).toBe(true);

    const chatRows = await db.select().from(chats);
    expect(chatRows).toHaveLength(1);
    expect(chatRows[0]?.updatedAt).toBe(CHAT_UPDATED);
    // The ST note lands in the ONE per-chat prose door — a `chat_injections` row at the house author's-note
    // register (system @ depth 4). The `roomOverrides.authorsNote` twin was retired (owner ruling
    // 2026-08-01), so `metadata` carries nothing.
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
    for (const s of slots) {
      expect(s.selectedVariantId).not.toBeNull();
    }
    expect(variants.map((v) => v.content).sort()).toEqual(["Hello traveller.", "Hi Aria!"]);
  });

  test("dup-skip by importHash — a byte-identical re-import writes nothing", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, {});
    const character = await seedCharacter(db, { ownerId: owner.id, name: "Aria" });
    const op = createBulkImportChats(importCtx(db));
    const file = chatInput("Aria.jsonl");

    await op({ ownerId: owner.id, characterId: character.id, chats: [file] });
    const again = await op({ ownerId: owner.id, characterId: character.id, chats: [file] });

    expect(again.chatsImported).toBe(0);
    expect(again.chatsSkipped).toBe(1);
    expect(await db.select().from(chats)).toHaveLength(1);
  });

  test("branch resolution — a child links parentChatId by the parent's source filename", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, {});
    const character = await seedCharacter(db, { ownerId: owner.id, name: "Aria" });
    const op = createBulkImportChats(importCtx(db));

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
    const op = createBulkImportChats(importCtx(db));
    await expect(
      op({
        ownerId: owner.id,
        characterId: castId("character_missing"),
        chats: [],
      }),
    ).rejects.toBeInstanceOf(DomainNotFoundError);
  });
});
