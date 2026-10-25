import { spawn } from "node:child_process";
import { PLUGIN_HOST_VERSIONS, PLUGIN_MAIN_ENTRY, pluginManifestSchema } from "@orb/contracts/plugin";
import { seedShellState } from "@orb/testkit/browser/spec";
import { createShellAmbientReads, ROOM_PROCEDURES, routeTrpc, SECTION_LABELS, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness, makePluginBundle } from "@orb/testkit/node/composed";
import { CHAT_PANEL_HIDE_LABEL } from "#client/features/plugin/lib/plugin-copy.ts";
import type { PluginHideFocusStory } from "./_hide-focus-stories.tsx";

test.use({ viewport: { width: 1600, height: 1000 } });

test("hiding the final plugin panel returns focus to the shell Chats main region", async ({ corpus, page, mount }) => {
  await using root = await createCorpusHarness(undefined, { pluginSpawn: spawn });
  const caller = await root.internalCallerFor(root.ownerId);
  const manifest = pluginManifestSchema.parse({
    id: "focus-panel",
    name: "Focus panel",
    description: "A synthetic panel for focus return.",
    version: "1.0.0",
    hostVersion: PLUGIN_HOST_VERSIONS[0],
    entry: PLUGIN_MAIN_ENTRY,
    capabilities: ["ui.surface"],
  });
  const source =
    'orb.host(1).ui.register({ id: "focus", anchor: "chat-flank", title: "Focus witness", tier: "static", spec: { kind: "text", value: "Focus panel content" } });';
  const installed = await caller.plugin.install({
    bundleBase64: Buffer.from(makePluginBundle(manifest, source, root.clock.now())).toString("base64"),
    grant: manifest.capabilities,
  });
  await caller.plugin.setEnabled({ pluginId: installed.id, enabled: true });
  expect((await caller.plugin.listSurfaces()).some((surface) => surface.pluginId === installed.id && surface.anchor === "chat-flank")).toBe(true);
  const room = (await caller.chat.listChats({ limit: 1 })).items[0];
  if (room === undefined) {
    throw new Error("The corpus has no room");
  }
  await seedShellState(page, { activeSection: "chats" });
  await routeTrpc(page, {
    ...createShellAmbientReads(corpus),
    ...serveCorpusProcedures(caller, [
      ...SECTION_PROCEDURES,
      ...ROOM_PROCEDURES,
      "plugin.getSurfaceState",
      "settings.updateUserSettingsSection",
      "notifications.presence",
      "rpg.getGame",
      "rpg.listTurnToolCalls",
    ]),
  });
  await mount<typeof PluginHideFocusStory>("tests/client/features/plugin/components/_hide-focus-stories/PluginHideFocusStory", { chatId: room.id });
  const hide = page.getByRole("button", { name: `${CHAT_PANEL_HIDE_LABEL} ${manifest.name}`, exact: true });
  await expect(page.getByText("Focus panel content", { exact: true })).toBeVisible();
  await hide.click();
  await expect(hide).toHaveCount(0);
  await expect(page.getByRole("main", { name: `${SECTION_LABELS.chats} content`, exact: true })).toBeFocused();
});
