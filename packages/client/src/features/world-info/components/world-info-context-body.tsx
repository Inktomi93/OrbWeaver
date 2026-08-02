// The World Info CONTEXT body (`ContextDefinition` `kind:"single"` — client-architecture-lockdown.md
// §6b) — the book activation panel, shown only once a book is open. Reads its OWN selection so the
// `single` arm's `body` stays a zero-arg render (S=void: worldInfo shares no context-state projection).

import { EmptyState } from "@orb/ui/empty-state";
import { BookOpen, Icon } from "@orb/ui/icons";
import type { ReactElement } from "react";
import { useSelectedWorldBookId } from "#state";
import { BookAttachments } from "./book-attachments";

export function WorldInfoContextBody(): ReactElement {
  const selectedWorldBookId = useSelectedWorldBookId();
  if (selectedWorldBookId === null) {
    // THE NO-SELECTION ARM (side-eye F-12). This returned `null`, so a DOCKED World Info context pane
    // rendered its band's bare "Details" over an empty box — the whole pane's `innerText` was the word
    // "Details" — which reads as a surface nobody finished. It is a real arm now, naming what the pane
    // WILL show, per `ContextEmptyArm`'s contract and the section's own `context.empty` declaration.
    return (
      <EmptyState
        description="Open a world book and this pane shows where it attaches — the characters, chats and personas its entries can fire in."
        icon={<Icon icon={BookOpen} size="lg" />}
        title="No book open"
      />
    );
  }
  return <BookAttachments bookId={selectedWorldBookId} />;
}
