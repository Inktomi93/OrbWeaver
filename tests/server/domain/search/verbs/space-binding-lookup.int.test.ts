// The active search space resolves an unrecorded owner's encoder through the owner's binding. A binding that cannot
// resolve is the no-space refusal the retrieval degrade absorbs; any other failure of the lookup surfaces as itself and is
// logged, never answered as that refusal.
// @subject packages/server/src/domain/search/substrate/space.ts
import { connectionBindings } from "@orb/db";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness, withheldTable } from "@orb/testkit/node/composed";
import { vi } from "vitest";
import { withRetrievalDegrade } from "#server/domain/search/index.ts";

const QUERY = "orbital ledger";
const LOG_SCAN_LIMIT = 200;
const UNMAPPED_ERROR_EVENT = "trpc.unhandled";

test("an unbound encoder is the no-space refusal, and a failed binding lookup surfaces as itself, logged once", async () => {
  await using root = await createServerHarness({ logLevel: "error" });
  const caller = await root.internalCallerFor(root.ownerId);
  await caller.connection.setBinding({ task: "embed", connectionId: null });
  const query = { ownerId: root.ownerId, query: QUERY, over: "entities", scope: { kind: "owner" }, topN: 5 } as const;

  // The control: the same wiring with no binding is the refusal the degrade answers with the ruled empty result.
  const unavailable = vi.fn();
  expect(await withRetrievalDegrade(() => root.services.search.search(query), { empty: null, onIndexUnavailable: unavailable })).toBeNull();
  expect(unavailable).toHaveBeenCalledOnce();

  await using _fault = await withheldTable(root.db, connectionBindings);
  const unmapped = (): number => root.observability.logLines(LOG_SCAN_LIMIT).filter((line) => line.includes(UNMAPPED_ERROR_EVENT)).length;
  const unmappedBefore = unmapped();
  const missed = vi.fn();
  await expect(withRetrievalDegrade(() => root.services.search.search(query), { empty: null, onIndexUnavailable: missed })).rejects.toMatchObject({
    cause: expect.objectContaining({ message: expect.stringContaining("no such table") }),
  });
  expect(missed).not.toHaveBeenCalled();

  await expect(caller.search.search({ query: QUERY, over: "entities", scope: { kind: "owner" }, topN: 5 })).rejects.toMatchObject({
    code: "INTERNAL_SERVER_ERROR",
  });
  expect(unmapped() - unmappedBefore).toBe(1);
});
