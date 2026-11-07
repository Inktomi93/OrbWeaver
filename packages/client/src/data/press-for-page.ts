// A reader's press for one more page of an infinite query. It is one intent no later scroll repeats, and an invalidation
// that cancels its read resolves like a quiet success, so a press has to look at what it got.

/** The slice of an infinite-query fetch result a press reads. */
interface PressResult<TPage> {
  readonly data?: { readonly pages: readonly TPage[] } | undefined;
  readonly hasNextPage: boolean;
  readonly hasPreviousPage: boolean;
  readonly isFetchNextPageError: boolean;
  readonly isFetchPreviousPageError: boolean;
}

/** Which end of the loaded pages a press reads past. */
type PressDirection = "next" | "previous";

const PRESS_EDGE: Record<
  PressDirection,
  { readonly failed: "isFetchNextPageError" | "isFetchPreviousPageError"; readonly more: "hasNextPage" | "hasPreviousPage" }
> = {
  next: { failed: "isFetchNextPageError", more: "hasNextPage" },
  previous: { failed: "isFetchPreviousPageError", more: "hasPreviousPage" },
};

/** An invalidate cancels an in-flight page: one attempt, one that joins the refetch, one that fetches after it. */
const PRESS_ATTEMPTS = 3;

/** Fetch one page for a press: the pages it ended on, or `null` when it ended in neither a page nor the end of the list.
 *  After a cancel it waits for the refetch that cancelled it, because cancelling that too would lose the invalidate. */
export async function pressForPage<TPage>(
  fetchPage: (options?: { readonly cancelRefetch: boolean }) => Promise<PressResult<TPage>>,
  pagesBefore: number,
  direction: PressDirection,
): Promise<readonly TPage[] | null> {
  const edge = PRESS_EDGE[direction];
  for (let attempt = 0; attempt < PRESS_ATTEMPTS; attempt += 1) {
    const result = await fetchPage(attempt === 0 ? undefined : { cancelRefetch: false });
    if (result[edge.failed]) {
      return null;
    }
    const pages = result.data?.pages ?? [];
    if (pages.length > pagesBefore || !result[edge.more]) {
      return pages;
    }
  }
  return null;
}
