// The chat options ⋯ menu at its ONE home: the composer's LEFT gutter (D111 §3's drawn control map — ☰ ✨
// [textarea] 🎭 ⟳ ▷ ⏩ ➤; owner ruling 2026-08-09 closed the parked "topbar vs composer" fork on the
// composer, and the topbar affordance was REMOVED in the same commit — never two homes for one menu).
//
// PURE RELOCATION, as D111 specifies: `ChatOptionsMenu` and every item in it are untouched, and the ⋯ glyph
// stays ours (the map's ☰ is how the owner drew our three-dots, not a request to re-skin it). What changed
// is the mount point: the topbar wrapper resolved the active chat from the shell store because chrome has no
// props; the composer already HOLDS the room it renders for, so the id comes down as a PROP and the landing
// case is unrepresentable here.
//
// THE DRAFT ARM IS GONE (chat-creation-draft-mode-replacement.md §4.1, R1). There used to be a second wrapper
// that built its cast from a founding seed plus draft-config additions and rendered the whole menu with the
// committed-only actions DISABLED. The room has a chat row from the creation click, so there is one wrapper,
// one cast source (the roster), and nothing left to grey out.

import type { ChatId } from "@orb/kit/ids";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useTRPC } from "#data";
import { filterCharacters } from "../lib/roster.ts";
import { ChatOptionsMenu } from "./chat-options-menu.tsx";

/** The composer-left ⋯: the ONE options menu for the room this composer belongs to. Resolves the roster + server host gate (`viewerIsHost`) from the shared getChat query and
 *  renders the ⋯ menu — the same wiring the topbar trail used before the D111 relocation. */
export function ActiveChatOptionsMenu({ chatId }: { readonly chatId: ChatId }): ReactElement {
  const trpc = useTRPC();
  const { data: chat } = useQuery(trpc.chat.getChat.queryOptions({ chatId }));
  const characters = filterCharacters(chat?.participants ?? []).map((c) => ({ characterId: c.characterId, name: c.displayName }));
  return <ChatOptionsMenu chatId={chatId} title={chat?.title ?? null} characters={characters} />;
}
