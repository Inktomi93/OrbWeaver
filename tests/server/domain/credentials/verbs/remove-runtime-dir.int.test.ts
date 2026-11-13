// @subject packages/server/src/domain/credentials/verbs/remove.ts
// Removing the owner's last key for the agent-sdk wire removes that owner's runtime directory; a remaining key keeps it.
// A plugin provider on that wire counts the same while its plugin is disabled.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { builtinProvider, declaredCapabilitySchema } from "@orb/contracts/inference";
import { PLUGIN_HOST_VERSIONS, PLUGIN_MAIN_ENTRY, pluginManifestSchema } from "@orb/contracts/plugin";
import type { AgentSdkQuery } from "@orb/inference";
import { pluginProviderId } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness, makePluginBundle, SECRET_BOX_TEST_KEY } from "@orb/testkit/node/composed";

const PROVIDER = "claude-sub";
// The agent-sdk backend's runtime tool directory under the owner's runtime root.
const RUNTIME_TOOL = "claude";
const SUBSCRIPTION_PLUGIN = "subscription-relay";
const PLUGIN_PROVIDER = pluginProviderId(SUBSCRIPTION_PLUGIN, "sub");

const SDK_REFUSAL = "scripted SDK refusal";
// The SDK is refused at its boundary: the verify only has to build the spawn options, which create the directory.
const refusedQuery: AgentSdkQuery = (): never => {
  throw new Error(SDK_REFUSAL);
};

/** Store a key, give it a connection, and run the production auth check, which prepares the runtime directory. */
async function verifiedKey(
  root: ServerTestHarness,
  token: string,
  providerId: string = PROVIDER,
): Promise<Awaited<ReturnType<ServerTestHarness["services"]["credentials"]["add"]>>> {
  const principal = await root.principalFor(root.ownerId);
  const credential = await root.services.credentials.add({ principal, provider: providerId, key: token });
  const connection = await root.services.connection.create({
    principal,
    providerId,
    credentialId: credential.id,
    baseUrl: null,
    model: "runtime-dir-model",
    allowBackground: true,
    declared: declaredCapabilitySchema.parse({ kind: "generation", generation: { input: ["text"] } }),
  });
  const { resolved } = await root.app.runtime.resolve({ task: "chat", connectionId: connection.id, principal, cachedFacts: true });
  await expect(root.app.runtime.diagnostics.verifyAuth({ connection: resolved })).rejects.toThrow(SDK_REFUSAL);
  await root.settleBackground();
  return credential;
}

test("the owner's runtime directory outlives a removed key while another agent-sdk key remains, and goes with the last one", async () => {
  await using root = await createServerHarness({ secretBoxKey: SECRET_BOX_TEST_KEY, sdkQuery: refusedQuery });
  const principal = await root.principalFor(root.ownerId);
  const runtimeDir = join(root.env.USER_RUNTIME_DIR, root.ownerId, RUNTIME_TOOL);
  const first = await verifiedKey(root, "first-runtime-dir-token");
  const second = await verifiedKey(root, "second-runtime-dir-token");
  expect(existsSync(runtimeDir)).toBe(true);

  await root.services.credentials.remove({ principal, credentialId: first.id });
  expect(existsSync(runtimeDir)).toBe(true);

  await root.services.credentials.remove({ principal, credentialId: second.id });
  expect(existsSync(runtimeDir)).toBe(false);
});

test("removing the last key of a disabled plugin's agent-sdk provider removes the owner's runtime directory", { tags: ["slow"] }, async () => {
  await using root = await createServerHarness({ secretBoxKey: SECRET_BOX_TEST_KEY, sdkQuery: refusedQuery, pluginSpawn: spawn });
  const principal = await root.principalFor(root.ownerId);
  const runtimeDir = join(root.env.USER_RUNTIME_DIR, root.ownerId, RUNTIME_TOOL);
  const manifest = pluginManifestSchema.parse({
    id: SUBSCRIPTION_PLUGIN,
    name: "Subscription relay",
    version: "1.0.0",
    hostVersion: PLUGIN_HOST_VERSIONS[0],
    entry: PLUGIN_MAIN_ENTRY,
    description: "Contributes one agent-sdk provider.",
    capabilities: [],
    providers: [{ ...builtinProvider(PROVIDER), id: PLUGIN_PROVIDER, label: "Relayed subscription" }],
  });
  const installed = await root.services.plugin.install({
    caller: principal,
    bundle: makePluginBundle(manifest, "// provider-only guest", root.clock.now()),
    grant: [],
  });
  await root.services.plugin.setEnabled({ caller: principal, pluginId: installed.id, enabled: true });
  const key = await verifiedKey(root, "plugin-runtime-dir-token", PLUGIN_PROVIDER);
  // Positive control: the plugin provider's verify prepared the same runtime directory a built-in key does.
  expect(existsSync(runtimeDir)).toBe(true);

  await root.services.plugin.setEnabled({ caller: principal, pluginId: installed.id, enabled: false });
  await root.services.credentials.remove({ principal, credentialId: key.id });
  expect(existsSync(runtimeDir)).toBe(false);
});
