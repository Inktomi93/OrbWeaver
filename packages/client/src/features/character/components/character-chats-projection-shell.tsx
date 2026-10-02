// The CHARACTER-owned frame around the injected chats projection — the CONTEXT **Chats** tab's body. The
// ROWS are chat's (`ChatsWithCharacterPane`, threaded in at the door); everything here is the character-side
// container and its accessible name.
//
// IT MOVED OUT OF THE LIST PANE (#501, owner ruling 2026-08-22 — "library stays docked"). This used to be
// the LIST pane's second role: selecting somebody swapped the 320-character library out for her chats, so
// browsing the library cost a back-chevron trip per character (side-eye 2026-08-22 rail-characters). The
// list is the library now, always, and her history lives where artifact-scoped detail belongs — CONTEXT
// (§14). Two things went with the move:
//
//   · THE IDENTITY ROW. In the LIST pane it was the pane's only statement of WHOSE chats these were (the
//     band said `CHATS · <name>`). In CONTEXT the tab is named "Chats" on the panel of the character CONTENT
//     is already showing — portrait, name and handle all 300px to the left — so the row would be the fifth
//     echo on one screen, which is the very finding (P2 "the context pane is a read-only echo") this move
//     answers. The name survives where it is load-bearing and costs no pixels: the injected body's own
//     `role="list"` is named `Chats with <name>`, so rotor navigation still lands on her. This container
//     deliberately carries NO `aria-label` of its own — two nested nodes with one accessible name is a
//     duplicate an AT reads twice (measured: the CT hit a strict-mode violation on exactly that pair).
//   · THE FOCUS-OWNER EFFECT. It existed because a pick from the picker UNMOUNTED the row the user pressed
//     and the CONTENT editor's own `useFocusOnMount` would take the focus back. Nothing unmounts on a pick
//     any more — the library keeps the row, and its focus — so the intent seam that arbitrated the race is
//     gone with the race.

import type { CharacterId } from "@orb/kit/ids";
import { Stack } from "@orb/ui/layout";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import { useTRPC } from "#data";
import type { CharacterChatsProjectionView } from "#lib";
import { CHARACTER_CHATS_PROJECTION_SLOT, useStartChatWithCharacter } from "../lib/character-chat-intents.ts";

export interface CharacterChatsProjectionShellProps {
  readonly characterId: CharacterId;
  /** The door-injected chat-owned body (§3.2) — character never imports chat to render it. */
  readonly chatsProjection: (view: CharacterChatsProjectionView) => ReactNode;
}

export function CharacterChatsProjectionShell({ characterId, chatsProjection }: CharacterChatsProjectionShellProps): ReactElement {
  const trpc = useTRPC();
  // The same `character.get` cache the editor beside it suspends on — a cache hit, never a second read.
  const { data } = useQuery(trpc.character.get.queryOptions({ characterId }));
  const name = data?.name ?? "";
  const startChatWith = useStartChatWithCharacter();

  return (
    <Stack className="h-full min-h-0" data-slot={CHARACTER_CHATS_PROJECTION_SLOT} gap="row">
      <Stack className="min-h-0 flex-1">{chatsProjection({ characterId, characterName: name, onNewChat: (): void => startChatWith(characterId) })}</Stack>
    </Stack>
  );
}
