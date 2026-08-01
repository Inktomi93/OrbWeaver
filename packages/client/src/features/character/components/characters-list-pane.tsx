// The MODAL Characters LIST pane (list-pane-projection Arm A, §3.1) — one slot, two roles:
//
//   no selection → the PICKER (today's library, unchanged);
//   a character  → HER HISTORY (the identity row + the door-injected chats projection).
//
// The swap key is the section's OWN drill selection — reader shape 2 (own-section, render-only): no effect,
// no new store, just a render derivation of a pointer that already exists. Unconditional by owner ruling D2
// (selection ⇒ projection, back = deselect), so there is no extra chrome for the mode.
//
// Back-focus (§3.7): backing out of the projection must land focus on HER ROW, not `<body>`. The pane
// remembers the last non-null selection DURING RENDER (the sanctioned derive-state-from-props update — an
// effect keyed on selection is exactly what UI-Arch §5.1 rules out) and hands it to the re-mounting library
// as its focus target. The band's back button therefore stays a plain `clearCharacterSelection` with no
// shared state between the two render props.

import type { CharacterId } from "@orb/kit/ids";
import type { ReactElement, ReactNode } from "react";
import { useState } from "react";
import type { CharacterChatsProjectionView } from "#lib";
import { useSelectedCharacterId } from "#state";
import { CharacterLibrarySurface } from "../surfaces/character-library-surface";
import { CharacterChatsProjectionShell } from "./character-chats-projection-shell";

export interface CharactersListPaneProps {
  /** The chat-owned projection body, injected at the door (§3.2) — character never imports chat. */
  readonly chatsProjection: (view: CharacterChatsProjectionView) => ReactNode;
}

export function CharactersListPane({ chatsProjection }: CharactersListPaneProps): ReactElement {
  const selectedId = useSelectedCharacterId();
  const [lastSelectedId, setLastSelectedId] = useState<CharacterId | null>(selectedId);
  if (selectedId !== null && selectedId !== lastSelectedId) {
    setLastSelectedId(selectedId);
  }

  if (selectedId === null) {
    return <CharacterLibrarySurface focusCharacterId={lastSelectedId} />;
  }
  return <CharacterChatsProjectionShell characterId={selectedId} chatsProjection={chatsProjection} />;
}
