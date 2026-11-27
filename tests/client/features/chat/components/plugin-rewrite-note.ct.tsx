// @subject packages/client/src/features/chat/components/plugin-rewrite-note.tsx
// A row whose text a viewer plugin's display transform changed says which plugin did it. The plugin is a real guest installed
// for the viewer and the room is a corpus room, so the names come from the server's own answer to the row's transform.

import { spawn } from "node:child_process";
import { PLUGIN_HOST_VERSIONS, PLUGIN_MAIN_ENTRY, pluginManifestSchema } from "@orb/contracts/plugin";
import type { ChatId } from "@orb/kit/ids";
import { seedShellState } from "@orb/testkit/browser/spec";
import { createShellAmbientReads, ROOM_PROCEDURES, routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { nonEmpty } from "@orb/testkit/iso";
import { createCorpusHarness, makePluginBundle, seedInstalledPlugin, seedPluginGrant } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";
import { pluginRewriteLine } from "#client/features/chat/lib/plugin-rewrite-copy.ts";
import type { ChatRoomShellStory } from "./_chat-room-shell-stories.tsx";

const STORY = "tests/client/features/chat/components/_chat-room-shell-stories/ChatRoomShellStory";
const PLUGIN_NAME = "Annotator";
const ANNOTATION = " [annotated]";
const SOURCE = `orb.host(1).transforms.registerDisplay({ name: "annotate", apply: async ({ text }) => text + ${JSON.stringify(ANNOTATION)} });`;
const ROW = '[data-slot="message-row"]';

type Root = Awaited<ReturnType<typeof createCorpusHarness>>;

/** The viewer's own plugin whose display transform appends a marker to every row. */
async function installAnnotator(root: Root): Promise<void> {
  const caller = await root.principalFor(root.ownerId);
  const manifest = pluginManifestSchema.parse({
    id: "annotator",
    name: PLUGIN_NAME,
    version: "1.0.0",
    description: "Marks every row it displays.",
    hostVersion: PLUGIN_HOST_VERSIONS[0],
    entry: PLUGIN_MAIN_ENTRY,
    capabilities: ["chat.transform"],
  });
  const { outcome } = await seedInstalledPlugin(root, { caller, bundle: makePluginBundle(manifest, SOURCE, root.clock.now()), grant: [] });
  await seedPluginGrant(root, { caller, pluginId: outcome.id, grant: manifest.capabilities, acknowledgedNetHosts: [], enable: true });
}

/** The first corpus room that holds a character's reply, with the shell's reads and the room's reads routed to the root. */
async function routeRoom(page: Page, root: Root, corpus: Parameters<typeof createShellAmbientReads>[0]): Promise<ChatId> {
  const caller = await root.internalCallerFor(root.ownerId);
  const [room] = nonEmpty((await caller.chat.listChats({ limit: 100 })).items);
  await seedShellState(page, { activeSection: "chats" });
  await routeTrpc(page, {
    ...createShellAmbientReads(corpus, root.ownerId),
    ...serveCorpusProcedures(caller, [...SECTION_PROCEDURES, ...ROOM_PROCEDURES, "rpg.getGame", "rpg.listTurnToolCalls", "plugin.transformForDisplay"]),
  });
  return room.id;
}

test("a row a plugin's display transform rewrote names the plugin beside it", async ({ corpus, corpusMedia, mount, page }) => {
  // The guest is a real plugin process: the harness refuses one unless the test names the spawn.
  await using root = await createCorpusHarness(undefined, { pluginSpawn: spawn });
  await installAnnotator(root);
  const chatId = await routeRoom(page, root, corpus);
  await corpusMedia();
  await mount<typeof ChatRoomShellStory>(STORY, { chatId });

  const row = page.locator(ROW).filter({ hasText: ANNOTATION.trim() }).first();
  await expect(row).toBeVisible();
  await expect(row.getByText(pluginRewriteLine([PLUGIN_NAME]), { exact: true })).toBeVisible();
});

test("a room whose viewer has no display transform shows no rewrite note", async ({ corpus, corpusMedia, mount, page }) => {
  await using root = await createCorpusHarness();
  const chatId = await routeRoom(page, root, corpus);
  await corpusMedia();
  await mount<typeof ChatRoomShellStory>(STORY, { chatId });

  // The control: the row the other case annotates is on screen, unannotated, with no note under it.
  await expect(page.locator(ROW).first()).toBeVisible();
  await expect(page.locator(ROW).filter({ hasText: ANNOTATION.trim() })).toHaveCount(0);
  await expect(page.getByText(pluginRewriteLine([PLUGIN_NAME]), { exact: true })).toHaveCount(0);
});
