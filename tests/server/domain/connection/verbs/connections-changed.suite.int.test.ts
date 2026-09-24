// The per-user freshness plane: every persisting connection verb emits `connectionsChanged` on the user bus
// AFTER its durable write commits, so a second tab/device's Connections pane reconciles (docs/work/0121). One
// emit per call — never per row a bulk verb touched, and never on a refused write.

import { CONNECTION_OP_CODES } from "@orb/contracts/inference";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { BYO_BASE_URL, BYO_PROVIDER, makeHarness, seedOwner } from "../_support.ts";

describe("connectionsChanged", () => {
  test("create emits exactly once, after the row is durable", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    const owner = await seedOwner(db);
    const created = await h.svc.create({ principal: owner.principal, providerId: BYO_PROVIDER, credentialId: null, baseUrl: BYO_BASE_URL, model: "qwen3" });
    expect(h.emittedUserEvents).toEqual([{ userId: owner.userId, event: { type: "connectionsChanged" } }]);
    // AFTER the write: the row the emit announced is already readable.
    expect((await h.svc.get({ principal: owner.principal, connectionId: created.id })).id).toBe(created.id);
  });

  test("a refused create emits nothing", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    const owner = await seedOwner(db);
    await expect(
      h.svc.create({ principal: owner.principal, providerId: "no-such-provider", credentialId: null, baseUrl: BYO_BASE_URL, model: "m" }),
    ).rejects.toMatchObject({ code: CONNECTION_OP_CODES.providerUnknown });
    expect(h.emittedUserEvents).toEqual([]);
  });

  test("update emits exactly once, and a refused patch emits nothing", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    const owner = await seedOwner(db);
    const created = await h.svc.create({ principal: owner.principal, providerId: BYO_PROVIDER, credentialId: null, baseUrl: BYO_BASE_URL, model: "qwen3" });
    h.emittedUserEvents.length = 0;

    await h.svc.update({ principal: owner.principal, connectionId: created.id, patch: { model: "qwen3-next" } });
    expect(h.emittedUserEvents).toEqual([{ userId: owner.userId, event: { type: "connectionsChanged" } }]);

    h.emittedUserEvents.length = 0;
    await expect(h.svc.update({ principal: owner.principal, connectionId: created.id, patch: { model: "   " } })).rejects.toMatchObject({
      code: CONNECTION_OP_CODES.taskUnservable,
    });
    expect(h.emittedUserEvents).toEqual([]);
  });

  test("remove emits exactly once, and a stranger's refused remove emits nothing", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    const owner = await seedOwner(db);
    const other = await seedOwner(db, "user_b");
    const created = await h.svc.create({ principal: owner.principal, providerId: BYO_PROVIDER, credentialId: null, baseUrl: BYO_BASE_URL, model: "qwen3" });
    h.emittedUserEvents.length = 0;

    await expect(h.svc.remove({ principal: other.principal, connectionId: created.id })).rejects.toMatchObject({ code: CONNECTION_OP_CODES.notFound });
    expect(h.emittedUserEvents).toEqual([]);

    await h.svc.remove({ principal: owner.principal, connectionId: created.id });
    expect(h.emittedUserEvents).toEqual([{ userId: owner.userId, event: { type: "connectionsChanged" } }]);
  });

  test("setBinding emits exactly once, and a refused binding emits nothing", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    const owner = await seedOwner(db);
    const row = await h.svc.create({ principal: owner.principal, providerId: BYO_PROVIDER, credentialId: null, baseUrl: BYO_BASE_URL, model: "qwen3" });
    h.emittedUserEvents.length = 0;

    await h.svc.setBinding({ principal: owner.principal, task: "chat", connectionId: row.id });
    expect(h.emittedUserEvents).toEqual([{ userId: owner.userId, event: { type: "connectionsChanged" } }]);

    const other = await seedOwner(db, "user_b");
    const theirs = await h.svc.create({ principal: other.principal, providerId: BYO_PROVIDER, credentialId: null, baseUrl: BYO_BASE_URL, model: "m" });
    h.emittedUserEvents.length = 0;
    await expect(h.svc.setBinding({ principal: owner.principal, task: "chat", connectionId: theirs.id })).rejects.toMatchObject({
      code: CONNECTION_OP_CODES.notFound,
    });
    expect(h.emittedUserEvents).toEqual([]);
  });

  test("useForEverything emits exactly ONE event for the whole sweep, never one per bound task", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    const owner = await seedOwner(db);
    const row = await h.svc.create({ principal: owner.principal, providerId: BYO_PROVIDER, credentialId: null, baseUrl: BYO_BASE_URL, model: "qwen3" });
    h.emittedUserEvents.length = 0;

    const written = await h.svc.useForEverything({ principal: owner.principal, connectionId: row.id });
    expect(written.length).toBeGreaterThan(1);
    expect(h.emittedUserEvents).toEqual([{ userId: owner.userId, event: { type: "connectionsChanged" } }]);
  });
});
