// `createInferenceRuntime` — the §3.3 surface over in-memory ports: the §7.1 binding fold (actor → funder →
// none, no born default), the owner fence (a binding naming a stranger's row is refused AND recorded), the
// `canFund`/requirement verdicts on availability, `providers.available` with `runtime-missing`, the builtin
// catalog for local-light, and `capabilities.for`.

import type { Principal } from "@orb/contracts/identity";
import { builtinProvider } from "@orb/contracts/inference";
import { createInferenceRuntime, DEFAULT_EMBED_MODEL, DEFAULT_RERANK_MODEL, NoConnectionError } from "@orb/inference";
import type { UserConnectionId, UserId } from "@orb/kit/ids";
import { principal } from "../support/factories/principal.ts";
import { expect, test } from "../support/fixtures.ts";
import { fakeConnection, fakeDeps, memoryStores, newPluginId, newRuleId, newUserId } from "./_support.ts";

interface Scene {
  readonly deps: ReturnType<typeof fakeDeps>;
  readonly stores: ReturnType<typeof memoryStores>;
  readonly alice: Principal;
  readonly bob: Principal;
  readonly aliceId: UserId;
  readonly bobId: UserId;
  readonly securityEvents: { kind: string; fields: Record<string, unknown> }[];
}

function scene(options: { claudeExecutable?: string } = {}): Scene {
  const stores = memoryStores();
  const securityEvents: Scene["securityEvents"] = [];
  const deps = fakeDeps({ stores, securityEvents, ...options });
  const aliceId = newUserId();
  const bobId = newUserId();
  return { deps, stores, alice: principal(aliceId), bob: principal(bobId), aliceId, bobId, securityEvents };
}

function seedLocalLight(s: Scene, ownerId: UserId, opts: { allowBackground?: boolean } = {}): { embed: UserConnectionId; rerank: UserConnectionId } {
  const embed = fakeConnection({
    ownerId,
    providerId: "local-light",
    model: DEFAULT_EMBED_MODEL,
    label: "local-light · encoder",
    allowBackground: opts.allowBackground ?? true,
  });
  const rerank = fakeConnection({
    ownerId,
    providerId: "local-light",
    model: DEFAULT_RERANK_MODEL,
    label: "local-light · reranker",
    allowBackground: opts.allowBackground ?? true,
  });
  s.stores.connections.rows.set(embed.id, embed);
  s.stores.connections.rows.set(rerank.id, rerank);
  s.stores.bindings.bind({ actorKind: "user", actorId: ownerId, task: "embed", connectionId: embed.id });
  s.stores.bindings.bind({ actorKind: "user", actorId: ownerId, task: "rerank", connectionId: rerank.id });
  return { embed: embed.id, rerank: rerank.id };
}

test("no binding ⇒ NoConnectionError on resolve and `no-connection` on availability — never a born default", async () => {
  const s = scene();
  const runtime = await createInferenceRuntime(s.deps);
  await expect(runtime.resolve({ task: "chat", principal: s.alice })).rejects.toBeInstanceOf(NoConnectionError);
  expect(await runtime.availability({ task: "chat", principal: s.alice })).toEqual({ available: false, cause: "no-connection" });
});

test("the user binding resolves the funder's own row with the curated capability, and reads available", async () => {
  const s = scene();
  const ids = seedLocalLight(s, s.aliceId);
  const runtime = await createInferenceRuntime(s.deps);
  const { resolved, warnings } = await runtime.resolve({ task: "embed", principal: s.alice });
  expect(resolved.connectionId).toBe(ids.embed);
  expect(resolved.ownerId).toBe(s.aliceId);
  expect(resolved.wire).toBe("local-light");
  expect(resolved.api).toBeNull();
  expect(resolved.capability.kind).toBe("embedding");
  expect(resolved.capability.kind === "embedding" && resolved.capability.embedding.dims).toBe(1024);
  expect(resolved.requirement).toEqual({ ok: true });
  expect(warnings).toEqual([]);
  expect(await runtime.availability({ task: "embed", principal: s.alice })).toEqual({ available: true });
});

test("a binding that names a stranger's row is refused and recorded as a security event", async () => {
  const s = scene();
  const bobRows = seedLocalLight(s, s.bobId);
  // Alice's binding points at Bob's connection — a domain bug the resolver must never serve.
  s.stores.bindings.bind({ actorKind: "user", actorId: s.aliceId, task: "embed", connectionId: bobRows.embed });
  const runtime = await createInferenceRuntime(s.deps);
  await expect(runtime.resolve({ task: "embed", principal: s.alice })).rejects.toBeInstanceOf(NoConnectionError);
  expect(s.securityEvents.map((e) => e.kind)).toEqual(["connection_owner_mismatch"]);
  expect(s.securityEvents[0]?.fields["funder"]).toBe(s.aliceId);
  expect(s.securityEvents[0]?.fields["owner"]).toBe(s.bobId);
});

function seedEndpointRow(s: Scene, ownerId: UserId, label: string): UserConnectionId {
  const row = fakeConnection({ ownerId, providerId: "custom-openai", model: "qwen3", label, baseUrl: "http://box.local:8000", allowBackground: true });
  s.stores.connections.rows.set(row.id, row);
  return row.id;
}

test("the actor hop wins over the funder's user binding for an actor-scoped task; an unbound rule falls through to the author", async () => {
  const s = scene();
  const userRow = seedEndpointRow(s, s.aliceId, "alice's box");
  const ruleRow = seedEndpointRow(s, s.aliceId, "the rule's box");
  s.stores.bindings.bind({ actorKind: "user", actorId: s.aliceId, task: "summarize", connectionId: userRow });
  const rule = newRuleId();
  s.stores.bindings.bind({ actorKind: "automation-rule", actorId: rule, task: "summarize", connectionId: ruleRow });
  const runtime = await createInferenceRuntime(s.deps);
  const viaRule = await runtime.resolve({ task: "summarize", principal: s.alice, actor: { kind: "automation-rule", ruleId: rule } });
  expect(viaRule.resolved.connectionId).toBe(ruleRow);
  const viaAuthor = await runtime.resolve({ task: "summarize", principal: s.alice, actor: { kind: "automation-rule", ruleId: newRuleId() } });
  expect(viaAuthor.resolved.connectionId).toBe(userRow);
  // `structured` rides the summarize binding — no row of its own.
  const rides = await runtime.resolve({ task: "structured", principal: s.alice });
  expect(rides.resolved.connectionId).toBe(userRow);
});

test("an owner-scoped task (the vector space) ignores the actor hop — one space per owner", async () => {
  const s = scene();
  const ids = seedLocalLight(s, s.aliceId);
  const ruleRow = fakeConnection({ ownerId: s.aliceId, providerId: "local-light", model: DEFAULT_EMBED_MODEL, label: "rule's encoder", allowBackground: true });
  s.stores.connections.rows.set(ruleRow.id, ruleRow);
  const rule = newRuleId();
  s.stores.bindings.bind({ actorKind: "automation-rule", actorId: rule, task: "embed", connectionId: ruleRow.id });
  const runtime = await createInferenceRuntime(s.deps);
  const viaRule = await runtime.resolve({ task: "embed", principal: s.alice, actor: { kind: "automation-rule", ruleId: rule } });
  expect(viaRule.resolved.connectionId).toBe(ids.embed);
});

test("a background task on a row without allowBackground warns at resolve and reads background-refused", async () => {
  const s = scene();
  seedLocalLight(s, s.aliceId, { allowBackground: false });
  const runtime = await createInferenceRuntime(s.deps);
  const { warnings } = await runtime.resolve({ task: "embed", principal: s.alice });
  expect(warnings.map((w) => w.code)).toEqual(["background_task_degraded"]);
  expect(await runtime.availability({ task: "embed", principal: s.alice })).toEqual({ available: false, cause: "background-refused" });
});

test("a row whose model kind cannot serve the task is refused at resolve and reads requirement-unmet", async () => {
  const s = scene();
  const ids = seedLocalLight(s, s.aliceId);
  // Bind the ENCODER row to rerank: an embedding model cannot serve a rerank task.
  s.stores.bindings.bind({ actorKind: "user", actorId: s.aliceId, task: "rerank", connectionId: ids.embed });
  const runtime = await createInferenceRuntime(s.deps);
  await expect(runtime.resolve({ task: "rerank", principal: s.alice })).rejects.toMatchObject({ kind: "forbidden" });
  expect(await runtime.availability({ task: "rerank", principal: s.alice })).toEqual({ available: false, cause: "requirement-unmet" });
});

test("rerank on an endpoint row with no declared rerankPath reads requirement-unmet; a declared path clears it", async () => {
  const s = scene();
  const bare = fakeConnection({
    ownerId: s.aliceId,
    providerId: "custom-openai",
    model: "bge-reranker",
    label: "bare",
    baseUrl: "http://box.local:8000",
    declared: { kind: "rerank" },
    allowBackground: true,
  });
  s.stores.connections.rows.set(bare.id, bare);
  s.stores.bindings.bind({ actorKind: "user", actorId: s.aliceId, task: "rerank", connectionId: bare.id });
  const runtime = await createInferenceRuntime(s.deps);
  const { resolved } = await runtime.resolve({ task: "rerank", principal: s.alice });
  expect(resolved.requirement).toEqual({ ok: false, missing: ["features.rerankPath"] });
  expect(await runtime.availability({ task: "rerank", principal: s.alice })).toEqual({ available: false, cause: "requirement-unmet" });
  s.stores.connections.rows.set(bare.id, { ...bare, declared: { kind: "rerank", features: { rerankPath: "/v1/rerank" } } });
  const declared = await runtime.resolve({ task: "rerank", principal: s.alice });
  expect(declared.resolved.requirement).toEqual({ ok: true });
  expect(declared.resolved.features.rerankPath).toBe("/v1/rerank");
});

test("providers.available lists every row; claude-sub reads runtime-missing without the claude executable", async () => {
  const withoutClaude = await createInferenceRuntime(scene().deps);
  const rows = withoutClaude.providers.available(principal(newUserId()));
  expect(rows.map((r) => r.provider.id).toSorted()).toEqual(
    withoutClaude.providers.registry
      .list()
      .map((r) => r.id)
      .toSorted(),
  );
  const claudeSub = rows.find((r) => r.provider.id === "claude-sub");
  expect(claudeSub).toMatchObject({ available: false, cause: "runtime-missing" });
  expect(rows.filter((r) => r.provider.id !== "claude-sub").every((r) => r.available)).toBe(true);

  const withClaude = await createInferenceRuntime(scene({ claudeExecutable: "/usr/bin/claude" }).deps);
  expect(withClaude.providers.available(principal(newUserId())).every((r) => r.available)).toBe(true);
});

test("a claude-sub binding without the runtime reads runtime-missing, not no-connection", async () => {
  const s = scene();
  const row = fakeConnection({ ownerId: s.aliceId, providerId: "claude-sub", model: "sonnet", label: "sub" });
  s.stores.connections.rows.set(row.id, row);
  s.stores.bindings.bind({ actorKind: "user", actorId: s.aliceId, task: "chat", connectionId: row.id });
  const runtime = await createInferenceRuntime(s.deps);
  expect(await runtime.availability({ task: "chat", principal: s.alice })).toEqual({ available: false, cause: "runtime-missing" });
});

test("catalogs.models: the builtin strategy lists the curated local-light rows with their kinds", async () => {
  const s = scene();
  const ids = seedLocalLight(s, s.aliceId);
  const runtime = await createInferenceRuntime(s.deps);
  const connection = s.stores.connections.rows.get(ids.embed);
  if (connection === undefined) {
    throw new Error("seeded row missing");
  }
  const models = await runtime.catalogs.models({ connection, principal: s.alice });
  expect(models.map((m) => m.id)).toContain(DEFAULT_EMBED_MODEL);
  expect(models.find((m) => m.id === DEFAULT_EMBED_MODEL)?.kind).toBe("embedding");
  expect(models.find((m) => m.id === DEFAULT_RERANK_MODEL)?.kind).toBe("rerank");
  // Another principal cannot list through someone else's row.
  await expect(runtime.catalogs.models({ connection, principal: s.bob })).rejects.toMatchObject({ kind: "forbidden" });
});

test("capabilities.for reads one descriptor + the tasks a row serves, for the owner only", async () => {
  const s = scene();
  const ids = seedLocalLight(s, s.aliceId);
  const runtime = await createInferenceRuntime(s.deps);
  const read = await runtime.capabilities.for({ connectionId: ids.rerank, principal: s.alice });
  expect(read.capability.kind).toBe("rerank");
  expect(read.tasks).toEqual(["rerank"]);
  await expect(runtime.capabilities.for({ connectionId: ids.rerank, principal: s.bob })).rejects.toMatchObject({ kind: "forbidden" });
});

test("providers.register refuses a built-in id and a mis-namespaced plugin row; drop removes a runtime row", async () => {
  const s = scene();
  const runtime = await createInferenceRuntime(s.deps);
  const adminId = newUserId();
  await expect(runtime.providers.register({ ...builtinProvider("openai"), label: "shadow" }, { admin: adminId })).rejects.toMatchObject({ kind: "invalid" });
  const bad = {
    id: "plugin:other/relay",
    label: "Relay",
    wire: "openai-compat",
    dialect: "openai-compatible",
    auth: "apiKey",
    baseUrl: "https://relay.example",
    apis: ["chat-completions"],
    catalog: "url",
    metered: true,
  };
  await expect(runtime.providers.register(bad, { plugin: newPluginId(), pluginName: "acme" })).rejects.toMatchObject({ kind: "invalid" });
  const good = { ...bad, id: "plugin:acme/relay" };
  const row = await runtime.providers.register(good, { plugin: newPluginId(), pluginName: "acme" });
  expect(runtime.providers.registry.get(row.id)?.label).toBe("Relay");
  expect(s.stores.providerStore.rows.has(row.id)).toBe(true);
  await runtime.providers.drop(row.id);
  expect(runtime.providers.registry.get(row.id)).toBeUndefined();
  expect(s.stores.providerStore.rows.has(row.id)).toBe(false);
});
