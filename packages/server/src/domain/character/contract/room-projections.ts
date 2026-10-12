import type { DeploymentRenderPolicy } from "@orb/contracts/chat";
import type { Principal } from "@orb/contracts/identity";
import type { UserId } from "@orb/kit/ids";
import type { ChatContext } from "#domain/chat";
import type { CharacterService, LoadSeatCards } from "./service.ts";
export interface CharacterRoomProjectionDeps {
  readonly get: CharacterService["get"];
  readonly loadSeatCards: LoadSeatCards;
  readonly principalForUser: (userId: UserId) => Principal;
  readonly readRenderPolicy: () => DeploymentRenderPolicy;
}
export type CharacterRoomProjections = Pick<ChatContext, "resolveCharacterTags" | "resolveSeatDeco" | "resolveSeatDecos">;
