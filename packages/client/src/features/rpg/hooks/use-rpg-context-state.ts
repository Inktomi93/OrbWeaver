// The rpg CONTEXT-panel projection hook (client-architecture-lockdown.md §6b; Context-Panel-Program §4.1)
// — resolves the active game chat into the takeover's panel state, or `null` when the chat carries no game.
// The takeover is APPLICABILITY (§4.1): it renders only when `chat.rpg !== null` (the pointer already on
// `chat.getChat`, read off data the panel already holds — no per-chat probe on every switch). When a game
// exists, the mode/read-only trim (`rpg.getGame`) + the whole tracker aggregate (`rpg.getTrackerView`)
// suspense-fetch together, both keyed by `chatId`. Both reads run `staleTime: Infinity` under the query
// client default — the rpg bus (`use-rpg-bus.ts`) is their freshness driver.
//
// All reads are unconditional (rules-of-hooks). The `useSuspenseQueries` dynamic-array idiom (the
// `use-chat-context-state.ts` precedent) suspends ONLY when a game is present — a `null`-on-pending would
// flash the placeholder (a lying state). SELF-CONTAINED (lockdown §12): the hook takes only `chatId` and
// re-reads `chat.getChat` ITSELF (cache-first, deduped — chat already holds it), deriving the pointer AND
// the viewer identity (`viewerUserId`/`viewerIsHost`) from that ONE cross-domain read — it imports NOTHING
// from `features/chat` and never widens chat's client projection.

import type { RpgGameView, RpgTrackerView } from "@orb/contracts/rpg";
import { isRpgEngaged } from "@orb/contracts/rpg";
import type { ChatId, UserId } from "@orb/kit/ids";
import { useQuery, useSuspenseQueries } from "@tanstack/react-query";
import { useTRPC } from "#data";
import { deriveChatTitle } from "#lib";
import { useRpgRoundPending } from "#state";

/** The resolved takeover panel state the game tabs + header render. `null` (from the hook) ⇒ this chat is
 *  not a game (the tab's `when` hides it). `viewerUserId`/`isHost` are derived from the SAME `chat.getChat`
 *  cross-domain read; the game reads supply `game`/`tracker`. `canEditShared` folds the honest-arms + host
 *  gate the shared-plane edits (snapshot/quest/widget — host-only in v1) obey; `viewerUserId` lets the Sheet
 *  tab offer the member-own edit arm (`patchSheet` allows a member their own `user` ref). */
export interface RpgPanelState {
  readonly chatId: ChatId;
  /** The ROOM's rendered name — the same `deriveChatTitle` derivation the topbar identity and the chat
   *  band use, so a game room is named identically wherever it is named (#875 F3, 2026-08-30: the game
   *  band printed the scene LOCATION where the other two bands print the artifact, so a docked game room
   *  had no heading at all and the two strings on screen at 1024 disagreed). */
  readonly roomTitle: string;
  readonly viewerUserId: UserId;
  readonly isHost: boolean;
  readonly game: RpgGameView;
  readonly tracker: RpgTrackerView;
  /** The cached tracker is being replaced after a bus or swipe invalidation. The old value may still render
   *  during that fetch, so freshness UI must not call it current until the replacement lands. */
  readonly trackerRefreshing: boolean;
  /** Shared-plane HAND edits (snapshot/quest/widget) are enabled for a host — INDEPENDENT of
   *  `trackersReadOnly` (D108 manual-steering, owner-confirmed 2026-07-28): `trackersReadOnly` gates the
   *  MODEL-write path ONLY; when the model can't write trackers the host hand-edits every plane (the pill
   *  "edit them by hand" is the affordance, not a lock). Conflating the two disabled the exact recovery the
   *  read-only state exists to enable. */
  readonly canEditShared: boolean;
  /** Does the game tab's BODY hold the satellite row instead of the head band (#878 F7)? See
   *  {@link SATELLITES_TO_BODY_FONT_SCALE}. ONE derivation, read by both mounts, so the row can never be
   *  in both places or in neither. */
  readonly satellitesInBody: boolean;
}

/** THE TYPE SCALE AT WHICH THE ORBS LEAVE THE BAND (#878 F7, owner-ruled 2026-08-30).
 *
 *  MEASURED at the `reading` appearance preset, 1280×800, the game room: band 299 + rails 256 = 555 of the
 *  pane's 740px, leaving the viewport 184px — 24.9%, against the ≥40% the review asked for. The band is
 *  where the budget goes, and the satellite row is the one part of it that is a GLANCE rather than the
 *  artifact's identity — so at a large type scale it moves into the tab body and scrolls with the content
 *  instead of standing permanently over it. The Waystone (dial · sky · weather · the when-line · the cues)
 *  stays in the band, untouched, per the same ruling.
 *
 *  KEYED ON `fontScale`, WHICH IS THE CAUSE, NOT ON A MEASUREMENT OF THE BAND. A measured "is the band too
 *  tall" condition would be circular — moving the row shrinks the band, which un-trips the condition, which
 *  moves it back — and a layout oscillation is a worse defect than the one being fixed. `fontScale` is a
 *  user knob that does not depend on the band's own layout, and it is what the `reading` preset moves
 *  (1.25, the only preset that touches it; the schema's range is 0.8-1.5, default 1). So the rule states
 *  itself honestly: at a large type scale, the pane spends its height on the reading, not on the glance. */
const SATELLITES_TO_BODY_FONT_SCALE = 1.25;
/** The appearance schema's own born value (`appearanceSchema.fontScale`) — what a pending read answers as. */
const DEFAULT_FONT_SCALE = 1;

/** Resolve the active game chat into its takeover panel state, or `null` when the chat is not a game.
 *  Fully self-contained: reads `chat.getChat` (cache-first) for the pointer + viewer identity, then the two
 *  rpg reads. Suspends only once a game is confirmed present. */
export function useRpgContextState(chatId: ChatId): RpgPanelState | null {
  const trpc = useTRPC();
  const roundPending = useRpgRoundPending(chatId);
  // The type scale, for the #878 F7 satellite home. A plain `useQuery` on the SHARED data layer, never an
  // import from `features/app-shell`'s `useAppearance` — a sideways feature import is banned, and this hook's
  // own header rule is that it is self-contained.
  const { data: settings } = useQuery(trpc.settings.getUserSettings.queryOptions());
  // The chat detail read — the cross-domain source of the rpg pointer AND the viewer identity (cache-first;
  // chat already holds this query). Always present (the panel is inside a committed chat), so single-element.
  const [chatQuery] = useSuspenseQueries({
    queries: [trpc.chat.getChat.queryOptions({ chatId })],
  });
  const chat = chatQuery.data;
  // #40 — a DISENGAGED game (pointer engaged:false) collapses the takeover exactly like a non-game chat
  // (the panel hides; the rows are preserved for re-enable).
  const isGame = isRpgEngaged(chat.rpg ?? null);

  // The two game reads fire ONLY when the pointer says this chat is a game (the dynamic-array idiom — an
  // empty array suspends on nothing, so a non-game chat never round-trips rpg).
  const gameQueries = useSuspenseQueries({
    queries: (isGame ? [chatId] : []).map((id) => trpc.rpg.getGame.queryOptions({ chatId: id })),
  });
  const trackerQueries = useSuspenseQueries({
    queries: (isGame ? [chatId] : []).map((id) => trpc.rpg.getTrackerView.queryOptions({ chatId: id })),
  });

  const gameQuery = gameQueries[0];
  const trackerQuery = trackerQueries[0];
  if (!isGame || gameQuery === undefined || trackerQuery === undefined) {
    return null;
  }
  // Annotate the two game reads: the dynamic-array `useSuspenseQueries` idiom (a conditionally-sized query
  // array) can't infer element types, so `.data` degrades to `any` — pin them to their contract types so
  // `game.trackersReadOnly` is a real boolean (strict-boolean-expressions) and the panel state stays typed.
  const game: RpgGameView = gameQuery.data;
  const tracker: RpgTrackerView = trackerQuery.data;
  const isHost = chat.viewerIsHost === true;
  return {
    chatId,
    // The npc half is filtered inline rather than through chat's own `filterCharacters`: rpg imports
    // NOTHING from `features/chat` (this hook's own self-containment rule), and the predicate is one line
    // over a `contracts` shape. The DERIVATION is the shared one (`deriveChatTitle`), which is the part
    // that must not fork.
    roomTitle: deriveChatTitle(
      chat.title,
      chat.participants.filter((p) => p.kind === "character").map((p) => p.displayName),
    ),
    viewerUserId: chat.viewerUserId,
    isHost,
    game,
    tracker,
    trackerRefreshing: roundPending || trackerQuery.isFetching,
    // D108: hand edits are NOT gated by trackersReadOnly (that gates the MODEL write path only) — a host
    // hand-edits the shared plane whether or not the model can write it.
    canEditShared: isHost,
    // Cache-first and NEVER suspending on its own account (the `chat-context-band.tsx` precedent for the
    // same read): while the settings response is on its way the answer is the DEFAULT scale, so the band
    // keeps the row — today's behaviour — rather than flashing it out and back.
    satellitesInBody: (settings?.config.appearance.fontScale ?? DEFAULT_FONT_SCALE) >= SATELLITES_TO_BODY_FONT_SCALE,
  };
}
