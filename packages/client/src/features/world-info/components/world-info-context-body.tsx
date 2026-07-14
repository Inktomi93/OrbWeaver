// The World Info CONTEXT body (`ContextDefinition` `kind:"single"` — client-architecture-lockdown.md
// §6b) — the book activation panel, shown only once a book is open. Reads its OWN selection so the
// `single` arm's `body` stays a zero-arg render (S=void: worldInfo shares no context-state projection).

import type { ReactElement } from "react";
import { useSelectedWorldBookId } from "#state";
import { BookAttachments } from "./book-attachments";

export function WorldInfoContextBody(): ReactElement | null {
  const selectedWorldBookId = useSelectedWorldBookId();
  if (selectedWorldBookId === null) {
    return null;
  }
  return <BookAttachments bookId={selectedWorldBookId} />;
}
