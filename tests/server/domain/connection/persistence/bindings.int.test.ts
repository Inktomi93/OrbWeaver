// persistence: `connection_bindings`. The actor is spelled ONCE here as a `(kind, id)` pair over three
// nullable id columns, and the two properties that fall out of that spelling are what a regression would
// break: a lookup for one actor must never see another actor's row even when the TASK is the same (the
// per-arm predicate, not a coalesce), and the upsert must re-point the existing row in place rather than
// writing a second row for the same (actor, task).

import type { ProviderId } from "@orb/contracts/inference";
import type { Db } from "@orb/db";
import { userConnections } from "@orb/db";
import type { AutomationRuleId, ConnectionBindingId, UserConnectionId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { listBindingsForActor, lookupBinding, upsertBinding } from "../../../../../packages/server/src/domain/connection/persistence/bindings.ts";
import { FROZEN_AT_MS } from "../../../../support/clock.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { seedAutomationRule, seedUser } from "../_support.ts";

const ROW_ID = castId<UserConnectionId>("user_connection_000001");
const SECOND_ROW_ID = castId<UserConnectionId>("user_connection_000002");
const bindingId = (n: number): ConnectionBindingId => castId<ConnectionBindingId>(`connection_binding_00000${String(n)}`);

async function seedRow(db: Db, id: UserConnectionId, ownerId: UserId, label: string): Promise<void> {
  await db.insert(userConnections).values({
    id,
    ownerId,
    label,
    providerId: castId<ProviderId>("custom-openai"),
    credentialId: null,
    baseUrl: "http://127.0.0.1:18703/v1",
    model: "m",
    api: "auto",
    declared: null,
    extras: null,
    transport: null,
    modelListed: true,
    allowBackground: false,
    createdAt: FROZEN_AT_MS,
    updatedAt: FROZEN_AT_MS,
  });
}

describe("the actor predicate", () => {
  test("two actors may hold the SAME task without seeing each other's row", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const ruleId: AutomationRuleId = await seedAutomationRule(db, owner);
    await seedRow(db, ROW_ID, owner, "user row");
    await seedRow(db, SECOND_ROW_ID, owner, "rule row");
    await upsertBinding(db, { id: bindingId(1), actor: { actorKind: "user", actorId: owner }, task: "chat", connectionId: ROW_ID });
    await upsertBinding(db, {
      id: bindingId(2),
      actor: { actorKind: "automation-rule", actorId: ruleId },
      task: "chat",
      connectionId: SECOND_ROW_ID,
    });
    expect((await lookupBinding(db, { actorKind: "user", actorId: owner }, "chat"))?.connectionId).toBe(ROW_ID);
    expect((await lookupBinding(db, { actorKind: "automation-rule", actorId: ruleId }, "chat"))?.connectionId).toBe(SECOND_ROW_ID);
  });

  test("a lookup with no row answers `null`, and one user's list never carries another's rows", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const other = await seedUser(db, "user_b");
    await seedRow(db, ROW_ID, owner, "mine");
    await upsertBinding(db, { id: bindingId(1), actor: { actorKind: "user", actorId: owner }, task: "chat", connectionId: ROW_ID });
    expect(await lookupBinding(db, { actorKind: "user", actorId: owner }, "embed")).toBeNull();
    expect(await lookupBinding(db, { actorKind: "user", actorId: other }, "chat")).toBeNull();
    expect(await listBindingsForActor(db, { actorKind: "user", actorId: other })).toEqual([]);
  });
});

describe("upsert", () => {
  test("re-points the SAME row rather than writing a second one for the same (actor, task)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    await seedRow(db, ROW_ID, owner, "first");
    await seedRow(db, SECOND_ROW_ID, owner, "second");
    const first = await upsertBinding(db, { id: bindingId(1), actor: { actorKind: "user", actorId: owner }, task: "chat", connectionId: ROW_ID });
    const second = await upsertBinding(db, { id: bindingId(2), actor: { actorKind: "user", actorId: owner }, task: "chat", connectionId: SECOND_ROW_ID });
    expect(second.id, "the second write must reuse the stored row's id, not the freshly minted one").toBe(first.id);
    const rows = await listBindingsForActor(db, { actorKind: "user", actorId: owner });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.connectionId).toBe(SECOND_ROW_ID);
  });

  test("the returned row is the row as WRITTEN — its actor columns match its kind", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const ruleId = await seedAutomationRule(db, owner);
    await seedRow(db, ROW_ID, owner, "mine");
    const written = await upsertBinding(db, {
      id: bindingId(1),
      actor: { actorKind: "automation-rule", actorId: ruleId },
      task: "chat",
      connectionId: ROW_ID,
    });
    expect(written).toMatchObject({ actorKind: "automation-rule", ruleId, userId: null, pluginId: null, task: "chat" });
    expect(await lookupBinding(db, { actorKind: "automation-rule", actorId: ruleId }, "chat")).toEqual(written);
  });

  test("a cleared binding stores `null` and stays one row", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    await seedRow(db, ROW_ID, owner, "mine");
    await upsertBinding(db, { id: bindingId(1), actor: { actorKind: "user", actorId: owner }, task: "chat", connectionId: ROW_ID });
    const cleared = await upsertBinding(db, { id: bindingId(2), actor: { actorKind: "user", actorId: owner }, task: "chat", connectionId: null });
    expect(cleared.connectionId).toBeNull();
    expect(await listBindingsForActor(db, { actorKind: "user", actorId: owner })).toHaveLength(1);
  });
});
