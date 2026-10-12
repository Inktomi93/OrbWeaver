// Room identity and configuration resolve live through injected owner ports, in one ordered ladder.

import type { ChoiceBlockSpec, PromptConfig, UserIntent, UserMacroSpec } from "@orb/contracts/preset";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { ProseOverrides } from "@orb/contracts/prose";
import { composeProse } from "@orb/contracts/prose";
import type { CharacterId, ChatId, PresetId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createTurnPersonaResolver } from "../assembly/turn-personas.ts";
import type { MemoryConfig } from "../contract/memory.ts";
import type { ChatRoomInputDeps, ChatRoomInputs } from "../contract/room-inputs.ts";

/** Resolve turn configuration without replacing a failed foreign read with a default. */
export function createChatRoomInputs(deps: ChatRoomInputDeps): ChatRoomInputs {
  const resolvePromptConfigFor = async (runAsUserId: UserId, defaultPresetId: string | null): Promise<{ config: PromptConfig; name: string | null }> => {
    if (defaultPresetId === null) {
      return { config: DEFAULT_PROMPT_CONFIG, name: null };
    }
    const detail = await deps.loadOptionalPreset(runAsUserId, castId<PresetId>(defaultPresetId));
    return detail === null ? { config: DEFAULT_PROMPT_CONFIG, name: null } : { config: detail.config, name: detail.name };
  };
  const resolvePromptConfigWithOverride = async (
    runAsUserId: UserId,
    presetOverride: PresetId | undefined,
    defaultPresetId: string | null,
  ): Promise<{ config: PromptConfig; presetId: PresetId | null; presetName: string | null }> => {
    if (presetOverride !== undefined) {
      const detail = await deps.loadOptionalPreset(runAsUserId, presetOverride);
      if (detail !== null) {
        return { config: detail.config, presetId: presetOverride, presetName: detail.name };
      }
    }
    const { config, name } = await resolvePromptConfigFor(runAsUserId, defaultPresetId);
    return { config, presetId: config === DEFAULT_PROMPT_CONFIG ? null : (defaultPresetId as PresetId | null), presetName: name };
  };
  // The chat's active preset's ChoiceBlock variables, resolved under the chat's host. Hostless/stale room
  // ⇒ no declared variables.
  const resolvePromptVariables = async (chatId: ChatId): Promise<readonly ChoiceBlockSpec[]> => {
    const hostUserId = await deps.resolveHostUserId(chatId);
    if (hostUserId === null) {
      return [];
    }
    const us = await deps.loadUserSettings(hostUserId);
    const { config } = await resolvePromptConfigFor(hostUserId, us.seeds.defaultPresetId);
    return config.variables;
  };

  // The chat's active preset's authored USER MACROS (#24) — the picks pane's declaration half, resolved
  // under the chat's host exactly like `resolvePromptVariables` (its ChoiceBlock sibling). A feature preset
  // OVERRIDE is deliberately not applied: it is a per-turn redirect (the rpg GM voice) no pane read can
  // anticipate. Hostless/stale room ⇒ no declared macros.
  const resolvePromptUserMacros = async (chatId: ChatId): Promise<readonly UserMacroSpec[]> => {
    const hostUserId = await deps.resolveHostUserId(chatId);
    if (hostUserId === null) {
      return [];
    }
    const us = await deps.loadUserSettings(hostUserId);
    const { config } = await resolvePromptConfigFor(hostUserId, us.seeds.defaultPresetId);
    return config.userMacros;
  };

  // The chat's app-tier PROSE overrides, resolved under the chat's HOST (PROSE-1 owner-decision 8, option
  // (a) — the room's side generations read one stable voice, not the speaker-of-the-moment's). One home with
  // `resolvePromptVariables`: same host resolution, same hostless degrade — an
  // empty record, which resolves every slot to its shipped default (byte-identical to pre-PROSE-1).
  const resolveChatProse = async (chatId: ChatId): Promise<ProseOverrides> => {
    const hostUserId = await deps.resolveHostUserId(chatId);
    if (hostUserId === null) {
      return {};
    }
    return (await deps.loadUserSettings(hostUserId)).prose;
  };

  // The chat's PRESET-tier prose (PROSE-1 S4) — the rpg host doors' own resolution moment (see the field's
  // doc on `ChatComposeResult.rpgChatOps`). It walks the SAME ladder a game TURN walks, in the same order:
  // the GM-voice preset REDIRECT first (`input.rpg.resolvePresetOverride`, the early hop `buildTurnContext`
  // runs before its foreign read), then `resolvePromptConfigWithOverride`'s lenient resolve, then
  // `composeProse` by home. That sameness IS the inherited-preview rule: a host who edits a plane teach on
  // the table's GM preset sees the SAME bytes on a resync/populate that they see on a turn. Diverging here —
  // e.g. reading the host's default preset — is precisely the defect the `resolvePreviewInputs` GM redirect
  // was landed to fix, in a different jacket.
  // The room's preset as a TURN resolves it: the GM-voice redirect first, then the host's default.
  const resolveChatTurnPresetConfig = async (chatId: ChatId): Promise<PromptConfig | null> => {
    const hostUserId = await deps.resolveHostUserId(chatId);
    if (hostUserId === null) {
      return null;
    }
    const presetOverride = (await deps.rpg?.resolvePresetOverride(chatId)) ?? null;
    const us = await deps.loadUserSettings(hostUserId);
    return (await resolvePromptConfigWithOverride(hostUserId, presetOverride ?? undefined, us.seeds.defaultPresetId)).config;
  };
  const resolveChatPresetProse = async (chatId: ChatId): Promise<ProseOverrides> => {
    const config = await resolveChatTurnPresetConfig(chatId);
    return config === null ? {} : composeProse({ preset: config.prose });
  };
  // The room's preset generation params, by the SAME ladder the turn walks: every send on the chat connection outside
  // the turn (quiet generation and compaction, the host's resync and populate, the overflow notice) reads its sampling
  // and its Max context here, so it runs the window the turn sends. A hostless room degrades to the system default.
  const resolveChatPresetParams = async (chatId: ChatId): Promise<UserIntent> =>
    (await resolveChatTurnPresetConfig(chatId))?.params ?? DEFAULT_PROMPT_CONFIG.params;

  // The one memory-config merge: the admin-set defaults, forced to `mode:"off"` when the host disabled
  // memory. Kept pure so both the live turn path and the sweep resolver funnel through it without
  // re-reading settings — the opt-out can't be honored on the turn and dropped on the sweep.
  const withMemoryOptOut = (disabled: boolean, defaults: MemoryConfig): MemoryConfig => (disabled ? { ...defaults, mode: "off" } : defaults);
  const resolveMemoryConfig = async (hostUserId: UserId): Promise<MemoryConfig> => {
    const us = await deps.loadUserSettings(hostUserId);
    const defaults = deps.getEffectiveConfig().memoryDefaults;
    return withMemoryOptOut(us.memory.enabled === false, defaults);
  };

  const resolveTurnPersonas = createTurnPersonaResolver(deps.resolvePersonasForParticipants);
  return {
    resolvePromptVariables,
    resolvePromptUserMacros,
    resolveChatProse,
    resolveChatPresetProse,
    resolveChatPresetParams,
    resolveMemoryConfig,
    resolveTempChatTtlHours: async (userId) => (await deps.loadUserSettings(userId)).chat.tempChatTtlHours,
    resolveWelcomeAssistantId: async (userId): ReturnType<ChatRoomInputs["resolveWelcomeAssistantId"]> => {
      const id = (await deps.loadUserSettings(userId)).seeds.welcomeAssistantCharacterId;
      return id === null ? null : castId<CharacterId>(id);
    },
    readReactionDefaults: async (userId): ReturnType<ChatRoomInputs["readReactionDefaults"]> => {
      const us = await deps.loadUserSettings(userId);
      return { charactersCanReact: us.chat.charactersCanReact, reactionsEnabled: us.chat.reactionsEnabled };
    },
    resolveForeignInputs: async ({
      chatId,
      runAsUserId,
      anchorPersonaId,
      presentHumanUserIds,
      humanSeats,
      trigger,
      voice,
      presetOverride,
    }): ReturnType<ChatRoomInputs["resolveForeignInputs"]> => {
      const us = await deps.loadUserSettings(runAsUserId);

      // A feature-supplied GM-voice preset REDIRECT (docs/plans/rpg/design.md) wins over the host's default when it
      // resolves owned-or-system under the host; a stale/unowned override degrades to the host's normal default
      // (the lenient-id rule — never a broken turn). Absent ⇒ the host default (byte-identical to today).
      const { config: promptConfig, presetId, presetName } = await resolvePromptConfigWithOverride(runAsUserId, presetOverride, us.seeds.defaultPresetId);

      // THE ROOM-PLANE PERSONA READ (the multi-human widening). NOT `persona.get` under a host Principal:
      // that owner-scoped keyhole silently nulled every NON-HOST member's persona, so a member's own turn
      // rendered `{{user}}` as the kit floor "User" and a host-pinned member-owned anchor was a dead pin —
      // both violating FINAL-Persona §A.1 in exactly the multi-human room the D16/D18 spine exists for. The
      // persona domain's principal-less roster op resolves the room's ids in ONE gated read; chat supplies
      // the consent set (its PRESENT humans), so a departed member's persona resolves to nothing.
      const turnPersonas = await resolveTurnPersonas({ chatId, runAsUserId, anchorPersonaId, presentHumanUserIds, humanSeats, trigger, voice });

      const memoryConfig = withMemoryOptOut(us.memory.enabled === false, deps.getEffectiveConfig().memoryDefaults);

      return {
        promptConfig,
        // WAVE MU — the resolved preset id for user-macro source attribution (override id / host default / null).
        presetId,
        // #1754 — the SAME resolution's NAME, so the room's Regex section can say WHICH preset it is showing
        // (the GM redirect's on a game chat) instead of falling back to the viewer's own active preset.
        presetName,
        personas: turnPersonas,
        scanDepth: us.worldInfo.scanDepth,
        injectionTokenBudget: us.worldInfo.tokenBudget,
        memoryConfig,
        // The host's turn-behavior arm the engine honors (custom stops + auto-continue/auto-swipe).
        chatBehavior: {
          attachmentQuality: us.chat.attachmentQuality,
          autoContinue: us.chat.autoContinue,
          autoContinueRounds: us.chat.autoContinueRounds,
          autoSwipe: us.chat.autoSwipe,
          customStoppingStrings: us.chat.customStoppingStrings,
          // B1 — the host's per-user offer-choices DEFAULT; the room's own `chatMetadata.offerChoices`
          // overrides it at `resolveTeachingKnobs`. Under the frozen host (D19), like every other field here.
          offerChoices: us.chat.offerChoices,
          // B7 — the two reaction defaults, the same seam + meeting point (their room halves override at
          // `resolveTeachingKnobs`; the verb-time gates read them via `readReactionDefaults` above).
          charactersCanReact: us.chat.charactersCanReact,
          reactionsEnabled: us.chat.reactionsEnabled,
        },
        // DB6: the host's databank retrieval params (k/minScore/rerank) the gather passes to search.documents,
        // plus the {{databank}} slot budget — the FOREIGN-inputs seam (settings read chat delegates).
        databankRetrieval: us.databank.retrieval,
        databankSlotTokenBudget: us.databank.slotTokenBudget,
      };
    },
  };
}
