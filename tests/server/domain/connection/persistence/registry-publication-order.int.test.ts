// Storage is the subject: the registry publishes the provider store's snapshots in refresh order, and a failed
// activation publish rolls its claim link back in the database. The store read is the real one; its served-claims
// statement is held or refused at the native libSQL client the root's database hands over.
// @subject packages/server/src/domain/connection/persistence/provider-rows.ts

import { spawn } from "node:child_process";
import type { ProviderDef } from "@orb/contracts/inference";
import { PLUGIN_PROVIDER_ID_PREFIX, providerDefSchema } from "@orb/contracts/inference";
import { PLUGIN_HOST_VERSIONS, PLUGIN_MAIN_ENTRY, pluginManifestSchema } from "@orb/contracts/plugin";
import type { LibSqlWrap } from "@orb/db";
import { pluginProviderClaims } from "@orb/db";
import { ID_PREFIX } from "@orb/kit/ids";
import { createSeededIds, FIXTURE_ID_CURSOR } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness, freshDb, makePluginBundle } from "@orb/testkit/node/composed";
import { vi } from "vitest";

const ids = createSeededIds(FIXTURE_ID_CURSOR);

const PLUGIN = "acme-plugin";
const PLUGIN_PROVIDER = `${PLUGIN_PROVIDER_ID_PREFIX}${PLUGIN}/acme`;
// The statement that reads the claims an enabled install serves: the second of the store read's two selects.
const SERVED_READ = 'from "plugin_provider_claims" inner join "plugins"';
// Each activation parses and installs a real bundle, which outlasts the default test budget.
const PLUGIN_TIMEOUT_MS = 30_000;

type NativeDriver = Parameters<LibSqlWrap>[0];

const sqlOf = (statement: string | { readonly sql: string }): string => (typeof statement === "string" ? statement : statement.sql);

const provider = (id: string, label: string): ProviderDef =>
  providerDefSchema.parse({
    id,
    label,
    wire: "openai-compat",
    dialect: "openai-compatible",
    auth: "endpoint",
    apis: ["chat-completions"],
    catalog: "url",
    metered: false,
  });

const manifest = pluginManifestSchema.parse({
  id: PLUGIN,
  name: "Acme",
  version: "1.0.0",
  hostVersion: PLUGIN_HOST_VERSIONS[0],
  entry: PLUGIN_MAIN_ENTRY,
  description: "Serves one provider.",
  capabilities: ["storage.kv"],
  providers: [provider(PLUGIN_PROVIDER, "Acme")],
});

interface Rooted {
  readonly root: ServerTestHarness;
  /** Park the next served-claims read until `release`; `reached` settles once it arrives. */
  readonly hold: () => { readonly reached: Promise<void>; readonly release: () => void };
  /** Refuse the next served-claims read with `error`. */
  readonly failNext: (error: Error) => void;
}

async function rooted(stack: AsyncDisposableStack): Promise<Rooted> {
  let client: NativeDriver | undefined;
  const db = await freshDb((opened) => {
    client = opened;
    return opened;
  });
  const root = stack.use(await createServerHarness({ startJobs: false, pluginSpawn: spawn, db }));
  if (client === undefined) {
    throw new Error("the root's database never handed over its native client");
  }
  const driver = client;
  const execute = driver.execute.bind(driver);
  let held: { readonly reached: () => void; readonly released: Promise<void> } | undefined;
  let refusal: Error | undefined;
  vi.spyOn(driver, "execute").mockImplementation((statement, args) => {
    const read = sqlOf(statement).includes(SERVED_READ);
    if (read && refusal !== undefined) {
      const error = refusal;
      refusal = undefined;
      return Promise.reject(error);
    }
    if (read && held !== undefined) {
      const gate = held;
      held = undefined;
      gate.reached();
      return gate.released.then(() => execute(statement, args));
    }
    return execute(statement, args);
  });
  return {
    root,
    hold: (): ReturnType<Rooted["hold"]> => {
      const reached = Promise.withResolvers<void>();
      const released = Promise.withResolvers<void>();
      held = { reached: reached.resolve, released: released.promise };
      return { reached: reached.promise, release: released.resolve };
    },
    failNext: (error): void => {
      refusal = error;
    },
  };
}

test("an older store read cannot republish an admin provider after its durable removal", async () => {
  await using stack = new AsyncDisposableStack();
  const { root, hold } = await rooted(stack);
  const registry = root.app.runtime.providers.registry;
  const admin = provider("admin-shared", "Shared");
  await registry.register(admin, { admin: root.ownerId });
  expect(registry.get(admin.id, root.ownerId)).toEqual(admin);

  // A refresh whose read began while the row existed, parked after its admin-rows select.
  const stale = hold();
  const refresh = registry.dropPlugin(ids.typeId(ID_PREFIX.plugin));
  await stale.reached;
  const drop = registry.drop(admin.id);
  stale.release();
  await Promise.all([refresh, drop]);

  expect(registry.get(admin.id, root.ownerId)).toBeUndefined();
});

test("a failed store read does not poison later registry publication", async () => {
  await using stack = new AsyncDisposableStack();
  const { root, failNext } = await rooted(stack);
  const registry = root.app.runtime.providers.registry;
  const boom = new Error("controlled store read refusal");

  failNext(boom);
  await expect(registry.dropPlugin(ids.typeId(ID_PREFIX.plugin))).rejects.toMatchObject({ cause: boom });

  const admin = provider("admin-after-failure", "After");
  await registry.register(admin, { admin: root.ownerId });
  expect(registry.get(admin.id, root.ownerId)).toEqual(admin);
});

test("an activation whose publish fails releases its claim link, so the install's published provider stops being served", {
  timeout: PLUGIN_TIMEOUT_MS,
}, async () => {
  await using stack = new AsyncDisposableStack();
  const { root, failNext } = await rooted(stack);
  const registry = root.app.runtime.providers.registry;
  const caller = await root.principalFor(root.ownerId);
  const installed = await root.services.plugin.install({ caller, bundle: makePluginBundle(manifest, "orb.host(1);", root.clock.now()), grant: [] });
  const outcome = await root.services.plugin.setGrant({ caller, pluginId: installed.id, grant: manifest.capabilities, acknowledgedNetHosts: [], enable: true });
  expect(outcome.status).toBe("enabled");
  const linkedPlugins = async (): Promise<(string | null)[]> => (await root.db.select().from(pluginProviderClaims)).map((claim) => claim.pluginId);
  expect(await linkedPlugins()).toEqual([installed.id]);
  expect(registry.get(PLUGIN_PROVIDER, root.ownerId)?.label).toBe("Acme");

  const boom = new Error("controlled activation publish refusal");
  failNext(boom);
  const second = `${PLUGIN_PROVIDER}-second`;
  const replacement = [provider(PLUGIN_PROVIDER, "Acme"), provider(second, "Second")];
  await expect(registry.registerPlugin(replacement, { plugin: installed.id, pluginName: PLUGIN })).rejects.toMatchObject({ cause: boom });

  // Both claims the replacement wrote are released, the new id's and the one the install already served.
  expect(await linkedPlugins()).toEqual([null, null]);
  expect(registry.get(PLUGIN_PROVIDER, root.ownerId)).toBeUndefined();
  expect(registry.get(second, root.ownerId)).toBeUndefined();
});
