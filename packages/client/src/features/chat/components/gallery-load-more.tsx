// "Load more" under a keyset-paged gallery grid (the gallery itself and the add-picker's candidates). The
// virtualized grid has no end-of-list callback, so the next page is a press. A short page ends the list, and
// the control goes with it.

import { Button } from "@orb/ui/button";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";

interface GalleryLoadMoreProps {
  readonly hasNextPage: boolean;
  readonly isFetchingNextPage: boolean;
  /** The last page request failed while earlier pages are on screen. */
  readonly failed: boolean;
  readonly onLoadMore: () => void;
}

export function GalleryLoadMore({ hasNextPage, isFetchingNextPage, failed, onLoadMore }: GalleryLoadMoreProps): ReactElement | null {
  if (!hasNextPage) {
    return null;
  }
  return (
    <Stack gap="tight">
      {failed ? (
        <Text className="text-destructive" role="alert" voice="label">
          Couldn't load more pictures. Try again.
        </Text>
      ) : null}
      <Row justify="center">
        <Button intent="secondary" size="sm" loading={isFetchingNextPage} onClick={onLoadMore}>
          Load more
        </Button>
      </Row>
    </Stack>
  );
}
