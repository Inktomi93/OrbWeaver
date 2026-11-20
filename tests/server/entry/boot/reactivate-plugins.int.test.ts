// Boot restarts every enabled plugin except one whose owner is disabled: that owner's startup code does not run. Once
// the owner is enabled again, the next boot starts it, because the row still records the owner's enable.
// @subject packages/server/src/entry/boot/reactivate-plugins.ts

import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PLUGIN_HOST_VERSIONS, PLUGIN_MAIN_ENTRY, pluginManifestSchema } from "@orb/contracts/plugin";
import type { PluginId, UserId } from "@orb/kit/ids";
import { reactivatePluginsOnBoot } from "@orb/server/entry/boot";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness, freshDb, makePluginBundle } from "@orb/testkit/node/composed";
import { bootGrantFor } from "@orb/testkit/node/helpers";

const STARTED = "The lamp-keeper starts its watch.";
// The guest records its own start from top-level code, which runs only when its plugin is started.
const GUEST_SOURCE = `const h = orb.host(1);
h.log.info(${JSON.stringify(STARTED)});`;

interface Install {
  readonly ownerId: UserId;
  readonly pluginId: PluginId;
}

async function installStartedPlugin(root: ServerTestHarness): Promise<Install> {
  const owner = await root.principalFor((await root.actor()).id);
  const manifest = pluginManifestSchema.parse({
    id: "lamp-keeper",
    name: "Lamp keeper",
    version: "1.0.0",
    hostVersion: PLUGIN_HOST_VERSIONS[0],
    entry: PLUGIN_MAIN_ENTRY,
    description: "Records when it starts.",
    capabilities: [],
  });
  const installed = await root.services.plugin.install({ caller: owner, bundle: makePluginBundle(manifest, GUEST_SOURCE, root.clock.now()), grant: [] });
  await root.services.plugin.setEnabled({ caller: owner, pluginId: installed.id, enabled: true });
  return { ownerId: owner.userId, pluginId: installed.id };
}

/** Run the boot step the lifecycle runs, over the root's own sessions reads. */
function bootPlugins(root: ServerTestHarness): ReturnType<typeof reactivatePluginsOnBoot> {
  return reactivatePluginsOnBoot({
    db: bootGrantFor(root.db),
    logger: root.logger,
    setEnabled: root.services.plugin.setEnabled,
    resolvePrincipal: root.principalFor,
    isOwnerEnabled: root.workloadExecution.isAccountEnabled,
  });
}

async function startRecords(root: ServerTestHarness, install: Install): Promise<string[]> {
  const caller = await root.principalFor(install.ownerId);
  return (await root.services.plugin.getLog({ caller, pluginId: install.pluginId })).map((line) => line.message).filter((message) => message === STARTED);
}

test("a boot skips a disabled owner's plugin and starts an enabled owner's, and the next boot after re-enabling starts it", { tags: ["slow"] }, async () => {
  using held = await freshDb();
  // The bundle bytes live in the CAS, which every boot of the same box reads.
  await using box = new AsyncDisposableStack();
  const directory = await mkdtemp(join(tmpdir(), "orb-reactivate-plugins-"));
  box.defer(() => rm(directory, { recursive: true, force: true }));
  const casDir = join(directory, "cas");
  let lineage: Pick<ServerTestHarness, "ownerId" | "clock" | "ids">;
  let disabled: Install;
  let enabled: Install;
  {
    await using first = await createServerHarness({ db: held.db, casDir, pluginSpawn: spawn });
    disabled = await installStartedPlugin(first);
    enabled = await installStartedPlugin(first);
    expect(await startRecords(first, disabled)).toEqual([STARTED]);
    const boxOwner = await first.principalFor(first.ownerId);
    await first.services.admin.setEnabled({ principal: boxOwner, userId: disabled.ownerId, enabled: false });
    lineage = { ownerId: first.ownerId, clock: first.clock, ids: first.ids };
  }

  {
    await using second = await createServerHarness({ db: held.db, casDir, ...lineage, pluginSpawn: spawn });
    await bootPlugins(second);
    expect(await startRecords(second, enabled)).toEqual([STARTED]);
    expect(await startRecords(second, disabled)).toEqual([]);
    const boxOwner = await second.principalFor(second.ownerId);
    await second.services.admin.setEnabled({ principal: boxOwner, userId: disabled.ownerId, enabled: true });
  }

  await using third = await createServerHarness({ db: held.db, casDir, ...lineage, pluginSpawn: spawn });
  await bootPlugins(third);
  expect(await startRecords(third, disabled)).toEqual([STARTED]);
  expect(await startRecords(third, enabled)).toEqual([STARTED]);
});
