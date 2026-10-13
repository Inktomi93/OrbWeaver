import type { CharacterCard } from "@orb/contracts/character";
import type { ResolveViewerVisibility } from "@orb/contracts/chat";
import type { Principal } from "@orb/contracts/identity";
import type { RoleClientsWithSignal } from "@orb/inference";
import type { CharacterId, ChatId, UserId } from "@orb/kit/ids";
import type { ExtractQuiet, ExtractQuietDeps, ExtractQuietParams } from "./context.ts";

export interface ImageryRoomAccessDeps {
  readonly resolveViewerVisibility: ResolveViewerVisibility;
  readonly resolveChatHostUserId: (chatId: ChatId) => Promise<UserId | null>;
  readonly isCharacterSeated: (chatId: ChatId, characterId: CharacterId) => Promise<boolean>;
  readonly resolveHostPrincipal: (userId: UserId) => Promise<Principal>;
}

export interface ImageryRoomAccess {
  readonly callerInChat: (caller: Principal, chatId: ChatId) => Promise<boolean>;
  readonly resolveRoomRunAs: (caller: Principal, chatId: ChatId, subjectCharacterId: CharacterId | undefined) => Promise<Principal>;
}

export interface VisibleExtractQuietParams extends Pick<ExtractQuietParams, "chatId" | "funderUserId" | "instruction" | "subjectCharacterId" | "timeZone"> {
  readonly caller: Principal;
}

export type VisibleExtractQuiet = (params: VisibleExtractQuietParams) => ReturnType<ExtractQuiet>;

export interface VisibleExtractQuietDeps extends Pick<ExtractQuietDeps, "db" | "now" | "resolveUtilityPresetParams" | "resolveUserMacroDefs"> {
  readonly roleClientsFor: (userId: UserId) => Promise<Pick<RoleClientsWithSignal, "summarize">>;
  readonly getCard: (params: { readonly principal: Principal; readonly characterId: CharacterId }) => Promise<CharacterCard | null>;
  readonly resolveHostPrincipal: (userId: UserId) => Promise<Principal>;
  readonly resolveViewerVisibility: ResolveViewerVisibility;
}

export interface VisibleExtractQuietGateDeps {
  readonly extractQuiet: ExtractQuiet;
  readonly resolveViewerVisibility: ResolveViewerVisibility;
}
