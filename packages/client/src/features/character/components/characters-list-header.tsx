// The Characters LIST chrome-band header — BOTH modes of the modal pane (list-pane-projection §3.4, D9),
// and the close of the A1/N2 gap: characters passed no `listHeader` at all, so its title + create lived in
// the in-surface toolbar while every other section had migrated to the band.
//
//   PICKER (no selection)     — `CHARACTERS` + the ONE primary: New, with Import beside it as the band ghost.
//   PROJECTION (her selected) — back chevron + `CHATS · <name>` + the ONE primary: New chat.
//
// The band swaps on the SAME selection read the pane does (D9): the band is the panel's chrome VOICE, and
// a `CHARACTERS` band standing over her chats would mislabel the pane for anyone landing on it — including
// a screen-reader user who meets the band before the rows.
//
// Back lives HERE (not in the pane) because it is chrome, and it is a plain `clearCharacterSelection`: the
// pane restores focus to her row by remembering the last selection itself, so the two render props need no
// shared state.

import type { CharacterId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Icon, Plus } from "@orb/ui/icons";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { ListPaneHeader } from "#components";
import { useTRPC } from "#data";
import { clearCharacterSelection, useSelectedCharacterId } from "#state";
import { useStartChatWithCharacter } from "../lib/character-chat-intents.ts";
import { CharacterCreateActions } from "./character-create-actions.tsx";

/** The band wants the CENSUS, not the rows — the smallest page the server will serve still carries it. */
const COUNT_ONLY_PAGE = 1;

export function CharactersListHeader(): ReactElement {
  const selectedId = useSelectedCharacterId();
  return selectedId === null ? <PickerBand /> : <ProjectionBand characterId={selectedId} />;
}

/** Role 1 — the library picker's band. THE COUNT IS BACK, and it is the server's census (2026-08-13). It was
 *  deleted when the list went keyset-paged because the only number available then was "loaded so far", and a
 *  census that silently means something else is worse than none. `character.list` serves a real `COUNT` over
 *  the request's scope now, so the band asks for the cheapest possible page and prints `totalCount`: one
 *  honest number, one tiny read (the `chat-list-header.tsx` shape). Unscoped on purpose — the band names the
 *  LIBRARY, while the pane's own live region reports what the current filters match. */
function PickerBand(): ReactElement {
  const trpc = useTRPC();
  const { data: page } = useQuery(trpc.character.list.queryOptions({ limit: COUNT_ONLY_PAGE }));
  return <ListPaneHeader action={<CharacterCreateActions />} count={page?.totalCount ?? 0} title="Characters" />;
}

/** Role 2 — her history's band. The name resolves off the SAME `character.get` cache the editor beside it
 *  suspends on, so this is a cache hit; until it lands the band is still honest ("CHATS"), never blank. */
function ProjectionBand({ characterId }: { readonly characterId: CharacterId }): ReactElement {
  const trpc = useTRPC();
  const { data } = useQuery(trpc.character.get.queryOptions({ characterId }));
  const name = data?.name;
  const startChatWith = useStartChatWithCharacter();

  return (
    <ListPaneHeader
      action={
        <Button intent="primary" onClick={(): void => startChatWith(characterId)} size="sm">
          <Icon icon={Plus} size="sm" />
          New chat
        </Button>
      }
      back={{ label: "Back to all characters", onClick: clearCharacterSelection }}
      title="Chats"
      {...(name === undefined ? {} : { accent: name })}
    />
  );
}
