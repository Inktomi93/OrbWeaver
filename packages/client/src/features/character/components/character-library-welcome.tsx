// CharacterLibraryWelcome — the Characters-section CONTENT hero for today's browse-only library
// (UI-Arch §4.1: LIST = "the section's collection + search + new"; CONTENT = the hero). The library's
// collection (search + rows) now fills the LIST panel (`character-library-surface.tsx`), so CONTENT
// needs its OWN honest content rather than an empty `<SectionPlaceholder>` sitting beside a live grid.
// No per-character detail/editor surface exists yet (character-card.tsx: "a stub today... a later
// task") — this is deliberately NOT a fabricated detail pane, just the teaching empty-state pointing at
// the LIST's two real actions (pick a row to start a chat; use "New chat"'s search to find someone).
// A pure leaf, no data — swap this out the day a real per-character detail surface lands.

import { EmptyState } from "@orb/ui/empty-state";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind the @orb/ui/icons subpath; tsc + vite resolve every glyph + Icon fine (the character-library-surface.tsx precedent).
import { Icon, Users } from "@orb/ui/icons";
import type { ReactElement } from "react";

/** The Characters CONTENT hero when no per-character detail surface exists to show. */
export function CharacterLibraryWelcome(): ReactElement {
  return (
    <EmptyState
      className="h-full justify-center"
      description="Pick someone from the list to start a chat, or search to find them."
      icon={<Icon icon={Users} size="lg" />}
      title="Choose a character"
    />
  );
}
