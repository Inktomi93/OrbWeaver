// verbs: listBindings · setBinding · useForEverything — the `connection_bindings` writer. The rule a SQL
// CHECK cannot express is the one pinned hardest here: a binding may only point at a row the caller holds,
// and the ACTOR (a rule, a plugin) must be the caller's too. Beside it: the two write-time refusals the pane
// surfaces inline (a background task on a row with `allowBackground` off; a task the row's kind cannot
// serve), the upsert's re-point-in-place (never a second row), `useForEverything`'s SKIP-not-refuse rule for
// background tasks, the per-ROUTABLE-task readout `listBindings` always returns, and the embed-space trigger.

import type { ProviderId } from "@orb/contracts/inference";
import { CONNECTION_OP_CODES, LOCAL_LIGHT_SEED_ROWS, ROUTABLE_TASKS } from "@orb/contracts/inference";
import { userCredentials } from "@orb/db";
import type { AutomationRuleId, PluginId, UserConnectionId, UserCredentialId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { BindingView } from "@orb/server/domain/connection";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { BYO_BASE_URL, BYO_PROVIDER, makeHarness, seedAutomationRule, seedOwner, seedPlugin } from "../_support.ts";

const PLUGIN_ID = castId<PluginId>("plugin_000001");
const UNOWNED_RULE_ID = castId<AutomationRuleId>("automation_rule_999999");
const LOCAL_LIGHT = castId<ProviderId>("local-light");
const ENCODER = LOCAL_LIGHT_SEED_ROWS[0].model;
const CREDENTIAL = castId<UserCredentialId>("user_credential_000001");

/** OpenRouter lists embedders only under `output_modalities=embeddings`; the chat and rerank lists stay empty. */
const OPENROUTER_EMBEDDER = "baai/bge-base-en-v1.5";
const OPENROUTER_EMBEDDER_ROUTES = [
  {
    match: "/models?output_modalities=embeddings",
    json: { data: [{ id: OPENROUTER_EMBEDDER, name: "BGE base", architecture: { ["input_modalities"]: ["text"], ["output_modalities"]: ["embeddings"] } }] },
  },
  { match: "/models", json: { data: [] } },
];

/** An Ollama server listing one embedder no curated row names; its `/api/show` is the test's own. */
const OLLAMA_HOUSE_EMBEDDER_ROUTES = [
  { match: "/v1/models", json: { object: "list", data: [{ id: "house-embedder:latest", object: "model" }] } },
  { match: "/api/version", json: { version: "0.12.0" } },
  { match: "/api/ps", json: { models: [] } },
];

describe("setBinding", () => {
  test("image generation is neither offered nor bindable on a text-only model; declared image output enables it", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    const owner = await seedOwner(db);
    const row = await h.svc.create({
      principal: owner.principal,
      providerId: BYO_PROVIDER,
      credentialId: null,
      baseUrl: BYO_BASE_URL,
      model: "m",
      declared: { generation: { output: { modalities: ["text"] } } },
    });
    expect(row.tasks).not.toContain("generateImage");
    expect((await h.svc.list({ principal: owner.principal }))[0]?.tasks).not.toContain("generateImage");
    await expect(h.svc.setBinding({ principal: owner.principal, task: "generateImage", connectionId: row.id })).rejects.toMatchObject({
      code: CONNECTION_OP_CODES.taskUnservable,
    });
    await h.svc.update({
      principal: owner.principal,
      connectionId: row.id,
      patch: { declared: { generation: { output: { modalities: ["text", "image"] } } } },
    });
    expect((await h.svc.get({ principal: owner.principal, connectionId: row.id })).tasks).toContain("generateImage");
    expect((await h.svc.setBinding({ principal: owner.principal, task: "generateImage", connectionId: row.id })).connectionId).toBe(row.id);
  });
  test("a row the provider's catalog lists as an embedder binds as one, with no Purpose set by hand", async () => {
    const db = await freshDb();
    const h = await makeHarness(db, { routes: OPENROUTER_EMBEDDER_ROUTES });
    const owner = await seedOwner(db);
    await db
      .insert(userCredentials)
      .values({ id: CREDENTIAL, ownerId: owner.userId, provider: castId<ProviderId>("openrouter"), ciphertext: "ct", iv: "iv", tag: "tag" });
    const row = await h.svc.create({
      principal: owner.principal,
      providerId: "openrouter",
      credentialId: CREDENTIAL,
      baseUrl: null,
      model: OPENROUTER_EMBEDDER,
      allowBackground: true,
    });

    expect((await h.svc.setBinding({ principal: owner.principal, task: "embed", connectionId: row.id })).connectionId).toBe(row.id);
    expect((await h.svc.get({ principal: owner.principal, connectionId: row.id })).tasks).toContain("embed");
    await expect(h.svc.setBinding({ principal: owner.principal, task: "chat", connectionId: row.id })).rejects.toMatchObject({
      code: CONNECTION_OP_CODES.taskUnservable,
    });
  });

  // A chat role moves no index, so it is judged from what is already known; a slow host cannot hold the write.
  test("binding chat on a restarted process dials nothing", async () => {
    const db = await freshDb();
    const first = await makeHarness(db);
    const owner = await seedOwner(db);
    const row = await first.svc.create({
      principal: owner.principal,
      providerId: BYO_PROVIDER,
      credentialId: null,
      baseUrl: BYO_BASE_URL,
      model: "some-local-model",
      allowBackground: true,
    });
    const restarted = await makeHarness(db, { intercept: () => new Promise<Response>(() => undefined) });

    expect((await restarted.svc.setBinding({ principal: owner.principal, task: "chat", connectionId: row.id })).connectionId).toBe(row.id);
    expect(restarted.requests).toHaveLength(0);
  });

  // A vector role asks the server what the model is, but a host that never answers costs one bounded wait, not a hang.
  test("binding an embedder on a host that never answers finishes within the server-read bound", async () => {
    const db = await freshDb();
    const silent = (_url: string, init: RequestInit | undefined): Promise<Response> =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("aborted", "AbortError"));
        });
      });
    const h = await makeHarness(db, { intercept: silent });
    const owner = await seedOwner(db);
    const row = await h.svc.create({
      principal: owner.principal,
      providerId: BYO_PROVIDER,
      credentialId: null,
      baseUrl: BYO_BASE_URL,
      model: "nomic-embed-text",
      allowBackground: true,
    });
    // @orb-waive test-determinism(performance.now): the subject is the real-time bound on a dial to a silent host.
    const started = performance.now();

    expect((await h.svc.setBinding({ principal: owner.principal, task: "embed", connectionId: row.id })).connectionId).toBe(row.id);

    // @orb-waive test-determinism(performance.now): the subject is the real-time bound on a dial to a silent host.
    expect(performance.now() - started).toBeLessThan(8000);
  }, 30_000);

  // Nothing known says what the model is because its server did not answer: that is the refusal, not a capability claim.
  test("binding an embedder nothing describes yet, on a host that never answers, refuses as unreachable", async () => {
    const db = await freshDb();
    const silent = (_url: string, init: RequestInit | undefined): Promise<Response> =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("aborted", "AbortError"));
        });
      });
    const h = await makeHarness(db, { intercept: silent });
    const owner = await seedOwner(db);
    const row = await h.svc.create({
      principal: owner.principal,
      providerId: BYO_PROVIDER,
      credentialId: null,
      baseUrl: BYO_BASE_URL,
      model: "acme-embedder",
      allowBackground: true,
    });

    await expect(h.svc.setBinding({ principal: owner.principal, task: "embed", connectionId: row.id })).rejects.toMatchObject({
      code: CONNECTION_OP_CODES.embedUnreachable,
    });
  }, 30_000);

  test("an Ollama embedder no curated row names binds to Embed by what /api/show says, and is refused for Chat", async () => {
    const db = await freshDb();
    const h = await makeHarness(db, {
      routes: [
        { match: "/api/show", json: { capabilities: ["embedding"], ["model_info"]: { "general.architecture": "bert", "bert.embedding_length": 768 } } },
        ...OLLAMA_HOUSE_EMBEDDER_ROUTES,
      ],
    });
    const owner = await seedOwner(db);
    const row = await h.svc.create({
      principal: owner.principal,
      providerId: "ollama",
      credentialId: null,
      baseUrl: BYO_BASE_URL,
      model: "house-embedder:latest",
      allowBackground: true,
    });

    expect((await h.svc.setBinding({ principal: owner.principal, task: "embed", connectionId: row.id })).connectionId).toBe(row.id);
    await expect(h.svc.setBinding({ principal: owner.principal, task: "chat", connectionId: row.id })).rejects.toMatchObject({
      code: CONNECTION_OP_CODES.taskUnservable,
    });
  });

  // The list answered but the one read that says what the model is did not: still the unreachable refusal.
  test("binding an Ollama embedder whose /api/show answers too late refuses as unreachable, not as a chat model", async () => {
    const db = await freshDb();
    const showStalls = (url: string, init: RequestInit | undefined): Promise<Response> | null =>
      url.endsWith("/api/show")
        ? new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              reject(new DOMException("aborted", "AbortError"));
            });
          })
        : null;
    const h = await makeHarness(db, { intercept: showStalls, routes: OLLAMA_HOUSE_EMBEDDER_ROUTES });
    const owner = await seedOwner(db);
    const row = await h.svc.create({
      principal: owner.principal,
      providerId: "ollama",
      credentialId: null,
      baseUrl: BYO_BASE_URL,
      model: "house-embedder:latest",
      allowBackground: true,
    });

    await expect(h.svc.setBinding({ principal: owner.principal, task: "embed", connectionId: row.id })).rejects.toMatchObject({
      code: CONNECTION_OP_CODES.embedUnreachable,
    });
  }, 30_000);

  // A 404 on `/api/show` (a proxy exposing only `/v1`) is the server's answer: the model is unstated, not unreachable,
  // and it is not asked again on every bind.
  test("binding an Ollama model whose /api/show answers 404 refuses as unservable, asking the server once", async () => {
    const db = await freshDb();
    const h = await makeHarness(db, { routes: OLLAMA_HOUSE_EMBEDDER_ROUTES });
    const owner = await seedOwner(db);
    const row = await h.svc.create({
      principal: owner.principal,
      providerId: "ollama",
      credentialId: null,
      baseUrl: BYO_BASE_URL,
      model: "house-embedder:latest",
      allowBackground: true,
    });

    for (const _attempt of [1, 2, 3]) {
      await expect(h.svc.setBinding({ principal: owner.principal, task: "embed", connectionId: row.id })).rejects.toMatchObject({
        code: CONNECTION_OP_CODES.taskUnservable,
      });
    }
    expect(h.requests.filter((request) => request.url.endsWith("/api/show"))).toHaveLength(1);
  });

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

  test("a plugin grant binds only a task the plugin's declared capabilities route; clearing one stays open", async () => {
    // An inert grant on an unrouted task would go live the day a capability starts routing it, spending on a
    // model the owner picked for nothing. The write refuses it; a clear of a legacy row is still allowed.
    const db = await freshDb();
    const h = await makeHarness(db, { pluginGrantTasks: ["summarize"] });
    const owner = await seedOwner(db);
    const pluginId = await seedPlugin(db, owner.userId);
    const row = await h.svc.create({
      principal: owner.principal,
      providerId: BYO_PROVIDER,
      credentialId: null,
      baseUrl: BYO_BASE_URL,
      model: "m",
      allowBackground: true,
    });
    const actor = { kind: "plugin-grant", pluginId } as const;
    await expect(h.svc.setBinding({ principal: owner.principal, task: "chat", connectionId: row.id, actor })).rejects.toMatchObject({
      code: CONNECTION_OP_CODES.actorTaskUnrouted,
    });
    expect((await h.svc.setBinding({ principal: owner.principal, task: "summarize", connectionId: row.id, actor })).connectionId).toBe(row.id);
    expect((await h.svc.setBinding({ principal: owner.principal, task: "chat", connectionId: null, actor })).connectionId).toBeNull();
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

  // Only a move ONTO a space that can embed is worth a rebuild: clearing an embed role leaves nothing to embed with,
  // and re-binding the same encoder moves nothing.
  test("clearing a task writes `null`; only a bind onto a new embed space raises the trigger", async () => {
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
    h.embedSpaceChanges.length = 0;
    await h.svc.setBinding({ principal: owner.principal, task: "embed", connectionId: embedder.id });
    expect(h.embedSpaceChanges, "the same encoder again moves no space").toEqual([]);
    await h.svc.setBinding({ principal: owner.principal, task: "embed", connectionId: null });
    expect(h.embedSpaceChanges, "an unbind leaves nothing that can embed").toEqual([]);
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

  test("a bound local-light row whose model failed its latest load reads blocked with `model-load-failed`", async () => {
    const readEmbed = async (loadFailed: readonly string[]): Promise<BindingView | undefined> => {
      const db = await freshDb();
      const h = await makeHarness(db, { localLight: true, localLightLoadFailed: loadFailed });
      const owner = await seedOwner(db);
      const row = await h.svc.create({
        principal: owner.principal,
        providerId: LOCAL_LIGHT,
        model: ENCODER,
        baseUrl: null,
        credentialId: null,
        allowBackground: true,
      });
      await h.svc.setBinding({ principal: owner.principal, task: "embed", connectionId: row.id });
      return (await h.svc.listBindings({ principal: owner.principal })).find((view) => view.task === "embed");
    };
    const healthy = await readEmbed([]);
    expect(healthy?.resolved).toMatchObject({ task: "embed", model: ENCODER });
    expect(healthy?.unavailableCause).toBeNull();
    const failed = await readEmbed([ENCODER]);
    expect(failed?.resolved).toBeNull();
    expect(failed?.unavailableCause).toBe("model-load-failed");
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

describe("getBoundConnection", () => {
  test("reads only the caller's persisted user chat binding, without a runtime resolution", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    const owner = await seedOwner(db);
    const other = await seedOwner(db, "user_other");
    const row = await h.svc.create({
      principal: owner.principal,
      providerId: BYO_PROVIDER,
      credentialId: null,
      baseUrl: BYO_BASE_URL,
      model: "model-a",
      label: "Private work model",
    });
    expect(await h.svc.getBoundConnection({ principal: owner.principal, task: "chat" })).toBeNull();
    await h.svc.setBinding({ principal: owner.principal, task: "chat", connectionId: row.id });
    expect(await h.svc.getBoundConnection({ principal: owner.principal, task: "chat" })).toMatchObject({
      label: "Private work model",
      providerId: BYO_PROVIDER,
      providerLabel: "Custom OpenAI-compatible",
      model: row.model,
    });
    expect(await h.svc.getBoundConnection({ principal: other.principal, task: "chat" })).toBeNull();
    await h.svc.setBinding({ principal: owner.principal, task: "chat", connectionId: null });
    expect(await h.svc.getBoundConnection({ principal: owner.principal, task: "chat" })).toBeNull();
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
    expect(written.map((binding) => binding.task).toSorted()).toEqual(["chat"]);

    await h.svc.update({ principal: owner.principal, connectionId: row.id, patch: { allowBackground: true } });
    const withBackground = await h.svc.useForEverything({ principal: owner.principal, connectionId: row.id });
    expect(withBackground.map((binding) => binding.task).toSorted()).toEqual(["chat", "summarize"]);
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
    expect(written.map((binding) => binding.task).toSorted()).toEqual(["embed"]);
    expect(h.embedSpaceChanges).toEqual([owner.userId]);
  });
});

// 768 is what the usual local embedder makes. The owner's space takes the bound embedder's width, so it binds
// for search vectors and the space-change trigger fires to re-index at that width.
describe("a vector role admits an embedder of any width", () => {
  test("a 768-wide local embedder binds for search vectors and raises the re-index trigger", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    const owner = await seedOwner(db);
    const narrow = await h.svc.create({
      principal: owner.principal,
      providerId: BYO_PROVIDER,
      credentialId: null,
      baseUrl: BYO_BASE_URL,
      model: "nomic-embed-text:latest",
      allowBackground: true,
    });
    await expect(h.svc.setBinding({ principal: owner.principal, task: "embed", connectionId: narrow.id })).resolves.toMatchObject({ task: "embed" });
    expect(h.embedSpaceChanges).toEqual([owner.userId]);
    const written = await h.svc.useForEverything({ principal: owner.principal, connectionId: narrow.id });
    expect(written.map((binding) => binding.task).toSorted()).toEqual(["embed"]);
  });
});
