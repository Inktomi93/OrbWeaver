// A three-character smart-picker room over a scripted utility and chat peer, with its send and warning reads.

import { createCharacterSchema } from "@orb/contracts/character";
import type { TurnOutcome } from "@orb/contracts/chat";
import { SHIPPED_PROMPT_CACHE } from "@orb/contracts/inference";
import { speakerRoom } from "./speaker-funding-physical.ts";

export type Room = Awaited<ReturnType<typeof speakerRoom>>;

export async function smartRoom(plan: Parameters<typeof speakerRoom>[0], options: Parameters<typeof speakerRoom>[1] = {}): Promise<Room> {
  return await speakerRoom(plan, options, { ...SHIPPED_PROMPT_CACHE, enabled: false });
}

export async function send(room: Room, content = "who's up?"): Promise<TurnOutcome> {
  return await room.h.root.services.chat.send({ principal: room.h.owner, chatId: room.h.chatId, content });
}

export function warnings(room: Room): Room["events"] {
  return room.events.filter((event) => event.type === "warning");
}

export async function muteCara(room: Room): Promise<void> {
  const seats = await room.h.root.services.chat.listParticipants({ principal: room.h.owner, chatId: room.h.chatId });
  const cara = seats.find((seat) => seat.characterId === room.h.characters[2]?.id);
  if (cara === undefined) {
    throw new Error("the actual cara seat was not created");
  }
  await room.h.root.services.chat.setSeatKnobs({ principal: room.h.owner, chatId: room.h.chatId, participantId: cara.id, patch: { disabled: true } });
}

export const THREE = ["aria", "bryn", "cara"].map((name) => createCharacterSchema.parse({ handle: name, name, description: `The traveller ${name}.` }));
