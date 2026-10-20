// The embeddings connection resolve compose wires: an implicit resolve with no binding surfaces the refusal, while a
// NAMED row that no longer resolves answers null (the generation's own connection is gone). Faked at the provider
// edge only, through the shared inference-runtime fake.

import { NoConnectionError } from "@orb/inference";
import type { UserConnectionId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createResolveEmbeddingConnection } from "@orb/server/domain/embeddings";
import { freshDb } from "@orb/testkit/node/db.ts";
import { principal } from "@orb/testkit/node/factories/principal.ts";
import { TEST_CONNECTION_ID, TEST_OWNER_ID } from "@orb/testkit/node/factories/resolved-connection.ts";
import { makeFakeRoleClients } from "@orb/testkit/node/factories/role-clients.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { makeEmbeddingRuntime } from "@orb/testkit/node/inference-runtime.ts";
import { describe } from "vitest";
import { makeResolvedSecret } from "../../../inference/_support.ts";

// The resolve reads no user rows; the host resolver answers from rows in one in-memory database.
const callersDb = await freshDb();
const GONE_ROW = castId<UserConnectionId>("user_connection_gone");
const SECOND_ROW = castId<UserConnectionId>("user_connection_second");
const STRANGER_ROW = castId<UserConnectionId>("user_connection_stranger");

function resolverOver(roleClients: ReturnType<typeof makeFakeRoleClients>): ReturnType<typeof createResolveEmbeddingConnection> {
  return createResolveEmbeddingConnection(
    makeEmbeddingRuntime(roleClients, () => Promise.resolve(makeResolvedSecret())),
    (userId) => principal({ db: callersDb }, userId),
  );
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

  // A generation pins the row it was minted under, which need not be the one bound now: any row the owner holds
  // resolves by name, and another owner's row answers like a missing one.
  test("an owned row that is not bound resolves by name; another owner's row does not", async () => {
    const stranger = castId<UserId>("user_stranger");
    const roleClients = makeFakeRoleClients();
    const resolve = createResolveEmbeddingConnection(
      makeEmbeddingRuntime(
        roleClients,
        () => Promise.resolve(makeResolvedSecret()),
        (funder) => (funder === stranger ? STRANGER_ROW : TEST_CONNECTION_ID),
        (funder) => (funder === stranger ? [] : [{ id: SECOND_ROW, task: "embed" }]),
      ),
      (userId) => principal({ db: callersDb }, userId),
    );

    expect((await resolve(TEST_OWNER_ID, "embed", SECOND_ROW))?.connectionId).toBe(SECOND_ROW);
    expect((await resolve(stranger, "embed"))?.connectionId).toBe(STRANGER_ROW);
    expect(await resolve(TEST_OWNER_ID, "embed", STRANGER_ROW)).toBeNull();
  });

  test("the bound row resolves to its snapshot, explicitly and implicitly alike", async () => {
    const resolve = resolverOver(makeFakeRoleClients());

    expect((await resolve(TEST_OWNER_ID, "embed"))?.connectionId).toBe(TEST_CONNECTION_ID);
    expect((await resolve(TEST_OWNER_ID, "embed", TEST_CONNECTION_ID))?.connectionId).toBe(TEST_CONNECTION_ID);
  });
});
