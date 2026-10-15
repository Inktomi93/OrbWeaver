// @subject tests/support/node/factories/connection-view.ts
import "../composed-real.ts";
import { CONNECTION_OP_CODES } from "@orb/contracts/inference";
import { expect, test } from "../fixtures.ts";
import { createServerHarness } from "../server.ts";
import { makeConnectionRow } from "./connection-view.ts";

test("a saved hosted row may lack a credential without changing its native owner or granting another viewer access", async () => {
  let requests = 0;
  await using root = await createServerHarness({
    providerFetch: () => {
      requests += 1;
      return Promise.reject(new Error("connection row reads must not execute a provider request"));
    },
  });
  const principal = await root.principalFor(root.ownerId);
  const snapshot = makeConnectionRow({ ownerId: principal.userId });
  const created = await root.services.connection.create({
    principal,
    providerId: snapshot.providerId,
    credentialId: null,
    baseUrl: snapshot.baseUrl,
    model: snapshot.model,
    label: snapshot.label,
    api: snapshot.api,
    modelCheck: snapshot.modelCheck,
    allowBackground: snapshot.allowBackground,
  });
  expect(created).toMatchObject({ ownerId: principal.userId, credentialId: null, providerId: snapshot.providerId, model: snapshot.model });
  expect(created.ownerId.startsWith("user_")).toBe(false);
  expect(snapshot.tasks.every((task) => created.tasks.includes(task))).toBe(true);
  const caller = await root.internalCallerFor(root.ownerId);
  expect(await caller.connection.get({ connectionId: created.id })).toEqual(created);
  expect(await caller.connection.list()).toEqual([created]);
  const other = await root.actor();
  const foreign = await root.internalCallerFor(other.id);
  expect(await foreign.connection.list()).toEqual([]);
  await expect(foreign.connection.get({ connectionId: created.id })).rejects.toMatchObject({ cause: { code: CONNECTION_OP_CODES.notFound } });
  await expect(foreign.connection.resolveChatCapability({ target: { kind: "connection", connectionId: created.id } })).rejects.toMatchObject({
    cause: { code: CONNECTION_OP_CODES.notFound },
  });
  expect(requests).toBe(0);
});
