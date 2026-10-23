// support/factories/message — the D26 slot + variant pair. `X` is the SLOT row (`messages` — identity +
// attribution + selection ONLY; content lives on `message_variants`). `seedMessage` performs the 3-step
// circular-FK dance the schema requires (insert slot → insert variant idx 0 → point `selectedVariantId`)
// and returns the slot with the pointer set plus the variant id + content. `makeMessage` stays pure —
// its default `chatId` is MINTED (dangling); `seedMessage` auto-seeds a bare chat when none is given.

import type { TurnOutcome } from "@orb/contracts/chat";
import type { Db } from "@orb/db";
import { messages, messageVariants } from "@orb/db";
import type { IdSource, MessageVariantId } from "@orb/kit/ids";
import { createIdSource, ID_PREFIX } from "@orb/kit/ids";
import { and, eq } from "drizzle-orm";
import { FROZEN_AT_MS } from "../../iso/clock.ts";
import { createSeededIds } from "../../iso/ids.ts";
import { seedChat } from "./chat.ts";

/** The full `messages` SLOT row (derived from the live schema — the factory `X`). */
export type MessageRow = typeof messages.$inferSelect;
type MessageVariantRow = typeof messageVariants.$inferSelect;

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

const ids = createIdSource(createSeededIds().next);

/** Pure builder: a fully-valid slot row (assistant, seq 1). `selectedVariantId` is null — the pointer
 *  only exists after the variant insert (`seedMessage` owns that dance). */
export function makeMessage(overrides: Partial<MessageRow> = {}, source: IdSource = ids): MessageRow {
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

/** The D26 3-step dance over a real db: slot → variant idx 0 → `selectedVariantId` pointer. An absent
 *  `chatId` seeds a bare chat first (FK-clean on an empty db). */
export async function seedMessage(db: Db, overrides: SeedMessageOptions = {}, source?: IdSource): Promise<SeededMessage> {
  const { content, ...slotOverrides } = overrides;
  const sequence = source ?? ids;
  const chatId = slotOverrides.chatId ?? (await seedChat(db, {}, source)).id;
  const slot = makeMessage({ ...slotOverrides, chatId }, sequence);
  await db.insert(messages).values(slot);

  const variantId = sequence.typeId(ID_PREFIX.messageVariant);
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

/** Canonical rows come only from the exact message/variant identities returned by the actual turn. */
export async function captureTurnRows(db: Db, outcome: TurnOutcome): Promise<CapturedTurnRows> {
  return await Promise.all(
    outcome.messages.map(async (message) => {
      const row = await db
        .select({ slot: messages, variant: messageVariants })
        .from(messages)
        .innerJoin(messageVariants, eq(messageVariants.messageId, messages.id))
        .where(and(eq(messages.id, message.id), eq(messages.selectedVariantId, message.selectedVariantId), eq(messageVariants.id, message.selectedVariantId)))
        .get();
      if (row === undefined) {
        throw new Error("actual turn message has no matching canonical selected variant");
      }
      return row;
    }),
  );
}

interface CapturedTurnRow {
  readonly slot: MessageRow;
  readonly variant: MessageVariantRow;
}
export type CapturedTurnRows = readonly CapturedTurnRow[];
