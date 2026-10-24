import { peekQueryData } from "@orb/client/data";
import { createClientRuntime } from "@orb/testkit/browser";
import { expect, test } from "@orb/testkit/node";
import { queryOptions } from "@tanstack/react-query";
import { vi } from "vitest";

test("peeking never fetches or creates a missing entry and returns an existing cache value unchanged", async () => {
  using lifetime = new DisposableStack();
  const { queryClient } = createClientRuntime();
  lifetime.defer(() => queryClient.clear());
  const queryFn = vi.fn(async () => 42);
  const options = queryOptions({ queryKey: ["cache-peek-control"], queryFn, staleTime: 0 });
  expect(peekQueryData(queryClient, options.queryKey)).toBeUndefined();
  expect(queryClient.getQueryState(options.queryKey)).toBeUndefined();
  expect(queryFn).not.toHaveBeenCalled();
  queryClient.setQueryData(options.queryKey, 7);
  expect(peekQueryData(queryClient, options.queryKey)).toBe(7);
  expect(queryFn).not.toHaveBeenCalled();
  await expect(queryClient.query(options)).resolves.toBe(42);
  expect(queryFn).toHaveBeenCalledTimes(1);
  expect(peekQueryData(queryClient, options.queryKey)).toBe(42);
});
