// The persona ↔ world-book (lorebook) connections (FINAL-Persona §A.6b — persona-bound world books). A
// Switch per library book toggles the M:N attachment (`worldInfo.attachToPersona`/`detachFromPersona`);
// the per-persona list drives the checked state. QueryBoundary loads both the library + the attachments.

import type { PersonaId, WorldBookId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { EmptyState } from "@orb/ui/empty-state";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind the @orb/ui/icons subpath; tsc + vite resolve BookOpen/Icon fine (the add-member-popover precedent).
import { BookOpen, Icon } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Switch } from "@orb/ui/switch";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { QueryBoundary, useInvalidation, useTRPC } from "#data";
import { useAttachBookToPersona, useDetachBookFromPersona } from "../hooks/use-persona-lorebooks";

export interface PersonaWorldBooksSectionProps {
  readonly personaId: PersonaId;
}

/** The persona-bound world-book toggles — a Switch per library book, checked when attached. */
export function PersonaWorldBooksSection({
  personaId,
}: PersonaWorldBooksSectionProps): ReactElement {
  return (
    <QueryBoundary
      fallback={<Text tone="muted">Loading world books…</Text>}
      renderError={(_error, retry): ReactElement => (
        <Row gap="row" align="center">
          <Text tone="muted">Couldn't load world books.</Text>
          <Button intent="ghost" onClick={retry}>
            Retry
          </Button>
        </Row>
      )}
    >
      <WorldBooksList personaId={personaId} />
    </QueryBoundary>
  );
}

function WorldBooksList({ personaId }: PersonaWorldBooksSectionProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const attach = useAttachBookToPersona({ trpc, invalidation });
  const detach = useDetachBookFromPersona({ trpc, invalidation });
  const { data: library } = useSuspenseQuery(trpc.worldInfo.listBooks.queryOptions());
  const { data: attached } = useSuspenseQuery(
    trpc.worldInfo.listForPersona.queryOptions({ personaId }),
  );
  const attachedIds = new Set<string>(attached.map((book) => book.id));

  if (library.length === 0) {
    return (
      <EmptyState
        icon={<Icon icon={BookOpen} size="md" />}
        title="No world books yet"
        description="Create a world book to attach lore to this persona."
      />
    );
  }

  return (
    <Stack gap="row">
      {library.map((book) => {
        const isAttached = attachedIds.has(book.id);
        const bookId = castId<WorldBookId>(book.id);
        return (
          <Row key={book.id} gap="row" align="center" className="min-w-0">
            <Switch
              checked={isAttached}
              onCheckedChange={(next): void => {
                if (next) {
                  attach.mutate({ personaId, bookId });
                } else {
                  detach.mutate({ personaId, bookId });
                }
              }}
            />
            <Icon icon={BookOpen} size="sm" />
            <Text as="span" className="min-w-0 flex-1 truncate">
              {book.name}
            </Text>
          </Row>
        );
      })}
    </Stack>
  );
}
