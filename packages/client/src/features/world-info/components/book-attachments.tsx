// Book activation reads settle together; failed reads never become unattached rows.
import type { BookAttachmentTargets } from "@orb/contracts/world-info";
import type { WorldBookId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { ChevronDown, ChevronRight, Icon } from "@orb/ui/icons";
import { Input } from "@orb/ui/input";
import { Row, Section, Stack } from "@orb/ui/layout";
import { Switch } from "@orb/ui/switch";
import { Text } from "@orb/ui/text";
import { useSuspenseQueries, useSuspenseQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import { QueryBoundary } from "#components";
import type { Trpc } from "#data";
import { QueryErrorState, SkeletonRows, useInvalidation, useTRPC } from "#data";
import { useDebouncedValue } from "#lib";
import { useAttachWorldBookGlobal, useDetachWorldBookGlobal } from "../hooks/use-world-info-mutations.ts";
import { CharacterAttachRow, PersonaAttachRow } from "./attachment-rows.tsx";

const PICKER_PAGE_LIMIT = 100;
const SEARCH_DEBOUNCE_MS = 250;
const PICKER_SKELETON_ROWS = 3;

export interface BookAttachmentsProps {
  readonly bookId: WorldBookId;
}
interface AttachmentSectionProps extends BookAttachmentsProps {
  readonly attachments: BookAttachmentTargets;
}

/** The activation panel for one book, with shared loading and retry states. */
export function BookAttachments(props: BookAttachmentsProps): ReactElement {
  return (
    <QueryBoundary
      fallback={<SkeletonRows count={PICKER_SKELETON_ROWS} />}
      renderError={(_error, retry): ReactElement => <QueryErrorState label="book attachments" onRetry={retry} />}
    >
      <BookAttachmentsBody {...props} />
    </QueryBoundary>
  );
}

function BookAttachmentsBody({ bookId }: BookAttachmentsProps): ReactElement {
  const trpc = useTRPC();
  const [{ data: attachments }, { data: globalBooks }, { data: personas }, { data: usage }] = useSuspenseQueries({
    queries: [
      trpc.worldInfo.listAttachmentsForBook.queryOptions({ bookId }),
      trpc.worldInfo.listGlobal.queryOptions(),
      trpc.persona.list.queryOptions(),
      trpc.worldInfo.listBooksWithUsage.queryOptions(),
    ],
  });
  return (
    <Stack gap="section" padding="block">
      <GlobalSection bookId={bookId} isGlobal={globalBooks.some((book) => book.id === bookId)} />
      <PersonasSection bookId={bookId} attachments={attachments} personas={personas} />
      <CharactersSection bookId={bookId} attachments={attachments} attachedCount={usage.find((book) => book.id === bookId)?.usage.characters ?? 0} />
    </Stack>
  );
}

function GlobalSection({ bookId, isGlobal }: BookAttachmentsProps & { readonly isGlobal: boolean }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const attach = useAttachWorldBookGlobal({ trpc, invalidation });
  const detach = useDetachWorldBookGlobal({ trpc, invalidation });
  return (
    <Stack gap="field">
      <Row gap="row" align="center" justify="between">
        <Text as="span" voice="label">
          Fires in every chat
        </Text>
        <Switch
          aria-label="Fires in every chat"
          checked={isGlobal}
          disabled={attach.isPending || detach.isPending}
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

function PersonasSection({
  bookId,
  attachments,
  personas,
}: AttachmentSectionProps & { readonly personas: inferOutput<Trpc["persona"]["list"]> }): ReactElement {
  return (
    <Section kicker={`Attached by personas · ${personas.length}`}>
      {personas.length === 0 ? (
        <Text voice="gloss">No personas yet. Create one from the rail-foot Account &amp; personas panel.</Text>
      ) : (
        <Stack gap="row">
          {personas.map((persona) => (
            <PersonaAttachRow
              key={persona.id}
              bookId={bookId}
              personaId={persona.id}
              personaName={persona.name}
              attached={attachments.personaIds.includes(persona.id)}
              queryPending={false}
              queryError={false}
            />
          ))}
        </Stack>
      )}
    </Section>
  );
}

function CharactersSection({ bookId, attachments, attachedCount }: AttachmentSectionProps & { readonly attachedCount: number }): ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <Section kicker={`Attached by characters · ${attachedCount}`}>
      <Stack gap="row">
        <Button intent="ghost" size="sm" aria-expanded={open} onClick={(): void => setOpen((prev) => !prev)}>
          <Icon icon={open ? ChevronDown : ChevronRight} size="sm" />
          {open ? "Hide characters" : "Attach to a character"}
        </Button>
        {open ? <CharacterPicker bookId={bookId} attachments={attachments} /> : null}
      </Stack>
    </Section>
  );
}

function CharacterPicker(props: AttachmentSectionProps): ReactElement {
  const [term, setTerm] = useState("");
  const needle = useDebouncedValue(term.trim(), SEARCH_DEBOUNCE_MS);
  return (
    <Stack gap="row">
      <Input aria-label="Search characters" onValueChange={setTerm} placeholder="Search characters" value={term} />
      <QueryBoundary
        fallback={<SkeletonRows count={PICKER_SKELETON_ROWS} shape="avatar-row" />}
        renderError={(_error, retry): ReactElement => <QueryErrorState label="characters" onRetry={retry} />}
      >
        <CharacterMatches {...props} needle={needle} onClearSearch={(): void => setTerm("")} />
      </QueryBoundary>
    </Stack>
  );
}

function CharacterMatches({
  bookId,
  attachments,
  needle,
  onClearSearch,
}: AttachmentSectionProps & { readonly needle: string; readonly onClearSearch: () => void }): ReactElement {
  const trpc = useTRPC();
  const { data } = useSuspenseQuery(trpc.character.list.queryOptions({ limit: PICKER_PAGE_LIMIT, ...(needle === "" ? {} : { search: needle }) }));
  if (data.items.length === 0) {
    return needle === "" ? (
      <Text voice="gloss">No characters yet.</Text>
    ) : (
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
  return (
    <Stack gap="row">
      {data.items.map((character) => (
        <CharacterAttachRow
          key={character.id}
          bookId={bookId}
          characterId={character.id}
          characterName={character.name}
          role={attachments.characters.find((attachment) => attachment.characterId === character.id)?.role}
          queryPending={false}
          queryError={false}
        />
      ))}
    </Stack>
  );
}
