import type { Db } from "@orb/db";
import type { ChatId, PersonaId, UserId } from "@orb/kit/ids";

export interface PersonaSeatCaptureDeps {
  readonly db: Db;
  readonly setActivePersona: (chatId: ChatId, targetUserId: UserId, personaId: PersonaId | null) => Promise<void>;
}

export type CapturePersonaSeatsForDelete = (ownerId: UserId, personaId: PersonaId) => Promise<(reseatWith: PersonaId) => Promise<void>>;
