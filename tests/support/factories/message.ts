// support/factories/message — the D26 slot + variant pair. `X` is the SLOT row (`messages` — identity +
// attribution + selection ONLY; content lives on `message_variants`). `seedMessage` performs the 3-step
// circular-FK dance the schema requires (insert slot → insert variant idx 0 → point `selectedVariantId`)
// and returns the slot with the pointer set plus the variant id + content. `makeMessage` stays pure —
// its default `chatId` is MINTED (dangling); `seedMessage` auto-seeds a bare chat when none is given.

import type { Db } from "@orb/db";
import { messages, messageVariants } from "@orb/db";
import type { ChatId, MessageId, MessageVariantId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { FROZEN_AT_MS } from "../clock.ts";
import { createSeededIds } from "../ids.ts";
import { seedChat } from "./chat.ts";

/** The full `messages` SLOT row (derived from the live schema — the factory `X`). */
export type MessageRow = typeof messages.$inferSelect;

/** Slot overrides + the first variant's content (a variant field, so not on `Partial<X>`). */
export interface SeedMessageOptions extends Partial<MessageRow> {
  /** The idx-0 variant's text. Defaults to `body-<seq>` (deterministic). */
  readonly content?: string;
}

/** The seeded slot: `selectedVariantId` is set (non-null post-dance) + the variant id/content. */
export interface SeededMessage extends MessageRow {
  readonly variantId: MessageVariantId;
  readonly content: string;
}

const ids = createSeededIds();

/** Pure builder: a fully-valid slot row (assistant, seq 1). `selectedVariantId` is null — the pointer
 *  only exists after the variant insert (`seedMessage` owns that dance). */
export function makeMessage(overrides: Partial<MessageRow> = {}): MessageRow {
  return {
    id: castId<MessageId>(ids.next("message")),
    chatId: castId<ChatId>(ids.next("chat")),
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

/** The D26 3-step dance over a real db: slot → variant idx 0 → `selectedVariantId` pointer. An absent
 *  `chatId` seeds a bare chat first (FK-clean on an empty db). */
export async function seedMessage(db: Db, overrides: SeedMessageOptions = {}): Promise<SeededMessage> {
  const { content, ...slotOverrides } = overrides;
  const chatId = slotOverrides.chatId ?? (await seedChat(db)).id;
  const slot = makeMessage({ ...slotOverrides, chatId });
  await db.insert(messages).values(slot);

  const variantId = castId<MessageVariantId>(ids.next("message_variant"));
  const body = content ?? `body-${slot.seq}`;
  await db.insert(messageVariants).values({
    id: variantId,
    messageId: slot.id,
    idx: 0,
    content: body,
    createdAt: FROZEN_AT_MS,
  });
  await db.update(messages).set({ selectedVariantId: variantId }).where(eq(messages.id, slot.id));

  return { ...slot, selectedVariantId: variantId, variantId, content: body };
}
