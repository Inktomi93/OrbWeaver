// domain/regex/contract/params — every verb's *Params, declared ONCE. Every verb carries the resolved
// principal; ownership scopes off principal.userId, never a users read. The CHAT scope's authority is the
// injected chat-guard ops (requireChatHost for attach/detach, requireChatMember for list) — regex never
// reads the chat roster itself (the world-info precedent).

import type { Principal } from "@orb/contracts/identity";
import type { CreateRegexScriptInput, RegexAttachScope, UpdateRegexScriptInput } from "@orb/contracts/regex";
import type { CharacterId, ChatId, PresetId, RegexScriptId } from "@orb/kit/ids";
import type { RegexPass, RegexTarget } from "@orb/kit/regex";

interface RegexActorParams {
  readonly principal: Principal;
}

export interface ListScriptsParams extends RegexActorParams {}

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
// Every one takes an ID LIST and a single target value: the operations are exactly the ones a selection can
// mean for a whole library, including both behavior axes at once.

/** Switch many owned scripts on or off. Foreign/absent ids are silently dropped (see the persistence note). */
export interface BulkSetScriptsEnabledParams extends RegexActorParams {
  readonly scriptIds: readonly RegexScriptId[];
  readonly enabled: boolean;
}

/** REPLACE both axes of many owned scripts. The router has already paired them as a write pairs them; each row
 *  keeps its own find/replace, and its depth and author scope while it stays on an ephemeral pass. Foreign or
 *  absent ids are silently dropped, as the other bulk verbs do. */
export interface BulkSetScriptsAxesParams extends RegexActorParams {
  readonly scriptIds: readonly RegexScriptId[];
  readonly targets: readonly RegexTarget[];
  readonly passes: readonly RegexPass[];
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

/** The REVERSE-roster read: which carriers attach ONE owned script. Owner-gated: a
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

/** Rewrite the execution ORDER of one scope's attachments. Position 0 runs FIRST (the executor applies its
 *  input list in order). An omitted attachment keeps its position. Foreign/stale ids that match no junction row
 *  are dropped in the scope arms; the GLOBAL arm PRE-GATES ownership of every id (the tier has no scope row of
 *  its own), so a script the caller does not own is `RegexNotFoundError`, never a silent reorder. */
export interface ApplyScopeOrderParams extends RegexActorParams {
  /** WHICH scope an order rewrite addresses. A discriminated ref rather than four verbs: the ordering operation is
   *  identical across scopes (only the junction table differs), where attach/detach differ in their AUTHORITY (owner
   *  vs the chat membership chain). */
  readonly scope: RegexAttachScope;
  readonly orderedScriptIds: readonly RegexScriptId[];
}
