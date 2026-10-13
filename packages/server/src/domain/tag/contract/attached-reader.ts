import type { Principal } from "@orb/contracts/identity";
import type { CharacterId, ChatId, PersonaId, PresetId, UserId, WorldBookId } from "@orb/kit/ids";

export interface AttachedEntityReaders {
  readonly characterName: (principal: Principal, id: CharacterId) => Promise<{ readonly name: string }>;
  readonly chatTitle: (principal: Principal, id: ChatId) => Promise<{ readonly title: string | null }>;
  readonly worldBookName: (principal: Principal, id: WorldBookId) => Promise<{ readonly name: string }>;
  readonly personaName: (principal: Principal, id: PersonaId) => Promise<{ readonly name: string }>;
  readonly presetName: (userId: UserId, id: PresetId) => Promise<{ readonly name: string }>;
}
