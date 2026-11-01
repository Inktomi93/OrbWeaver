// The inbox's older reaches: the next page of rows, and the dismissed rows behind their own press. The
// dismissed read starts only on that press, so the bell never pays for it.

import { Button } from "@orb/ui/button";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useState } from "react";
import { useTRPC } from "#data";
import { useInboxCollection } from "../hooks/use-inbox.ts";
import { DismissedInboxRow } from "./notification-inbox-row.tsx";

interface InboxLoadMoreProps {
  readonly hasNextPage: boolean;
  readonly isFetchingNextPage: boolean;
  /** The last read failed while earlier rows are on screen. */
  readonly failed: boolean;
  readonly onLoadMore: () => void;
}

/** The next page is a press: the inbox is a plain list inside a popover, with no end-of-list callback. */
export function InboxLoadMore({ hasNextPage, isFetchingNextPage, failed, onLoadMore }: InboxLoadMoreProps): ReactElement | null {
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
          Load more
        </Button>
      </Row>
    </Stack>
  );
}

function DismissedRows(): ReactElement {
  const trpc = useTRPC();
  const dismissed = useInboxCollection({ trpc }, { state: "dismissed" });
  return (
    <Stack gap="block">
      {dismissed.isEmpty ? (
        <Text voice="gloss" ink="muted">
          {dismissed.error === null ? "Nothing dismissed." : "Couldn't load dismissed notifications."}
        </Text>
      ) : null}
      {dismissed.items.map((item) => (
        <DismissedInboxRow key={item.id} item={item} />
      ))}
      <InboxLoadMore
        hasNextPage={dismissed.hasNextPage}
        isFetchingNextPage={dismissed.isFetchingNextPage}
        failed={dismissed.error !== null}
        onLoadMore={dismissed.listProps.onEndApproach}
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
