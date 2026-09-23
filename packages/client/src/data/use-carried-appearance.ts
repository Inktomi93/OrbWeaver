// `useCarriedAppearance` — the ONE client read of "whose card dresses this room".
//
// THE BUG IT EXISTS TO KILL (owner dogfood 2026-08-06 — "character backgrounds and avatars also dont show
// up until the first message"): the carried look — the app-root background (BG-C) and the room-theme
// takeover (D44 §12.1) — was resolved from `chat.getChat`'s roster, and a pre-send room did not have one, so
// a brand-new chat wore the viewer's default chrome and re-skinned itself the instant the first message
// created the row.
//
// IT IS ONE ARM NOW (D166). The fix used to be a second,
// draft-phase resolver over the founding CARDS, because the room had no row until the first send. The room
// has a row from the creation CLICK, and `useStartChat` SEEDS `chat.getChat` from `startChat`'s own response
// — so the roster this reads is warm on the room's first frame, with zero extra reads. The card-reading arm
// (and `useDraftCastCards`, the list-first peek built to make it fast) is deleted: it answered a question
// that can no longer be asked.
//
// It lives in `#data` rather than `features/chat` because it has consumers in TWO features — the chat room
// (theme) and the app shell (background) — and features cannot import each other (the `useDisplayScripts`
// precedent, same reasoning).
//
// NON-SUSPENDING: appearance is decoration. An unresolved or errored read reports `undefined`, which every
// consumer maps to "the viewer's own chrome". It must never block or error a room, and never suspend a shell.

import type { CarriedAppearance } from "@orb/contracts/chat";
import { carriedAppearanceFromParticipants } from "@orb/contracts/chat";
import type { ChatId } from "@orb/kit/ids";
import { useTRPC } from "./trpc.ts";
import { useGatedQuery } from "./use-gated-query.ts";

/**
 * The carried appearance for the room a caller is showing — the room composition the carried-appearance
 * rules read (`CarriedAppearance`, vocabulary-map row "the room composition…").
 *
 * @param chatId - the open chat, or `null` for the landing.
 * @returns `undefined` while nothing is resolvable (landing, an unsettled or failed read) — the "viewer's
 *   own chrome" floor.
 */
export function useCarriedAppearance(chatId: ChatId | null): CarriedAppearance | undefined {
  const trpc = useTRPC();
  const { data: chat } = useGatedQuery(chatId, (id) => trpc.chat.getChat.queryOptions({ chatId: id }));
  return chat === undefined ? undefined : carriedAppearanceFromParticipants(chat.participants);
}
