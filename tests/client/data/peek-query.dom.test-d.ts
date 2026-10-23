import type { UserId, VerifiedUserId } from "@orb/kit/ids";
import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";
import { expectTypeOf, test } from "vitest";
import { peekQueryData } from "#client/data/peek-query.ts";

declare const queryClient: QueryClient;
declare const userId: UserId;

test("cache peeks require a tagged key and cannot claim an arbitrary output type", () => {
  expectTypeOf<readonly ["plain-user"]>().not.toExtend<Parameters<typeof peekQueryData>[1]>();
  expectTypeOf<typeof peekQueryData>().not.toExtend<<T>(client: QueryClient, key: QueryKey) => T | undefined>();
  const options = queryOptions({ queryKey: ["plain-user"], queryFn: () => Promise.resolve(userId) });
  const cached = peekQueryData(queryClient, options.queryKey);
  expectTypeOf(cached).toEqualTypeOf<UserId | undefined>();
  expectTypeOf(cached).not.toExtend<VerifiedUserId | undefined>();
});

test("never-key specialization cannot be rebound as a method that claims verification", () => {
  const verifiedReader = {
    read(_client: QueryClient, _key: QueryKey): VerifiedUserId | undefined {
      return undefined;
    },
  };
  expectTypeOf<{ read: typeof peekQueryData<never> }>().not.toExtend<typeof verifiedReader>();
  expectTypeOf<ReturnType<typeof peekQueryData<never>>>().toBeUnknown();
  const options = queryOptions({ queryKey: ["plain-user"], queryFn: () => Promise.resolve(userId) });
  const taggedReader = {
    read(client: QueryClient, key: typeof options.queryKey): UserId | undefined {
      return peekQueryData(client, key);
    },
  };
  expectTypeOf<{ read: typeof peekQueryData<typeof options.queryKey> }>().toExtend<typeof taggedReader>();
});
