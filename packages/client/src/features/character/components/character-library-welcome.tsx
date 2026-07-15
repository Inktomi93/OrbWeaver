// CharacterLibraryWelcome — the CONTENT teaching hero for the "nothing selected" state. Serves both
// "library has rows, none selected" and "library is empty" identically — the create/import action is
// always present, so an empty library is never a dead end.

import { EmptyState } from "@orb/ui/empty-state";
import { Icon, Users } from "@orb/ui/icons";
import type { ReactElement } from "react";
import { CharacterCreateMenu } from "./character-create-menu";

/** The Characters CONTENT teaching hero (§5) — shown when no character is selected. */
export function CharacterLibraryWelcome(): ReactElement {
  return (
    <EmptyState
      action={<CharacterCreateMenu />}
      className="h-full justify-center"
      description="Pick someone from the list, or make someone new."
      icon={<Icon icon={Users} size="lg" />}
      title="Choose a character"
    />
  );
}
