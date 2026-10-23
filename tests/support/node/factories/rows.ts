// Direct row builders for persistence-tier tests that assert a query or a schema fact (Spine-Testing §9).
// Every other test seeds through the composed root; dependency-cruiser limits who imports this door.

import type { Db, users } from "@orb/db";
import { characters, chats, messages, messageVariants } from "@orb/db";
import { handleKey } from "@orb/kit/handle-key";
import type { CharacterHandle, Handle, IdSource, MessageVariantId } from "@orb/kit/ids";
import { castId, createIdSource, ID_PREFIX } from "@orb/kit/ids";
import { cardTokenSize } from "@orb/server/domain/character";
import { cardContentHash } from "@orb/server/primitives/serde/card";
import { eq } from "drizzle-orm";
import { FROZEN_AT_MS } from "../../iso/clock.ts";
import { createSeededIds } from "../../iso/ids.ts";

export type UserRow = typeof users.$inferSelect;
type CharacterRow = typeof characters.$inferSelect;
type ChatRow = typeof chats.$inferSelect;
type MessageRow = typeof messages.$inferSelect;

const ids = createIdSource(createSeededIds().next);

/** A fully-valid human user row; `handle` defaults to the id so both stay unique per counter. */
export function makeUser(overrides: Partial<UserRow> = {}, source: IdSource = ids): UserRow {
  const id = overrides.id ?? source.userId();
  const handle = overrides.handle ?? castId<Handle>(id);
  return {
    id,
    handle,
    handleKey: handleKey(handle),
    externalId: null,
    email: null,
    role: "user",
    enabled: true,
    passwordHash: null,
    kind: "human",
    ownerUserId: null,
    createdAt: FROZEN_AT_MS,
    updatedAt: FROZEN_AT_MS,
    ...overrides,
  };
}

/** A card row stamped the way the create verb stamps it: `contentHash` and `tokenSize` derive from the
 *  finished card, so neither is an override. The owner user must already exist. */
export async function seedCharacterRow(
  db: Db,
  overrides: Pick<CharacterRow, "ownerId"> & Partial<Omit<CharacterRow, "contentHash" | "tokenSize">>,
  source: IdSource = ids,
): Promise<CharacterRow> {
  const id = overrides.id ?? source.typeId(ID_PREFIX.character);
  const card = {
    id,
    // The handle is the id, not a slug of the name: `(ownerId, handle)` is unique and the name default is fixed.
    handle: castId<CharacterHandle>(id),
    starred: false,
    archived: false,
    synthetic: false,
    forbidExternalMedia: null,
    trustHtml: null,
    interactiveHtml: null,
    themeOverride: null,
    backgroundOverride: null,
    importedFrom: null,
    importHash: null,
    importTextHash: null,
    name: "Test Character",
    description: null,
    personality: null,
    scenario: null,
    greetings: [],
    exampleMessages: null,
    systemPrompt: null,
    postHistoryInstructions: null,
    depthPrompt: null,
    creatorNotes: null,
    creator: null,
    cardVersion: null,
    nickname: null,
    source: null,
    creationDate: null,
    modificationDate: null,
    extensions: null,
    residualData: null,
    avatarAssetId: null,
    refinery: null,
    createdAt: FROZEN_AT_MS,
    updatedAt: FROZEN_AT_MS,
    ...overrides,
  } satisfies Omit<CharacterRow, "contentHash" | "tokenSize">;
  const row: CharacterRow = { ...card, contentHash: cardContentHash(card), tokenSize: cardTokenSize(card) };
  await db.insert(characters).values(row);
  return row;
}

// D18 makes a membership-free room row legal at the schema; the caller inserts any seats it needs.
function makeChat(overrides: Partial<ChatRow>, source: IdSource): ChatRow {
  return {
    id: source.typeId(ID_PREFIX.chat),
    title: null,
    starred: false,
    archived: false,
    temporary: false,
    startedAt: FROZEN_AT_MS,
    pendingHostUserId: null,
    pendingHandoffOffer: null,
    anchorPersonaId: null,
    parentChatId: null,
    forkedAt: null,
    compactSummary: null,
    compactedAtSeq: null,
    metadata: null,
    variableValues: null,
    userMacroValues: null,
    runtimeVariables: null,
    streamSeq: 0,
    standaloneVariableDeltas: null,
    importedFrom: null,
    importHash: null,
    createdAt: FROZEN_AT_MS,
    updatedAt: FROZEN_AT_MS,
    ...overrides,
  };
}

/** A bare room row, born started at the frozen clock; the caller inserts the seats its case needs. */
export async function seedChatRow(db: Db, overrides: Partial<ChatRow> = {}, source: IdSource = ids): Promise<ChatRow> {
  const row = makeChat(overrides, source);
  await db.insert(chats).values(row);
  return row;
}

function makeMessage(overrides: Partial<MessageRow>, source: IdSource): MessageRow {
  return {
    id: source.typeId(ID_PREFIX.message),
    chatId: source.typeId(ID_PREFIX.chat),
    seq: 1,
    role: "assistant",
    kind: "standard",
    authorUserId: null,
    characterId: null,
    personaId: null,
    selectedVariantId: null,
    excludedFromPrompt: false,
    initiator: "human",
    automationDepth: 0,
    createdAt: FROZEN_AT_MS,
    editedAt: null,
    ...overrides,
  };
}

/** Slot overrides plus the idx-0 variant's text, which lives on `message_variants` rather than the slot. */
export interface SeedMessageRowOptions extends Partial<MessageRow> {
  readonly content?: string;
}

export interface SeededMessageRow extends MessageRow {
  readonly variantId: MessageVariantId;
  readonly content: string;
}

/** The D26 circular-FK write: slot, then variant idx 0, then the `selectedVariantId` pointer. An absent
 *  `chatId` inserts a bare room first so the slot lands FK-clean on an empty database. */
export async function seedMessageRow(db: Db, overrides: SeedMessageRowOptions = {}, source: IdSource = ids): Promise<SeededMessageRow> {
  const { content, ...slotOverrides } = overrides;
  const chatId = slotOverrides.chatId ?? (await seedChatRow(db, {}, source)).id;
  const slot = makeMessage({ ...slotOverrides, chatId }, source);
  await db.insert(messages).values(slot);
  const variantId = source.typeId(ID_PREFIX.messageVariant);
  const body = content ?? `body-${slot.seq}`;
  await db.insert(messageVariants).values({ id: variantId, messageId: slot.id, idx: 0, content: body, createdAt: FROZEN_AT_MS });
  await db.update(messages).set({ selectedVariantId: variantId }).where(eq(messages.id, slot.id));
  return { ...slot, selectedVariantId: variantId, variantId, content: body };
}
