// The book activation panel — where the open book is switched ON. Drives three of the four attach
// scopes (global/character/persona) from the book's side. Global is
// a clean book-centric toggle; character/persona writes are target-scoped, while the read is one
// book-centric reverse index shared by both lists. The character list still reveals on demand, but its
// rows no longer fan out one membership request apiece.
//
// THE FOURTH SCOPE IS NOT MISSING, IT LIVES IN THE ROOM (#640). `worldInfo.attachToChat` is host-gated on a
// MEMBERSHIP-scoped chat, so its affordance is the "This chat" tab's World books section
// (`features/chat/chat-books-section.tsx`), not a fourth row here. `databank-active-in.tsx`'s header records
// the ruling for the identical shape: a junction row OUTLIVES the attacher's seat (chats carry no `ownerId`,
// D18), so naming rooms from the OWNER's library would tell an ex-host about a room they can no longer open
// — and world-info has no per-book reverse index of chats anyway, so a switch here could not render the
// state it would be toggling. This panel's earlier "chat scope is deferred at transport" note was stale in
// both halves: transport has exposed the verb since the router shipped, and the deferral was never a
// transport fact.
//
// THE CHARACTER PICKER SEARCHES THE WHOLE LIBRARY, ON THE SERVER (2026-08-14 — the owner's paged-list-lens
// ruling applied to a picker, the same treatment `add-chat-document-dialog` and `character-picker` took).
// The reveal used to read `character.list` with NO params: one default page, so past the fiftieth card a
// character was simply unattachable from here — the list ended, silently, with nothing saying so and no
// affordance to reach further. `persona.list` needs none of this: it is unpaged, so its section still reads
// the whole set. The term rides to the verb, so the target arrives on the first page of the SEARCHED read
// however deep she sits, and the picker answers the same question the library does with the same predicate.

import type { BookAttachmentTargets } from "@orb/contracts/world-info";
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

/** The list's shape-matched loading skeleton (house loading law — never a spinner/text void). */
const PICKER_SKELETON_ROWS = 3;

export interface BookAttachmentsProps {
  readonly bookId: WorldBookId;
}

/** The activation panel for one book (global toggle + character/persona attachment). */
export function BookAttachments({ bookId }: BookAttachmentsProps): ReactElement {
  const trpc = useTRPC();
  const attachments = useQuery(trpc.worldInfo.listAttachmentsForBook.queryOptions({ bookId }));
  return (
    <Stack gap="section" padding="block">
      <GlobalSection bookId={bookId} />
      {attachments.isPending ? (
        <Text role="status" voice="gloss">
          Loading attachment status…
        </Text>
      ) : null}
      {attachments.isError ? (
        <Row align="center" gap="field" role="alert">
          <Text className="text-destructive" voice="gloss">
            Couldn&apos;t load attachment status.
          </Text>
          <Button aria-label="Retry attachment status" intent="secondary" onClick={(): void => void attachments.refetch()} size="sm" type="button">
            Retry
          </Button>
        </Row>
      ) : null}
      <PersonasSection bookId={bookId} attachments={attachments.data} queryPending={attachments.isPending} queryError={attachments.isError} />
      <CharactersSection bookId={bookId} attachments={attachments.data} queryPending={attachments.isPending} queryError={attachments.isError} />
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
  const controlsDisabled = globalQuery.isPending || globalQuery.isError || attach.isPending || detach.isPending;

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
        {globalQuery.isError ? (
          <Button intent="ghost" onClick={(): void => void globalQuery.refetch()} size="sm" type="button">
            Retry
          </Button>
        ) : null}
        <Switch
          aria-label="Fires in every chat"
          checked={isGlobal}
          disabled={controlsDisabled}
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

interface AttachmentSectionProps extends BookAttachmentsProps {
  readonly attachments: BookAttachmentTargets | undefined;
  readonly queryPending: boolean;
  readonly queryError: boolean;
}

function PersonasSection({ bookId, attachments, queryPending, queryError }: AttachmentSectionProps): ReactElement {
  const trpc = useTRPC();
  const personasQuery = useQuery(trpc.persona.list.queryOptions());
  const personas = personasQuery.data ?? [];

  // The regex arm's list grammar: an ALL-CAPS kicker band carrying the count, because "Attached by
  // personas · 0" is a complete statement where a bare heading over an empty box asks whether it failed.
  return (
    <Section kicker={personasQuery.isPending || personasQuery.isError ? "Attached by personas" : `Attached by personas · ${personas.length}`}>
      {personasQuery.isPending ? <SkeletonRows count={PICKER_SKELETON_ROWS} shape="line" /> : null}
      {personasQuery.isError ? (
        <Row align="center" gap="field" role="alert">
          <Text className="text-destructive" voice="gloss">
            Couldn&apos;t load personas.
          </Text>
          <Button aria-label="Retry personas" intent="secondary" onClick={(): void => void personasQuery.refetch()} size="sm" type="button">
            Retry
          </Button>
        </Row>
      ) : null}
      {personasQuery.isSuccess && personas.length === 0 ? (
        <Text voice="gloss">No personas yet. Create one from the rail-foot Account &amp; personas panel.</Text>
      ) : null}
      {personasQuery.isSuccess && personas.length > 0 ? (
        <Stack gap="row">
          {personas.map((persona) => (
            <PersonaAttachRow
              key={persona.id}
              bookId={bookId}
              personaId={persona.id}
              personaName={persona.name}
              attached={attachments?.personaIds.includes(persona.id) ?? false}
              queryPending={queryPending}
              queryError={queryError}
            />
          ))}
        </Stack>
      ) : null}
    </Section>
  );
}

function CharactersSection({ bookId, attachments, queryPending, queryError }: AttachmentSectionProps): ReactElement {
  const trpc = useTRPC();
  const [open, setOpen] = useState(false);
  // The kicker's count is the ATTACHED set, not the picker's page — `listBooksWithUsage`'s per-book
  // rollup already carries it (the census/collection-rows cache hit, `use-world-info-collection.ts`),
  // so this never has to fan the character list out just to count.
  const usageQuery = useQuery(trpc.worldInfo.listBooksWithUsage.queryOptions());
  const attachedCount = usageQuery.data?.find((book) => book.id === bookId)?.usage.characters ?? 0;

  return (
    <Section kicker={usageQuery.isPending || usageQuery.isError ? "Attached by characters" : `Attached by characters · ${attachedCount}`}>
      <Stack gap="row">
        <Button intent="ghost" size="sm" aria-expanded={open} onClick={(): void => setOpen((prev) => !prev)}>
          <Icon icon={open ? ChevronDown : ChevronRight} size="sm" />
          {open ? "Hide characters" : "Attach to a character"}
        </Button>
        {open ? <CharacterPicker bookId={bookId} attachments={attachments} queryPending={queryPending} queryError={queryError} /> : null}
      </Stack>
    </Section>
  );
}

/** The revealed character picker — the search box plus the list it narrows. The read lives HERE rather
 *  than in the section above so it is mounted-with-the-reveal: nothing is asked for until the list is,
 *  and a close-then-reopen re-reads instead of holding a page from before the last attach. */
function CharacterPicker(props: AttachmentSectionProps): ReactElement {
  const trpc = useTRPC();
  const [term, setTerm] = useState("");
  const needle = useDebouncedValue(term.trim(), SEARCH_DEBOUNCE_MS);
  const charactersQuery = useQuery(trpc.character.list.queryOptions({ limit: PICKER_PAGE_LIMIT, ...(needle === "" ? {} : { search: needle }) }));

  return (
    <Stack gap="row">
      {/* The box stays mounted through every body state — including "No matches", whose only way out is to
          edit or clear the term that produced it. */}
      <Input aria-label="Search characters" onValueChange={setTerm} placeholder="Search characters" value={term} />
      <CharacterList
        bookId={props.bookId}
        attachments={props.attachments}
        queryPending={props.queryPending}
        queryError={props.queryError}
        characters={charactersQuery.data?.items ?? []}
        isPending={charactersQuery.isPending}
        needle={needle}
        onClearSearch={(): void => setTerm("")}
      />
    </Stack>
  );
}

/** The list rows, or the honest nothing. Split out so the OPEN gate above stays a single ternary. */
function CharacterList({
  bookId,
  characters,
  isPending,
  needle,
  onClearSearch,
  attachments,
  queryPending,
  queryError,
}: {
  readonly bookId: WorldBookId;
  readonly characters: readonly CharacterListItem[];
  readonly isPending: boolean;
  readonly needle: string;
  readonly onClearSearch: () => void;
  readonly attachments: AttachmentSectionProps["attachments"];
  readonly queryPending: boolean;
  readonly queryError: boolean;
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
        <CharacterAttachRow
          key={character.id}
          bookId={bookId}
          characterId={character.id}
          characterName={character.name}
          role={attachments?.characters.find((attachment) => attachment.characterId === character.id)?.role}
          queryPending={queryPending}
          queryError={queryError}
        />
      ))}
    </Stack>
  );
}
