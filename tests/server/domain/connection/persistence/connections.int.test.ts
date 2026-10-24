// @subject packages/server/src/domain/connection/persistence/connections.ts
// @subject packages/server/src/domain/connection/verbs/connections.ts
// @subject packages/inference/src/resolve/resolve-task.ts
// @subject packages/inference/src/index.ts

import { CONNECTION_OP_CODES, modelIdSchema, providerIdSchema } from "@orb/contracts/inference";
import { expect, test } from "@orb/testkit/node";
import { sql } from "drizzle-orm";
import { vi } from "vitest";

const STORED_CANARY = "private-connection-canary";
const OWNER_MISMATCH_EVENT = "connection_owner_mismatch";

const CONNECTION_INPUT = {
  providerId: providerIdSchema.parse("openrouter"),
  credentialId: null,
  baseUrl: null,
  model: modelIdSchema.parse("openai/gpt-4o-mini"),
};

test("owned invalid shapes and malformed bytes refuse before a read-derived update can overwrite them", async ({ db, ownerCaller }) => {
  const row = await ownerCaller.connection.create(CONNECTION_INPUT);
  for (const raw of ['{"headers":{"authorization":42}}', "{", `{"headers":{"authorization":"${STORED_CANARY}"},"broken":`]) {
    await db.run(sql`update user_connections set transport = ${raw} where id = ${row.id}`);
    await expect(ownerCaller.connection.update({ connectionId: row.id, patch: { label: "must not land" } })).rejects.toThrow();
    expect(await db.get<{ label: string; transport: string }>(sql`select label, transport from user_connections where id = ${row.id}`)).toEqual({
      label: row.label,
      transport: raw,
    });
    let refusal: Error | undefined;
    try {
      await ownerCaller.connection.get({ connectionId: row.id });
    } catch (error) {
      if (!(error instanceof Error)) {
        throw error;
      }
      refusal = error;
    }
    expect(refusal).toMatchObject({
      message: "The stored connection could not be read. The existing row is untouched.",
      cause: { code: "stored_config_unreadable", detail: undefined },
    });
    expect(refusal?.cause).not.toHaveProperty("cause");
    expect(JSON.stringify(refusal)).not.toContain(STORED_CANARY);
  }
  await ownerCaller.connection.remove({ connectionId: row.id });
  await expect(ownerCaller.connection.get({ connectionId: row.id })).toThrowTRPCError("BAD_REQUEST");
  expect(await db.all(sql`select id from user_connections where id = ${row.id}`)).toHaveLength(0);
});

test("foreign malformed bytes still reach the mismatch event, never decoding or exposing the foreign row", async ({
  db,
  app,
  harness,
  ownerCaller,
  otherCaller,
}) => {
  const otherId = (await otherCaller.sessions.me()).userId;
  const own = await ownerCaller.connection.create(CONNECTION_INPUT);
  const foreign = await otherCaller.connection.create({ ...CONNECTION_INPUT, label: "foreign-connection-marker" });
  const foreignRefusal = {
    code: "BAD_REQUEST",
    message: `connection ${foreign.id} not found`,
    cause: { code: CONNECTION_OP_CODES.notFound },
  };
  await expect(ownerCaller.connection.get({ connectionId: foreign.id })).rejects.toMatchObject(foreignRefusal);
  const binding = await ownerCaller.connection.setBinding({ task: "chat", connectionId: own.id });
  await db.run(sql`update connection_bindings set connection_id = ${foreign.id} where id = ${binding.id}`);
  await db.run(sql`update user_connections set transport = '{' where id = ${foreign.id}`);

  using security = vi.spyOn(harness.logger, "warn");
  await expect(ownerCaller.connection.resolveChatCapability()).rejects.toThrow(`connection ${foreign.id} not found`);
  const mismatchEvents = (): (readonly unknown[])[] =>
    security.mock.calls.filter((call: readonly unknown[]) => {
      const fields = call[0];
      return typeof fields === "object" && fields !== null && "event" in fields && fields.event === OWNER_MISMATCH_EVENT;
    });
  const expectedEvent = [
    { security: true, event: OWNER_MISMATCH_EVENT, task: "chat", connectionId: foreign.id, funder: harness.ownerId, owner: otherId },
    "security: connection_owner_mismatch",
  ];
  expect(mismatchEvents()).toEqual([expectedEvent]);

  const principal = await harness.principalFor(harness.ownerId);
  await expect(app.runtime.capabilities.for({ connectionId: foreign.id, principal })).rejects.toThrow(`connection ${foreign.id} not found`);
  await expect(ownerCaller.connection.get({ connectionId: foreign.id })).rejects.toMatchObject(foreignRefusal);
  await expect(ownerCaller.connection.remove({ connectionId: foreign.id })).toThrowTRPCError("BAD_REQUEST");
  expect((await ownerCaller.connection.get({ connectionId: own.id })).id).toBe(own.id);
  expect(await db.get<{ label: string; transport: string }>(sql`select label, transport from user_connections where id = ${foreign.id}`)).toEqual({
    label: "foreign-connection-marker",
    transport: "{",
  });
  await otherCaller.connection.remove({ connectionId: foreign.id });
  await expect(ownerCaller.connection.get({ connectionId: foreign.id })).rejects.toMatchObject(foreignRefusal);
  expect(await db.all(sql`select id from user_connections where id = ${foreign.id}`)).toHaveLength(0);
  expect(mismatchEvents()).toEqual([expectedEvent]);
  expect(await db.get(sql`select connection_id as connectionId from connection_bindings where id = ${binding.id}`)).toEqual({ connectionId: null });
});
