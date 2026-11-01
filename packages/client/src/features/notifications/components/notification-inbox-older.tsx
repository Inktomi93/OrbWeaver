// The inbox's older reaches: the next page of rows, and the dismissed rows behind their own press. The
// dismissed read starts only on that press, so the bell never pays for it.

import { Button } from "@orb/ui/button";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useState } from "react";
import { QueryErrorState, useTRPC } from "#data";
import { useInboxCollection } from "../hooks/use-inbox.ts";
import { usePageFocus } from "../hooks/use-page-focus.ts";
import { DismissedInboxRow } from "./notification-inbox-row.tsx";

interface InboxLoadMoreProps {
  readonly hasNextPage: boolean;
  readonly isFetchingNextPage: boolean;
  /** The last press failed while earlier rows are on screen. */
  readonly failed: boolean;
  readonly onLoadMore: () => void;
  /** The control's name. Two of these share the popup, and a screen reader's list cannot tell them apart otherwise.
   *  @defaultValue "Load more" */
  readonly label?: string;
}

/** The next page is a press: the inbox is a plain list inside a popover, with no end-of-list callback. */
export function InboxLoadMore({ hasNextPage, isFetchingNextPage, failed, onLoadMore, label = "Load more" }: InboxLoadMoreProps): ReactElement | null {
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

function DismissedRows(): ReactElement {
  const trpc = useTRPC();
  const dismissed = useInboxCollection({ trpc }, { state: "dismissed" });
  // Starts at row 0: the reveal itself is the first page, and without the move the press changes only its label.
  const pageFocus = usePageFocus({ rowCount: dismissed.items.length, loadMore: dismissed.loadMore, firstRow: 0 });
  return (
    <Stack gap="block">
      {dismissed.isEmpty ? (
        <Stack align="center" ref={pageFocus.rowRef(0)} tabIndex={-1}>
          {dismissed.error === null ? (
            <Text voice="gloss" ink="muted">
              Nothing dismissed.
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
        label="Load more dismissed"
        hasNextPage={dismissed.hasNextPage}
        isFetchingNextPage={dismissed.isFetchingNextPage}
        failed={dismissed.loadMoreFailed}
        onLoadMore={pageFocus.loadNextPage}
      />
    </Stack>
  );
}

/** The dismissed rows, closed until asked for. */
export function DismissedInbox(): ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <Stack gap="block">
      <Row justify="center">
        <Button variant="ghost" size="sm" aria-expanded={open} onClick={(): void => setOpen(!open)}>
          {open ? "Hide dismissed" : "Show dismissed"}
        </Button>
      </Row>
      {open ? <DismissedRows /> : null}
    </Stack>
  );
}
