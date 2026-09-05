// domain/regex/contract/resolve — the SCOPE-RESOLUTION op the chat turn consumes (D121-E). This is the seam
// that replaced the three embed-by-value carriers: instead of chat reading `us.regex.scripts` +
// `promptConfig.regexScripts` + `card.regexScripts` off three blobs, ONE injected op dereferences the four
// scope junctions and hands back the four ordered slices. Chat still owns the UNION (source order + the
// dedup is a chat-assembly decision, `substrate/regex-tier`) — this op resolves, it never unions.
//
// PRINCIPAL-LESS BY CONSTRUCTION (the standalone-factory class): every argument is already an id the CALLER
// gated. `ownerId` is the turn's frozen `runAsUserId` (D19 — the host, never the calling member), which is
// exactly why a non-host member cannot contribute: they have no parameter on this surface. The chat scope
// is not owner-filtered (a room's attached scripts are room-public prompt content, membership is the
// caller's gate) — the `listChatBooks` precedent.

import type { CharacterRegexSlice } from "@orb/contracts/chat";
import type { RegexScriptRow } from "@orb/contracts/regex";
import type { Db } from "@orb/db";
import type { CharacterId, ChatId, PresetId, UserId } from "@orb/kit/ids";

/** The DI bundle `createResolveRegexSources` closes over. Pure owner-scoped reads — no clock/id/audit. */
export interface RegexResolveContext {
  readonly db: Db;
}

/** Which scopes to dereference for one turn. Every field is already caller-gated (see the header). */
export interface ResolveRegexSourcesArgs {
  /** The turn's frozen `runAsUserId` — the host. Gates the global/preset/character slices. */
  readonly ownerId: UserId;
  /** The chat's resolved active preset, or null when the system `DEFAULT_PROMPT_CONFIG` stood in. */
  readonly presetId: PresetId | null;
  /** The present characters, IN ROSTER ORDER (the character slice concatenates per character in this order). */
  readonly characterIds: readonly CharacterId[];
  /** The room. Room-public scope — not owner-filtered. */
  readonly chatId: ChatId;
}

/** The four resolved slices, each already ordered by its junction `position`. The consumer (chat's
 *  `resolveHostTierRegexScripts`) concatenates global → preset → character (per seat, roster order) → chat,
 *  drops the tiers this room switched off, and dedupes by row id. */
export interface ResolvedRegexSources {
  readonly hostGlobal: readonly RegexScriptRow[];
  readonly preset: readonly RegexScriptRow[];
  /** PER SEAT, in roster order — not one flat list (#1742/F3). Each seated character is its own TIER: its
   *  own per-chat allow flag, its own group in the room's Regex section, its own lever. A flat list made
   *  "whose rows are these" unanswerable downstream, so the regroup this op already performs is now KEPT
   *  instead of being immediately discarded by a `flatMap`. Concatenating the slices in array order
   *  reproduces the old value exactly. */
  readonly character: readonly CharacterRegexSlice[];
  readonly chat: readonly RegexScriptRow[];
}

export type ResolveRegexSources = (args: ResolveRegexSourcesArgs) => Promise<ResolvedRegexSources>;

/** WHOSE display scripts a room broadcasts (D121-E host option) — chat's answer, injected. `enabled:false`
 *  is the default and the byte-identical arm; `hostUserId` is null for a hostless (archived orphan) room,
 *  which also resolves to broadcasting nothing. */
export interface RoomDisplayPolicy {
  readonly enabled: boolean;
  readonly hostUserId: UserId | null;
}

// THE REVERSE-ROSTER ROOM FILTER MOVED OUT OF THIS FILE (2026-08-19). It was `ResolveVisibleRooms`, declared
// here because regex was its only consumer; databank's "Active in" doors (#276) and the preset CONTEXT's
// backward bindings (#279) made it three, which is the one-home threshold. The shape + the op type are
// `@orb/contracts/chat`'s `VisibleRoomRef` / `ResolveVisibleRoomsOp` (rooms are chat's concept, D18) and the
// ONE runtime is `entry/compose/visible-rooms.ts`. regex still DECLARES the op it needs — the DI slot is on
// `RegexContext` (`contract/service.ts`), typed by the contracts name; nothing here re-spells it.
