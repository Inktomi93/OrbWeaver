import type { LoadOptionalPreset } from "@orb/contracts/preset";
import type { ProseOverrides } from "@orb/contracts/prose";
import type { LoadUserSettings } from "@orb/contracts/settings";
import type { ChatId, PresetId, UserId } from "@orb/kit/ids";
import type { DebugRoutesOptions } from "#foundation/observability";
import type { ChatContext, ChatServiceDeps } from "./context.ts";
import type { ResolveTurnPersonas } from "./foreign.ts";
import type { ResolveBackfillMemoryConfig } from "./memory.ts";

/** Foreign facts are loaded through their owners; chat owns the room's resolution order. */

export interface ChatRoomInputDeps {
  readonly loadUserSettings: LoadUserSettings;
  readonly getEffectiveConfig: NonNullable<DebugRoutesOptions["effectiveConfig"]>;
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
  /** The id of the preset behind `resolvePromptUserMacros`; null when that is the built-in default. */
  readonly resolvePromptPresetId: (chatId: ChatId) => Promise<PresetId | null>;
  readonly resolveChatPresetProse: (chatId: ChatId) => Promise<ProseOverrides>;
  readonly resolveMemoryConfig: ResolveBackfillMemoryConfig;
}
