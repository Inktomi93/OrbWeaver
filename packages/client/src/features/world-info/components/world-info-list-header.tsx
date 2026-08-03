// The World Info LIST chrome-band header (north-star §4 N2, D66 A1/A2 — the L4 band sweep). World Info was
// one of the two sections still printing its title INSIDE the pane via `LibraryListLayout`; the title, the
// live book count, and the ONE primary (New) now ride the `.shell-panel-header` band through the section
// definition's `listHeader` slot, like chats/corpus/analytics already did.
//
// The band owns the create verb because the band is where a pane's ONE primary lives (A2) — so the new
// book's selection write lands here too (`selectWorldBookFromList`, which also closes the mobile sheet).
//
// F2: it also owns IMPORT — the ruled anatomy's band=Import. The world-info export/import verbs were BUILT
// and had ZERO doors, so sharing one lorebook (the most-shared artifact after a card) meant a full
// library-zip round-trip through the backup pane. Import is a GHOST icon beside the ONE primary (the preset
// band's grammar); Export is the row kebab.
//
// The count is a non-suspending `useQuery` sharing the `listBooks` cache with the suspending list below, so
// no extra fetch: the title + New render immediately and stay put while the count settles.

import { Button } from "@orb/ui/button";
import { FileTrigger } from "@orb/ui/file-trigger";
import { Icon, Plus, Upload } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { ListPaneHeader } from "#components";
import { useInvalidation, useTRPC } from "#data";
import { notify } from "#lib";
import { selectWorldBookFromList } from "#state";
import { useCreateWorldBook, useImportWorldBookFile } from "../hooks/use-world-info-mutations";

const NEW_BOOK_NAME = "New book";
/** ONE string for the import door's accessible name AND its hover tooltip (they can't drift). */
const IMPORT_LABEL = "Import a world-info book";

export function WorldInfoListHeader(): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { data: books } = useQuery(trpc.worldInfo.listBooks.queryOptions());
  const create = useCreateWorldBook({ trpc, invalidation });
  const importBook = useImportWorldBookFile({ trpc, invalidation });

  const onCreate = (): void => {
    void create.mutateAsync({ input: { name: NEW_BOOK_NAME } }).then((created) => {
      selectWorldBookFromList(created.id);
    });
  };

  const onImportFile = async (file: File): Promise<void> => {
    try {
      const { created } = await importBook.mutateAsync({ fileText: await file.text() });
      notify.success(created ? "Book imported." : "Book merged into the one with the same name.");
    } catch (error) {
      // The SERVER's refusal reason, rendered as words: "written by a newer version of orbweaver" is a
      // different problem from "that isn't a world-info book", and only the difference is actionable.
      notify.error(error instanceof Error ? error.message : "Couldn't import the book.");
    }
  };

  return (
    <ListPaneHeader
      action={
        // ONE flex child, so the band's space-between keeps the cluster hard against the trailing edge.
        <Row align="center" gap="field">
          {/* `size="icon"` (not `sm`): an icon-only trigger in an `sm` box measures under the 44px coarse
              floor — `size="icon"` is `size-control-md`, 34px fine / 48px coarse BY TOKEN (D62 P1). */}
          <FileTrigger
            accept="application/json"
            onFilesSelected={([file]): void => {
              if (file !== undefined) {
                void onImportFile(file);
              }
            }}
          >
            {({ open }): ReactElement => (
              <Button aria-label={IMPORT_LABEL} disabled={importBook.isPending} intent="ghost" onClick={open} size="icon" title={IMPORT_LABEL}>
                <Icon icon={Upload} size="sm" />
              </Button>
            )}
          </FileTrigger>
          <Button disabled={create.isPending} intent="primary" onClick={onCreate} size="sm">
            <Icon icon={Plus} size="sm" />
            New
          </Button>
        </Row>
      }
      count={books?.length ?? 0}
      title="World Info"
    />
  );
}
