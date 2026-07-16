// The CONTEXT Relations tab (FINAL-Character §7) — the character's cross-entity links: Linked World Books
// (worldInfo.attach/detach/listForCharacter) + Connected Personas (persona.connect/disconnect/
// listConnectedToCharacter). Each is an inline summary list + a picker Dialog (legal — a picker is not
// section-content, rule 5). All writes are IMMEDIATE (never the CONTENT save-bar). NO chat-lore control
// here (PD-30 — CHAT-scoped book attachment is the Chats lane's concern).

import type { CharacterId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Dialog, DialogClose, DialogPopup, DialogTitle, DialogTrigger } from "@orb/ui/dialog";
import { Section, Stack } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useMemo } from "react";
import { useInvalidation, useTRPC } from "#data";
import {
  useAttachBookToCharacter,
  useConnectPersonaToCharacter,
  useDetachBookFromCharacter,
  useDisconnectPersonaFromCharacter,
} from "../hooks/use-character-context-mutations";

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

  // Memoized so the `?? []` fallback keeps a stable identity for the attachedIds useMemo below.
  const attached = useMemo(() => attachedQuery.data ?? [], [attachedQuery.data]);
  const attachedIds = useMemo(() => new Set(attached.map((b) => b.id)), [attached]);
  const available = (allBooksQuery.data ?? []).filter((b) => !attachedIds.has(b.id));

  return (
    <Section heading="Linked world books">
      {attached.length === 0 ? (
        <Text tone="muted">No world books linked.</Text>
      ) : (
        <Stack gap="row">
          {attached.map((book) => (
            <ListRow
              key={book.id}
              title={book.name}
              subtitle={book.role ?? "auxiliary"}
              actions={
                <Button intent="ghost" onClick={(): void => detach.mutate({ characterId, bookId: book.id })}>
                  Unlink
                </Button>
              }
            />
          ))}
        </Stack>
      )}
      <Dialog>
        <DialogTrigger render={<Button intent="secondary">Link a book</Button>} />
        <DialogPopup>
          <Stack gap="block">
            <DialogTitle>Link a world book</DialogTitle>
            {available.length === 0 ? (
              <Text tone="muted">Every book is already linked.</Text>
            ) : (
              <Stack gap="row">
                {available.map((book) => (
                  <ListRow
                    key={book.id}
                    title={book.name}
                    {...(book.description === null ? {} : { subtitle: book.description })}
                    actions={
                      <Button intent="ghost" onClick={(): void => attach.mutate({ characterId, bookId: book.id, role: "auxiliary" })}>
                        Link
                      </Button>
                    }
                  />
                ))}
              </Stack>
            )}
            <DialogClose render={<Button intent="ghost">Done</Button>} />
          </Stack>
        </DialogPopup>
      </Dialog>
    </Section>
  );
}

function ConnectedPersonasSection({ characterId }: CharacterRelationsTabProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const connectedQuery = useQuery(trpc.persona.listConnectedToCharacter.queryOptions({ characterId }));
  const allPersonasQuery = useQuery(trpc.persona.list.queryOptions());
  const connect = useConnectPersonaToCharacter({ trpc, invalidation });
  const disconnect = useDisconnectPersonaFromCharacter({ trpc, invalidation });

  // Memoized so the `?? []` fallback keeps a stable identity for the connectedIds useMemo below.
  const connected = useMemo(() => connectedQuery.data ?? [], [connectedQuery.data]);
  const connectedIds = useMemo(() => new Set(connected.map((p) => p.id)), [connected]);
  const available = (allPersonasQuery.data ?? []).filter((p) => !connectedIds.has(p.id));

  return (
    <Section heading="Connected personas">
      {connected.length === 0 ? (
        <Text tone="muted">No personas connected.</Text>
      ) : (
        <Stack gap="row">
          {connected.map((persona) => (
            <ListRow
              key={persona.id}
              title={persona.name}
              {...(persona.title === null ? {} : { subtitle: persona.title })}
              actions={
                <Button intent="ghost" onClick={(): void => disconnect.mutate({ characterId, personaId: persona.id })}>
                  Disconnect
                </Button>
              }
            />
          ))}
        </Stack>
      )}
      <Dialog>
        <DialogTrigger render={<Button intent="secondary">Connect a persona</Button>} />
        <DialogPopup>
          <Stack gap="block">
            <DialogTitle>Connect a persona</DialogTitle>
            {available.length === 0 ? (
              <Text tone="muted">Every persona is already connected.</Text>
            ) : (
              <Stack gap="row">
                {available.map((persona) => (
                  <ListRow
                    key={persona.id}
                    title={persona.name}
                    {...(persona.title === null ? {} : { subtitle: persona.title })}
                    actions={
                      <Button intent="ghost" onClick={(): void => connect.mutate({ characterId, personaId: persona.id })}>
                        Connect
                      </Button>
                    }
                  />
                ))}
              </Stack>
            )}
            <DialogClose render={<Button intent="ghost">Done</Button>} />
          </Stack>
        </DialogPopup>
      </Dialog>
    </Section>
  );
}
