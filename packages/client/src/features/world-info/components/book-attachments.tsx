// The book activation panel — where the open book is switched ON. Drives three of the four attach
// scopes (global/character/persona) from the book's side; chat scope is deferred at transport. Global is
// a clean book-centric toggle; character/persona attachment is target-scoped in the API, so those rows
// own their own membership query — the character list reveals on demand so a large cast doesn't fan out
// a query per row until asked.
//
// THE CHARACTER PICKER SEARCHES THE WHOLE LIBRARY, ON THE SERVER (2026-08-14 — the owner's paged-list-lens
// ruling applied to a picker, the same treatment `add-chat-document-dialog` and `character-picker` took).
// The reveal used to read `character.list` with NO params: one default page, so past the fiftieth card a
// character was simply unattachable from here — the roster ended, silently, with nothing saying so and no
// affordance to reach further. `persona.list` needs none of this: it is unpaged, so its section still reads
// the whole set. The term rides to the verb, so the target arrives on the first page of the SEARCHED read
// however deep she sits, and the picker answers the same question the library does with the same predicate.

import type { WorldBookId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { ChevronDown, ChevronRight, Icon } from "@orb/ui/icons";
import { Input } from "@orb/ui/input";
import { Row, Section, Stack } from "@orb/ui/layout";
import { Switch } from "@orb/ui/switch";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import type { Trpc } from "#data";
import { SkeletonRows, useInvalidation, useTRPC } from "#data";
import { useDebouncedValue } from "#lib";
import { useAttachWorldBookGlobal, useDetachWorldBookGlobal } from "../hooks/use-world-info-mutations.ts";
import { CharacterAttachRow, PersonaAttachRow } from "./attachment-rows.tsx";

type CharacterListItem = inferOutput<Trpc["character"]["list"]>["items"][number];

/** Rows per page. With a server predicate behind the box this is a page of the MATCHES, not a slice of the
 *  library taken before the question was asked (the `character-picker` value; the verb clamps at 100). */
const PICKER_PAGE_LIMIT = 100;

/** Keystroke→request damper — the library pane's value, so a picker and the pane behave alike. */
const SEARCH_DEBOUNCE_MS = 250;

/** The roster's shape-matched loading skeleton (house loading law — never a spinner/text void). */
const PICKER_SKELETON_ROWS = 3;

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
  // The kicker's count is the ATTACHED set, not the picker's page — `listBooksWithUsage`'s per-book
  // rollup already carries it (the census/collection-rows cache hit, `use-world-info-collection.ts`),
  // so this never has to fan the character list out just to count.
  const usageQuery = useQuery(trpc.worldInfo.listBooksWithUsage.queryOptions());
  const attachedCount = usageQuery.data?.find((book) => book.id === bookId)?.usage.characters ?? 0;

  return (
    <Section kicker={`Attached by characters · ${attachedCount}`}>
      <Stack gap="row">
        <Button intent="ghost" size="sm" aria-expanded={open} onClick={(): void => setOpen((prev) => !prev)}>
          <Icon icon={open ? ChevronDown : ChevronRight} size="sm" />
          {open ? "Hide characters" : "Attach to a character"}
        </Button>
        {open ? <CharacterPicker bookId={bookId} /> : null}
      </Stack>
    </Section>
  );
}

/** The revealed character picker — the search box plus the roster it narrows. The read lives HERE rather
 *  than in the section above so it is mounted-with-the-reveal: nothing is asked for until the roster is,
 *  and a close-then-reopen re-reads instead of holding a page from before the last attach. */
function CharacterPicker({ bookId }: { readonly bookId: WorldBookId }): ReactElement {
  const trpc = useTRPC();
  const [term, setTerm] = useState("");
  const needle = useDebouncedValue(term.trim(), SEARCH_DEBOUNCE_MS);
  const charactersQuery = useQuery(trpc.character.list.queryOptions({ limit: PICKER_PAGE_LIMIT, ...(needle === "" ? {} : { search: needle }) }));

  return (
    <Stack gap="row">
      {/* The box stays mounted through every body state — including "No matches", whose only way out is to
          edit or clear the term that produced it. */}
      <Input aria-label="Search characters" onValueChange={setTerm} placeholder="Search characters" value={term} />
      <CharacterRoster
        bookId={bookId}
        characters={charactersQuery.data?.items ?? []}
        isPending={charactersQuery.isPending}
        needle={needle}
        onClearSearch={(): void => setTerm("")}
      />
    </Stack>
  );
}

/** The roster rows, or the honest nothing. Split out so the OPEN gate above stays a single ternary. */
function CharacterRoster({
  bookId,
  characters,
  isPending,
  needle,
  onClearSearch,
}: {
  readonly bookId: WorldBookId;
  readonly characters: readonly CharacterListItem[];
  readonly isPending: boolean;
  readonly needle: string;
  readonly onClearSearch: () => void;
}): ReactElement {
  if (isPending) {
    return <SkeletonRows count={PICKER_SKELETON_ROWS} shape="line" />;
  }
  // TWO different nothings, said differently (empty states are load-bearing): a search that matched nothing
  // is about the TERM — and because the server searched the WHOLE library, that sentence is now honest, which
  // it would not have been over a client-side filter of one page.
  if (characters.length === 0) {
    if (needle !== "") {
      return (
        <Stack gap="field">
          <Text voice="gloss">{`No character matches "${needle}".`}</Text>
          <Row>
            <Button intent="secondary" onClick={onClearSearch} size="sm">
              Clear search
            </Button>
          </Row>
        </Stack>
      );
    }
    return <Text voice="gloss">No characters yet.</Text>;
  }
  return (
    <Stack gap="row">
      {characters.map((character) => (
        <CharacterAttachRow key={character.id} bookId={bookId} characterId={character.id} characterName={character.name} />
      ))}
    </Stack>
  );
}
