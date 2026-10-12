import type { ProseOverrides } from "@orb/contracts/prose";
import type { EffectiveAppConfig, UserSettings } from "@orb/contracts/settings";
import type { ChatId, UserId } from "@orb/kit/ids";
import type { LoadOptionalPreset } from "#domain/preset";
import type { ChatContext, ChatServiceDeps } from "./context.ts";
import type { ResolveTurnPersonas } from "./foreign.ts";
import type { ResolveBackfillMemoryConfig } from "./memory.ts";

/** Foreign facts are loaded through their owners; chat owns the room's resolution order. */

export interface ChatRoomInputDeps {
  readonly loadUserSettings: (userId: UserId) => Promise<UserSettings>;
  readonly getEffectiveConfig: () => EffectiveAppConfig;
  readonly loadOptionalPreset: LoadOptionalPreset;
  readonly resolveHostUserId: (chatId: ChatId) => Promise<UserId | null>;
  readonly resolveTurnPersonas: ResolveTurnPersonas;
  readonly rpg: ChatContext["rpg"];
}
/** The turn and out-of-turn readers use the same host/preset/memory rules. */
export interface ChatRoomInputs
  extends Pick<
      ChatContext,
      | "resolvePromptVariables"
      | "resolvePromptUserMacros"
      | "resolveChatProse"
      | "resolveChatPresetParams"
      | "resolveTempChatTtlHours"
      | "readReactionDefaults"
      | "resolveWelcomeAssistantId"
    >,
    Pick<ChatServiceDeps, "resolveForeignInputs"> {
  readonly resolveChatPresetProse: (chatId: ChatId) => Promise<ProseOverrides>;
  readonly resolveMemoryConfig: ResolveBackfillMemoryConfig;
}
