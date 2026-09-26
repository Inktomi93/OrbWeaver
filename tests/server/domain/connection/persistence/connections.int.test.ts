// persistence: `user_connections`. The asymmetry between the two readers is the point and is pinned here:
// `fetchOwnedConnection` is OWNER-SCOPED (a stranger's row reads `null` — the domain has no existence
// oracle) while `fetchConnectionById` is deliberately owner-AGNOSTIC, because it is the runtime's port and
// the resolver compares `ownerId` itself so it can REFUSE-AND-RECORD a binding that names a stranger's row.
// Collapsing the two would either blind the resolver's security event or leak existence at the domain.
// Beside it: the field-wise update writes only the keys present and is owner-scoped, and the delete leaves
// the binding row alive with a NULL connection (schema physics, not a verb loop).

import type { Db } from "@orb/db";
import { connectionBindings } from "@orb/db";
import { isConstraintViolation } from "@orb/db/kit";
import type { ConnectionBindingId, UserConnectionId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq, sql } from "drizzle-orm";
import { describe } from "vitest";
import {
  deleteOwnedConnection,
  fetchConnectionById,
  fetchOwnedConnection,
  insertConnection,
  listOwnedConnections,
  listOwnedLabels,
  updateOwnedConnection,
} from "../../../../../packages/server/src/domain/connection/persistence/connections.ts";
import { FROZEN_AT_MS } from "../../../../support/clock.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { testModelId, testProviderId } from "../../../../support/inference-identities.ts";
import { seedUser } from "../_support.ts";

const ROW_ID = castId<UserConnectionId>("user_connection_000001");
const OTHER_ROW_ID = castId<UserConnectionId>("user_connection_000002");
const THIRD_ROW_ID = castId<UserConnectionId>("user_connection_000003");

async function seedRow(db: Db, id: UserConnectionId, ownerId: UserId, label: string): Promise<void> {
  await insertConnection(db, {
    id,
    ownerId,
    label,
    providerId: testProviderId("custom-openai"),
    credentialId: null,
    baseUrl: "http://127.0.0.1:18703/v1",
    model: testModelId("m"),
    api: "auto",
    declared: null,
    extras: null,
    transport: null,
    modelCheck: "listed",
    allowBackground: false,
    createdAt: FROZEN_AT_MS,
    updatedAt: FROZEN_AT_MS,
  });
}

describe("the two readers", () => {
  test("`fetchOwnedConnection` collapses not-found and not-yours into `null`", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const other = await seedUser(db, "user_b");
    await seedRow(db, ROW_ID, owner, "mine");
    expect(await fetchOwnedConnection(db, owner, ROW_ID)).toMatchObject({ id: ROW_ID, label: "mine" });
    expect(await fetchOwnedConnection(db, other, ROW_ID)).toBeNull();
    expect(await fetchOwnedConnection(db, owner, OTHER_ROW_ID)).toBeNull();
  });

  test("`fetchConnectionById` is owner-AGNOSTIC — the resolver's fence needs the row to compare against", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    await seedRow(db, ROW_ID, owner, "mine");
    const read = await fetchConnectionById(db, ROW_ID);
    expect(read?.ownerId, "the port returns the row WITH its owner so the resolver can refuse and record").toBe(owner);
    expect(await fetchConnectionById(db, OTHER_ROW_ID)).toBeNull();
  });

  test("the projected row names its credential by id and carries no secret field", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    await seedRow(db, ROW_ID, owner, "mine");
    const row = await fetchOwnedConnection(db, owner, ROW_ID);
    expect(row).toHaveProperty("credentialId");
    expect(row).not.toHaveProperty("secret");
    expect(row).not.toHaveProperty("apiKey");
  });
});

describe("list reads", () => {
  test("list and labels are owner-scoped, and the list is label-ordered for a stable pane", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const other = await seedUser(db, "user_b");
    await seedRow(db, ROW_ID, owner, "zeta");
    await seedRow(db, THIRD_ROW_ID, owner, "alpha");
    await seedRow(db, OTHER_ROW_ID, other, "theirs");
    expect((await listOwnedConnections(db, owner)).map((row) => row.label)).toEqual(["alpha", "zeta"]);
    expect([...(await listOwnedLabels(db, owner))].toSorted()).toEqual(["alpha", "zeta"]);
    expect(await listOwnedLabels(db, other)).toEqual(["theirs"]);
  });
});

describe("writes", () => {
  test("the update is FIELD-WISE and OWNER-SCOPED — a stranger's update writes nothing", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const other = await seedUser(db, "user_b");
    await seedRow(db, ROW_ID, owner, "mine");
    await updateOwnedConnection(db, owner, ROW_ID, { model: testModelId("m2") });
    expect(await fetchOwnedConnection(db, owner, ROW_ID)).toMatchObject({ model: "m2", label: "mine", modelCheck: "listed" });
    await updateOwnedConnection(db, other, ROW_ID, { model: testModelId("stolen") });
    expect((await fetchOwnedConnection(db, owner, ROW_ID))?.model, "the owner predicate is the write's fence").toBe("m2");
  });

  test("user_connections.model_check refuses a value outside MODEL_CHECKS", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    await seedRow(db, ROW_ID, owner, "mine");
    let caught: unknown;
    try {
      await db.run(sql`update user_connections set model_check = 'maybe' where id = ${ROW_ID}`);
    } catch (err) {
      caught = err;
    }
    expect(isConstraintViolation(caught)?.kind).toBe("check");
    expect((await fetchOwnedConnection(db, owner, ROW_ID))?.modelCheck).toBe("listed");
  });

  test("deleting a row leaves its binding alive with a NULL connection (SET NULL, not a dangling id)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    await seedRow(db, ROW_ID, owner, "mine");
    await db.insert(connectionBindings).values({
      id: castId<ConnectionBindingId>("connection_binding_000001"),
      actorKind: "user",
      userId: owner,
      ruleId: null,
      pluginId: null,
      task: "chat",
      connectionId: ROW_ID,
    });
    await deleteOwnedConnection(db, owner, ROW_ID);
    const bindings = await db.select().from(connectionBindings).where(eq(connectionBindings.userId, owner));
    expect(bindings).toHaveLength(1);
    expect(bindings[0]?.connectionId).toBeNull();
  });
});
