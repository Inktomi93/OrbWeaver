import { join } from "node:path";
import type { PluginBridge, PluginCapability, PluginHandlerRef, PluginInstance } from "@orb/contracts/plugin";
import { PLUGIN_MAIN_ENTRY } from "@orb/contracts/plugin";
import type { ChatId } from "@orb/kit/ids";
import type { HostSeams } from "@orb/server/infra/plugin-host";
import { createPluginHost } from "@orb/server/infra/plugin-host";
import { writeShowcaseArtifacts } from "@orb/tooling/plugin-author-showcase";
import { unzipSync } from "fflate";
import { afterEach, beforeAll } from "vitest";
import { env } from "../../../../packages/server/src/foundation/env/index.ts";
import {
  __hasManagedPluginBrokerForTest,
  __killManagedPluginBrokerOnBridgeForTest,
  __killManagedPluginBrokerOnCommandForTest,
  __pauseManagedPluginBridgeDeliveryForTest,
  __pauseManagedPluginConnectChaseForTest,
  __terminateManagedPluginBrokerForTest,
} from "../../../../packages/server/src/infra/plugin-host/process-runtime.ts";
import { packShowcaseBundle } from "../../../../packages/showcase-plugins/src/index.ts";
import { expect, test } from "../../../support/fixtures.ts";

const LONG = 30_000;
const CHAT = "chat_process0000000000000000" as ChatId;
const noChat: null = null;
const REPO_ROOT = join(import.meta.dirname, "..", "..", "..", "..");

// The showcase authoring tree ships TypeScript source; the cold-wake case needs the real release-built
// guest JS, the same bytes `packShowcaseBundle` serves to the per-user seeder.
beforeAll(async () => {
  const built = await writeShowcaseArtifacts(REPO_ROOT);
  expect(built.diagnostics).toEqual([]);
});

afterEach(async () => {
  await __terminateManagedPluginBrokerForTest();
});

function seams(): HostSeams {
  let id = 0;
  return { nowEpochMs: () => 1_700_000_000_000, nextRandom: () => 0.5, mintId: () => `process-id-${id++}` };
}

function durableSource(
  mainJs: string,
  reload: () => Promise<string> = () => Promise.resolve(mainJs),
): {
  readonly mainJs: string;
  readonly reloadMainJs: () => Promise<string>;
} {
  return { mainJs, reloadMainJs: reload };
}

function bridge(): PluginBridge {
  return {
    chat: {
      listMessages: () => Promise.resolve([]),
      getVariables: () => Promise.resolve({}),
      listCharacters: () => Promise.resolve([]),
      applyVariableOps: () => Promise.resolve({ outcome: "applied" }),
      requestTurn: () => Promise.resolve(),
    },
    worldInfo: { listBooks: () => Promise.resolve([]), listEntries: () => Promise.resolve([]), upsertEntry: () => Promise.resolve() },
    imagery: { generatePicture: () => Promise.resolve({ assetId: "asset_process" }) },
    variables: { get: () => Promise.resolve(null), set: () => Promise.resolve(), delete: () => Promise.resolve() },
    assets: { read: () => Promise.resolve(null), storeFetched: () => Promise.resolve({ assetId: "asset_process" }) },
    search: { documents: () => Promise.resolve([]) },
    storage: {
      get: () => Promise.resolve(null),
      set: () => Promise.resolve(),
      delete: () => Promise.resolve(),
      list: () => Promise.resolve([]),
      compareAndSet: () => Promise.resolve({ applied: true, current: "next" }),
    },
    notifications: { post: () => Promise.resolve() },
    llm: { quiet: () => Promise.resolve({ text: "quiet" }) },
    suggest: () => Promise.resolve(),
    admitEgress: () => undefined,
    admitAssetEgress: () => undefined,
    surfaceQuickReply: () => Promise.resolve(),
    ui: { setState: () => Promise.resolve(), toast: () => Promise.resolve(), openDialog: () => Promise.resolve() },
    databank: { ingest: () => Promise.resolve({ documentId: "document_process" }) },
    character: {
      ingest: () => Promise.resolve({ characterId: "character_process", created: true }),
      ingestAsset: () => Promise.resolve({ characterId: "character_process", created: true }),
      setCardData: () => Promise.resolve(),
      getCardData: () => Promise.resolve(null),
    },
    pubsub: { emit: () => Promise.resolve() },
  };
}

async function activateTool(
  host: ReturnType<typeof createPluginHost>,
  runtimeBridge: PluginBridge,
): Promise<{ readonly instance: PluginInstance; readonly handler: PluginHandlerRef }> {
  const outcome = await host.createInstance({
    ...durableSource(`
      const h = orb.host(1);
      h.tools.register({
        name: "wait",
        description: "wait",
        parameters: { type: "object", properties: {} },
        handler: async () => { await h.variables.get("key"); return "done"; },
      });`),
    grants: ["tools.register", "global_vars"],
    bridge: runtimeBridge,
    chat: noChat,
  });
  if (!outcome.ok) {
    throw new Error(outcome.error);
  }
  const handler = outcome.instance.tools[0]?.handler;
  if (handler === undefined) {
    throw new Error("test: tool did not register");
  }
  return { instance: outcome.instance, handler };
}

test("broker exit during activation rejects the call and permits an explicit later activation", { timeout: LONG }, async () => {
  const host = createPluginHost(seams());
  __killManagedPluginBrokerOnCommandForTest("create");
  await expect(host.createInstance({ ...durableSource("'never completes';"), grants: [], bridge: bridge(), chat: noChat })).rejects.toMatchObject({
    name: "PluginHostUnavailable",
  });

  const retried = await host.createInstance({ ...durableSource("'explicit retry';"), grants: [], bridge: bridge(), chat: noChat });
  expect(retried.ok).toBe(true);
  if (retried.ok) {
    host.dispose(retried.instance);
  }
});

test("a create still resolving its connection when the broker dies is served exactly once by the reconnect, never replayed", { timeout: LONG }, async () => {
  const host = createPluginHost(seams());
  const victim = await host.createInstance({ ...durableSource("'victim';"), grants: [], bridge: bridge(), chat: noChat });
  if (!victim.ok) {
    throw new Error(victim.error);
  }
  __killManagedPluginBrokerOnCommandForTest("create");
  let sets = 0;
  const base = bridge();
  const countingBridge: PluginBridge = {
    ...base,
    storage: {
      ...base.storage,
      set: (): Promise<void> => {
        sets += 1;
        return Promise.resolve();
      },
    },
  };
  // `killer`'s own "create" write triggers the kill against the connection `victim` already opened.
  const killer = host.createInstance({ ...durableSource("'killer';"), grants: [], bridge: base, chat: noChat });
  await expect(killer).rejects.toMatchObject({ name: "PluginHostUnavailable" });
  // The kill only SIGKILLs the watchdog; its own already-spawned broker can stay alive and accepting until it
  // notices its parent's IPC channel close and self-terminates — an OS-scheduled gap, not an instant one. Wait
  // it out so `bystander` below cannot win a race by reusing that dying-but-not-yet-gone process.
  await new Promise((resolve) => setTimeout(resolve, 500));
  const pause = __pauseManagedPluginConnectChaseForTest();
  const bystander = host.createInstance({
    ...durableSource(`
      const h = orb.host(1);
      void h.storage.set('activated', '1');`),
    grants: ["storage.kv"],
    bridge: countingBridge,
    chat: noChat,
  });
  await pause.reached;
  // The chase has not run yet — nothing has served `bystander`'s command a second time before its first go.
  expect(sets).toBe(0);
  pause.release();
  const outcome = await bystander;
  expect(outcome.ok).toBe(true);
  expect(sets).toBe(1);
  if (outcome.ok) {
    host.dispose(outcome.instance);
  }
  host.dispose(victim.instance);
});

test("connectOnce never respawns a broker once the app tears it down with nothing pending", { timeout: LONG }, async () => {
  const host = createPluginHost(seams());
  const outcome = await host.createInstance({ ...durableSource("'settled';"), grants: [], bridge: bridge(), chat: noChat });
  expect(outcome.ok).toBe(true);
  if (outcome.ok) {
    host.dispose(outcome.instance);
  }
  await __terminateManagedPluginBrokerForTest();
  // A clean teardown with no in-flight command must leave the broker gone — no straggling reconnect chase
  // should spawn a replacement process nobody asked for.
  await new Promise((resolve) => setTimeout(resolve, 100));
  expect(__hasManagedPluginBrokerForTest()).toBe(false);
});

test("the app creates and owns the watchdog without a preconfigured broker endpoint", { timeout: LONG }, async () => {
  const host = createPluginHost(seams());
  const outcome = await host.createInstance({ ...durableSource("'app-owned watchdog';"), grants: [], bridge: bridge(), chat: noChat });
  expect(outcome.ok).toBe(true);
  if (outcome.ok) {
    host.dispose(outcome.instance);
  }
});

test("broker death while a Worker waits on the synchronous seam cannot block the app", { timeout: LONG }, async () => {
  const host = createPluginHost(seams());
  __killManagedPluginBrokerOnBridgeForTest("admitEgress");
  await expect(
    host.createInstance({
      ...durableSource(`(async () => { await orb.host(1).net.fetch("https://example.com/resource"); })()`),
      grants: ["net.fetch"],
      bridge: bridge(),
      chat: noChat,
      netHosts: ["example.com"],
    }),
  ).rejects.toMatchObject({ name: "PluginHostUnavailable" });
});

test("broker exit during an async invoke fails the call and marks the resident crashed", { timeout: LONG }, async () => {
  let reached = (): void => {
    throw new Error("test: bridge call arrived before gate initialization");
  };
  const called = new Promise<void>((resolve) => {
    reached = resolve;
  });
  const base = bridge();
  const waitingBridge: PluginBridge = {
    ...base,
    variables: {
      ...base.variables,
      get: () => {
        reached();
        return new Promise<string | null>(() => undefined);
      },
    },
  };
  const host = createPluginHost(seams());
  const resident = await activateTool(host, waitingBridge);
  const invocation = host.invoke(resident.instance, resident.handler, "{}", { chatId: CHAT, canWrite: true, automationDepth: 0 });
  // Attach a reaction to `invocation` NOW, not at the `expect(...).rejects` below: the forced teardown two
  // lines down rejects it mid-`await`, before that assertion would otherwise get a chance to attach its own
  // handler, and Node flags that gap as an unhandled rejection even though it settles correctly moments later.
  invocation.catch(() => undefined);
  await called;
  await __terminateManagedPluginBrokerForTest();
  await expect(invocation).rejects.toMatchObject({ name: "PluginHostUnavailable" });
  await expect(host.invoke(resident.instance, resident.handler, "{}", { chatId: CHAT, canWrite: true, automationDepth: 0 })).rejects.toMatchObject({
    name: "PluginHostUnavailable",
  });
  host.dispose(resident.instance);
});

test("disposing a pinned logical plugin cancels its Worker and rejects late callback reuse", { timeout: LONG }, async () => {
  let reached = (): void => undefined;
  let release = (): void => undefined;
  const called = new Promise<void>((resolve) => {
    reached = resolve;
  });
  const held = new Promise<string | null>((resolve) => {
    release = (): void => resolve("late");
  });
  const base = bridge();
  const waitingBridge: PluginBridge = {
    ...base,
    variables: {
      ...base.variables,
      get: () => {
        reached();
        return held;
      },
    },
  };
  const host = createPluginHost(seams());
  const resident = await activateTool(host, waitingBridge);
  const invocation = host.invoke(resident.instance, resident.handler, "{}", noChat);
  await called;
  host.dispose(resident.instance);
  await expect(invocation).rejects.toThrow();
  release();
  await expect(host.invoke(resident.instance, resident.handler, "{}", noChat)).rejects.toThrow(/unknown\/disposed/u);
});

test("a bridge frame already on the parent wire cannot dispatch after dispose revokes its authority", { timeout: LONG }, async () => {
  let writes = 0;
  const base = bridge();
  const writingBridge: PluginBridge = {
    ...base,
    variables: {
      ...base.variables,
      set: () => {
        writes += 1;
        return Promise.resolve();
      },
    },
  };
  const host = createPluginHost(seams());
  const outcome = await host.createInstance({
    ...durableSource(`
      const h = orb.host(1);
      h.tools.register({
        name: "write",
        description: "write",
        parameters: { type: "object", properties: {} },
        handler: async () => { await h.variables.set("revoked", "must-not-land"); return "done"; },
      });`),
    grants: ["tools.register", "global_vars"],
    bridge: writingBridge,
    chat: noChat,
  });
  if (!outcome.ok) {
    throw new Error(outcome.error);
  }
  const handler = outcome.instance.tools[0]?.handler;
  if (handler === undefined) {
    throw new Error("test: write tool did not register");
  }
  const delivery = __pauseManagedPluginBridgeDeliveryForTest("variables.set");
  try {
    const invocation = host.invoke(outcome.instance, handler, "{}", noChat);
    await delivery.reached;
    host.dispose(outcome.instance);
    delivery.release();

    await expect(invocation).rejects.toThrow();
    expect(writes).toBe(0);
  } finally {
    delivery.release();
    host.dispose(outcome.instance);
  }
});

test("broker exit during deactivation releases the runtime and a later lifecycle may reactivate", { timeout: LONG }, async () => {
  const host = createPluginHost(seams());
  const active = await host.createInstance({ ...durableSource("'active';"), grants: [], bridge: bridge(), chat: noChat });
  if (!active.ok) {
    throw new Error(active.error);
  }
  __killManagedPluginBrokerOnCommandForTest("dispose");
  host.dispose(active.instance);
  await expect(host.invoke(active.instance, "stale" as PluginHandlerRef, "{}", noChat)).rejects.toThrow(/unknown\/disposed instance/u);
  await __terminateManagedPluginBrokerForTest();

  const reactivated = await host.createInstance({ ...durableSource("'reactivated';"), grants: [], bridge: bridge(), chat: noChat });
  expect(reactivated.ok).toBe(true);
  if (reactivated.ok) {
    host.dispose(reactivated.instance);
  }
});

test("broker death invalidates sleeping logical residents instead of silently replaying them", { timeout: LONG }, async () => {
  const host = createPluginHost(seams());
  const runtimeBridge = bridge();
  const first = await activateTool(host, runtimeBridge);
  const second = await activateTool(host, runtimeBridge);
  const third = await activateTool(host, runtimeBridge);
  await __terminateManagedPluginBrokerForTest();
  await expect(host.invoke(first.instance, first.handler, "{}", noChat)).rejects.toMatchObject({ name: "PluginHostUnavailable" });
  host.dispose(first.instance);
  host.dispose(second.instance);
  host.dispose(third.instance);

  const explicit = await activateTool(host, runtimeBridge);
  await expect(host.invoke(explicit.instance, explicit.handler, "{}", noChat)).resolves.toBe("done");
  host.dispose(explicit.instance);
});

test("one hundred logical plugins remain discoverable and cold-callable through the configured bounded pool", { timeout: 180_000 }, async () => {
  const host = createPluginHost(seams());
  const runtimeBridge = bridge();
  const residents: { readonly instance: PluginInstance; readonly handler: PluginHandlerRef; readonly value: string }[] = [];
  try {
    const activated: { readonly instance: PluginInstance; readonly handler: PluginHandlerRef; readonly value: string }[] = [];
    for (let index = 0; index < 100; index += 1) {
      const value = `value-${index}`;
      const outcome = await host.createInstance({
        ...durableSource(`
            const h = orb.host(1);
            h.tools.register({
              name: "tool_${index}",
              description: "resident ${index}",
              parameters: { type: "object", properties: {} },
              handler: () => ${JSON.stringify(value)},
            });`),
        grants: ["tools.register"],
        bridge: runtimeBridge,
        chat: noChat,
      });
      expect(outcome.ok).toBe(true);
      if (!outcome.ok) {
        continue;
      }
      const handler = outcome.instance.tools[0]?.handler;
      if (handler === undefined) {
        throw new Error("test: logical plugin lost its tool registration");
      }
      activated.push({ instance: outcome.instance, handler, value });
    }
    residents.push(...activated);
    expect(residents).toHaveLength(100);
    expect(residents.every(({ instance }) => instance.tools.length === 1)).toBe(true);
    const results: string[] = [];
    for (const { instance, handler } of residents) {
      results.push(await host.invoke(instance, handler, "{}", noChat));
    }
    expect(results).toEqual(residents.map(({ value }) => value));
  } finally {
    for (const resident of residents) {
      host.dispose(resident.instance);
    }
  }
});

test("a near-limit durable source is reloaded on cold wake before catalog comparison without replaying its activation write", { timeout: LONG }, async () => {
  let writes = 0;
  const base = bridge();
  const runtimeBridge: PluginBridge = {
    ...base,
    storage: {
      ...base.storage,
      get: () => Promise.resolve("catalog-ready"),
      set: () => {
        writes += 1;
        return Promise.resolve();
      },
    },
  };
  const host = createPluginHost(seams());
  let reloads = 0;
  const source = `
      const h = orb.host(1);
      void (async () => {
        await h.storage.get("catalog");
        h.tools.register({
          name: "async_tool",
          description: "async registration",
          parameters: { type: "object", properties: {} },
          handler: () => "rehydrated",
        });
        await h.storage.set("activation_effect", "once");
      })().catch(() => {});\n/*${"x".repeat(900_000)}*/`;
  expect(source.length).toBeGreaterThan(890_000);
  const asyncPlugin = await host.createInstance({
    ...durableSource(source, () => {
      reloads += 1;
      return Promise.resolve(source);
    }),
    grants: ["tools.register", "storage.kv"],
    bridge: runtimeBridge,
    chat: noChat,
  });
  if (!asyncPlugin.ok) {
    throw new Error(asyncPlugin.error);
  }
  const fillers: PluginInstance[] = [];
  try {
    const handler = asyncPlugin.instance.tools[0]?.handler;
    if (handler === undefined) {
      throw new Error("test: async registration did not settle before activation returned");
    }
    expect(writes).toBe(1);
    // Fill every remaining warm slot up to the configured physical cap so the pool must evict the async
    // plugin's runtime (LRU, unpinned) — matching the sibling lifecycle tests below.
    for (let index = 0; index < env.PLUGIN_BROKER_WORKER_MAX; index += 1) {
      const filler = await host.createInstance({ ...durableSource(`'filler-${index}'`), grants: [], bridge: base, chat: noChat });
      if (!filler.ok) {
        throw new Error(filler.error);
      }
      fillers.push(filler.instance);
    }
    await expect(host.invoke(asyncPlugin.instance, handler, "{}", noChat)).resolves.toBe("rehydrated");
    expect(reloads).toBe(1);
    expect(writes).toBe(1);
    expect(asyncPlugin.instance.tools).toHaveLength(1);
  } finally {
    host.dispose(asyncPlugin.instance);
    for (const filler of fillers) {
      host.dispose(filler);
    }
  }
});

interface ShowcaseColdWakeCase {
  readonly slug: string;
  readonly grants: readonly PluginCapability[];
}

async function assertShowcaseColdWake(row: ShowcaseColdWakeCase): Promise<void> {
  const host = createPluginHost(seams());
  const runtimeBridge = bridge();
  const bundle = await packShowcaseBundle(row.slug);
  if (bundle === null) {
    throw new Error(`${row.slug}: release-built showcase bundle is missing`);
  }
  const entry = unzipSync(bundle)[PLUGIN_MAIN_ENTRY];
  if (entry === undefined) {
    throw new Error(`${row.slug}: release-built showcase bundle has no ${PLUGIN_MAIN_ENTRY}`);
  }
  const mainJs = new TextDecoder().decode(entry);
  const outcome = await host.createInstance({ ...durableSource(mainJs), grants: row.grants, bridge: runtimeBridge, chat: noChat, label: row.slug });
  if (!outcome.ok) {
    throw new Error(`${row.slug}: ${outcome.error}`);
  }
  const surface = outcome.instance.surfaces.find((candidate) => candidate.onAction !== undefined);
  const handler = surface?.onAction;
  if (handler === undefined) {
    throw new Error(`${row.slug}: async activation did not publish an actionable surface`);
  }
  const fillers: PluginInstance[] = [];
  try {
    for (let index = 0; index < 2; index += 1) {
      const filler = await host.createInstance({ ...durableSource(`'${row.slug}-filler-${index}'`), grants: [], bridge: runtimeBridge, chat: noChat });
      if (!filler.ok) {
        throw new Error(filler.error);
      }
      fillers.push(filler.instance);
    }
    let invocationError: unknown;
    try {
      await host.invoke(outcome.instance, handler, JSON.stringify({ actionId: "__rehydration_probe__", values: {}, chat: null }), noChat);
    } catch (error) {
      invocationError = error;
    }
    expect(String(invocationError ?? "")).not.toMatch(/rehydrated registrations differ|sleeping runtime could not be rebuilt/u);
    expect(outcome.instance.surfaces).toContain(surface);
  } finally {
    host.dispose(outcome.instance);
    for (const filler of fillers) {
      host.dispose(filler);
    }
  }
}

test("Card Atlas and Keepsake Camera retain async registrations across a cold wake", { timeout: 180_000 }, async () => {
  expect.hasAssertions();
  const cases: readonly ShowcaseColdWakeCase[] = [
    {
      slug: "card-atlas",
      grants: ["storage.kv", "ui.surface", "net.fetch", "net.fetch_asset", "character.ingest", "character.card_state"],
    },
    {
      slug: "keepsake-camera",
      grants: ["chat.read", "storage.kv", "assets.read", "llm.quiet", "imagery.generate", "ui.surface"],
    },
  ];
  for (const row of cases) {
    await assertShowcaseColdWake(row);
  }
});

test.each(["disable", "upgrade", "uninstall"] as const)("%s during a deferred cold loader cannot publish a Worker or reach the retired bridge", {
  timeout: 180_000,
}, async (lifecycle) => {
  let bridgeEffects = 0;
  const base = bridge();
  const staleBridge: PluginBridge = {
    ...base,
    variables: {
      ...base.variables,
      get: () => {
        bridgeEffects += 1;
        return Promise.resolve("stale");
      },
    },
  };
  let loaderStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    loaderStarted = resolve;
  });
  let releaseLoader!: () => void;
  const loaderGate = new Promise<void>((resolve) => {
    releaseLoader = resolve;
  });
  const source = `
      const h = orb.host(1);
      void h.variables.get("activation");
      h.tools.register({
        name: "stale",
        description: "stale",
        parameters: { type: "object", properties: {} },
        handler: async () => { await h.variables.get("invoke"); return "stale"; },
      });`;
  const host = createPluginHost(seams());
  const victim = await host.createInstance({
    ...durableSource(source, async () => {
      loaderStarted();
      await loaderGate;
      return source;
    }),
    grants: ["tools.register", "global_vars"],
    bridge: staleBridge,
    chat: noChat,
  });
  if (!victim.ok) {
    throw new Error(victim.error);
  }
  const handler = victim.instance.tools[0]?.handler;
  if (handler === undefined) {
    throw new Error("test: victim tool did not register");
  }
  const fillers: PluginInstance[] = [];
  let replacement: PluginInstance | undefined;
  try {
    for (let index = 0; index < env.PLUGIN_BROKER_WORKER_MAX; index += 1) {
      const filler = await host.createInstance({ ...durableSource(`'filler-${index}'`), grants: [], bridge: base, chat: noChat });
      if (!filler.ok) {
        throw new Error(filler.error);
      }
      fillers.push(filler.instance);
    }
    bridgeEffects = 0;
    const invocation = host.invoke(victim.instance, handler, "{}", noChat);
    await started;

    // Disable and uninstall both terminate the resident. Upgrade does the same first, then publishes a
    // replacement binding; the paused old loader must be unable to cross either lifecycle transition.
    host.dispose(victim.instance);
    if (lifecycle === "upgrade") {
      const upgraded = await host.createInstance({
        ...durableSource("'replacement';"),
        grants: [],
        bridge: base,
        chat: noChat,
      });
      if (!upgraded.ok) {
        throw new Error(upgraded.error);
      }
      replacement = upgraded.instance;
    }
    releaseLoader();

    await expect(invocation).rejects.toThrow(/lifecycle changed/u);
    expect(bridgeEffects).toBe(0);
  } finally {
    releaseLoader();
    host.dispose(victim.instance);
    if (replacement !== undefined) {
      host.dispose(replacement);
    }
    for (const filler of fillers) {
      host.dispose(filler);
    }
  }
});

test("dispose during cold activation retires the partially published runtime before replacement", { timeout: 180_000 }, async () => {
  let activationCalls = 0;
  const coldStarted = Promise.withResolvers<void>();
  const coldGate = Promise.withResolvers<string | null>();
  const base = bridge();
  const runtimeBridge: PluginBridge = {
    ...base,
    variables: {
      ...base.variables,
      get: () => {
        activationCalls += 1;
        if (activationCalls === 1) {
          return Promise.resolve("ready");
        }
        if (activationCalls === 2) {
          coldStarted.resolve();
          return coldGate.promise;
        }
        return Promise.resolve("invoked");
      },
    },
  };
  const source = `
    const h = orb.host(1);
    void (async () => {
      await h.variables.get("activation");
      h.tools.register({
        name: "partial",
        description: "partial",
        parameters: { type: "object", properties: {} },
        handler: async () => { await h.variables.get("invoke"); return "stale"; },
      });
    })().catch(() => {});`;
  const host = createPluginHost(seams());
  const victim = await host.createInstance({
    ...durableSource(source),
    grants: ["tools.register", "global_vars"],
    bridge: runtimeBridge,
    chat: noChat,
  });
  if (!victim.ok) {
    throw new Error(victim.error);
  }
  const handler = victim.instance.tools[0]?.handler;
  if (handler === undefined) {
    throw new Error("test: partial tool did not register");
  }
  const fillers: PluginInstance[] = [];
  let replacement: PluginInstance | undefined;
  try {
    for (let index = 0; index < env.PLUGIN_BROKER_WORKER_MAX; index += 1) {
      const filler = await host.createInstance({
        ...durableSource(`'partial-filler-${index}'`),
        grants: [],
        bridge: base,
        chat: noChat,
      });
      if (!filler.ok) {
        throw new Error(filler.error);
      }
      fillers.push(filler.instance);
    }
    const invocation = host.invoke(victim.instance, handler, "{}", noChat);
    await coldStarted.promise;
    host.dispose(victim.instance);
    coldGate.resolve("ready");

    await expect(invocation).rejects.toThrow();
    expect(activationCalls).toBe(2);
    const created = await host.createInstance({
      ...durableSource("'replacement';"),
      grants: [],
      bridge: base,
      chat: noChat,
    });
    expect(created.ok).toBe(true);
    if (created.ok) {
      replacement = created.instance;
    }
  } finally {
    coldGate.resolve("ready");
    host.dispose(victim.instance);
    if (replacement !== undefined) {
      host.dispose(replacement);
    }
    for (const filler of fillers) {
      host.dispose(filler);
    }
  }
});
