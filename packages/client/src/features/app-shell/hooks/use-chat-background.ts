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
//
// IT IS SCOPED TO THE ROOM, NOT TO THE POINTER (#170, owner-observed live 2026-08-18: "the chat's
// background is sticky and following me"). `useActiveChatId` is a PERSISTED pointer — deliberately so, since
// coming back to the chats section must land you in the room you left — so keying the app-root background on
// it alone dressed EVERY other section, and every reload, in the last-visited room's wallpaper with no global
// background set. The pointer says which room is open; only `activeSection` says whether that room is on
// SCREEN, and a carried background is a property of the room you are looking at. Reading the section here (a
// `#state` projection the shell already owns) keeps the pointer's own semantics untouched: leave chats and the
// override evaporates, come back and it paints again, with nothing to clear on exit and no second writer.

import type { ThemeBackground } from "@orb/contracts/theme";
import { useCarriedAppearanceCast, useGatedQuery, useTRPC } from "#data";
import { useActiveChatId, useActiveSection } from "#state";
import { resolveChatBackgroundSource } from "../lib/resolve-theme-background.ts";

/** The section whose CONTENT is the chat room — the only surface a carried background may dress. */
const ROOM_SECTION = "chats";

/** The active chat's effective carried background source, or `undefined` when the viewer's own appearance
 *  background should paint (the app-shell cascades this over `appearanceBackgroundSource(appearance)`). */
export function useChatBackground(): ThemeBackground | undefined {
  const trpc = useTRPC();
  // Gating the READS (not just the return) is what keeps a section-swap from holding a room's chat query warm
  // for decoration nobody is looking at — and it is what makes the hooks unconditional either way.
  const inRoom = useActiveSection() === ROOM_SECTION;
  const activeChatId = useActiveChatId();
  const chatId = inRoom ? activeChatId : null;
  const cast = useCarriedAppearanceCast(chatId);
  const { data } = useGatedQuery(chatId, (id) => trpc.chat.getChat.queryOptions({ chatId: id }));
  return resolveChatBackgroundSource(cast, data?.background);
}
