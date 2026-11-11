// A string crosses the plugin boundary whole in both directions, NUL included: a guest's argument and return value
// reach the host whole, and a host value, a nested value and an object key reach the guest whole. Each case is read on
// the far side of the crossing it proves. A guest reports what it saw as its own JSON, which escapes a NUL, so the
// report itself never depends on the crossing under test. Card data is stored as JSON text, so its round trip also
// shows that store keeps a NUL; the text stores refuse one instead (`tests/server/domain/plugin/substrate/stored-text-nul.int.test.ts`).
// @subject packages/server/src/infra/plugin-host/marshal.ts
import { spawn } from "node:child_process";
import { createCharacterSchema } from "@orb/contracts/character";
import { PLUGIN_HOST_VERSIONS, PLUGIN_MAIN_ENTRY, pluginManifestSchema } from "@orb/contracts/plugin";
import { expect, test } from "@orb/testkit/node";
import type { GuestOps } from "@orb/testkit/node/composed";
import { createServerHarness, guestRunner, installGuest, makePluginBundle } from "@orb/testkit/node/composed";

const NUL = "\0";
const WITH_NUL = `head${NUL}tail`;

const OPS = {
  // `a.text` rides the command's JSON arguments, which already cross whole; the call under test is the guest's.
  log: "(h, room, a) => { h.log.info(a.text); return null; }",
  cardKeys: "async (h, room, a) => { await h.character.setCardData(a.card, a.data); return Object.entries(await h.character.getCardData(a.card)); }",
} as const satisfies GuestOps;

test("a guest's string argument reaches the host whole", { tags: ["slow"] }, async () => {
  await using root = await createServerHarness({ pluginSpawn: spawn });
  const owner = await root.principalFor(root.ownerId);
  const pluginId = await installGuest(root, owner, { slug: "nul-logger", capabilities: [] }, OPS);

  await guestRunner({ root, caller: owner, pluginId, chatId: null })("log", { text: WITH_NUL });
  // Oldest first: the guest's call, then the runner's own outcome report.
  const [line] = await root.services.plugin.getLog({ caller: owner, pluginId, limit: 2 });
  expect(line?.message).toBe(WITH_NUL);
});

test("an object key and a nested value with a NUL reach the guest whole", { tags: ["slow"] }, async () => {
  await using root = await createServerHarness({ pluginSpawn: spawn });
  const owner = await root.principalFor(root.ownerId);
  const card = (
    await root.services.character.create({
      principal: owner,
      input: createCharacterSchema.parse({ handle: "keeper", name: "keeper", description: "A keeper." }),
    })
  ).id;
  const pluginId = await installGuest(root, owner, { slug: "nul-card", capabilities: ["character.card_state"] }, OPS);

  expect(await guestRunner({ root, caller: owner, pluginId, chatId: null })("cardKeys", { card, data: { [WITH_NUL]: { nested: WITH_NUL } } })).toEqual({
    ok: true,
    value: [[WITH_NUL, { nested: WITH_NUL }]],
  });
});

test("a guest's string return value reaches the host whole", { tags: ["slow"] }, async () => {
  await using root = await createServerHarness({ pluginSpawn: spawn });
  const owner = await root.principalFor(root.ownerId);
  const room = (await (await root.internalCallerFor(root.ownerId)).chat.startChat({ characterIds: [] })).chat;
  const manifest = pluginManifestSchema.parse({
    id: "nul-drafter",
    name: "nul-drafter",
    version: "1.0.0",
    hostVersion: PLUGIN_HOST_VERSIONS[0],
    entry: PLUGIN_MAIN_ENTRY,
    description: "Returns a draft with a NUL in it.",
    capabilities: ["ui.surface"],
  });
  const source = `orb.host(1).ui.registerCommand({ name: "draft", describe: "Return the draft with a tail", composerDraft: true, placements: [{ target: "composer-action", label: "Tail", icon: "sparkles" }], onRun: ({ draft }) => draft + ${JSON.stringify(`${NUL}more`)} });`;
  const installed = await root.services.plugin.install({ caller: owner, bundle: makePluginBundle(manifest, source, root.clock.now()), grant: [] });
  await root.services.plugin.setGrant({ caller: owner, pluginId: installed.id, grant: manifest.capabilities, acknowledgedNetHosts: [], enable: true });

  const outcome = await root.services.plugin.invokeUiCommand({
    caller: owner,
    pluginId: installed.id,
    name: "draft",
    args: "",
    chatId: room.id,
    composerDraft: WITH_NUL,
  });
  expect(outcome.composerDraft).toBe(`${WITH_NUL}${NUL}more`);
});
