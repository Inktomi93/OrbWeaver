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
import { useQueries } from "@tanstack/react-query";
import { useTRPC } from "./trpc.ts";
import { useGatedQuery } from "./use-gated-query.ts";

/** A pre-send draft's human seats: the viewer, alone. An invite can only land once the chat row exists, so
 *  a draft is single-human BY CONSTRUCTION — the same composition its `startChat` will create. */
const DRAFT_HUMAN_SEATS = 1;

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
  // The draft arm reads the founding CARDS themselves — the same `character.get` entries the greeting
  // preview already suspends on, so this is a warm cache hit inside a room and one cheap read outside it.
  const cards = useQueries({
    queries: (chatId === null ? draftCharacterIds : []).map((characterId) => ({
      ...trpc.character.get.queryOptions({ characterId }),
      // Decoration: a slow/failed card must degrade to no-takeover, never throw into a shell's boundary.
      throwOnError: false,
    })),
  });

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
    if (card.data === undefined) {
      return;
    }
    characters.push({
      displayName: card.data.name,
      themeOverride: card.data.themeOverride,
      backgroundOverride: card.data.backgroundOverride,
    });
  }
  return { humanCount: DRAFT_HUMAN_SEATS, characters };
}
