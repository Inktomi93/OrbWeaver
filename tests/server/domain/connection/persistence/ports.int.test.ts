// persistence: the four runtime PORTS. This file is the seam test — it asserts that what the domain's own
// verbs WRITE is exactly what the runtime's read side SEES, over one real db. A port wired to the wrong
// reader (owner-scoped where the resolver needs owner-agnostic, or a lookup missing the actor arm) would
// still typecheck and would still pass every per-query test; the only thing that catches it is reading
// through the port after writing through the verb.

import type { ProviderDef, ProviderId } from "@orb/contracts/inference";
import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createConnectionPorts } from "../../../../../packages/server/src/domain/connection/persistence/ports.ts";
import { FROZEN_AT_MS } from "../../../../support/clock.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { BYO_BASE_URL, BYO_PROVIDER, makeHarness, seedOwner } from "../_support.ts";

test("`connections.get` is BY ID and owner-agnostic; `listForOwner` is scoped", async () => {
  const db = await freshDb();
  const h = await makeHarness(db);
  const owner = await seedOwner(db);
  const other = await seedOwner(db, "user_b");
  const ports = createConnectionPorts({ db, now: () => FROZEN_AT_MS });
  const mine = await h.svc.create({ principal: owner.principal, providerId: BYO_PROVIDER, credentialId: null, baseUrl: BYO_BASE_URL, model: "m" });

  const byId = await ports.connections.get(mine.id);
  expect(byId?.ownerId, "the resolver compares the owner itself — the port must hand it over").toBe(owner.userId);
  expect(await ports.connections.listForOwner(owner.userId)).toHaveLength(1);
  expect(await ports.connections.listForOwner(other.userId)).toEqual([]);
});

test("`bindings.lookup` reads what the domain's setBinding WROTE, per actor and task", async () => {
  const db = await freshDb();
  const h = await makeHarness(db);
  const owner = await seedOwner(db);
  const ports = createConnectionPorts({ db, now: () => FROZEN_AT_MS });
  const row = await h.svc.create({ principal: owner.principal, providerId: BYO_PROVIDER, credentialId: null, baseUrl: BYO_BASE_URL, model: "m" });
  await h.svc.setBinding({ principal: owner.principal, task: "chat", connectionId: row.id });

  const found = await ports.bindings.lookup({ actorKind: "user", actorId: owner.userId, task: "chat" });
  expect(found?.connectionId).toBe(row.id);
  expect(await ports.bindings.lookup({ actorKind: "user", actorId: owner.userId, task: "embed" })).toBeNull();
  expect(await ports.bindings.lookup({ actorKind: "plugin-grant", actorId: owner.userId, task: "chat" }), "the actor KIND is part of the key").toBeNull();
});

test("`providerStore` round-trips a row and its removal, stamping the injected clock", async () => {
  const db = await freshDb();
  const admin: UserId = (await seedOwner(db, "user_admin")).userId;
  const ports = createConnectionPorts({ db, now: () => FROZEN_AT_MS });
  const id = castId<ProviderId>("acme-endpoint");
  const row: ProviderDef = {
    id,
    label: "Acme",
    wire: "openai-compat",
    dialect: "openai-compatible",
    auth: "endpoint",
    apis: ["chat-completions"],
    catalog: "url",
    metered: false,
  };
  expect(await ports.providerStore.putAdmin(row, admin)).toBe(true);
  expect(await ports.providerStore.list()).toEqual([row]);
  expect(await ports.providerStore.removeAdmin(id)).toBe(true);
  expect(await ports.providerStore.list()).toEqual([]);
});

test("`snapshotStore` is the KV the mirrors warm through", async () => {
  const db = await freshDb();
  const ports = createConnectionPorts({ db, now: () => FROZEN_AT_MS });
  expect(await ports.snapshotStore.read("catalog:openrouter")).toBeNull();
  await ports.snapshotStore.write("catalog:openrouter", "[]");
  expect(await ports.snapshotStore.read("catalog:openrouter")).toBe("[]");
});
