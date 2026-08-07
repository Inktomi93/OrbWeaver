// `useChatBackground` — resolves the ACTIVE chat's carried background source (BG-C) for the app-root
// background layer. The per-chat / card-carried background lives on the chat (getChat) or, before the chat
// exists, on the DRAFT's founding cards — the shell learns both through the SANCTIONED §12 cross-feature
// READ (`#data`'s `useCarriedAppearanceCast`, keyed off the `#state` active-chat pointer — never a
// `#features/chat` import), exactly as `use-selected-theme` reads `trpc.settings.*`. `undefined` ⇒ no
// carried override (the viewer's own `appearance` background wins) — the safe floor for landing, a blank
// draft, a non-single-human room, or an unresolved read.
//
// DRAFT PARITY (owner dogfood 2026-08-06): this used to gate the whole read on `useActiveChatId`, which is
// `null` until the first send commits the draft — so starting a chat with a character showed the viewer's
// default background and swapped to the card's the moment a message landed. The composition + cascade are
// unchanged; only the CAST now has two honest sources. A draft carries no chat-set background (that column
// is written by a post-creation verb), so its cascade is the card arm alone.
//
// Non-suspending throughout: the shell must never suspend/crash on decoration — an unresolved/errored read
// falls back to `undefined` (byte-identical to a viewer-appearance-only background).

import type { ThemeBackground } from "@orb/contracts/theme";
import { useCarriedAppearanceCast, useGatedQuery, useTRPC } from "#data";
import { useActiveChatId, useActiveDraftFoundingCast } from "#state";
import { resolveChatBackgroundSource } from "../lib/resolve-theme-background.ts";

/** The active chat's (or active draft's) effective carried background source, or `undefined` when the
 *  viewer's own appearance background should paint (the app-shell cascades this over
 *  `appearanceBackgroundSource(appearance)`). */
export function useChatBackground(): ThemeBackground | undefined {
  const trpc = useTRPC();
  const chatId = useActiveChatId();
  const draftCharacterIds = useActiveDraftFoundingCast();
  const cast = useCarriedAppearanceCast(chatId, draftCharacterIds);
  // The chat-SET source is a committed-chat column; a draft has none, so this read stays gated on the id.
  const { data } = useGatedQuery(chatId, (id) => trpc.chat.getChat.queryOptions({ chatId: id }));
  return resolveChatBackgroundSource(cast, data?.background);
}
