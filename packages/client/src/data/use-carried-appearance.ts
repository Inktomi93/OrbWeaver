// `useCarriedAppearanceCast` — the ONE client read of "whose card dresses this room", resolved for BOTH
// chat phases.
//
// THE BUG IT EXISTS TO KILL (owner dogfood 2026-08-06 — "character backgrounds and avatars also dont show
// up until the first message"): the carried look — the app-root background (BG-C) and the room-theme
// takeover (D44 §12.1) — was resolved from `chat.getChat`'s roster, which a DRAFT does not have. Every
// consumer therefore gated the card's appearance on a committed chat id, so a brand-new chat wore the
// viewer's default chrome and re-skinned itself the instant the first message created the row. The cast a
// draft can honestly produce is its FOUNDING CARDS plus the viewer's own single seat, and that is exactly
// what `CarriedAppearanceCast` models — so both arms resolve through the SAME
// `resolveCarriedTheme`/`resolveCarriedBackgroundForCast` rules in `@orb/contracts/chat`.
//
// It lives in `#data` rather than `features/chat` because it has consumers in TWO features — the chat room
// (theme) and the app shell (background) — and features cannot import each other (the `useDisplayScripts`
// precedent, same reasoning).
//
// NON-SUSPENDING on every arm: appearance is decoration. An unresolved or errored read reports `undefined`,
// which every consumer maps to "the viewer's own chrome" — the pre-fix behavior. It must never block or
// error a room, and it must never suspend a shell.

import type { CarriedAppearanceCast, CarriedAppearanceMember } from "@orb/contracts/chat";
import { carriedCastFromParticipants } from "@orb/contracts/chat";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import { useTRPC } from "./trpc.ts";
import { useDraftCastCards } from "./use-draft-cast-cards.ts";
import { useGatedQuery } from "./use-gated-query.ts";

/** A pre-send draft's human seats: the viewer, alone. An invite can only land once the chat row exists, so
 *  a draft is single-human BY CONSTRUCTION — the same composition its `startChat` will create. */
const DRAFT_HUMAN_SEATS = 1;

/** The frozen "not a draft" cast ref — a stable identity so the committed arm never churns the resolver's
 *  query list (the selector-stability floor, UI-Gates §7 row 4). */
const NO_DRAFT_CAST: readonly CharacterId[] = Object.freeze([]);

/**
 * The carried-appearance cast for the room a caller is showing.
 *
 * @param chatId - the COMMITTED chat, or `null` for a draft/landing (the discriminant, exactly as the
 *   message-list surface uses it — a draft never reads canon or a roster).
 * @param draftCharacterIds - the DRAFT's founding cast (`resolveDraftCharacterIds`); ignored when
 *   `chatId` is non-null, and empty for a blank draft.
 * @returns `undefined` while nothing is resolvable (landing, a blank draft, an unsettled or failed read) —
 *   the "viewer's own chrome" floor.
 */
export function useCarriedAppearanceCast(chatId: ChatId | null, draftCharacterIds: readonly CharacterId[]): CarriedAppearanceCast | undefined {
  const trpc = useTRPC();
  const { data: chat } = useGatedQuery(chatId, (id) => trpc.chat.getChat.queryOptions({ chatId: id }));
  // The draft arm reads the founding CARDS themselves, LIST-FIRST (`useDraftCastCards`). It used to read N
  // cold `character.get` entries directly, and — because the gate below is all-or-nothing — the whole carried
  // look waited on the SLOWEST of them: measured, a fresh draft rendered ~2s of the viewer's own chrome
  // before snapping to the card's theme and background (side-eye 2026-08-07 §④ P2). The picker one frame
  // earlier had already fetched exactly these cards' `themeOverride` and `backgroundOverride` under
  // `character.list`, so the resolver now answers from whatever list page is warm and lets `character.get`
  // take over as the authority when it lands. The all-or-nothing gate is UNCHANGED, and so is what it
  // protects — it just stops being the thing that makes a resolvable draft wait.
  const cards = useDraftCastCards(chatId === null ? draftCharacterIds : NO_DRAFT_CAST);

  if (chatId !== null) {
    return chat === undefined ? undefined : carriedCastFromParticipants(chat.participants);
  }
  if (draftCharacterIds.length === 0) {
    return;
  }
  // ALL-OR-NOTHING on the draft arm: a partially-loaded cast would momentarily read as true-solo and flash
  // the first card's background onto what is actually a group draft.
  const characters: CarriedAppearanceMember[] = [];
  for (const card of cards) {
    if (card === undefined) {
      return;
    }
    characters.push({
      displayName: card.name,
      themeOverride: card.themeOverride,
      backgroundOverride: card.backgroundOverride,
    });
  }
  return { humanCount: DRAFT_HUMAN_SEATS, characters };
}
