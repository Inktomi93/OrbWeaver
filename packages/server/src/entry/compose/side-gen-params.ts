// Composition helper — the side-generation sampling ladder's MIDDLE rung: WHICH preset's `params` a side-gen
// call reads. Two resolvers built from the same seam (preset.get under a user's default preset, the
// `resolvePromptConfigFor` precedent — a stale/unowned/missing id degrades to the system default's params,
// never a throw), so every side-gen consumer resolves the caller's preset params ONE way and can't drift:
//
//   • resolveUserPresetParams(userId)  — the user's own DEFAULT preset params (card/user-scoped sites:
//     greeting studio, distill, analyze, autobg, caption).
//   • resolveChatPresetParams(chatId)  — the chat HOST's default preset params (chat-scoped sites: smart
//     arbitration, quiet-generate/compaction, extract-quiet). Hostless/stale room ⇒ the floor (no rung).
//
// The result is the pure `SideGenSampling` subset the `@orb/kit/side-gen-posture` resolver folds — a preset's
// full `UserIntent` is structurally a superset, so `.params` is handed through verbatim (the resolver reads
// only temperature/topP/maxOutputTokens and ignores the rest). Owns no business logic.

import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { ChatId, PresetId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { SideGenSampling } from "@orb/kit/side-gen-posture";
import type { PresetService } from "#domain/preset";
import type { SettingsService } from "#domain/settings";

export interface SideGenParamsResolvers {
  /** The user's own default-preset generation params (card/user-scoped side-gen). */
  readonly resolveUserPresetParams: (userId: UserId) => Promise<SideGenSampling>;
  /** The chat host's default-preset generation params (chat-scoped side-gen). */
  readonly resolveChatPresetParams: (chatId: ChatId) => Promise<SideGenSampling>;
}

export interface SideGenParamsDeps {
  readonly preset: Pick<PresetService, "get">;
  readonly settings: Pick<SettingsService, "loadUserSettings">;
  /** The chat's PRESENT host userId (role='host', leftSeq NULL) — `null` for a hostless/stale room. */
  readonly resolveChatHostUserId: (chatId: ChatId) => Promise<UserId | null>;
}

export function buildSideGenParams(deps: SideGenParamsDeps): SideGenParamsResolvers {
  // A user's default-preset params, given the already-loaded default preset id. A stale/unowned/missing id
  // degrades to the system default's params (the resolvePromptConfigFor lenient-id rule — never a throw).
  const paramsForDefaultPreset = async (userId: UserId, defaultPresetId: string | null): Promise<SideGenSampling> => {
    if (defaultPresetId === null) {
      return DEFAULT_PROMPT_CONFIG.params;
    }
    try {
      return (await deps.preset.get({ userId, id: castId<PresetId>(defaultPresetId) })).config.params;
    } catch {
      return DEFAULT_PROMPT_CONFIG.params;
    }
  };

  const resolveUserPresetParams = async (userId: UserId): Promise<SideGenSampling> => {
    const us = await deps.settings.loadUserSettings(userId);
    return paramsForDefaultPreset(userId, us.seeds.defaultPresetId);
  };

  const resolveChatPresetParams = async (chatId: ChatId): Promise<SideGenSampling> => {
    const hostUserId = await deps.resolveChatHostUserId(chatId);
    if (hostUserId === null) {
      return DEFAULT_PROMPT_CONFIG.params;
    }
    return resolveUserPresetParams(hostUserId);
  };

  return { resolveUserPresetParams, resolveChatPresetParams };
}
