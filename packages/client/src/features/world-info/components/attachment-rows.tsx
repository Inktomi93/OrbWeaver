// The per-TARGET attachment rows for the book activation panel. The world-info attachment API is
// TARGET-scoped (`listForCharacter(characterId)` / `listForPersona(personaId)` — there is no per-book reverse
// index), so each row owns the ONE membership query for its target and derives "is THIS book attached?" from
// it. A `Switch` toggles attach/detach; for characters the `role` axis (primary/auxiliary — the card-bound
// vs installation-extra distinction) rides an inline `Select` shown only while attached (attachToCharacter is
// an idempotent upsert, so re-attaching with a new role re-stamps it). Chat scope is deferred at transport.

import type { WorldBookRole } from "@orb/contracts/world-info";
import { WORLD_BOOK_ROLES } from "@orb/contracts/world-info";
import type { CharacterId, PersonaId, WorldBookId } from "@orb/kit/ids";
import { ListRow } from "@orb/ui/list-row";
import type { SelectItems } from "@orb/ui/select";
import { Select } from "@orb/ui/select";
import { Switch } from "@orb/ui/switch";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useInvalidation, useTRPC } from "#data";
import {
  useAttachWorldBookToCharacter,
  useAttachWorldBookToPersona,
  useDetachWorldBookFromCharacter,
  useDetachWorldBookFromPersona,
} from "../hooks/use-world-info-mutations.ts";

const ROLE_ITEMS: SelectItems<string> = WORLD_BOOK_ROLES.map((value) => ({ value, label: value }));

export interface CharacterAttachRowProps {
  readonly bookId: WorldBookId;
  readonly characterId: CharacterId;
  readonly characterName: string;
}

/** One character row: attach/detach this book + (while attached) its primary/auxiliary role. */
export function CharacterAttachRow({ bookId, characterId, characterName }: CharacterAttachRowProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const attachedQuery = useQuery(trpc.worldInfo.listForCharacter.queryOptions({ characterId }));
  const attach = useAttachWorldBookToCharacter({ trpc, invalidation });
  const detach = useDetachWorldBookFromCharacter({ trpc, invalidation });

  const attachment = (attachedQuery.data ?? []).find((b) => b.id === bookId);
  const attached = attachment !== undefined;

  return (
    <ListRow
      title={characterName}
      {...(attached ? { subtitle: attachment.role ?? "auxiliary" } : {})}
      actions={
        <>
          {attached ? (
            <Select
              items={ROLE_ITEMS}
              value={attachment.role ?? "auxiliary"}
              onValueChange={(role): void => attach.mutate({ characterId, bookId, role: role as WorldBookRole })}
              aria-label={`Role for ${characterName}`}
            />
          ) : null}
          <Switch
            aria-label={`Attach to ${characterName}`}
            checked={attached}
            onCheckedChange={(on): void => {
              if (on) {
                attach.mutate({ characterId, bookId, role: "auxiliary" });
              } else {
                detach.mutate({ characterId, bookId });
              }
            }}
          />
        </>
      }
    />
  );
}

export interface PersonaAttachRowProps {
  readonly bookId: WorldBookId;
  readonly personaId: PersonaId;
  readonly personaName: string;
}

/** One persona row: attach/detach this book (personas carry no role). */
export function PersonaAttachRow({ bookId, personaId, personaName }: PersonaAttachRowProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const attachedQuery = useQuery(trpc.worldInfo.listForPersona.queryOptions({ personaId }));
  const attach = useAttachWorldBookToPersona({ trpc, invalidation });
  const detach = useDetachWorldBookFromPersona({ trpc, invalidation });

  const attached = (attachedQuery.data ?? []).some((b) => b.id === bookId);

  return (
    <ListRow
      title={personaName}
      actions={
        <Switch
          aria-label={`Attach to ${personaName}`}
          checked={attached}
          onCheckedChange={(on): void => {
            if (on) {
              attach.mutate({ personaId, bookId });
            } else {
              detach.mutate({ personaId, bookId });
            }
          }}
        />
      }
    />
  );
}
