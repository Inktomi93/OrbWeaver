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
      // The command opens the Characters section, where a new character starts; no create form exists to route to.
      // Dismissal is the HOST's job (the palette closes before it runs anything), never the runner's.
      setActiveSection("characters");
    });
  }, [onRunner]);
  return null;
}
