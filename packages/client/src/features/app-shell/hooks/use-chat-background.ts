// `useChatBackground` — resolves the ACTIVE chat's carried background source (BG-C) for the app-root
// background layer. The per-chat / card-carried background lives on the chat (getChat); the shell learns it
// through the SANCTIONED §12 cross-feature READ (`#data`'s `useCarriedAppearanceCast`, keyed off the
// `#state` active-chat pointer — never a `#features/chat` import), exactly as `use-selected-theme` reads
// `trpc.settings.*`. `undefined` ⇒ no carried override (the viewer's own `appearance` background wins) — the
// safe floor for landing, a cast-less room, a non-single-human room, or an unresolved read.
//
// IT USED TO HAVE TWO CAST SOURCES (owner dogfood 2026-08-06): gating the read on `useActiveChatId` meant a
// pre-send room showed the viewer's default background and swapped to the card's the moment a message
// landed, so a DRAFT arm read the founding cards directly. A chat row exists from the creation click now
// (chat-creation-draft-mode-replacement.md §4.1) and `useStartChat` seeds `getChat` from `startChat`'s own
// response, so ONE cast source is warm on the room's first frame. The composition + cascade are unchanged.
//
// Non-suspending throughout: the shell must never suspend/crash on decoration — an unresolved/errored read
// falls back to `undefined` (byte-identical to a viewer-appearance-only background).

import type { ThemeBackground } from "@orb/contracts/theme";
import { useCarriedAppearanceCast, useGatedQuery, useTRPC } from "#data";
import { useActiveChatId } from "#state";
import { resolveChatBackgroundSource } from "../lib/resolve-theme-background.ts";

/** The active chat's effective carried background source, or `undefined` when the viewer's own appearance
 *  background should paint (the app-shell cascades this over `appearanceBackgroundSource(appearance)`). */
export function useChatBackground(): ThemeBackground | undefined {
  const trpc = useTRPC();
  const chatId = useActiveChatId();
  const cast = useCarriedAppearanceCast(chatId);
  const { data } = useGatedQuery(chatId, (id) => trpc.chat.getChat.queryOptions({ chatId: id }));
  return resolveChatBackgroundSource(cast, data?.background);
}
