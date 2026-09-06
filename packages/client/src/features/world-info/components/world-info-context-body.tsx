// The world-info collection's CONTEXT arm — "where this book fires" for the selected book: the activation
// panel (global toggle + persona/character attachment), unchanged from the rail section's CONTEXT.
//
// It is a `{kind:"body"}` arm, so the NO-SELECTION state is gone by construction: the host only calls this
// with a member selected, and its own `context.empty` covers the nothing-selected case. What remains is the
// GONE arm — the book was deleted on another device while its context was open.

import { EmptyState } from "@orb/ui/empty-state";
import { BookOpen, Icon } from "@orb/ui/icons";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useTRPC } from "#data";
import { BookAttachments } from "./book-attachments.tsx";

export function WorldInfoContextBody({ memberId }: { readonly memberId: string }): ReactElement {
  const trpc = useTRPC();
  const { data: books } = useSuspenseQuery(trpc.worldInfo.listBooksWithUsage.queryOptions());
  const book = books.find((row) => row.id === memberId);
  if (book === undefined) {
    // @orb-waive empty-state-has-action(EmptyState): the GONE arm of the world-info CONTEXT pane — the open book was deleted while its attachments were on screen. The next step is picking another row in the sibling roster, which is on screen; the regex-context-body twin, same species. Ends if the context pane can be shown without its sibling roster.
    return <EmptyState description="This book was deleted. Pick another from the list." icon={<Icon icon={BookOpen} size="lg" />} title="Book not found" />;
  }
  return <BookAttachments bookId={book.id} />;
}
