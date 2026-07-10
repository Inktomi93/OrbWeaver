// CharacterLibraryWelcome — the Characters-section CONTENT teaching hero for the "nothing selected" state
// (FINAL-Character §5). The LIST panel holds the collection (search + rows, `character-library-surface.tsx`);
// this fills CONTENT with the §5 teaching state: one line ("Pick someone from the list, or make someone
// new") + the create/import tile as the ENABLED next step (rule 1 — no dead ends). Selecting a LIST row now
// opens the §6 EDITOR (`character-editor-surface.tsx`) in this same slot, so this hero shows only until a
// character is picked.
//
// DATA-DRIVEN, no `if(empty)` layout branch (§5): the same component serves both "library has rows, none
// selected" and "library is genuinely empty" — the create/import action is always present, so an empty
// library is never a dead end and never a second layout. The action reuses `CharacterCreateMenu` (the ONE
// create/import entry — the LIST header's `+` menu), so there is a single home for that flow.

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
