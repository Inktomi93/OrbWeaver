// The CONTEXT Relations tab — the character's cross-entity links: Linked World Books
// (worldInfo.attach/detach/listForCharacter) + Connected Personas (persona.connect/disconnect/
// listConnectedToCharacter). Each is a RelationManagerSection (tier-2): an inline summary list + an add-picker
// Dialog. All writes are IMMEDIATE (never the CONTENT save-bar). NO chat-lore control here — CHAT-scoped
// book attachment is the Chats lane's concern.

import type { CharacterId, PersonaId, WorldBookId } from "@orb/kit/ids";
import { Section, Stack } from "@orb/ui/layout";
import type { ReactElement, ReactNode } from "react";
import type { RelationManagerItem } from "#components";
import { QueryBoundary, RelationManagerSection } from "#components";
import { QueryErrorState, SkeletonRows, useInvalidation, useSuspenseQueries, useTRPC } from "#data";
import {
  useAttachBookToCharacter,
  useConnectPersonaToCharacter,
  useDetachBookFromCharacter,
  useDisconnectPersonaFromCharacter,
} from "../hooks/use-character-context-mutations.ts";
import { CHARACTER_CONNECT_PERSONA_NAME, CHARACTER_LINK_BOOK_NAME } from "../lib/character-names.ts";

export interface CharacterRelationsTabProps {
  readonly characterId: CharacterId;
}

const RELATION_SKELETON_ROWS = 2;

// A RELATION SECTION IS ATOMIC, so a failed half fails the whole (#1500). Both reads feed one control: the
// attached list IS the section's answer, and the catalogue is what the picker offers. With either one unknown
// every affordance states something false — an empty `attached` says "none linked" about a character that may
// have five. The section's own boundary settles both reads together and offers the re-read.
function RelationBoundary({ heading, noun, children }: { readonly heading: string; readonly noun: string; readonly children: ReactNode }): ReactElement {
  return (
    <QueryBoundary
      fallback={
        <Section heading={heading}>
          <SkeletonRows count={RELATION_SKELETON_ROWS} />
        </Section>
      }
      renderError={(_error, retry): ReactElement => (
        <Section heading={heading}>
          <QueryErrorState label={`this character's ${noun}`} onRetry={retry} />
        </Section>
      )}
    >
      {children}
    </QueryBoundary>
  );
}

export function CharacterRelationsTab({ characterId }: CharacterRelationsTabProps): ReactElement {
  return (
    <Stack gap="section">
      <RelationBoundary heading="Linked world books" key={`books-${characterId}`} noun="linked world books">
        <LinkedBooksSection characterId={characterId} />
      </RelationBoundary>
      <RelationBoundary heading="Connected personas" key={`personas-${characterId}`} noun="connected personas">
        <ConnectedPersonasSection characterId={characterId} />
      </RelationBoundary>
    </Stack>
  );
}

function LinkedBooksSection({ characterId }: CharacterRelationsTabProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const [{ data: attached }, { data: allBooks }] = useSuspenseQueries({
    queries: [trpc.worldInfo.listForCharacter.queryOptions({ characterId }), trpc.worldInfo.listBooks.queryOptions()],
  });
  const attach = useAttachBookToCharacter({ trpc, invalidation });
  const detach = useDetachBookFromCharacter({ trpc, invalidation });
  const attachedIds = new Set(attached.map((b) => b.id));

  const items: readonly RelationManagerItem<WorldBookId>[] = attached.map((book) => ({ id: book.id, title: book.name, subtitle: book.role ?? "auxiliary" }));
  const available: readonly RelationManagerItem<WorldBookId>[] = allBooks
    .filter((book) => !attachedIds.has(book.id))
    .map((book) => ({ id: book.id, title: book.name, ...(book.description === null ? {} : { subtitle: book.description }) }));

  return (
    <RelationManagerSection
      addEmptyLabel="Every book is already linked."
      addLabel="Link"
      addTitle="Link a world book"
      addTriggerLabel={CHARACTER_LINK_BOOK_NAME}
      available={available}
      emptyLabel="No world books linked."
      heading="Linked world books"
      items={items}
      onAdd={(item): void => attach.mutate({ characterId, bookId: item.id, role: "auxiliary" })}
      onRemove={(item): void => detach.mutate({ characterId, bookId: item.id })}
      removeLabel="Unlink"
    />
  );
}

function ConnectedPersonasSection({ characterId }: CharacterRelationsTabProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const [{ data: connected }, { data: allPersonas }] = useSuspenseQueries({
    queries: [trpc.persona.listConnectedToCharacter.queryOptions({ characterId }), trpc.persona.list.queryOptions()],
  });
  const connect = useConnectPersonaToCharacter({ trpc, invalidation });
  const disconnect = useDisconnectPersonaFromCharacter({ trpc, invalidation });
  const connectedIds = new Set(connected.map((p) => p.id));

  const items: readonly RelationManagerItem<PersonaId>[] = connected.map((persona) => ({
    id: persona.id,
    title: persona.name,
    ...(persona.title === null ? {} : { subtitle: persona.title }),
  }));
  const available: readonly RelationManagerItem<PersonaId>[] = allPersonas
    .filter((persona) => !connectedIds.has(persona.id))
    .map((persona) => ({ id: persona.id, title: persona.name, ...(persona.title === null ? {} : { subtitle: persona.title }) }));

  return (
    <RelationManagerSection
      addEmptyLabel="Every persona is already connected."
      addLabel="Connect"
      addTitle={CHARACTER_CONNECT_PERSONA_NAME}
      addTriggerLabel={CHARACTER_CONNECT_PERSONA_NAME}
      available={available}
      emptyLabel="No personas connected."
      heading="Connected personas"
      items={items}
      onAdd={(item): void => connect.mutate({ characterId, personaId: item.id })}
      onRemove={(item): void => disconnect.mutate({ characterId, personaId: item.id })}
      removeLabel="Disconnect"
    />
  );
}
