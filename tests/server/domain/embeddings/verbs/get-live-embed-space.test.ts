import { EMBEDDING_FLOOR } from "@orb/contracts/inference";
import type { ResolvedTaskView, RoleClientTask } from "@orb/contracts/role-clients";
import { createIdSource } from "@orb/kit/ids";
import { createGetLiveEmbedSpace } from "@orb/server/domain/embeddings";
import { createSeededIds, testModelId } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import { makeResolvedView } from "@orb/testkit/node/helpers";
import { vi } from "vitest";

test("the progress space follows each owner's current binding and dtype, including an explicit unbound state", async () => {
  const ids = createIdSource(createSeededIds().next);
  const owner = ids.userId();
  const other = ids.userId();
  let resolved: ResolvedTaskView | null = makeResolvedView({
    task: "embed",
    model: testModelId("first"),
    capability: { kind: "embedding", embedding: { ...EMBEDDING_FLOOR, dtype: "q8" } },
  });
  const resolve = vi.fn(async (_task: RoleClientTask) => resolved);
  const clients = vi.fn<Parameters<typeof createGetLiveEmbedSpace>[0]["roleClientsFor"]>((ownerId) =>
    Promise.resolve({ resolved: (task) => (ownerId === owner ? resolve(task) : Promise.resolve(null)) }),
  );
  const read = createGetLiveEmbedSpace({ roleClientsFor: clients });
  expect(await read(owner)).toEqual({ model: "first@q8" });
  resolved = makeResolvedView({
    task: "embed",
    model: testModelId("second"),
    capability: { kind: "embedding", embedding: { ...EMBEDDING_FLOOR, dtype: "fp16" } },
  });
  expect(await read(owner)).toEqual({ model: "second@fp16" });
  expect(await read(other)).toBeNull();
  resolved = null;
  expect(await read(owner)).toBeNull();
  expect(clients.mock.calls.map(([ownerId]) => ownerId)).toEqual([owner, owner, other, owner]);
  expect(resolve.mock.calls).toEqual([["embed"], ["embed"], ["embed"]]);
});
