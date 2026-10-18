import { createTrpcClient, createTrpcProxy } from "@orb/client/data";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { QueryClient } from "@tanstack/react-query";
import { createInvalidation } from "#client/data/invalidation.ts";

test("terminal library import invalidates cached NULL provenance under the same owned asset key", () => {
  const queryClient = new QueryClient();
  const trpc = createTrpcProxy(createTrpcClient("http://localhost/api/trpc"), queryClient);
  const key = trpc.imagery.readProvenance.queryKey({ assetId: mintTypeId(ID_PREFIX.asset) });
  queryClient.setQueryData(key, null);
  expect(queryClient.getQueryState(key)?.isInvalidated).toBe(false);
  createInvalidation({ queryClient, trpc }).invalidateUser({ type: "charactersChanged" });
  expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true);
});
