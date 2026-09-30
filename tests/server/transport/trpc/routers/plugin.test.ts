// plugin.list / listSurfaces — the strict output boundary. The row views are projected field by field; the output
// parser is the second guard, so a producer that starts returning an extra key fails the call instead of shipping
// it. `listSurfaces` extends the refined registration meta, so its per-anchor refinements must still run.

import type { PluginId } from "@orb/kit/ids";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import type { PluginService, PluginSurfaceView, PluginView } from "@orb/server/domain/plugin";
import { describe, vi } from "vitest";
import { expect, test } from "../../../../support/fixtures.ts";
import { caller, makeContext, principal } from "../_support.ts";

const PLUGIN_ID: PluginId = mintTypeId(ID_PREFIX.plugin);

const VIEW: PluginView = {
  id: PLUGIN_ID,
  slug: "story-clocks",
  name: "Story Clocks",
  version: "1.0.0",
  status: "enabled",
  origin: "upload",
  sourceUrl: null,
  sourceCommit: null,
  updateSource: null,
  grantedCapabilities: ["ui.surface"],
  declaredCapabilities: ["ui.surface"],
  netHosts: null,
  reconsentPending: false,
  widenedNetHosts: [],
  builtAgainst: null,
  lastError: null,
  installedAt: 1_750_000_000_000,
  updatedAt: 1_750_000_000_000,
};

const SURFACE: PluginSurfaceView = { id: "clocks", anchor: "settings", title: "Clocks", tier: "static", pluginId: PLUGIN_ID };

function pluginApi(services: Partial<PluginService>): ReturnType<typeof caller>["plugin"] {
  return caller(makeContext({ auth: principal("user"), services: { plugin: services } })).plugin;
}

describe("plugin — the strict output boundary", () => {
  test("control: well-formed rows and surfaces pass through unchanged", async () => {
    const list = vi.fn<PluginService["list"]>(async () => [VIEW]);
    const listSurfaces = vi.fn<PluginService["listSurfaces"]>(async () => [
      SURFACE,
      { ...SURFACE, id: "tool", anchor: "tool-card", toolName: "tick", toolWireName: "plugin_story_clocks_tick" },
    ]);
    const api = pluginApi({ list, listSurfaces });

    await expect(api.list()).resolves.toEqual([VIEW]);
    await expect(api.listSurfaces()).resolves.toHaveLength(2);
  });

  test("list refuses a row carrying the bundle bytes", async () => {
    const list = vi.fn<PluginService["list"]>(async () => [{ ...VIEW, bundle: "UEsDBBQ-planted" }]);

    await expect(pluginApi({ list }).list()).rejects.toThrow("Output validation failed");
  });

  test("listSurfaces refuses a surface carrying an extra key", async () => {
    const listSurfaces = vi.fn<PluginService["listSurfaces"]>(async () => [{ ...SURFACE, ownerId: "user_planted" }]);

    await expect(pluginApi({ listSurfaces }).listSurfaces()).rejects.toThrow("Output validation failed");
  });

  test("listSurfaces still runs the registration refinements: a tool-card surface without its toolName is refused", async () => {
    const listSurfaces = vi.fn<PluginService["listSurfaces"]>(async () => [{ ...SURFACE, anchor: "tool-card" }]);

    await expect(pluginApi({ listSurfaces }).listSurfaces()).rejects.toThrow("Output validation failed");
  });
});
