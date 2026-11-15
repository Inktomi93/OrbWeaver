// @subject packages/client/src/lib/trpc-error-reason.ts
// A query read that a warm-up, a prefetch or the refinery open hands to `rethrowUnlessTrpcFailure` settles quietly
// when a mutation's `cancelQueries` reverts its first fetch, the way `createEntityMutation` cancels a read before its
// optimistic write, and still rejects for a fault of any other kind. The reverted read has no data, so TanStack rejects
// it with `CancelledError`; a rejection that reached the window would land in the unhandled-rejection ring.

import { createAppQueryClient } from "@orb/client/data";
import { rethrowUnlessTrpcFailure } from "@orb/client/lib";
import { expect, test } from "@orb/testkit/node";

// A first fetch the server has not answered yet. A tRPC query function never reads the cancel signal, so the read
// only settles through the cache.
function unanswered(): Promise<never> {
  return new Promise<never>(() => undefined);
}

test("a first fetch a mutation's cancel reverts settles the warm-up with no answer, and any other fault still rejects", async () => {
  const client = createAppQueryClient();
  const roster = ["refinery", "listSessions"];

  const warmUp = client.query({ queryKey: roster, queryFn: unanswered }).catch(rethrowUnlessTrpcFailure);
  const open = client.query({ queryKey: roster, queryFn: unanswered }).catch((error: unknown): readonly string[] => {
    rethrowUnlessTrpcFailure(error);
    return [];
  });
  await client.cancelQueries({ queryKey: roster, exact: true });

  await expect(warmUp).resolves.toBeUndefined();
  await expect(open).resolves.toEqual([]);

  const defect = new RangeError("a fault in the read's own follow-up");
  const faulted = client
    .query({
      queryKey: ["faulted"],
      queryFn: (): Promise<never> => Promise.reject(defect),
      retry: false,
    })
    .catch(rethrowUnlessTrpcFailure);
  await expect(faulted).rejects.toBe(defect);
});
