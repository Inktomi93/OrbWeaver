// A press ends in a page, the end of the list, or null; a cancelled read in between is neither.
import { pressForPage } from "@orb/client/data";
import { expect, test } from "@orb/testkit/node";

type PressResult<TPage> = Awaited<ReturnType<Parameters<typeof pressForPage<TPage>>[0]>>;

const LOADED = ["page"] as const;
const QUIET = { hasNextPage: true, hasPreviousPage: true, isFetchNextPageError: false, isFetchPreviousPageError: false };
const CANCELLED: PressResult<string> = { ...QUIET, data: { pages: [...LOADED] } };
const LANDED: PressResult<string> = { ...QUIET, data: { pages: [...LOADED, "older"] } };

function scripted(results: readonly PressResult<string>[]): {
  readonly fetch: (options?: { readonly cancelRefetch: boolean }) => Promise<PressResult<string>>;
  readonly calls: readonly ({ readonly cancelRefetch: boolean } | undefined)[];
} {
  const calls: ({ readonly cancelRefetch: boolean } | undefined)[] = [];
  return {
    calls,
    fetch: (options): Promise<PressResult<string>> => {
      calls.push(options);
      const result = results[calls.length - 1];
      if (result === undefined) {
        throw new Error("The press read past its script");
      }
      return Promise.resolve(result);
    },
  };
}

test("a read an invalidate cancelled is tried again, and the later reads join the refetch instead of cancelling it", async () => {
  const { fetch, calls } = scripted([CANCELLED, CANCELLED, LANDED]);
  expect(await pressForPage(fetch, LOADED.length, "previous")).toEqual(LANDED.data?.pages);
  expect(calls).toEqual([undefined, { cancelRefetch: false }, { cancelRefetch: false }]);
});

test("a press every attempt of which is cancelled ends in null, not a quiet success", async () => {
  const { fetch } = scripted([CANCELLED, CANCELLED, CANCELLED]);
  expect(await pressForPage(fetch, LOADED.length, "next")).toBeNull();
});

test.for([
  ["next", { isFetchNextPageError: true }, { hasNextPage: false }],
  ["previous", { isFetchPreviousPageError: true }, { hasPreviousPage: false }],
] as const)("a %s press reads its own direction's failure and end", async ([direction, failure, end]) => {
  expect(await pressForPage(scripted([{ ...CANCELLED, ...failure }]).fetch, LOADED.length, direction)).toBeNull();
  expect(await pressForPage(scripted([{ ...CANCELLED, ...end }]).fetch, LOADED.length, direction)).toEqual(CANCELLED.data?.pages);
});

test("a failure on the other end says nothing about this press", async () => {
  const { fetch } = scripted([{ ...CANCELLED, isFetchNextPageError: true }, LANDED]);
  expect(await pressForPage(fetch, LOADED.length, "previous")).toEqual(LANDED.data?.pages);
});
