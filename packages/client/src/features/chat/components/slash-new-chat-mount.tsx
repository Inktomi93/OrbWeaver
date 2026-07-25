// The `/new-chat` runner mount — rendered invisibly by each slash-command host (the composer and the
// command palette) in its OWN fiber, so a runner may use hooks without a hooks-in-a-loop at the host.
// This one needs none (`openModal` is a module action), but it keeps the mount shape every command shares.

import { useEffect } from "react";
import type { SlashCommandMountProps } from "#lib";
import { openModal } from "#state";

export function SlashNewChatMount({ onRunner }: SlashCommandMountProps): null {
  useEffect(() => {
    onRunner((): void => openModal("newChat"));
  }, [onRunner]);
  return null;
}
