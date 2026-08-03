// CharacterLibraryWelcome — the CONTENT teaching hero for the "nothing selected" state. Serves both
// "library has rows, none selected" and "library is empty" identically — the create/import action is
// always present, so an empty library is never a dead end.

import { EmptyState } from "@orb/ui/empty-state";
import { Icon, Users } from "@orb/ui/icons";
import type { ReactElement } from "react";
import { CharacterCreateButton } from "./character-create-actions.tsx";

/** The Characters CONTENT teaching hero (§5) — shown when no character is selected. */
export function CharacterLibraryWelcome(): ReactElement {
  return (
    <EmptyState
      action={<CharacterCreateButton />}
      className="h-full justify-center"
      description="Pick someone from the list, or make someone new."
      icon={<Icon icon={Users} size="lg" />}
      title="Choose a character"
    />
  );
}
