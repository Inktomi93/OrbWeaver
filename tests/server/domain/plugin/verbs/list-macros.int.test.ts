// A caller reads the macros of their own enabled plugins through the router and nobody else's: a second account sees
// none of the owner's, a disabled plugin contributes nothing, and the plugin id and display name ride each row.
// @subject packages/server/src/domain/plugin/verbs/list-macros.ts
// @subject packages/server/src/transport/trpc/routers/plugin.ts

import { spawn } from "node:child_process";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness, installMacroGuest, seedCorpusActors } from "@orb/testkit/node/composed";
import { pluginMacroName } from "#server/domain/plugin/substrate/plugin-macros.ts";

test("listMacros returns the caller's own enabled plugins' macros with plugin id and name, and a second account reads none of them", {
  tags: "slow",
}, async () => {
  await using root = await createServerHarness({ pluginSpawn: spawn });
  const { owner, secondUserId } = await seedCorpusActors(root);
  const second = await root.principalFor(secondUserId);
  const ownerRpc = await root.internalCallerFor(root.ownerId);
  const secondRpc = await root.internalCallerFor(secondUserId);

  const oracle = await installMacroGuest(root, owner, { slug: "oracle-deck", name: "Oracle Deck" }, [
    { name: "omen", description: "Draws an omen." },
    { name: "fate", description: "Draws a fate." },
  ]);
  expect(await secondRpc.plugin.listMacros()).toEqual([]);

  const ledger = await installMacroGuest(root, second, { slug: "ledger", name: "Ledger" }, [{ name: "tally", description: "Counts coins." }]);
  const ownerRows = await ownerRpc.plugin.listMacros();
  expect(ownerRows.toSorted((a, b) => a.name.localeCompare(b.name))).toEqual([
    { pluginId: oracle, pluginName: "Oracle Deck", name: pluginMacroName("oracle-deck", "fate"), description: "Draws a fate." },
    { pluginId: oracle, pluginName: "Oracle Deck", name: pluginMacroName("oracle-deck", "omen"), description: "Draws an omen." },
  ]);
  expect(await secondRpc.plugin.listMacros()).toEqual([
    { pluginId: ledger, pluginName: "Ledger", name: pluginMacroName("ledger", "tally"), description: "Counts coins." },
  ]);

  // A disabled plugin has no resident instance, so its macros leave the read.
  await root.services.plugin.setEnabled({ caller: owner, pluginId: oracle, enabled: false });
  expect(await ownerRpc.plugin.listMacros()).toEqual([]);
});
