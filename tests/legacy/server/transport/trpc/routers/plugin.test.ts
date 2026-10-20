// plugin.list / listSurfaces — the strict output boundary. The row views are projected field by field; the output
// parser is the second guard, so a producer that starts returning an extra key fails the call instead of shipping
// it. `listSurfaces` extends the refined registration meta, so its per-anchor refinements must still run.

import { PLUGIN_TEXT_MAX_CHARS } from "@orb/contracts/plugin";
import type { Db } from "@orb/db";
import type { ChatId, MessageId, PluginId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { FROZEN_AT_MS } from "@orb/testkit/iso/clock.ts";
import { freshDb } from "@orb/testkit/node/db.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { describe, vi } from "vitest";
import type { PluginService, PluginSurfaceView, PluginView } from "#server/domain/plugin/index.ts";
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
  description: "A fixture plugin.",
  lastError: null,
  installedAt: FROZEN_AT_MS,
  updatedAt: FROZEN_AT_MS,
};

const SURFACE: PluginSurfaceView = { id: "clocks", anchor: "settings", title: "Clocks", tier: "static", pluginId: PLUGIN_ID };

async function pluginApi(db: Db, services: Partial<PluginService>): Promise<ReturnType<typeof caller>["plugin"]> {
  return caller(makeContext({ auth: await principal(db, "user"), services: { plugin: services } })).plugin;
}

describe("plugin — the strict output boundary", () => {
  test("control: well-formed rows and surfaces pass through unchanged", async () => {
    const db = await freshDb();
    const list = vi.fn<PluginService["list"]>(async () => [VIEW]);
    const listSurfaces = vi.fn<PluginService["listSurfaces"]>(async () => [
      SURFACE,
      { ...SURFACE, id: "tool", anchor: "tool-card", toolName: "tick", toolWireName: "plugin_story_clocks_tick" },
    ]);
    const api = await pluginApi(db, { list, listSurfaces });

    await expect(api.list()).resolves.toEqual([VIEW]);
    await expect(api.listSurfaces()).resolves.toHaveLength(2);
  });

  test("list refuses a row carrying the bundle bytes", async () => {
    const db = await freshDb();
    const list = vi.fn<PluginService["list"]>(async () => [{ ...VIEW, bundle: "UEsDBBQ-planted" }]);

    await expect((await pluginApi(db, { list })).list()).rejects.toThrow("Output validation failed");
  });

  test("listSurfaces refuses a surface carrying an extra key", async () => {
    const db = await freshDb();
    const listSurfaces = vi.fn<PluginService["listSurfaces"]>(async () => [{ ...SURFACE, ownerId: "user_planted" }]);

    await expect((await pluginApi(db, { listSurfaces })).listSurfaces()).rejects.toThrow("Output validation failed");
  });

  test("listSurfaces still runs the registration refinements: a tool-card surface without its toolName is refused", async () => {
    const db = await freshDb();
    const listSurfaces = vi.fn<PluginService["listSurfaces"]>(async () => [{ ...SURFACE, anchor: "tool-card" }]);

    await expect((await pluginApi(db, { listSurfaces })).listSurfaces()).rejects.toThrow("Output validation failed");
  });
});

test("display text reaches only its caller at the shared cap; larger text is refused before the service", async ({ ids }) => {
  const db = await freshDb();
  const transformForDisplay = vi.fn<PluginService["transformForDisplay"]>(async ({ text: renderedText }) => ({ text: renderedText }));
  const api = await pluginApi(db, { transformForDisplay });
  const chatId = castId<ChatId>(ids.next(ID_PREFIX.chat));
  const messageId = castId<MessageId>(ids.next(ID_PREFIX.message));
  const text = "x".repeat(PLUGIN_TEXT_MAX_CHARS);
  await expect(api.transformForDisplay({ chatId, messageId, text })).resolves.toEqual({ text });
  expect(transformForDisplay).toHaveBeenCalledTimes(1);
  await expect(api.transformForDisplay({ chatId, messageId, text: `${text}x` })).rejects.toThrow();
  expect(transformForDisplay).toHaveBeenCalledTimes(1);
});
