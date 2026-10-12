import type { DeploymentRenderPolicy, ResolveCharacterTagsOp, ResolveSeatDecoOp, ResolveSeatDecosOp } from "@orb/contracts/chat";
import type { Principal } from "@orb/contracts/identity";
import type { UserId } from "@orb/kit/ids";
import type { CharacterService, LoadSeatCards } from "./service.ts";

export interface CharacterRoomProjectionDeps {
  readonly get: CharacterService["get"];
  readonly loadSeatCards: LoadSeatCards;
  readonly principalForUser: (userId: UserId) => Principal;
  readonly readRenderPolicy: () => DeploymentRenderPolicy;
}
export interface CharacterRoomProjections {
  readonly resolveCharacterTags: ResolveCharacterTagsOp;
  readonly resolveSeatDeco: ResolveSeatDecoOp;
  readonly resolveSeatDecos: ResolveSeatDecosOp;
}
