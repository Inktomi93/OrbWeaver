// `createInferenceRuntime` — the §3.3 surface over in-memory ports: the §7.1 binding fold (actor → funder →
// none, no born default), the owner fence (a binding naming a stranger's row is refused AND recorded), the
// `canFund`/requirement verdicts on availability, `providers.available` with `runtime-missing`, and
// `capabilities.for`. The catalog read is `tests/inference/catalog/listing.test.ts`.
//
// The owner-fence arms are the NON-ORACLE proof: an id-taking read must answer a caller who does not own the
// id identically whether or not a row is behind it. They probe the SAME id in both states, so any difference
// in class, kind or message is the oracle.

import type { Principal } from "@orb/contracts/identity";
import { builtinProvider } from "@orb/contracts/inference";
import { createInferenceRuntime, DEFAULT_EMBED_MODEL, DEFAULT_RERANK_MODEL, NoConnectionError, ProviderError } from "@orb/inference";
import type { UserConnectionId, UserId } from "@orb/kit/ids";
import { principal } from "../support/factories/principal.ts";
import { expect, test } from "../support/fixtures.ts";
import { fakeConnection, fakeDeps, memoryStores, newPluginId, newRuleId, newUserId } from "./_support.ts";

/** The rejection a call produced, as a value — so two refusals can be COMPARED rather than merely matched
 *  one at a time, which is the only way to assert "these two answers are indistinguishable". A call that
 *  RESOLVES is a test failure, never a silent `undefined`. */
async function caught(promise: Promise<unknown>): Promise<unknown> {
  let thrown: unknown;
  let resolved = false;
  try {
    await promise;
    resolved = true;
  } catch (err) {
    thrown = err;
  }
  if (resolved) {
    throw new Error("expected the call to reject, but it resolved");
  }
  return thrown;
}

/** The three fields a caller can actually tell two `ProviderError`s apart by. */
function refusalShape(err: unknown): { readonly name: string; readonly kind: string; readonly message: string } {
  if (!(err instanceof ProviderError)) {
    throw new Error(`expected a ProviderError, got ${String(err)}`);
  }
  return { name: err.name, kind: err.kind, message: err.message };
}

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

test("catalogs.builtin: a builtin provider answers the same closed set its rows list; a url provider has none", async () => {
  const s = scene();
  const runtime = await createInferenceRuntime(s.deps);
  const closed = runtime.catalogs.builtin("local-light");
  expect(closed?.map((m) => m.id)).toContain(DEFAULT_EMBED_MODEL);
  expect(closed?.map((m) => m.id)).toContain(DEFAULT_RERANK_MODEL);
  expect(runtime.catalogs.builtin("openrouter")).toBeNull();
  expect(() => runtime.catalogs.builtin("no-such-provider")).toThrow('provider "no-such-provider" is not registered');
});

test("capabilities.for reads one descriptor + the tasks a row serves, for the owner only", async () => {
  const s = scene();
  const ids = seedLocalLight(s, s.aliceId);
  const runtime = await createInferenceRuntime(s.deps);
  const read = await runtime.capabilities.for({ connectionId: ids.rerank, principal: s.alice });
  expect(read.capability.kind).toBe("rerank");
  expect(read.baseline).toEqual(read.capability);
  expect(read.tasks).toEqual(["rerank"]);
  await expect(runtime.capabilities.for({ connectionId: ids.rerank, principal: s.bob })).rejects.toBeInstanceOf(ProviderError);
});

test("capabilities.for separates a row's declared override from its evidence baseline", async () => {
  const s = scene();
  const row = fakeConnection({
    ownerId: s.aliceId,
    providerId: "local-light",
    model: DEFAULT_EMBED_MODEL,
    declared: { kind: "embedding", embedding: { dims: 768, dtype: "q8", input: ["text"] } },
    allowBackground: true,
  });
  s.stores.connections.rows.set(row.id, row);
  const runtime = await createInferenceRuntime(s.deps);

  const read = await runtime.capabilities.for({ connectionId: row.id, principal: s.alice });

  expect(read.capability).toMatchObject({ kind: "embedding", embedding: { dims: 768, dtype: "q8", input: ["text"] } });
  expect(read.baseline).toMatchObject({ kind: "embedding", embedding: { dims: 1024, dtype: "q8", input: ["text", "image"] } });
  expect(read.tasks).toEqual(["embed", "imageEmbed"]);
  expect(read.warnings).toEqual([]);
});

// The owner belt's whole job, stated as the property an oracle would break: the answer to "read this id" must
// be a function of the ID ALONE for a caller who does not own it — never of whether a row is behind it. The two
// probes below use the SAME id, so a difference in kind, in message, or in class IS the oracle. Before
// 2026-09-20 the arms were `forbidden` / "connection X is not the caller's" and `invalid` / "connection X no
// longer exists" — two tRPC codes and, on the second, the raw text (`error-mapping.ts` lets `invalid` carry its
// own message), so this pair failed on all three counts.
test("the owner fence answers a STRANGER'S row exactly as it answers NO row — same id, same refusal", async () => {
  const s = scene();
  const ids = seedLocalLight(s, s.aliceId);
  const runtime = await createInferenceRuntime(s.deps);

  const exists = await caught(runtime.capabilities.for({ connectionId: ids.rerank, principal: s.bob }));
  s.stores.connections.rows.delete(ids.rerank);
  const absent = await caught(runtime.capabilities.for({ connectionId: ids.rerank, principal: s.bob }));

  expect(refusalShape(exists)).toEqual(refusalShape(absent));
  // Pinned literally, because the TEXT is half the answer on the `invalid` arm: the transport carries it.
  expect(refusalShape(exists)).toEqual({ name: "ProviderError", kind: "invalid", message: `connection ${ids.rerank} not found` });
});

test("POSITIVE CONTROL — the collapse did not blunt the fence: the owner still reads, and an unservable row is still `forbidden`", async () => {
  const s = scene();
  const ids = seedLocalLight(s, s.aliceId);
  const runtime = await createInferenceRuntime(s.deps);
  // The owner resolves through the id-taking belt.
  expect((await runtime.capabilities.for({ connectionId: ids.embed, principal: s.alice })).capability.kind).toBe("embedding");
  // And `forbidden` still means what it meant — the row cannot serve the task. The two live readers of that
  // kind (`resolve/availability.ts`, `entry/compose/rpg.ts`) sit on THIS arm, never on the owner fence.
  s.stores.bindings.bind({ actorKind: "user", actorId: s.aliceId, task: "rerank", connectionId: ids.embed });
  await expect(runtime.resolve({ task: "rerank", principal: s.alice })).rejects.toMatchObject({ kind: "forbidden" });
});

// The resolver's own owner fence (`resolve-task.ts::connectionFor`) is the second belt, and it is reachable
// with a caller-supplied `connectionId`. Its kinds were already collapsed (both `NoConnectionError`); its
// MESSAGES were not. Same property, same probe.
test("the resolver's funder fence answers a stranger's row exactly as it answers no row, and records only the former", async () => {
  const s = scene();
  const bobRows = seedLocalLight(s, s.bobId);
  const runtime = await createInferenceRuntime(s.deps);

  const exists = await caught(runtime.resolve({ task: "embed", principal: s.alice, connectionId: bobRows.embed }));
  s.stores.connections.rows.delete(bobRows.embed);
  const absent = await caught(runtime.resolve({ task: "embed", principal: s.alice, connectionId: bobRows.embed }));

  expect(exists).toBeInstanceOf(NoConnectionError);
  expect(absent).toBeInstanceOf(NoConnectionError);
  expect(refusalShape(exists)).toEqual(refusalShape(absent));
  expect(refusalShape(exists)).toEqual({ name: "NoConnectionError", kind: "invalid", message: `connection ${bobRows.embed} not found` });
  // Indistinguishable OUTWARD, fully attributable INWARD: only the not-yours probe raised the security event.
  expect(s.securityEvents.map((e) => e.kind)).toEqual(["connection_owner_mismatch"]);
  expect(s.securityEvents[0]?.fields["owner"]).toBe(s.bobId);
});

test("providers.register refuses a built-in id and a mis-namespaced plugin row; dropPlugin removes its runtime row", async () => {
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
  const pluginId = newPluginId();
  const row = await runtime.providers.register(good, { plugin: pluginId, pluginName: "acme" });
  expect(runtime.providers.registry.get(row.id)?.label).toBe("Relay");
  expect(s.stores.providerStore.rows.has(row.id)).toBe(true);
  await runtime.providers.dropPlugin(pluginId);
  expect(runtime.providers.registry.get(row.id)).toBeUndefined();
  expect(s.stores.providerStore.rows.has(row.id)).toBe(true);
});

test("a registry refresh failure compensates the durable plugin contribution before activation fails", async () => {
  const s = scene();
  const durable = s.stores.providerStore;
  const listFailures: Error[] = [];
  const providerStore = {
    ...durable,
    list: (): ReturnType<typeof durable.list> => {
      const failure = listFailures.shift();
      if (failure !== undefined) {
        return Promise.reject(failure);
      }
      return durable.list();
    },
  };
  const runtime = await createInferenceRuntime({ ...s.deps, providerStore });
  const pluginId = newPluginId();
  const row = {
    id: "plugin:acme/rollback",
    label: "Rollback",
    wire: "openai-compat",
    dialect: "openai-compatible",
    auth: "endpoint",
    apis: ["chat-completions"],
    catalog: "url",
    metered: false,
  };

  listFailures.push(new Error("test: provider snapshot unavailable"));
  await expect(runtime.providers.registerPlugin([row], { plugin: pluginId, pluginName: "acme" })).rejects.toThrow("provider snapshot unavailable");
  expect(durable.rows.has(row.id)).toBe(true);

  const restarted = await createInferenceRuntime(s.deps);
  expect(restarted.providers.registry.get(row.id)).toBeUndefined();
});
