// The per-TARGET attachment rows for the book activation panel. The world-info attachment API is
// TARGET-scoped writes stay `attachToCharacter` / `attachToPersona`, while the book-centric read is the ONE
// `listAttachmentsForBook(bookId)` reverse index owned by the parent. Each row receives only its target's
// result. A `Switch` toggles attach/detach; for characters the `role` axis (primary/auxiliary — the card-bound
// vs installation-extra distinction) rides an inline `Select` shown only while attached (attachToCharacter is
// an idempotent upsert, so re-attaching with a new role re-stamps it). The CHAT scope has no row here on
// purpose — it is host-gated over a membership-scoped room, so its affordance lives in the room (#640; the
// panel header states the ruling).

import type { WorldBookRole } from "@orb/contracts/world-info";
import { WORLD_BOOK_ROLES } from "@orb/contracts/world-info";
import type { CharacterId, PersonaId, WorldBookId } from "@orb/kit/ids";
import { ListRow } from "@orb/ui/list-row";
import type { SelectItems } from "@orb/ui/select";
import { Select } from "@orb/ui/select";
import { Switch } from "@orb/ui/switch";
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
  readonly role: WorldBookRole | undefined;
  readonly queryPending: boolean;
  readonly queryError: boolean;
}

/** One character row: attach/detach this book + (while attached) its primary/auxiliary role. */
export function CharacterAttachRow({ bookId, characterId, characterName, role, queryPending, queryError }: CharacterAttachRowProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const attach = useAttachWorldBookToCharacter({ trpc, invalidation });
  const detach = useDetachWorldBookFromCharacter({ trpc, invalidation });

  const attached = role !== undefined;
  const controlsDisabled = queryPending || queryError || attach.isPending || detach.isPending;

  return (
    <ListRow
      title={characterName}
      {...(attached ? { subtitle: role } : {})}
      actions={
        <>
          {attached ? (
            <Select
              disabled={controlsDisabled}
              items={ROLE_ITEMS}
              value={role}
              onValueChange={(nextRole): void => attach.mutate({ characterId, bookId, role: nextRole as WorldBookRole })}
              aria-label={`Role for ${characterName}`}
            />
          ) : null}
          <Switch
            aria-label={`Attach to ${characterName}`}
            checked={attached}
            disabled={controlsDisabled}
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
  readonly attached: boolean;
  readonly queryPending: boolean;
  readonly queryError: boolean;
}

/** One persona row: attach/detach this book (personas carry no role). */
export function PersonaAttachRow({ bookId, personaId, personaName, attached, queryPending, queryError }: PersonaAttachRowProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const attach = useAttachWorldBookToPersona({ trpc, invalidation });
  const detach = useDetachWorldBookFromPersona({ trpc, invalidation });

  const controlsDisabled = queryPending || queryError || attach.isPending || detach.isPending;

  return (
    <ListRow
      title={personaName}
      actions={
        <Switch
          aria-label={`Attach to ${personaName}`}
          checked={attached}
          disabled={controlsDisabled}
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
