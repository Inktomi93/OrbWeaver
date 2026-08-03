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

  // ONE GRAMMAR WITH ITS SIBLING ARM (side-eye 2026-08-03 P3). This pane and the regex pane sit in the SAME
  // slot of the SAME workspace and spoke two languages: sentence-case `Section` headings ("Everywhere") over
  // a muted paragraph here, ALL-CAPS kicker bands over a label+switch row there. The regex shape wins on
  // merit — the switch's own line NAMES the state ("Runs in every chat") instead of a heading naming a
  // place — so this arm adopts it verbatim: label + switch, then the gloss underneath.
  return (
    <Stack gap="field">
      <Row gap="row" align="center" justify="between">
        <Text as="span" voice="label">
          Fires in every chat
        </Text>
        <Switch
          aria-label="Fires in every chat"
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
      <Text voice="gloss">On top of any character or persona attachment — the one scope that needs no carrier.</Text>
    </Stack>
  );
}

function PersonasSection({ bookId }: BookAttachmentsProps): ReactElement {
  const trpc = useTRPC();
  const personasQuery = useQuery(trpc.persona.list.queryOptions());
  const personas = personasQuery.data ?? [];

  // The regex arm's roster grammar: an ALL-CAPS kicker band carrying the count, because "Attached by
  // personas · 0" is a complete statement where a bare heading over an empty box asks whether it failed.
  return (
    <Section kicker={`Attached by personas · ${personas.length}`}>
      {personas.length === 0 ? (
        <Text voice="gloss">No personas yet. Create one from the rail-foot Account &amp; personas panel.</Text>
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
    <Section kicker={`Attached by characters · ${characters.length}`}>
      {characters.length === 0 ? (
        <Text voice="gloss">No characters yet.</Text>
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
