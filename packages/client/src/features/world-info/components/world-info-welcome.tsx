// The World Info CONTENT teaching state (UI-Arch §4.2 · §4.3 rule 1 no-dead-ends — the empty state teaches +
// offers the next step). Rendered when no book is open. A containment CONSUMER (§2.1) — no outer container.
//
// It carries NO action of its own: "New book" had THREE simultaneous homes on an empty World Info — the
// band's primary, the LIST pane's empty state, and a third here in the middle of the screen (side-eye
// P3-11). The next step lives in the sibling LIST, which is on screen whenever this is, so this state
// teaches and points; it is the `preset-library-welcome.tsx` posture exactly, which is also what makes the
// two library sections read as one grammar. Recorded in the empty-state-has-action allowlist with that
// reasoning, alongside its Presets twin.

import { EmptyState } from "@orb/ui/empty-state";
import { BookOpen, Icon } from "@orb/ui/icons";
import type { ReactElement } from "react";

/** The teaching welcome shown in World Info CONTENT when no book is open. */
export function WorldInfoWelcome(): ReactElement {
  return (
    <EmptyState
      className="h-full justify-center"
      icon={<Icon icon={BookOpen} size="lg" />}
      title="Build a world your characters know"
      description="Pick a book on the left to edit its lore entries — or create one with New, above the list. Each entry fires into the prompt when its keywords come up (or always, if you set it to). A book only takes effect once you attach it: globally, to a character, or to a persona."
    />
  );
}
