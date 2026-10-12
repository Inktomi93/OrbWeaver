// The embeddings connection resolve compose wires: an implicit resolve with no binding surfaces the refusal, while a
// NAMED row that no longer resolves answers null (the generation's own connection is gone). Faked at the provider
// edge only, through the shared inference-runtime fake.

import { NoConnectionError } from "@orb/inference";
import type { UserConnectionId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createResolveEmbeddingConnection } from "@orb/server/entry/compose";
import { principal } from "@orb/testkit/node/factories/principal.ts";
import { TEST_CONNECTION_ID, TEST_OWNER_ID } from "@orb/testkit/node/factories/resolved-connection.ts";
import { makeFakeRoleClients } from "@orb/testkit/node/factories/role-clients.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { makeEmbeddingRuntime } from "@orb/testkit/node/inference-runtime.ts";
import { describe } from "vitest";

const GONE_ROW = castId<UserConnectionId>("user_connection_gone");

function resolverOver(roleClients: ReturnType<typeof makeFakeRoleClients>): ReturnType<typeof createResolveEmbeddingConnection> {
  return createResolveEmbeddingConnection(makeEmbeddingRuntime(roleClients), (userId) => Promise.resolve(principal(userId)));
}

describe("createResolveEmbeddingConnection", () => {
  test("an implicit resolve with no binding surfaces the refusal, never a silent null", async () => {
    const resolve = resolverOver(makeFakeRoleClients({ unbound: ["embed"] }));

    await expect(resolve(TEST_OWNER_ID, "embed")).rejects.toBeInstanceOf(NoConnectionError);
  });

  test("a named row that no longer resolves answers null", async () => {
    const resolve = resolverOver(makeFakeRoleClients());

    expect(await resolve(TEST_OWNER_ID, "embed", GONE_ROW)).toBeNull();
  });

  test("the bound row resolves to its snapshot, explicitly and implicitly alike", async () => {
    const resolve = resolverOver(makeFakeRoleClients());

    expect((await resolve(TEST_OWNER_ID, "embed"))?.connectionId).toBe(TEST_CONNECTION_ID);
    expect((await resolve(TEST_OWNER_ID, "embed", TEST_CONNECTION_ID))?.connectionId).toBe(TEST_CONNECTION_ID);
  });
});
