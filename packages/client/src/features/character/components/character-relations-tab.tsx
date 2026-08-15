// The CONTEXT Relations tab — the character's cross-entity links: Linked World Books
// (worldInfo.attach/detach/listForCharacter) + Connected Personas (persona.connect/disconnect/
// listConnectedToCharacter). Each is a RelationManagerSection (tier-2): an inline summary list + an add-picker
// Dialog. All writes are IMMEDIATE (never the CONTENT save-bar). NO chat-lore control here (PD-30 — CHAT-scoped
// book attachment is the Chats lane's concern).

import type { CharacterId, PersonaId, WorldBookId } from "@orb/kit/ids";
import { Stack } from "@orb/ui/layout";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import type { RelationManagerItem } from "#components";
import { RelationManagerSection } from "#components";
import { useInvalidation, useTRPC } from "#data";
import {
  useAttachBookToCharacter,
  useConnectPersonaToCharacter,
  useDetachBookFromCharacter,
  useDisconnectPersonaFromCharacter,
} from "../hooks/use-character-context-mutations.ts";

export interface CharacterRelationsTabProps {
  readonly characterId: CharacterId;
}

export function CharacterRelationsTab({ characterId }: CharacterRelationsTabProps): ReactElement {
  return (
    <Stack gap="section">
      <LinkedBooksSection characterId={characterId} />
      <ConnectedPersonasSection characterId={characterId} />
    </Stack>
  );
}

function LinkedBooksSection({ characterId }: CharacterRelationsTabProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const attachedQuery = useQuery(trpc.worldInfo.listForCharacter.queryOptions({ characterId }));
  const allBooksQuery = useQuery(trpc.worldInfo.listBooks.queryOptions());
  const attach = useAttachBookToCharacter({ trpc, invalidation });
  const detach = useDetachBookFromCharacter({ trpc, invalidation });

  const attached = attachedQuery.data ?? [];
  const attachedIds = new Set(attached.map((b) => b.id));

  const items: readonly RelationManagerItem<WorldBookId>[] = attached.map((book) => ({ id: book.id, title: book.name, subtitle: book.role ?? "auxiliary" }));
  const available: readonly RelationManagerItem<WorldBookId>[] = (allBooksQuery.data ?? [])
    .filter((book) => !attachedIds.has(book.id))
    .map((book) => ({ id: book.id, title: book.name, ...(book.description === null ? {} : { subtitle: book.description }) }));

  return (
    <RelationManagerSection
      addEmptyLabel="Every book is already linked."
      addLabel="Link"
      addTitle="Link a world book"
      addTriggerLabel="Link a book"
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
  const connectedQuery = useQuery(trpc.persona.listConnectedToCharacter.queryOptions({ characterId }));
  const allPersonasQuery = useQuery(trpc.persona.list.queryOptions());
  const connect = useConnectPersonaToCharacter({ trpc, invalidation });
  const disconnect = useDisconnectPersonaFromCharacter({ trpc, invalidation });

  const connected = connectedQuery.data ?? [];
  const connectedIds = new Set(connected.map((p) => p.id));

  const items: readonly RelationManagerItem<PersonaId>[] = connected.map((persona) => ({
    id: persona.id,
    title: persona.name,
    ...(persona.title === null ? {} : { subtitle: persona.title }),
  }));
  const available: readonly RelationManagerItem<PersonaId>[] = (allPersonasQuery.data ?? [])
    .filter((persona) => !connectedIds.has(persona.id))
    .map((persona) => ({ id: persona.id, title: persona.name, ...(persona.title === null ? {} : { subtitle: persona.title }) }));

  return (
    <RelationManagerSection
      addEmptyLabel="Every persona is already connected."
      addLabel="Connect"
      addTitle="Connect a persona"
      addTriggerLabel="Connect a persona"
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
