// The persona <-> world-book (lorebook) connection: one book per persona, a single-select dropdown over
// worldInfo.listBooks (+ "None"). Picking a book attaches it and detaches whichever was previously
// attached; picking "None" just detaches. The M:N junction still supports many books server-side — the
// UI just never offers more than one at a time.

import type { PersonaId, WorldBookId } from "@orb/kit/ids";
import { Field } from "@orb/ui/field";
import { BookOpen, Icon } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import type { SelectItems } from "@orb/ui/select";
import { Select } from "@orb/ui/select";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { QueryBoundary, QueryErrorState, useInvalidation, useTRPC } from "#data";
import { useAttachBookToPersona, useDetachBookFromPersona } from "../hooks/use-persona-lorebooks";

const NONE_VALUE = "none";

export interface PersonaLoreBookFieldProps {
  readonly personaId: PersonaId;
}

/** The persona's single-select lore book. */
export function PersonaLoreBookField({ personaId }: PersonaLoreBookFieldProps): ReactElement {
  return (
    <QueryBoundary
      fallback={<Text voice="gloss">Loading world books…</Text>}
      renderError={(_error, retry): ReactElement => <QueryErrorState label="world books" onRetry={retry} />}
    >
      <LoreBookSelect personaId={personaId} />
    </QueryBoundary>
  );
}

function LoreBookSelect({ personaId }: PersonaLoreBookFieldProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const attach = useAttachBookToPersona({ trpc, invalidation });
  const detach = useDetachBookFromPersona({ trpc, invalidation });
  const { data: library } = useSuspenseQuery(trpc.worldInfo.listBooks.queryOptions());
  const { data: attached } = useSuspenseQuery(trpc.worldInfo.listForPersona.queryOptions({ personaId }));
  // The UI only ever offers ONE — the first attachment (if the M:N junction somehow holds more, from a
  // pre-redesign state, the others are simply not shown/touched until the user picks again).
  const current = attached[0];

  const items: SelectItems<string> = [{ value: NONE_VALUE, label: "None" }, ...library.map((book) => ({ value: book.id, label: book.name }))];

  const onChange = (value: string | null): void => {
    // `book.id` is already the branded `WorldBookId` (tRPC-inferred) — no re-cast.
    const previous = current?.id;
    const next = value ?? NONE_VALUE;
    if (next !== NONE_VALUE) {
      attach.mutate({ personaId, bookId: next as WorldBookId });
    }
    if (previous !== undefined && previous !== next) {
      detach.mutate({ personaId, bookId: previous });
    }
  };

  return (
    <Field label="Lore book" name="persona-lore-book">
      <Row gap="field" align="center">
        <Icon icon={BookOpen} size="sm" />
        <Select aria-label="Lore book" items={items} value={current?.id ?? NONE_VALUE} onValueChange={onChange} placeholder="None" />
      </Row>
    </Field>
  );
}
