// The book activation panel — where the open book is switched ON. Drives three of the four attach
// scopes (global/character/persona) from the book's side; chat scope is deferred at transport. Global is
// a clean book-centric toggle; character/persona attachment is target-scoped in the API, so those rows
// own their own membership query — the character list reveals on demand so a large cast doesn't fan out
// a query per row until asked.

import type { WorldBookId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { ChevronDown, ChevronRight, Icon } from "@orb/ui/icons";
import { Row, Section, Stack } from "@orb/ui/layout";
import { Switch } from "@orb/ui/switch";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import { useInvalidation, useTRPC } from "#data";
import { useAttachWorldBookGlobal, useDetachWorldBookGlobal } from "../hooks/use-world-info-mutations";
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
            <PersonaAttachRow key={persona.id} bookId={bookId} personaId={persona.id} personaName={persona.name} />
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
          <Button intent="ghost" size="sm" aria-expanded={open} onClick={(): void => setOpen((prev) => !prev)}>
            <Icon icon={open ? ChevronDown : ChevronRight} size="sm" />
            {open ? "Hide characters" : `Attach to a character (${characters.length})`}
          </Button>
          {open ? (
            <Stack gap="row">
              {characters.map((character) => (
                <CharacterAttachRow key={character.id} bookId={bookId} characterId={character.id} characterName={character.name} />
              ))}
            </Stack>
          ) : null}
        </Stack>
      )}
    </Section>
  );
}
