// domain/regex/contract/service — typed API surface: RegexContext (DI bundle) + RegexService (verb
// interface). The regex SCRIPT LIBRARY (D121-E): owner-authored find/replace scripts, attached at
// global/character/preset/chat scopes for the chat turn's host-tier resolver to union. Every owner-scoped
// verb gates on principal.userId (ownership is the gate).
//
// The chat scope is membership-scoped (D18 — no chats.ownerId); its guards (requireChatHost/Member) arrive
// as injected ops from chat's own guards, wired at the composition root (the world-info PD-30 shape).

import type { Principal } from "@orb/contracts/identity";
import type { EmitUserEvent } from "@orb/contracts/user-bus";
import type { Db } from "@orb/db";
import type { ChatId, RegexScriptId } from "@orb/kit/ids";
import type { AuditEntry } from "#foundation/observability";
import type {
  ApplyScopeOrderParams,
  AttachGlobalParams,
  AttachToCharacterParams,
  AttachToChatParams,
  AttachToPresetParams,
  CreateScriptParams,
  DetachFromCharacterParams,
  DetachFromChatParams,
  DetachFromPresetParams,
  DetachGlobalParams,
  DuplicateScriptParams,
  GetScriptParams,
  ListForCharacterParams,
  ListForChatParams,
  ListForPresetParams,
  ListGlobalParams,
  ListRoomDisplayScriptsParams,
  ListScriptsParams,
  ListScriptUsageParams,
  RemoveScriptParams,
  UpdateScriptParams,
} from "./params";
import type { ResolveVisibleRooms, RoomDisplayPolicy } from "./resolve";
import type { DetachResult, RemoveResult, ReorderResult } from "./results";
import type { RegexScriptRow, RegexScriptUsage } from "./views";

/** DI bundle every regex verb closes over. Chat-scope guards are injected from chat itself. */
export interface RegexContext {
  readonly db: Db;
  readonly now: () => number;
  readonly newScriptId: () => RegexScriptId;
  readonly audit: (entry: AuditEntry, at: number) => Promise<void>;
  readonly requireChatHost: (principal: Principal, chatId: ChatId) => Promise<void>;
  readonly requireChatMember: (principal: Principal, chatId: ChatId) => Promise<void>;
  /** D121-E display-tier room OPTION (owner ruling 2026-08-02): resolve WHOSE display scripts this room
   *  broadcasts. Injected from chat because both halves are chat's data — the room's host seat and the
   *  `chatMetadata.hostDisplayScripts` flag. Regex reads neither the roster nor chat metadata itself (the
   *  same posture as the guards above). `enabled:false` ⇒ the per-user default, and `listRoomDisplayScripts`
   *  returns nothing at all. */
  readonly resolveRoomDisplayPolicy: (chatId: ChatId) => Promise<RoomDisplayPolicy>;
  /** The REVERSE-roster room filter (`listScriptUsage`) — chat's answer to "of these rooms, which may this
   *  caller see, and what are they called". Injected for the same reason the guards are: D18 rooms scope on
   *  `chat_participants`, and regex reads neither the roster nor `chats`. */
  readonly resolveVisibleRooms: ResolveVisibleRooms;
  /** Live-freshness invalidation. O-7 arm (a): the library is a low-churn owner surface, so ONE
   *  `regexChanged` user event carries every mutation; FK CASCADE + the D50 no-deletion-events discipline
   *  carry the rest. There are no per-entity bus events. */
  readonly emitUserEvent: EmitUserEvent;
}

export interface RegexService {
  /** The caller's library, newest first. */
  readonly listScripts: (params: ListScriptsParams) => Promise<RegexScriptRow[]>;
  readonly getScript: (params: GetScriptParams) => Promise<RegexScriptRow>;
  readonly createScript: (params: CreateScriptParams) => Promise<RegexScriptRow>;
  readonly updateScript: (params: UpdateScriptParams) => Promise<RegexScriptRow>;
  /** DB CASCADE clears every junction row. */
  readonly removeScript: (params: RemoveScriptParams) => Promise<RemoveResult>;
  /** Copies a script into a fresh "<name> (copy)" row, unattached at every scope. */
  readonly duplicateScript: (params: DuplicateScriptParams) => Promise<RegexScriptRow>;
  /** The REVERSE rosters — which presets/characters/rooms attach ONE owned script (the library context
   *  pane's "where does this already run"). Owner-gated on the script; rooms membership-scoped (D18). */
  readonly listScriptUsage: (params: ListScriptUsageParams) => Promise<RegexScriptUsage>;

  /** Marks a script global (runs in every chat the owner hosts). Gate is plain script ownership. */
  readonly attachGlobal: (params: AttachGlobalParams) => Promise<void>;
  readonly detachGlobal: (params: DetachGlobalParams) => Promise<DetachResult>;
  readonly listGlobal: (params: ListGlobalParams) => Promise<RegexScriptRow[]>;

  readonly attachToCharacter: (params: AttachToCharacterParams) => Promise<void>;
  readonly detachFromCharacter: (params: DetachFromCharacterParams) => Promise<DetachResult>;
  readonly listForCharacter: (params: ListForCharacterParams) => Promise<RegexScriptRow[]>;

  readonly attachToPreset: (params: AttachToPresetParams) => Promise<void>;
  readonly detachFromPreset: (params: DetachFromPresetParams) => Promise<DetachResult>;
  readonly listForPreset: (params: ListForPresetParams) => Promise<RegexScriptRow[]>;

  /** Host authority — a room-wide text transform is a one-shot jailbreak surface (the `chat_books` rule). */
  readonly attachToChat: (params: AttachToChatParams) => Promise<void>;
  readonly detachFromChat: (params: DetachFromChatParams) => Promise<DetachResult>;
  /** Room-public, not owner-filtered — the room's set is what every member's turns assemble against. */
  readonly listForChat: (params: ListForChatParams) => Promise<RegexScriptRow[]>;

  /** The room's BROADCAST display set (D121-E host option). Member-readable: any present member needs it to
   *  render the transcript the way the host intends. Returns the HOST's enabled DISPLAY-placement scripts
   *  when the room opted in, and `[]` otherwise — so the OFF arm is byte-identical to a room that never
   *  heard of the option, and a member can never learn what scripts the host owns while it is off. */
  readonly listRoomDisplayScripts: (params: ListRoomDisplayScriptsParams) => Promise<RegexScriptRow[]>;

  /** Rewrite one scope's execution order (position 0 runs first). Authority is that scope's own gate. */
  readonly applyScopeOrder: (params: ApplyScopeOrderParams) => Promise<ReorderResult>;
}
