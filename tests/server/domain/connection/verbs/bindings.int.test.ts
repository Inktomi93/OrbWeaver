// verbs: listBindings · setBinding · useForEverything — the `connection_bindings` writer. The rule a SQL
// CHECK cannot express is the one pinned hardest here: a binding may only point at a row the caller holds,
// and the ACTOR (a rule, a plugin) must be the caller's too. Beside it: the two write-time refusals the pane
// surfaces inline (a background task on a row with `allowBackground` off; a task the row's kind cannot
// serve), the upsert's re-point-in-place (never a second row), `useForEverything`'s SKIP-not-refuse rule for
// background tasks, the per-ROUTABLE-task readout `listBindings` always returns, and the embed-space trigger.

import { CONNECTION_OP_CODES, ROUTABLE_TASKS } from "@orb/contracts/inference";
import type { AutomationRuleId, PluginId, UserConnectionId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { BYO_BASE_URL, BYO_PROVIDER, makeHarness, seedAutomationRule, seedOwner } from "../_support.ts";

const PLUGIN_ID = castId<PluginId>("plugin_000001");
const UNOWNED_RULE_ID = castId<AutomationRuleId>("automation_rule_999999");

describe("setBinding", () => {
  test("re-points an existing task in place — one row per (actor, task), never a second", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    const owner = await seedOwner(db);
    const first = await h.svc.create({ principal: owner.principal, providerId: BYO_PROVIDER, credentialId: null, baseUrl: BYO_BASE_URL, model: "m1" });
    const second = await h.svc.create({ principal: owner.principal, providerId: BYO_PROVIDER, credentialId: null, baseUrl: BYO_BASE_URL, model: "m2" });
    const a = await h.svc.setBinding({ principal: owner.principal, task: "chat", connectionId: first.id });
    const b = await h.svc.setBinding({ principal: owner.principal, task: "chat", connectionId: second.id });
    expect(b.id).toBe(a.id);
    expect(b.connectionId).toBe(second.id);
    const chat = (await h.svc.listBindings({ principal: owner.principal })).find((row) => row.task === "chat");
    expect(chat?.binding?.connectionId).toBe(second.id);
  });

  test("a row the caller does not hold is NOT bindable (the rule no CHECK can express)", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    const owner = await seedOwner(db);
    const other = await seedOwner(db, "user_b");
    const theirs = await h.svc.create({ principal: other.principal, providerId: BYO_PROVIDER, credentialId: null, baseUrl: BYO_BASE_URL, model: "m" });
    await expect(h.svc.setBinding({ principal: owner.principal, task: "chat", connectionId: theirs.id })).rejects.toMatchObject({
      code: CONNECTION_OP_CODES.notFound,
    });
  });

  test("an actor that is not the caller's is refused for a rule and for a plugin alike", async () => {
    const db = await freshDb();
    const h = await makeHarness(db, { ruleOwned: false, pluginOwned: false });
    const owner = await seedOwner(db);
    const row = await h.svc.create({ principal: owner.principal, providerId: BYO_PROVIDER, credentialId: null, baseUrl: BYO_BASE_URL, model: "m" });
    await expect(
      h.svc.setBinding({ principal: owner.principal, task: "chat", connectionId: row.id, actor: { kind: "automation-rule", ruleId: UNOWNED_RULE_ID } }),
    ).rejects.toMatchObject({ code: CONNECTION_OP_CODES.actorForeign });
    await expect(
      h.svc.setBinding({ principal: owner.principal, task: "chat", connectionId: row.id, actor: { kind: "plugin-grant", pluginId: PLUGIN_ID } }),
    ).rejects.toMatchObject({ code: CONNECTION_OP_CODES.actorForeign });
  });

  test("an actor's bindings are its OWN — a rule's pick does not read back as the user's", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    const owner = await seedOwner(db);
    const ruleId = await seedAutomationRule(db, owner.userId);
    const mine = await h.svc.create({ principal: owner.principal, providerId: BYO_PROVIDER, credentialId: null, baseUrl: BYO_BASE_URL, model: "m1" });
    const rules = await h.svc.create({ principal: owner.principal, providerId: BYO_PROVIDER, credentialId: null, baseUrl: BYO_BASE_URL, model: "m2" });
    await h.svc.setBinding({ principal: owner.principal, task: "chat", connectionId: mine.id });
    await h.svc.setBinding({ principal: owner.principal, task: "chat", connectionId: rules.id, actor: { kind: "automation-rule", ruleId } });
    const asUser = (await h.svc.listBindings({ principal: owner.principal })).find((row) => row.task === "chat");
    const asRule = (await h.svc.listBindings({ principal: owner.principal, actor: { kind: "automation-rule", ruleId } })).find((row) => row.task === "chat");
    expect(asUser?.binding?.connectionId).toBe(mine.id);
    expect(asRule?.binding?.connectionId).toBe(rules.id);
  });

  test("a background task on a row that does not allow background work is refused by name", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    const owner = await seedOwner(db);
    const row = await h.svc.create({
      principal: owner.principal,
      providerId: BYO_PROVIDER,
      credentialId: null,
      baseUrl: BYO_BASE_URL,
      model: "m",
      allowBackground: false,
    });
    // `summarize` is a foreground-funded generation task only when the flag is on: spend is background.
    await expect(h.svc.setBinding({ principal: owner.principal, task: "summarize", connectionId: row.id })).rejects.toMatchObject({
      code: CONNECTION_OP_CODES.backgroundRefused,
    });
    // The POSITIVE control: the same row/task binds once the flag is on, so the refusal above is the
    // flag's doing and not an unreachable path.
    await h.svc.update({ principal: owner.principal, connectionId: row.id, patch: { allowBackground: true } });
    const bound = await h.svc.setBinding({ principal: owner.principal, task: "summarize", connectionId: row.id });
    expect(bound.connectionId).toBe(row.id);
  });

  test("a task the row's KIND cannot serve is refused (one connection = one model = one kind)", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    const owner = await seedOwner(db);
    const embedder = await h.svc.create({
      principal: owner.principal,
      providerId: BYO_PROVIDER,
      credentialId: null,
      baseUrl: BYO_BASE_URL,
      model: "bge-m3",
      declared: { kind: "embedding" },
      allowBackground: true,
    });
    await expect(h.svc.setBinding({ principal: owner.principal, task: "chat", connectionId: embedder.id })).rejects.toMatchObject({
      code: CONNECTION_OP_CODES.taskUnservable,
    });
    const bound = await h.svc.setBinding({ principal: owner.principal, task: "embed", connectionId: embedder.id });
    expect(bound.task).toBe("embed");
  });

  test("clearing a task writes `null` and raises the embed-space trigger for a vector task only", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    const owner = await seedOwner(db);
    const row = await h.svc.create({ principal: owner.principal, providerId: BYO_PROVIDER, credentialId: null, baseUrl: BYO_BASE_URL, model: "m" });
    await h.svc.setBinding({ principal: owner.principal, task: "chat", connectionId: row.id });
    expect(h.embedSpaceChanges).toEqual([]);
    const cleared = await h.svc.setBinding({ principal: owner.principal, task: "chat", connectionId: null });
    expect(cleared.connectionId).toBeNull();

    const embedder = await h.svc.create({
      principal: owner.principal,
      providerId: BYO_PROVIDER,
      credentialId: null,
      baseUrl: BYO_BASE_URL,
      model: "bge-m3",
      declared: { kind: "embedding" },
      allowBackground: true,
    });
    await h.svc.setBinding({ principal: owner.principal, task: "embed", connectionId: embedder.id });
    expect(h.embedSpaceChanges).toEqual([owner.userId]);
  });
});

describe("listBindings", () => {
  test("answers one row per ROUTABLE task, bound or not — the pane renders every slot", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    const owner = await seedOwner(db);
    const views = await h.svc.listBindings({ principal: owner.principal });
    expect(views.map((row) => row.task)).toEqual([...ROUTABLE_TASKS]);
    expect(views.every((row) => row.binding === null && row.resolved === null)).toBe(true);
    // An unbound task's readout names the CAUSE the pane renders, never a silent null pair.
    expect(views.every((row) => row.unavailableCause === "no-connection")).toBe(true);
  });

  test("a bound task carries the credential-free resolved view and no cause", async () => {
    const db = await freshDb();
    const h = await makeHarness(db, { routes: [{ match: "/models", json: { data: [{ id: "m" }] } }] });
    const owner = await seedOwner(db);
    const row = await h.svc.create({ principal: owner.principal, providerId: BYO_PROVIDER, credentialId: null, baseUrl: BYO_BASE_URL, model: "m" });
    await h.svc.setBinding({ principal: owner.principal, task: "chat", connectionId: row.id });
    const chat = (await h.svc.listBindings({ principal: owner.principal })).find((view) => view.task === "chat");
    expect(chat?.resolved).toMatchObject({ task: "chat", connectionId: row.id, providerId: "custom-openai", model: "m" });
    expect(chat?.unavailableCause).toBeNull();
    expect(chat?.resolved).not.toHaveProperty("credential");
  });

  test("a binding whose row was deleted reads as `no-connection`, never a dangling id", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    const owner = await seedOwner(db);
    const row = await h.svc.create({ principal: owner.principal, providerId: BYO_PROVIDER, credentialId: null, baseUrl: BYO_BASE_URL, model: "m" });
    await h.svc.setBinding({ principal: owner.principal, task: "chat", connectionId: row.id });
    await h.svc.remove({ principal: owner.principal, connectionId: row.id });
    const chat = (await h.svc.listBindings({ principal: owner.principal })).find((view) => view.task === "chat");
    expect(chat?.binding?.connectionId).toBeNull();
    expect(chat?.unavailableCause).toBe("no-connection");
  });
});

describe("useForEverything", () => {
  test("binds every task the row can serve AND fund — a background task on a foreground-only row is SKIPPED, not refused", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    const owner = await seedOwner(db);
    const row = await h.svc.create({
      principal: owner.principal,
      providerId: BYO_PROVIDER,
      credentialId: null,
      baseUrl: BYO_BASE_URL,
      model: "m",
      allowBackground: false,
    });
    const written = await h.svc.useForEverything({ principal: owner.principal, connectionId: row.id });
    expect(written.map((binding) => binding.task).toSorted()).toEqual(["chat", "generateImage"]);

    await h.svc.update({ principal: owner.principal, connectionId: row.id, patch: { allowBackground: true } });
    const withBackground = await h.svc.useForEverything({ principal: owner.principal, connectionId: row.id });
    expect(withBackground.map((binding) => binding.task).toSorted()).toEqual(["chat", "generateImage", "summarize"]);
  });

  test("a stranger's row is refused", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    const owner = await seedOwner(db);
    const other = await seedOwner(db, "user_b");
    const theirs = await h.svc.create({ principal: other.principal, providerId: BYO_PROVIDER, credentialId: null, baseUrl: BYO_BASE_URL, model: "m" });
    await expect(h.svc.useForEverything({ principal: owner.principal, connectionId: theirs.id })).rejects.toMatchObject({
      code: CONNECTION_OP_CODES.notFound,
    });
    await expect(
      h.svc.useForEverything({ principal: owner.principal, connectionId: castId<UserConnectionId>("user_connection_999999") }),
    ).rejects.toMatchObject({ code: CONNECTION_OP_CODES.notFound });
  });

  test("an embedding row's sweep raises the embed-space trigger once", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    const owner = await seedOwner(db);
    const embedder = await h.svc.create({
      principal: owner.principal,
      providerId: BYO_PROVIDER,
      credentialId: null,
      baseUrl: BYO_BASE_URL,
      model: "bge-m3",
      declared: { kind: "embedding" },
      allowBackground: true,
    });
    const written = await h.svc.useForEverything({ principal: owner.principal, connectionId: embedder.id });
    expect(written.map((binding) => binding.task).toSorted()).toEqual(["embed", "imageEmbed"]);
    expect(h.embedSpaceChanges).toEqual([owner.userId]);
  });
});
