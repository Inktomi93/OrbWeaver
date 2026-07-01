// Shared test harness for the stats domain (NOT a test file — no `.test` suffix, so test-layout ignores it).
// Deterministic seeders: fixed id strings (castId — no unseeded mint under tests/, test-determinism) +
// fixed epoch-ms timestamps (no ambient clock). Seeds both the rollup tables (for the read verbs) and the
// canon slot/variant graph (D26 — for the on-read scans + reconcile). Inserts route through @orb/db tables.

import type { BatchStmt, Db } from "@orb/db";
import {
  batchMany,
  characterStats,
  characters,
  chatParticipants,
  chats,
  dailyStats,
  messages,
  messageVariants,
  modelStats,
  ownerStats,
  personas,
  users,
} from "@orb/db";
import type {
  CharacterId,
  CharacterStatId,
  ChatId,
  ChatParticipantId,
  DailyStatId,
  Handle,
  MessageId,
  MessageVariantId,
  ModelStatId,
  PersonaId,
  UserId,
} from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { MessageRole } from "@orb/kit/message-role";
import { eq } from "drizzle-orm";
import { createFrozenClock } from "../../../support/clock.ts";

// The deterministic base instant — sourced from the LOCKED global fixture (testing.md §4), not a
// self-rolled literal. Seed-row timestamps build off it as test DATA (the `msgCounter` + explicit
// `createdAt`/`updatedAt` values are data generation, not the injected-clock determinism seam).
export const T0 = createFrozenClock().frozenAt;
export const DAY = 86_400_000;

let msgCounter = 0;

/** Insert a `users` row (FK parent for owner-scoped rows). */
export async function seedUser(db: Db, id = "user_owner"): Promise<UserId> {
  const uid = castId<UserId>(id);
  await db.insert(users).values({ id: uid, handle: castId<Handle>(id), role: "owner" });
  return uid;
}

/** Insert a `characters` row owned by `ownerId`. */
export async function seedCharacter(
  db: Db,
  ownerId: UserId,
  opts: { id?: string; name?: string } = {},
): Promise<CharacterId> {
  const id = castId<CharacterId>(opts.id ?? "character_a");
  await db.insert(characters).values({
    id,
    handle: id,
    ownerId,
    name: opts.name ?? "Aria",
    contentHash: "hash",
  });
  return id;
}

/** Insert a `personas` row owned by `ownerId`. */
export async function seedPersona(
  db: Db,
  ownerId: UserId,
  opts: { id?: string; name?: string } = {},
): Promise<PersonaId> {
  const id = castId<PersonaId>(opts.id ?? "persona_a");
  await db.insert(personas).values({
    id,
    ownerId,
    name: opts.name ?? "Me",
    description: "d",
    createdAt: T0,
    updatedAt: T0,
  });
  return id;
}

/** Insert a `chats` row + a character participant (the D18 membership that owner-scopes the chat). */
export async function seedChat(
  db: Db,
  characterId: CharacterId,
  opts: { id?: string; createdAt?: number; updatedAt?: number; anchorPersonaId?: PersonaId } = {},
): Promise<ChatId> {
  const id = castId<ChatId>(opts.id ?? "chat_a");
  await db.insert(chats).values({
    id,
    createdAt: opts.createdAt ?? T0,
    updatedAt: opts.updatedAt ?? T0,
    anchorPersonaId: opts.anchorPersonaId ?? null,
  });
  await db.insert(chatParticipants).values({
    id: castId<ChatParticipantId>(`chat_participant_${id}`),
    chatId: id,
    kind: "character",
    characterId,
    role: "member",
    joinSeq: 0,
  });
  return id;
}

export interface VariantSeed {
  content?: string;
  model?: string | null;
  provider?: string | null;
  tokensIn?: number | null;
  tokensOut?: number | null;
  ttftMs?: number | null;
  genStartedAt?: number | null;
  genFinishedAt?: number | null;
  costUsd?: number | null;
  cacheReadTokens?: number | null;
  cacheWriteTokens?: number | null;
  contextWindow?: number | null;
  reasoning?: string | null;
  reasoningDuration?: number;
}

interface MessageSeed {
  chatId: ChatId;
  seq: number;
  role: MessageRole;
  characterId?: CharacterId | null;
  personaId?: PersonaId | null;
  createdAt?: number;
  selectedIdx?: number;
  variants: VariantSeed[];
}

function variantRow(
  messageId: MessageId,
  n: number,
  idx: number,
  v: VariantSeed,
): typeof messageVariants.$inferInsert {
  const metadata =
    v.reasoningDuration === undefined
      ? null
      : // biome-ignore lint/style/useNamingConvention: this JSON key is the json_extract('$.reasoning_duration') read path.
        { reasoning_duration: v.reasoningDuration };
  return {
    id: castId<MessageVariantId>(`message_variant_${n}_${idx}`),
    messageId,
    idx,
    content: v.content ?? "",
    model: v.model ?? null,
    provider: v.provider ?? null,
    tokensIn: v.tokensIn ?? null,
    tokensOut: v.tokensOut ?? null,
    ttftMs: v.ttftMs ?? null,
    genStartedAt: v.genStartedAt ?? null,
    genFinishedAt: v.genFinishedAt ?? null,
    costUsd: v.costUsd ?? null,
    cacheReadTokens: v.cacheReadTokens ?? null,
    cacheWriteTokens: v.cacheWriteTokens ?? null,
    contextWindow: v.contextWindow ?? null,
    reasoning: v.reasoning ?? null,
    metadata,
  };
}

/** Insert a message SLOT + its variants (D26 — content/economics on variants), wiring `selectedVariantId`
 *  to the variant at `selectedIdx` (default 0). Extra variants beyond the selected one are swipes. */
export async function seedMessage(db: Db, opts: MessageSeed): Promise<MessageId> {
  const n = msgCounter++;
  const messageId = castId<MessageId>(`message_${n}`);
  await db.insert(messages).values({
    id: messageId,
    chatId: opts.chatId,
    seq: opts.seq,
    role: opts.role,
    characterId: opts.characterId ?? null,
    personaId: opts.personaId ?? null,
    createdAt: opts.createdAt ?? T0,
  });
  const stmts: BatchStmt[] = opts.variants.map((v, idx) =>
    db.insert(messageVariants).values(variantRow(messageId, n, idx, v)),
  );
  await db.batch(batchMany(stmts));
  const selectedIdx = opts.selectedIdx ?? 0;
  await db
    .update(messages)
    .set({ selectedVariantId: castId<MessageVariantId>(`message_variant_${n}_${selectedIdx}`) })
    .where(eq(messages.id, messageId));
  return messageId;
}

// ── Direct rollup-row seeders (for the read-verb tests — no canon needed). ──

export async function seedOwnerStats(
  db: Db,
  ownerId: UserId,
  o: Partial<typeof ownerStats.$inferInsert> = {},
): Promise<void> {
  await db.insert(ownerStats).values({ ownerId, computedAt: T0, ...o });
}

export async function seedCharacterStats(
  db: Db,
  characterId: CharacterId,
  o: Partial<typeof characterStats.$inferInsert> = {},
): Promise<void> {
  await db.insert(characterStats).values({
    id: castId<CharacterStatId>(`character_stat_${characterId}`),
    characterId,
    computedAt: T0,
    ...o,
  });
}

export async function seedDailyStats(
  db: Db,
  ownerId: UserId,
  day: string,
  o: Partial<typeof dailyStats.$inferInsert> = {},
): Promise<void> {
  await db.insert(dailyStats).values({
    id: castId<DailyStatId>(`daily_stat_${day}`),
    ownerId,
    day,
    computedAt: T0,
    ...o,
  });
}

export async function seedModelStats(
  db: Db,
  ownerId: UserId,
  o: { model: string; provider: string } & Partial<typeof modelStats.$inferInsert>,
): Promise<void> {
  await db.insert(modelStats).values({
    id: castId<ModelStatId>(`model_stat_${o.model}_${o.provider}`),
    ownerId,
    computedAt: T0,
    ...o,
  });
}
