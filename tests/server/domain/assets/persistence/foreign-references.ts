// Stored references another build wrote: unknown source kinds and encodings this build's verbs cannot produce.
// The one home that plants them, for the persistence suite and the sweep's late-write case.
import { createCharacterSchema } from "@orb/contracts/character";
import { characters, chats, userSettings } from "@orb/db";
import type { CharacterHandle, ChatId } from "@orb/kit/ids";
import { eq, sql } from "drizzle-orm";
import type { GcBox } from "../gc-box.ts";

/** Write `value` at the room's `background` key as stored JSON (a string value stores a JSON string). */
export async function plantRoomBackground(box: GcBox, room: ChatId, value: unknown): Promise<void> {
  await box.root.db
    .update(chats)
    .set({ metadata: sql`json_set(coalesce(${chats.metadata}, '{}'), '$.background', json(${JSON.stringify(value)}))` })
    .where(eq(chats.id, room));
}

export async function plantCardBackground(box: GcBox, handle: CharacterHandle, value: unknown): Promise<string> {
  const card = await box.root.services.character.create({
    principal: box.principal,
    input: createCharacterSchema.parse({ handle, name: "Unreadable", description: "" }),
  });
  await box.root.db
    .update(characters)
    .set({ backgroundOverride: sql`json(${JSON.stringify(value)})` })
    .where(eq(characters.id, card.id));
  return card.id;
}

/** The owner's settings row, written once through the real section verb so a raw rewrite has a row to edit. */
export async function settingsRow(box: GcBox): Promise<void> {
  await box.root.services.settings.updateUserSettingsSection({ principal: box.principal, input: { section: "profile", patch: { flankCollapsed: true } } });
}

export async function rewriteSettings(box: GcBox, path: string, value: unknown): Promise<string> {
  await settingsRow(box);
  await box.root.db
    .update(userSettings)
    .set({ config: sql`json_set(${userSettings.config}, ${path}, json(${JSON.stringify(value)}))` })
    .where(eq(userSettings.userId, box.root.ownerId));
  return box.root.ownerId;
}
