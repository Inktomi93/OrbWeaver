// CharacterLibraryWelcome — the CONTENT teaching hero for the "nothing selected" state. Serves both
// "library has rows, none selected" and "library is empty" identically — the create/import action is
// always present, so an empty library is never a dead end.

import { EmptyState } from "@orb/ui/empty-state";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind the @orb/ui/icons subpath; tsc + vite resolve every glyph + Icon fine (the character-library-surface.tsx precedent).
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
