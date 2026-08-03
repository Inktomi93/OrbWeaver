// domain/regex/contract/params — every verb's *Params, declared ONCE. Every verb carries the resolved
// principal; ownership scopes off principal.userId, never a users read. The CHAT scope's authority is the
// injected chat-guard ops (requireChatHost for attach/detach, requireChatMember for list) — regex never
// reads the chat roster itself (the world-info PD-30 precedent).

import type { Principal } from "@orb/contracts/identity";
import type { CreateRegexScriptInput, RegexAttachScope, UpdateRegexScriptInput } from "@orb/contracts/regex";
import type { CharacterId, ChatId, PresetId, RegexScriptId } from "@orb/kit/ids";

interface RegexActorParams {
  readonly principal: Principal;
}

export interface ListScriptsParams extends RegexActorParams {}

export interface GetScriptParams extends RegexActorParams {
  readonly scriptId: RegexScriptId;
}

export interface CreateScriptParams extends RegexActorParams {
  readonly input: CreateRegexScriptInput;
}

export interface UpdateScriptParams extends RegexActorParams {
  readonly scriptId: RegexScriptId;
  readonly input: UpdateRegexScriptInput;
}

export interface RemoveScriptParams extends RegexActorParams {
  readonly scriptId: RegexScriptId;
}

export interface DuplicateScriptParams extends RegexActorParams {
  readonly scriptId: RegexScriptId;
}

/** The REVERSE-roster read: which carriers attach ONE owned script. Same gate as `getScript` — a
 *  foreign/absent script is `RegexNotFoundError`, so the read can never enumerate someone else's shelf. */
export interface ListScriptUsageParams extends RegexActorParams {
  readonly scriptId: RegexScriptId;
}

export interface AttachGlobalParams extends RegexActorParams {
  readonly scriptId: RegexScriptId;
}

export interface DetachGlobalParams extends RegexActorParams {
  readonly scriptId: RegexScriptId;
}

export interface ListGlobalParams extends RegexActorParams {}

export interface AttachToCharacterParams extends RegexActorParams {
  readonly characterId: CharacterId;
  readonly scriptId: RegexScriptId;
}

export interface DetachFromCharacterParams extends RegexActorParams {
  readonly characterId: CharacterId;
  readonly scriptId: RegexScriptId;
}

export interface ListForCharacterParams extends RegexActorParams {
  readonly characterId: CharacterId;
}

export interface AttachToPresetParams extends RegexActorParams {
  readonly presetId: PresetId;
  readonly scriptId: RegexScriptId;
}

export interface DetachFromPresetParams extends RegexActorParams {
  readonly presetId: PresetId;
  readonly scriptId: RegexScriptId;
}

export interface ListForPresetParams extends RegexActorParams {
  readonly presetId: PresetId;
}

export interface AttachToChatParams extends RegexActorParams {
  readonly chatId: ChatId;
  readonly scriptId: RegexScriptId;
}

export interface DetachFromChatParams extends RegexActorParams {
  readonly chatId: ChatId;
  readonly scriptId: RegexScriptId;
}

export interface ListForChatParams extends RegexActorParams {
  readonly chatId: ChatId;
}

/** The room's BROADCAST display set (D121-E host option). MEMBER-gated, not owner-gated: the point is
 *  that a NON-host viewer reads the HOST's scripts, which is exactly why the room must have opted in. */
export interface ListRoomDisplayScriptsParams extends RegexActorParams {
  readonly chatId: ChatId;
}

/** Rewrite the execution ORDER of one scope's attachments. Position 0 runs FIRST (the executor applies its
 *  input list in order). Stale/foreign ids are silently dropped; an omitted attachment keeps its position. */
export interface ApplyScopeOrderParams extends RegexActorParams {
  readonly scope: RegexAttachScopeRef;
  readonly orderedScriptIds: readonly RegexScriptId[];
}

/** WHICH scope an order rewrite addresses — the ONE spelling, from `@orb/contracts/regex`. A discriminated
 *  ref rather than four verbs: the ordering operation is identical across scopes (only the junction table
 *  differs), where attach/detach differ in their AUTHORITY (owner vs the chat membership chain). */
export type RegexAttachScopeRef = RegexAttachScope;
