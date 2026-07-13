// The World Info CONTENT teaching state (UI-Arch §4.2 · §4.3 rule 1 no-dead-ends — the empty state teaches +
// offers the next step). Rendered when no book is open. A containment CONSUMER (§2.1) — no outer container.
// Carries an `action` CTA (design-enforcement §3.2 — no dead-end empty state): a self-contained "New book"
// that creates a book + opens it (the CharacterLibraryWelcome → CharacterCreateMenu precedent).

import { Button } from "@orb/ui/button";
import { EmptyState } from "@orb/ui/empty-state";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind @orb/ui/icons; tsc + vite resolve BookOpen/Icon/Plus fine (the preset-library-welcome.tsx precedent).
import { BookOpen, Icon, Plus } from "@orb/ui/icons";
import type { ReactElement } from "react";
import { useInvalidation, useTRPC } from "#data";
import { selectWorldBook } from "#state";
import { useCreateWorldBook } from "../hooks/use-world-info-mutations";

const NEW_BOOK_NAME = "New book";

/** The teaching welcome shown in World Info CONTENT when no book is open. */
export function WorldInfoWelcome(): ReactElement {
  return (
    <EmptyState
      action={<NewBookAction />}
      className="h-full justify-center"
      icon={<Icon icon={BookOpen} size="lg" />}
      title="Build a world your characters know"
      description="Pick a book on the left to edit its lore entries — or create a new one. Each entry fires into the prompt when its keywords come up (or always, if you set it to). A book only takes effect once you attach it: globally, to a character, or to a persona."
    />
  );
}

/** The next-step CTA — creates a book, then opens it in the editor (the LIST's New button, mirrored here). */
function NewBookAction(): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const create = useCreateWorldBook({ trpc, invalidation });
  return (
    <Button
      intent="secondary"
      size="sm"
      disabled={create.isPending}
      onClick={(): void => {
        void create
          .mutateAsync({ input: { name: NEW_BOOK_NAME } })
          .then((created) => selectWorldBook(created.id));
      }}
    >
      <Icon icon={Plus} size="sm" />
      New book
    </Button>
  );
}
