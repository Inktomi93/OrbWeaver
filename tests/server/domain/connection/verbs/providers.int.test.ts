// verbs: providersAvailable · registerProvider · dropProvider — the registry door. Three properties carry
// real consequence: a runtime row may NEVER shadow a built-in id (a plugin that registered `openrouter`
// would silently re-point every existing connection on it); a row on an unbuilt wire is LISTED DISABLED with
// its cause rather than hidden (the picker explains itself instead of losing an option); and a dropped
// provider leaves its connections resolvable-as-`no-connection` rather than dangling.

import type { ProviderId } from "@orb/contracts/inference";
import type { PluginId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeHarness, seedOwner } from "../_support.ts";

const ACME_ID = castId<ProviderId>("acme-endpoint");
const PLUGIN_ID = castId<PluginId>("plugin_provider_test");
const CONTRIBUTED_ID = castId<ProviderId>("plugin:provider-test/acme");

const PLUGIN_ROW = {
  id: "acme-endpoint",
  label: "Acme",
  wire: "openai-compat",
  dialect: "openai-compatible",
  auth: "endpoint",
  apis: ["chat-completions"],
  catalog: "url",
  metered: false,
};

describe("providersAvailable", () => {
  test("lists a wire that was NOT built as unavailable with its cause, never hidden", async () => {
    const db = await freshDb();
    // No `claudeExecutable` ⇒ the agent-sdk wire is not built (the shipped default on a box without it).
    const h = await makeHarness(db);
    const owner = await seedOwner(db);
    const rows = await h.svc.providersAvailable({ principal: owner.principal });
    const claudeSub = rows.find((row) => row.provider.id === "claude-sub");
    expect(claudeSub, "an unbuildable wire's row is still offered — disabled and explained").toBeDefined();
    expect(claudeSub).toMatchObject({ available: false, cause: "runtime-missing" });
    expect(rows.find((row) => row.provider.id === "openrouter")).toMatchObject({ available: true });
  });
});

describe("registerProvider / dropProvider", () => {
  test("registerPluginProviders and dropPluginProviders publish and withdraw one plugin's rows", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    await h.svc.registerPluginProviders({
      pluginId: PLUGIN_ID,
      pluginName: "provider-test",
      rows: [{ ...PLUGIN_ROW, id: CONTRIBUTED_ID }],
    });
    expect(h.svc.registry.get(CONTRIBUTED_ID)).toMatchObject({ id: CONTRIBUTED_ID, label: "Acme" });
    await h.svc.dropPluginProviders({ pluginId: PLUGIN_ID });
    expect(h.svc.registry.get(CONTRIBUTED_ID)).toBeUndefined();
  });

  test("a registered row joins the registry, persists, and is offered by the picker", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    const owner = await seedOwner(db);
    await h.svc.registerProvider({ row: PLUGIN_ROW, origin: { admin: owner.userId } });
    expect(h.svc.registry.get("acme-endpoint")).toMatchObject({ id: "acme-endpoint", label: "Acme" });
    expect((await h.svc.providersAvailable({ principal: owner.principal })).some((row) => row.provider.id === "acme-endpoint")).toBe(true);
    // The row is PERSISTED: a fresh runtime over the same db reads it back at construction.
    const reborn = await makeHarness(db);
    expect(reborn.svc.registry.get("acme-endpoint")).toBeDefined();
  });

  test("a runtime row may not shadow a built-in id", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    const owner = await seedOwner(db);
    await expect(h.svc.registerProvider({ row: { ...PLUGIN_ROW, id: "openrouter" }, origin: { admin: owner.userId } })).rejects.toThrow();
    // The built-in is intact: its own label, not the impostor's.
    expect(h.svc.registry.get("openrouter")).toMatchObject({ label: "OpenRouter" });
  });

  test("a malformed row is refused by the registry's own schema, not stored half-parsed", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    const owner = await seedOwner(db);
    await expect(h.svc.registerProvider({ row: { id: "broken" }, origin: { admin: owner.userId } })).rejects.toThrow();
    expect(h.svc.registry.get("broken")).toBeUndefined();
  });

  test("dropping a provider removes it from the registry and from the persisted rows", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    const owner = await seedOwner(db);
    await h.svc.registerProvider({ row: PLUGIN_ROW, origin: { admin: owner.userId } });
    await h.svc.dropProvider({ providerId: ACME_ID });
    expect(h.svc.registry.get("acme-endpoint")).toBeUndefined();
    const reborn = await makeHarness(db);
    expect(reborn.svc.registry.get("acme-endpoint")).toBeUndefined();
  });

  test("a connection on a dropped provider reads `no-connection` instead of resolving", async () => {
    const db = await freshDb();
    const h = await makeHarness(db, { routes: [{ match: "/models", json: { data: [{ id: "m" }] } }] });
    const owner = await seedOwner(db);
    await h.svc.registerProvider({ row: PLUGIN_ROW, origin: { admin: owner.userId } });
    const row = await h.svc.create({
      principal: owner.principal,
      providerId: "acme-endpoint",
      credentialId: null,
      baseUrl: "http://127.0.0.1:18703/v1",
      model: "m",
    });
    await h.svc.setBinding({ principal: owner.principal, task: "chat", connectionId: row.id });
    expect(await h.svc.availability({ task: "chat", principal: owner.principal })).toEqual({ available: true });
    await h.svc.dropProvider({ providerId: ACME_ID });
    expect(await h.svc.availability({ task: "chat", principal: owner.principal })).toEqual({ available: false, cause: "no-connection" });
  });
});
