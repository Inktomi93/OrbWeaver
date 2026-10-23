// Direct row builders for persistence-tier tests that assert a query or a schema fact (Spine-Testing §9).
// Every other test seeds through the composed root; dependency-cruiser limits who imports this door.

import type { Db, users } from "@orb/db";
import { chats, messages, messageVariants } from "@orb/db";
import { handleKey } from "@orb/kit/handle-key";
import type { Handle, IdSource, MessageVariantId } from "@orb/kit/ids";
import { castId, createIdSource, ID_PREFIX } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { FROZEN_AT_MS } from "../../iso/clock.ts";
import { createSeededIds } from "../../iso/ids.ts";

export type UserRow = typeof users.$inferSelect;
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

// D18 makes a membership-free room row legal at the schema; only the message seed below needs one.
function makeChat(source: IdSource): ChatRow {
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
  };
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
  let chatId = slotOverrides.chatId;
  if (chatId === undefined) {
    const room = makeChat(source);
    await db.insert(chats).values(room);
    chatId = room.id;
  }
  const slot = makeMessage({ ...slotOverrides, chatId }, source);
  await db.insert(messages).values(slot);
  const variantId = source.typeId(ID_PREFIX.messageVariant);
  const body = content ?? `body-${slot.seq}`;
  await db.insert(messageVariants).values({ id: variantId, messageId: slot.id, idx: 0, content: body, createdAt: FROZEN_AT_MS });
  await db.update(messages).set({ selectedVariantId: variantId }).where(eq(messages.id, slot.id));
  return { ...slot, selectedVariantId: variantId, variantId, content: body };
}
