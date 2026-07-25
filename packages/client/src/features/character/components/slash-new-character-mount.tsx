// The `/new-character` runner mount — rendered invisibly by each slash-command host (the chat composer and
// the command palette) in its OWN fiber. The character feature grafts this command onto BOTH surfaces
// without importing features/chat: the only coupling is the `SlashCommandContribution` contract, assembled
// at the door (client-architecture-lockdown.md §6c).

import { useEffect } from "react";
import type { SlashCommandMountProps } from "#lib";
import { setActiveSection } from "#state";

export function SlashNewCharacterMount({ onRunner }: SlashCommandMountProps): null {
  useEffect(() => {
    onRunner((): void => {
      // No dedicated create-character flow exists yet — land in the Characters section.
      // TODO(character-lane): route straight to the create form when it lands.
      // Dismissal is the HOST's job (the palette closes before it runs anything), never the runner's.
      setActiveSection("characters");
    });
  }, [onRunner]);
  return null;
}
