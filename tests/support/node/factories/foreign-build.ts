// Stored references another build wrote: a source kind or encoding this build's verbs never produce, but a database
// shared across versions holds. The asset collector must refuse such a row rather than reap what it cannot read.

import { characters, chats, userSettings } from "@orb/db";
import type { CharacterId, ChatId, UserId } from "@orb/kit/ids";
import { eq, sql } from "drizzle-orm";
import type { ServerProducerRoot } from "../server.ts";

/** Store `value` at the room's `background` key as JSON; a string value stores a JSON string. */
export async function plantForeignRoomBackground(root: ServerProducerRoot, chatId: ChatId, value: unknown): Promise<void> {
  await root.db
    .update(chats)
    .set({ metadata: sql`json_set(coalesce(${chats.metadata}, '{}'), '$.background', json(${JSON.stringify(value)}))` })
    .where(eq(chats.id, chatId));
}

/** Store `value` as the card's background override JSON. */
export async function plantForeignCardBackground(root: ServerProducerRoot, characterId: CharacterId, value: unknown): Promise<void> {
  await root.db
    .update(characters)
    .set({ backgroundOverride: sql`json(${JSON.stringify(value)})` })
    .where(eq(characters.id, characterId));
}

/** Store `value` at a JSON path of an existing settings row; the row comes from the settings verb first. */
export async function plantForeignSettingsValue(root: ServerProducerRoot, userId: UserId, path: string, value: unknown): Promise<void> {
  await root.db
    .update(userSettings)
    .set({ config: sql`json_set(${userSettings.config}, ${path}, json(${JSON.stringify(value)}))` })
    .where(eq(userSettings.userId, userId));
}

/** Replace an existing settings row's stored bytes with text that is not JSON at all. */
export async function plantForeignSettingsBytes(root: ServerProducerRoot, userId: UserId, bytes: string): Promise<void> {
  await root.db
    .update(userSettings)
    .set({ config: sql`${bytes}` })
    .where(eq(userSettings.userId, userId));
}
