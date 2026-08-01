// The World Info LIST chrome-band header (north-star §4 N2, D66 A1/A2 — the L4 band sweep). World Info was
// one of the two sections still printing its title INSIDE the pane via `LibraryListLayout`; the title, the
// live book count, and the ONE primary (New) now ride the `.shell-panel-header` band through the section
// definition's `listHeader` slot, like chats/corpus/analytics already did.
//
// The band owns the create verb because the band is where a pane's ONE primary lives (A2) — so the new
// book's selection write lands here too (`selectWorldBookFromList`, which also closes the mobile sheet).
//
// The count is a non-suspending `useQuery` sharing the `listBooks` cache with the suspending list below, so
// no extra fetch: the title + New render immediately and stay put while the count settles.

import { Button } from "@orb/ui/button";
import { Icon, Plus } from "@orb/ui/icons";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { ListPaneHeader } from "#components";
import { useInvalidation, useTRPC } from "#data";
import { selectWorldBookFromList } from "#state";
import { useCreateWorldBook } from "../hooks/use-world-info-mutations";

const NEW_BOOK_NAME = "New book";

export function WorldInfoListHeader(): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { data: books } = useQuery(trpc.worldInfo.listBooks.queryOptions());
  const create = useCreateWorldBook({ trpc, invalidation });

  const onCreate = (): void => {
    void create.mutateAsync({ input: { name: NEW_BOOK_NAME } }).then((created) => {
      selectWorldBookFromList(created.id);
    });
  };

  return (
    <ListPaneHeader
      action={
        <Button disabled={create.isPending} intent="primary" onClick={onCreate} size="sm">
          <Icon icon={Plus} size="sm" />
          New
        </Button>
      }
      count={books?.length ?? 0}
      title="World Info"
    />
  );
}
