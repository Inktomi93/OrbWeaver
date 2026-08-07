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

// ── The BULK params (REGX2 · the library's multi-select bar) ──────────────────────────────────────────
// Every one takes an ID LIST and no other target: the operations are exactly the ones a selection can mean
// for a whole library. `placement` is deliberately NOT among them — the display/prompt tier flags and the
// `historyDepth` scope are DERIVED from a placement set at ONE write boundary (the owner-ratified X-1/X-2
// ruling, `client/features/regex/lib/derive-tier-flags.ts`), and a server-side placement bulk would be a
// second derivation home. It unblocks when that derivation lands beside the masks it mirrors in
// `@orb/kit/regex`; until then a placement change stays the per-script editor's.

/** Switch many owned scripts on or off. Foreign/absent ids are silently dropped (see the persistence note). */
export interface BulkSetScriptsEnabledParams extends RegexActorParams {
  readonly scriptIds: readonly RegexScriptId[];
  readonly enabled: boolean;
}

/** Add or clear the GLOBAL attachment for many owned scripts. Attaching APPENDS in the order given, so a
 *  bulk make-global never renumbers the tier the owner already authored. */
export interface BulkSetScriptsGlobalParams extends RegexActorParams {
  readonly scriptIds: readonly RegexScriptId[];
  readonly global: boolean;
}

/** Delete many owned scripts. The DB CASCADE clears every junction row, as the single verb's does. */
export interface BulkRemoveScriptsParams extends RegexActorParams {
  readonly scriptIds: readonly RegexScriptId[];
}

/** The single-entity EXPORT door (REGX2 · D121-D `kebab=Export`). Owner-gated; a foreign/absent id returns
 *  `null` rather than throwing — "not yours" and "doesn't exist" are one answer (the `exportBook` posture). */
export interface ExportScriptParams extends RegexActorParams {
  readonly scriptId: RegexScriptId;
}

/** The single-entity IMPORT door (REGX2 · D121-D `band=Import`). One portable `regex/*.json`'s text, through
 *  the SAME verb the backup bundle's descriptor calls. */
export interface ImportScriptFileParams extends RegexActorParams {
  readonly fileText: string;
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
