// Provider-registry publication is ordered by refresh invocation, even when store reads settle out of
// order. Plugin contributors may share one immutable ProviderId, so the final contributor removal must
// win over an older one-contributor snapshot; admin removals use the same publication lane.

import type { ProviderDef } from "@orb/contracts/inference";
import { providerDefSchema } from "@orb/contracts/inference";
import type { PluginId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ProviderStore } from "../../../packages/inference/src/deps.ts";
import { createProviderRegistry } from "../../../packages/inference/src/registry/providers.ts";
import { expect, test } from "../../support/fixtures.ts";

const PROVIDER = providerDefSchema.parse({
  id: "plugin:acme/shared",
  label: "Shared",
  wire: "openai-compat",
  dialect: "openai-compatible",
  auth: "endpoint",
  apis: ["chat-completions"],
  catalog: "url",
  metered: false,
});
const SECOND_PROVIDER = providerDefSchema.parse({ ...PROVIDER, id: "plugin:acme/second", label: "Second" });
const ADMIN_PROVIDER = providerDefSchema.parse({ ...PROVIDER, id: "admin-shared" });
const FIRST_PLUGIN = castId<PluginId>("plugin_first00000000000000001");
const FINAL_PLUGIN = castId<PluginId>("plugin_final00000000000000001");
const ADMIN = castId<UserId>("user_admin000000000000000001");

interface ReadBarrier {
  readonly started: Promise<void>;
  readonly release: () => void;
}

interface ControlledProviderStore {
  readonly store: ProviderStore;
  readonly holdNextRead: () => ReadBarrier;
  readonly observeNextRead: () => Promise<void>;
  readonly observeNextAdminRemoval: () => Promise<void>;
  readonly failNextRead: (error: Error) => void;
}

function controlledProviderStore(): ControlledProviderStore {
  const rows = new Map<string, ProviderDef>();
  const adminOwned = new Set<string>();
  const contributors = new Map<string, Set<PluginId>>();
  let heldRead: { readonly started: () => void; readonly released: Promise<void> } | undefined;
  let readObserver: (() => void) | undefined;
  let adminRemovalObserver: (() => void) | undefined;
  let readFailure: Error | undefined;

  const removePlugin = (pluginId: PluginId): void => {
    for (const [id, owners] of contributors) {
      owners.delete(pluginId);
      if (owners.size === 0) {
        contributors.delete(id);
      }
    }
  };

  const store: ProviderStore = {
    list: (): Promise<readonly ProviderDef[]> => {
      const snapshot = [...rows.entries()].filter(([id]) => adminOwned.has(id) || (contributors.get(id)?.size ?? 0) > 0).map(([, row]) => row);
      readObserver?.();
      readObserver = undefined;
      const failure = readFailure;
      readFailure = undefined;
      if (failure !== undefined) {
        throw failure;
      }
      const barrier = heldRead;
      heldRead = undefined;
      if (barrier === undefined) {
        return Promise.resolve(snapshot);
      }
      barrier.started();
      return barrier.released.then(() => snapshot);
    },
    putAdmin: (next): Promise<boolean> => {
      if ((contributors.get(next.id)?.size ?? 0) > 0) {
        return Promise.resolve(false);
      }
      rows.set(next.id, next);
      adminOwned.add(next.id);
      return Promise.resolve(true);
    },
    removeAdmin: (id): Promise<boolean> => {
      if (!adminOwned.delete(id)) {
        return Promise.resolve(false);
      }
      rows.delete(id);
      adminRemovalObserver?.();
      adminRemovalObserver = undefined;
      return Promise.resolve(true);
    },
    replacePlugin: (desired, pluginId): Promise<{ readonly ok: true } | { readonly ok: false; readonly conflictingId: ProviderDef["id"] }> => {
      const conflict = desired.find((next) => {
        const current = rows.get(next.id);
        return adminOwned.has(next.id) || (current !== undefined && JSON.stringify(current) !== JSON.stringify(next));
      });
      if (conflict !== undefined) {
        return Promise.resolve({ ok: false, conflictingId: conflict.id });
      }
      removePlugin(pluginId);
      for (const next of desired) {
        rows.set(next.id, next);
        const owners = contributors.get(next.id) ?? new Set<PluginId>();
        owners.add(pluginId);
        contributors.set(next.id, owners);
      }
      return Promise.resolve({ ok: true });
    },
    removePlugin: (pluginId): Promise<void> => {
      removePlugin(pluginId);
      return Promise.resolve();
    },
  };

  return {
    store,
    holdNextRead: (): ReadBarrier => {
      const started = Promise.withResolvers<void>();
      const released = Promise.withResolvers<void>();
      heldRead = { started: started.resolve, released: released.promise };
      return { started: started.promise, release: released.resolve };
    },
    observeNextRead: (): Promise<void> => {
      const observed = Promise.withResolvers<void>();
      readObserver = observed.resolve;
      return observed.promise;
    },
    observeNextAdminRemoval: (): Promise<void> => {
      const observed = Promise.withResolvers<void>();
      adminRemovalObserver = observed.resolve;
      return observed.promise;
    },
    failNextRead: (error): void => {
      readFailure = error;
    },
  };
}

test("an older one-contributor refresh cannot republish a provider after its final plugin owner is removed", async () => {
  const controlled = controlledProviderStore();
  const registry = await createProviderRegistry(controlled.store);
  await registry.registerPlugin([PROVIDER], { plugin: FIRST_PLUGIN, pluginName: "acme" });
  await registry.registerPlugin([PROVIDER], { plugin: FINAL_PLUGIN, pluginName: "acme" });
  expect(registry.get(PROVIDER.id)).toEqual(PROVIDER);

  const staleRead = controlled.holdNextRead();
  const firstDrop = registry.dropPlugin(FIRST_PLUGIN);
  await staleRead.started;
  const finalReadStarted = controlled.observeNextRead();
  const finalDrop = registry.dropPlugin(FINAL_PLUGIN);
  await finalReadStarted;

  staleRead.release();
  await Promise.all([firstDrop, finalDrop]);
  expect(registry.get(PROVIDER.id)).toBeUndefined();
});

test("an older refresh cannot resurrect an admin provider after its durable removal", async () => {
  const controlled = controlledProviderStore();
  const registry = await createProviderRegistry(controlled.store);
  await registry.register(ADMIN_PROVIDER, { admin: ADMIN });
  expect(registry.get(ADMIN_PROVIDER.id)).toEqual(ADMIN_PROVIDER);

  const staleRead = controlled.holdNextRead();
  const refresh = registry.refresh();
  await staleRead.started;
  const adminRemoved = controlled.observeNextAdminRemoval();
  const drop = registry.drop(ADMIN_PROVIDER.id);
  await adminRemoved;

  staleRead.release();
  await Promise.all([refresh, drop]);
  expect(registry.get(ADMIN_PROVIDER.id)).toBeUndefined();
});

test("failed activation compensation publishes after later snapshots that captured the rolled-back contribution", async () => {
  const controlled = controlledProviderStore();
  const registry = await createProviderRegistry(controlled.store);
  const olderRead = controlled.holdNextRead();
  const olderRefresh = registry.refresh();
  await olderRead.started;

  controlled.failNextRead(new Error("test: plugin A snapshot unavailable"));
  const pluginARead = controlled.observeNextRead();
  const pluginAActivation = registry.registerPlugin([PROVIDER], { plugin: FIRST_PLUGIN, pluginName: "acme" });
  await pluginARead;
  const pluginBRead = controlled.observeNextRead();
  const pluginBActivation = registry.registerPlugin([SECOND_PROVIDER], { plugin: FINAL_PLUGIN, pluginName: "acme" });
  await pluginBRead;
  const pluginAFailure = expect(pluginAActivation).rejects.toThrow("plugin A snapshot unavailable");

  olderRead.release();
  await Promise.all([olderRefresh, pluginAFailure, pluginBActivation]);
  expect(registry.get(PROVIDER.id)).toBeUndefined();
  expect(registry.get(SECOND_PROVIDER.id)).toEqual(SECOND_PROVIDER);
});

test("failed replacement compensation removes the plugin's previously published contribution", async () => {
  const controlled = controlledProviderStore();
  const registry = await createProviderRegistry(controlled.store);
  await registry.registerPlugin([PROVIDER], { plugin: FIRST_PLUGIN, pluginName: "acme" });
  expect(registry.get(PROVIDER.id)).toEqual(PROVIDER);
  controlled.failNextRead(new Error("test: replacement snapshot unavailable"));

  await expect(registry.registerPlugin([PROVIDER, SECOND_PROVIDER], { plugin: FIRST_PLUGIN, pluginName: "acme" })).rejects.toThrow(
    "replacement snapshot unavailable",
  );
  expect(registry.get(PROVIDER.id)).toBeUndefined();
  expect(registry.get(SECOND_PROVIDER.id)).toBeUndefined();
});

test("a failed refresh does not poison later registry publication", async () => {
  const controlled = controlledProviderStore();
  const registry = await createProviderRegistry(controlled.store);
  controlled.failNextRead(new Error("test: snapshot unavailable"));

  await expect(registry.refresh()).rejects.toThrow("snapshot unavailable");
  await registry.registerPlugin([PROVIDER], { plugin: FIRST_PLUGIN, pluginName: "acme" });
  expect(registry.get(PROVIDER.id)).toEqual(PROVIDER);
});
