// A real guest registers commands at activation: every closed placement target is admitted up to the one-per-target
// bound, a command may place nothing, and an unknown target or a repeat past the bound refuses that command alone.
// @subject packages/server/src/infra/plugin-host/membrane.ts
// @subject packages/contracts/src/plugin/ui.ts

import { spawn } from "node:child_process";
import { PLUGIN_COMMAND_PLACEMENT_TARGETS, PLUGIN_HOST_VERSIONS, PLUGIN_MAIN_ENTRY, pluginManifestSchema } from "@orb/contracts/plugin";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness, makePluginBundle, seedCorpusActors } from "@orb/testkit/node/composed";

const WARNING = "warn";
const everyTarget = PLUGIN_COMMAND_PLACEMENT_TARGETS.map((target) => ({ target, label: `At ${target}` }));
const registrations = [
  { name: "at_topbar", placements: [{ target: "topbar", label: "Draw", icon: "sparkles" }] },
  { name: "at_every_target", placements: everyTarget },
  { name: "unplaced" },
  { name: "unknown_target", placements: [{ target: "sidebar", label: "Nowhere" }] },
  { name: "past_the_bound", placements: [...everyTarget, { target: "topbar", label: "Again" }] },
];

test("a guest's placements register through the membrane, and an unknown target or a placement past the bound refuses only that command", async () => {
  await using root = await createServerHarness({ pluginSpawn: spawn });
  const { owner } = await seedCorpusActors(root);
  const manifest = pluginManifestSchema.parse({
    id: "placement-witness",
    name: "Placement witness",
    version: "1.0.0",
    hostVersion: PLUGIN_HOST_VERSIONS[0],
    entry: PLUGIN_MAIN_ENTRY,
    description: "Registers one command per placement shape.",
    capabilities: ["ui.surface"],
  });
  const source = `const h = orb.host(1);
for (const command of ${JSON.stringify(registrations)}) {
  h.ui.registerCommand({ ...command, describe: "Witness", onRun: async () => {} });
}`;
  const installed = await root.services.plugin.install({ caller: owner, bundle: makePluginBundle(manifest, source, root.clock.now()), grant: [] });
  await root.services.plugin.setGrant({ caller: owner, pluginId: installed.id, grant: [...manifest.capabilities], acknowledgedNetHosts: [], enable: true });

  const commands = await root.services.plugin.listCommands({ caller: owner });
  expect(new Map(commands.map((command) => [command.name, command.placements.map((placement) => placement.target)]))).toEqual(
    new Map([
      ["at_topbar", ["topbar"]],
      ["at_every_target", [...PLUGIN_COMMAND_PLACEMENT_TARGETS]],
      ["unplaced", []],
    ]),
  );
  expect(commands.find((command) => command.name === "at_topbar")?.placements).toEqual(registrations[0]?.placements);

  const log = await root.services.plugin.getLog({ caller: owner, pluginId: installed.id, limit: 20 });
  expect(log.filter((line) => line.level === WARNING)).toHaveLength(2);
});
