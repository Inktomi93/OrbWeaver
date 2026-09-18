// Mirror int-test for domain/chat/persistence/createBulkImportChats (Option B; PD-77) — the chat-OWNED bulk
// import WRITE over a real db: chats→messages→variants (D26) + founding roster + branch resolution, dup-skip
// by importHash, the ST author's-note → chat_injections landing, and the ownership precondition. The
// input is the canonical `BulkImportChatInput` (`@orb/contracts/chat`); the ST→canonical mapping is import's
// job (tested there), so these fixtures are chat-native.

import type { BulkImportChatInput } from "@orb/contracts/chat";
import type { Db } from "@orb/db";
import { chatImportClaims, chatInjections, chatParticipants, chats, messages, messageVariants, statsCanonVersions } from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import { DomainNotFoundError } from "@orb/kit/errors";
import type {
  AssetId,
  CharacterHandle,
  CharacterId,
  ChatId,
  ChatInjectionId,
  ChatParticipantId,
  MessageAssetId,
  MessageId,
  MessageVariantId,
  UserId,
} from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { ChatOperationError } from "../../../../../packages/server/src/domain/chat/contract/errors.ts";
import type { ChatImportContext } from "../../../../../packages/server/src/domain/chat/contract/import.ts";
import { createBulkImportChats } from "../../../../../packages/server/src/domain/chat/persistence/import-write.ts";
import { bumpStatsCanonVersion } from "../../../../../packages/server/src/domain/stats/write/apply-delta.ts";
import { freshDb } from "../../../../support/db.ts";
import { seedCharacter, seedPersona, seedUser } from "../../../../support/factories/index.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const NOW = 1_700_000_000_000;
const CHAT_CREATED = 1_699_999_990_000;
const CHAT_UPDATED = 1_699_999_995_000;
const MSG0_AT = 1_699_999_991_000;
const MSG1_AT = 1_699_999_992_000;
const JSONL_EXT = /\.jsonl$/i;

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
  const counter = (): string => {
    n += 1;
    return String(n).padStart(26, "0");
  };
  return {
    db,
    bumpStatsCanonVersion: (batch, opDb, versionOwnerId) => bumpStatsCanonVersion(batch as BatchStmt[], opDb, versionOwnerId),
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

    const err = await createBulkImportChats(importCtx(db, owner.id))({ ownerId: owner.id, characterId: character.id, chats: [file] }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ChatOperationError);
    expect((err as ChatOperationError).code).toBe("background_unavailable");
    expect(await db.select().from(chats)).toEqual([]);
    expect(await db.select().from(chatImportClaims)).toEqual([]);
  });

  test("concurrent identical imports converge on one character-scoped room", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, {});
    const character = await seedCharacter(db, { ownerId: owner.id, name: "Aria" });
    let arrivals = 0;
    let release: (() => void) | undefined;
    const together = new Promise<void>((resolve) => {
      release = resolve;
    });
    const heldContext: ChatImportContext = {
      ...importCtx(db, owner.id),
      filterExistingAssetIds: async () => {
        arrivals += 1;
        if (arrivals === 2) {
          release?.();
        }
        await together;
        return [];
      },
    };
    const file = chatInput("Aria.jsonl");

    const outcomes = await Promise.all([
      createBulkImportChats(heldContext)({ ownerId: owner.id, characterId: character.id, chats: [file] }),
      createBulkImportChats(heldContext)({ ownerId: owner.id, characterId: character.id, chats: [file] }),
    ]);

    expect(outcomes.map((result) => [result.chatsImported, result.chatsSkipped]).sort()).toEqual([
      [0, 1],
      [1, 0],
    ]);
    expect(await db.select().from(chats)).toHaveLength(1);
    expect(await db.select().from(chatImportClaims)).toHaveLength(1);
  });

  test("writes chats→messages→variants + founding roster; the carried prose plane lands as injections", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, {});
    const character = await seedCharacter(db, { ownerId: owner.id, name: "Aria" });
    const op = createBulkImportChats(importCtx(db, owner.id));

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
    expect(result.realConversationWritten).toBe(true);
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
    for (const s of slots) {
      expect(s.selectedVariantId).not.toBeNull();
    }
    expect(variants.map((v) => v.content).sort()).toEqual(["Hello traveller.", "Hi Aria!"]);
  });

  test("dup-skip by importHash — a byte-identical re-import writes nothing", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, {});
    const character = await seedCharacter(db, { ownerId: owner.id, name: "Aria" });
    const op = createBulkImportChats(importCtx(db, owner.id));
    const file = chatInput("Aria.jsonl");

    const first = await op({ ownerId: owner.id, characterId: character.id, chats: [file] });
    const again = await op({ ownerId: owner.id, characterId: character.id, chats: [file] });

    expect(again.chatsImported).toBe(0);
    expect(again.chatsSkipped).toBe(1);
    expect(await db.select().from(chats)).toHaveLength(1);
    expect(again.chatsPersonaHealed).toBe(0);
    expect(again.identities).toEqual(first.identities);
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
    const op = createBulkImportChats(importCtx(db, owner.id));

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
    const op = createBulkImportChats(importCtx(db, owner.id));

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
    const op = createBulkImportChats(importCtx(db, owner.id));

    await op({ ownerId: owner.id, characterId: character.id, chats: [chatInput("Aria.jsonl")] });
    const again = await op({ ownerId: owner.id, characterId: character.id, chats: [chatInput("Aria.jsonl")] });

    expect(again.chatsPersonaHealed).toBe(0);
    expect(await personaPlanes(db)).toEqual({ anchor: null, seat: null, userTurns: [null] });
  });

  test("branch resolution — a child links parentChatId by the parent's source filename", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, {});
    const character = await seedCharacter(db, { ownerId: owner.id, name: "Aria" });
    const op = createBulkImportChats(importCtx(db, owner.id));

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
    const op = createBulkImportChats(importCtx(db, owner.id));
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
    const op = createBulkImportChats(importCtx(db, owner.id, spy));

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
    const op = createBulkImportChats(importCtx(db, owner.id));

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
    const op = createBulkImportChats(importCtx(db, owner.id));

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
    const op = createBulkImportChats(importCtx(db, owner.id));

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
    const op = createBulkImportChats(importCtx(db, owner.id));

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
    const op = createBulkImportChats(importCtx(db, owner.id));

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
    const op = createBulkImportChats(importCtx(db, owner.id));

    await op({
      ownerId: owner.id,
      characterId: character.id,
      chats: [
        {
          ...chatInput("Meta.jsonl"),
          // `opening` is a valid sub-blob; the deliberately-bogus `group.output` must heal to absent WITHOUT
          // taking `opening` with it — that is `parseChatMetadata`'s fault isolation, not a second spelling here.
          // @orb-waive no-test-fabrication(never): the bogus `group.output` IS the probe — a well-typed value cannot express the malformed sub-blob whose isolation this test pins. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
          metadata: { opening: "greet-all", group: { output: "not-a-mode" } } as never,
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
    const op = createBulkImportChats(importCtx(db, owner.id, spy));

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
