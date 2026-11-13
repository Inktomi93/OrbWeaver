// The inbox's older reaches: the next page of rows, and the dismissed rows behind their own press. The
// dismissed read starts only on that press, so the bell never pays for it.

import { Button } from "@orb/ui/button";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { QueryErrorState, useTRPC } from "#data";
import { useInboxCollection } from "../hooks/use-inbox.ts";
import { usePageFocus } from "../hooks/use-page-focus.ts";
import { dismissedToggleLabel, LOAD_MORE_DISMISSED_LABEL, LOAD_MORE_LABEL } from "../lib/notifications-copy.ts";
import { DismissedInboxRow } from "./notification-inbox-row.tsx";

interface InboxLoadMoreProps {
  readonly hasNextPage: boolean;
  readonly isFetchingNextPage: boolean;
  /** The last press failed while earlier rows are on screen. */
  readonly failed: boolean;
  readonly onLoadMore: () => void;
  /** The control's name. Two of these share the popup, and a screen reader's list cannot tell them apart otherwise.
   *  @defaultValue {@link LOAD_MORE_LABEL} */
  readonly label?: string;
}

/** The next page is a press: the inbox is a plain list inside a popover, with no end-of-list callback. */
export function InboxLoadMore({ hasNextPage, isFetchingNextPage, failed, onLoadMore, label = LOAD_MORE_LABEL }: InboxLoadMoreProps): ReactElement | null {
  if (!hasNextPage) {
    return null;
  }
  return (
    <Stack gap="tight">
      {failed ? (
        <Text tone="destructive" role="alert" voice="label">
          Couldn't load more notifications. Try again.
        </Text>
      ) : null}
      <Row justify="center">
        <Button variant="outline" size="sm" loading={isFetchingNextPage} onClick={onLoadMore}>
          {label}
        </Button>
      </Row>
    </Stack>
  );
}

/** The dismissed list's id, so the toggle at the top of the inbox can name what it opens at the foot. */
const DISMISSED_ROWS_ID = "inbox-dismissed-rows";

/** What the dismissed list says when it is empty. A plugin's standing consent ask is not listed here, and a reader who
 *  just dismissed one must not be told nothing was. */
const NOTHING_DISMISSED_NOTE = "Nothing dismissed. The plugin consent ask is never listed here.";

export function DismissedRows(): ReactElement {
  const trpc = useTRPC();
  const dismissed = useInboxCollection({ trpc }, { state: "dismissed" });
  // Starts at row 0: the reveal itself is the first page, and without the move the press changes only its label.
  const pageFocus = usePageFocus({ rowCount: dismissed.items.length, loadMore: dismissed.loadMore, firstRow: 0 });
  return (
    <Stack gap="block" id={DISMISSED_ROWS_ID}>
      {dismissed.isEmpty ? (
        <Stack align="center" ref={pageFocus.rowRef(0)} tabIndex={-1}>
          {dismissed.error === null ? (
            <Text voice="gloss" ink="muted" textAlign="center">
              {NOTHING_DISMISSED_NOTE}
            </Text>
          ) : (
            <QueryErrorState label="dismissed notifications" onRetry={dismissed.refetch} />
          )}
        </Stack>
      ) : null}
      {dismissed.items.map((item, index) => (
        <DismissedInboxRow key={item.id} item={item} ref={pageFocus.rowRef(index)} />
      ))}
      <InboxLoadMore
        label={LOAD_MORE_DISMISSED_LABEL}
        hasNextPage={dismissed.hasNextPage}
        isFetchingNextPage={dismissed.isFetchingNextPage}
        failed={dismissed.loadMoreFailed}
        onLoadMore={pageFocus.loadNextPage}
      />
    </Stack>
  );
}

/** The press that opens the dismissed rows. It sits at the top of the inbox, where it stays in reach however many pages are loaded below. */
export function DismissedToggle({ open, onToggle }: { readonly open: boolean; readonly onToggle: () => void }): ReactElement {
  return (
    <Row justify="center">
      <Button variant="ghost" size="sm" aria-controls={open ? DISMISSED_ROWS_ID : undefined} aria-expanded={open} onClick={onToggle}>
        {dismissedToggleLabel(open)}
      </Button>
    </Row>
  );
}
