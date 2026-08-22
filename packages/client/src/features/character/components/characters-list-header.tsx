// The Characters LIST chrome-band header — `CHARACTERS` + the count + the ONE primary (New, with Import
// beside it as the band ghost). It closed the A1/N2 gap: characters passed no `listHeader` at all, so its
// title + create lived in the in-surface toolbar while every other section had migrated to the band.
//
// ONE MODE (#501, owner ruling 2026-08-22). The band used to SWAP with the pane (D9): a back chevron +
// `CHATS · <name>` + New chat whenever a character was open, because the pane below it had become her chats.
// The pane is the library now whatever is selected, so a swapping band would mislabel it — the band names
// what the pane IS, and the pane is always the library. Her chats moved to the CONTEXT Chats tab, and the
// two affordances the projection band carried went with them: BACK is not needed (nothing was replaced), and
// New chat is the editor hero's primary (CONTENT tier, where she is open) plus the chats pane's own empty
// state.

import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { ListPaneHeader } from "#components";
import { useTRPC } from "#data";
import { CharacterCreateActions } from "./character-create-actions.tsx";

/** The band wants the CENSUS, not the rows — the smallest page the server will serve still carries it. */
const COUNT_ONLY_PAGE = 1;

/** THE COUNT IS THE SERVER'S CENSUS (2026-08-13). It was deleted when the list went keyset-paged because the
 *  only number available then was "loaded so far", and a census that silently means something else is worse
 *  than none. `character.list` serves a real `COUNT` over the request's scope now, so the band asks for the
 *  cheapest possible page and prints `totalCount`: one honest number, one tiny read (the
 *  `chat-list-header.tsx` shape). Unscoped on purpose — the band names the LIBRARY, while the pane's own live
 *  region reports what the current filters match. */
export function CharactersListHeader(): ReactElement {
  const trpc = useTRPC();
  const { data: page } = useQuery(trpc.character.list.queryOptions({ limit: COUNT_ONLY_PAGE }));
  return <ListPaneHeader action={<CharacterCreateActions />} count={page?.totalCount ?? 0} title="Characters" />;
}
