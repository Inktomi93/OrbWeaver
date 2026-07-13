// The book ACTIVATION panel (World Info CONTEXT) — where the open book is switched ON. A book contributes
// nothing to a chat until it is attached at one of the four scopes; this panel drives three of them
// (global / character / persona) from the BOOK's side. The fourth, CHAT scope, is deferred at transport (the
// world-info router omits `attachToChat` — chats are membership-scoped, P5) so it is not surfaced here.
//
// Global is the clean book-centric toggle (a single `listGlobal` membership read). Character + persona
// attachment is TARGET-scoped in the API (no per-book reverse index), so those rows each own their membership
// query (attachment-rows.tsx) — the character list is revealed on demand so a large cast doesn't fan out a
// query per row until asked. A component (owns its queries), rendered by the route in the CONTEXT slot.

import type { WorldBookId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind @orb/ui/icons; tsc + vite resolve ChevronDown/ChevronRight/Icon fine (the preset-library-row.tsx precedent).
import { ChevronDown, ChevronRight, Icon } from "@orb/ui/icons";
import { Row, Section, Stack } from "@orb/ui/layout";
import { Switch } from "@orb/ui/switch";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import { useInvalidation, useTRPC } from "#data";
import {
  useAttachWorldBookGlobal,
  useDetachWorldBookGlobal,
} from "../hooks/use-world-info-mutations";
import { CharacterAttachRow, PersonaAttachRow } from "./attachment-rows";

export interface BookAttachmentsProps {
  readonly bookId: WorldBookId;
}

/** The activation panel for one book (global toggle + character/persona attachment). */
export function BookAttachments({ bookId }: BookAttachmentsProps): ReactElement {
  return (
    <Stack gap="section" padding="block">
      <GlobalSection bookId={bookId} />
      <PersonasSection bookId={bookId} />
      <CharactersSection bookId={bookId} />
    </Stack>
  );
}

function GlobalSection({ bookId }: BookAttachmentsProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const globalQuery = useQuery(trpc.worldInfo.listGlobal.queryOptions());
  const attach = useAttachWorldBookGlobal({ trpc, invalidation });
  const detach = useDetachWorldBookGlobal({ trpc, invalidation });

  const isGlobal = (globalQuery.data ?? []).some((b) => b.id === bookId);

  return (
    <Section heading="Everywhere">
      <Row gap="row" align="center" justify="between">
        <Text size="body" tone="muted">
          Fire this book in every chat, on top of any character or persona attachments.
        </Text>
        <Switch
          aria-label="Attach globally"
          checked={isGlobal}
          onCheckedChange={(on): void => {
            if (on) {
              attach.mutate({ bookId });
            } else {
              detach.mutate({ bookId });
            }
          }}
        />
      </Row>
    </Section>
  );
}

function PersonasSection({ bookId }: BookAttachmentsProps): ReactElement {
  const trpc = useTRPC();
  const personasQuery = useQuery(trpc.persona.list.queryOptions());
  const personas = personasQuery.data ?? [];

  return (
    <Section heading="Personas">
      {personas.length === 0 ? (
        <Text tone="muted">No personas yet.</Text>
      ) : (
        <Stack gap="row">
          {personas.map((persona) => (
            <PersonaAttachRow
              key={persona.id}
              bookId={bookId}
              personaId={persona.id}
              personaName={persona.name}
            />
          ))}
        </Stack>
      )}
    </Section>
  );
}

function CharactersSection({ bookId }: BookAttachmentsProps): ReactElement {
  const trpc = useTRPC();
  const [open, setOpen] = useState(false);
  const charactersQuery = useQuery(trpc.character.list.queryOptions());
  const characters = charactersQuery.data?.items ?? [];

  return (
    <Section heading="Characters">
      {characters.length === 0 ? (
        <Text tone="muted">No characters yet.</Text>
      ) : (
        <Stack gap="row">
          <Button
            intent="ghost"
            size="sm"
            aria-expanded={open}
            onClick={(): void => setOpen((prev) => !prev)}
          >
            <Icon icon={open ? ChevronDown : ChevronRight} size="sm" />
            {open ? "Hide characters" : `Attach to a character (${characters.length})`}
          </Button>
          {open ? (
            <Stack gap="row">
              {characters.map((character) => (
                <CharacterAttachRow
                  key={character.id}
                  bookId={bookId}
                  characterId={character.id}
                  characterName={character.name}
                />
              ))}
            </Stack>
          ) : null}
        </Stack>
      )}
    </Section>
  );
}
