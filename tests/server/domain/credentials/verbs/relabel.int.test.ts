// verb: relabel — a key follows its connection's rename, but only while it still carries the old name.
// @subject packages/server/src/domain/credentials/verbs/relabel.ts

import { freshDb } from "@orb/testkit/node/db.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { describe } from "vitest";
import { makeHarness, principal, seedCredential } from "../_support.ts";

describe("relabel", () => {
  test("a key carrying the old name takes the new one", async () => {
    const db = await freshDb();
    const { svc, owner, cred } = await seedCredential(db, makeHarness(db), { label: "Helper" });
    await svc.relabel({ principal: principal(owner), credentialId: cred.id, from: "Helper", to: "Helper (Flash Lite)" });
    expect((await svc.list({ principal: principal(owner) })).map((view) => view.label)).toEqual(["Helper (Flash Lite)"]);
  });

  test("a key the user named by hand keeps its name", async () => {
    const db = await freshDb();
    const { svc, owner, cred } = await seedCredential(db, makeHarness(db), { label: "work" });
    await svc.relabel({ principal: principal(owner), credentialId: cred.id, from: "Helper", to: "Renamed" });
    expect((await svc.list({ principal: principal(owner) })).map((view) => view.label)).toEqual(["work"]);
  });

  test("a new name another key on the provider already holds gets the next free spelling", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const { svc, owner, cred } = await seedCredential(db, h, { label: "Helper" });
    await svc.add({ principal: principal(owner), provider: "openrouter", key: "sk-other", label: "Renamed" });
    await svc.relabel({ principal: principal(owner), credentialId: cred.id, from: "Helper", to: "Renamed" });
    expect((await svc.list({ principal: principal(owner) })).map((view) => view.label).toSorted()).toEqual(["Renamed", "Renamed (2)"]);
  });
});
