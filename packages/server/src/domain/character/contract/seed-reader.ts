import type { Principal } from "@orb/contracts/identity";
import type { CharacterHandle, CharacterId } from "@orb/kit/ids";

export type FindSeedCharacter = (principal: Principal, handle: CharacterHandle) => Promise<CharacterId | null>;
