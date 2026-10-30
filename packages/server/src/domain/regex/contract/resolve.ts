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

import type { Db } from "@orb/db";

/** The DI bundle `createResolveRegexSources` closes over. Pure owner-scoped reads — no clock/id/audit. */
export interface RegexResolveContext {
  readonly db: Db;
}

// THE REVERSE-ROSTER ROOM FILTER MOVED OUT OF THIS FILE (2026-08-19). It was `ResolveVisibleRooms`, declared
// here because regex was its only consumer; databank's "Active in" doors (#276) and the preset CONTEXT's
// backward bindings (#279) made it three, which is the one-home threshold. The shape + the op type are
// `@orb/contracts/chat`'s `VisibleRoomRef` / `ResolveVisibleRoomsOp` (rooms are chat's concept, D18) and the
// ONE runtime is `entry/compose/visible-rooms.ts`. regex still DECLARES the op it needs — the DI slot is on
// `RegexContext` (`contract/service.ts`), typed by the contracts name; nothing here re-spells it.
