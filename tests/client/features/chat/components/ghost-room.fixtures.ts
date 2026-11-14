import type { CharacterId, ChatId } from "@orb/kit/ids";
import type { createCorpusHarness } from "@orb/testkit/node/composed";

/** The reads the production transcript sends while a ghost streams into it. */
export const GHOST_ROOM_PROCEDURES = [
  "sessions.me",
  "settings.getUserSettings",
  "chat.getChat",
  "chat.listMessages",
  "chat.listReactions",
  "chat.listMessageVariants",
  "chat.previewContextFit",
  "plugin.list",
  "plugin.listDisplayTransforms",
  "plugin.listSurfaces",
  "regex.listScripts",
  "regex.listRoomDisplayScripts",
  "rpg.getGame",
  "rpg.listTurnToolCalls",
] as const;

type Harness = Awaited<ReturnType<typeof createCorpusHarness>>;

/** A room seating exactly one character, so the speaker and `{{char}}` are the same name. */
export async function soloRoom(root: Harness): Promise<{ readonly chatId: ChatId; readonly characterId: CharacterId; readonly name: string }> {
  const owner = await root.internalCallerFor(root.ownerId);
  for (const room of (await owner.chat.listChats({ limit: 100 })).items) {
    const characters = (await owner.chat.getChat({ chatId: room.id })).participants.filter((p) => p.kind === "character");
    const [only] = characters;
    if (characters.length === 1 && only?.characterId !== null && only?.characterId !== undefined) {
      return { chatId: room.id, characterId: only.characterId, name: only.displayName };
    }
  }
  throw new Error("The corpus has no room seating exactly one character");
}
