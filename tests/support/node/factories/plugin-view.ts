// Browser-consumed defaults keep a contracts/kit-only runtime closure.
import type { PluginView } from "@orb/contracts/plugin";
import { pluginSurfaceRegistrationMetaSchema, pluginViewSchema } from "@orb/contracts/plugin";
import type { PluginId } from "@orb/kit/ids";
import { ID_PREFIX } from "@orb/kit/ids";
import { FROZEN_AT_MS } from "../../iso/clock.ts";
import { createSeededIds } from "../../iso/ids.ts";
import type { TrpcWireOutput } from "../route-trpc.ts";

const ids = createSeededIds();

/** Scripted registration metadata has no recursive spec; the native guest publishes its tree at runtime. */
export function makePluginScriptedPage(
  pluginId: PluginId,
): Pick<TrpcWireOutput<"plugin.listSurfaces">[number], "pluginId" | "id" | "anchor" | "title" | "tier"> {
  return {
    ...pluginSurfaceRegistrationMetaSchema.parse({ id: "protocol", anchor: "page", title: "Native protocol", tier: "scripted" }),
    pluginId,
  };
}

/** Build the canonical owner-facing view; refuse invalid overrides at the contract boundary. */
export function makePluginRow(overrides: Partial<TrpcWireOutput<"plugin.list">[number]> = {}): PluginView {
  return pluginViewSchema.parse({
    id: ids.next(ID_PREFIX.plugin),
    slug: "plugin",
    name: "Plugin",
    version: "1.0.0",
    status: "enabled",
    origin: "upload",
    sourceUrl: null,
    sourceCommit: null,
    updateSource: null,
    declaredCapabilities: ["ui.surface"],
    grantedCapabilities: ["ui.surface"],
    netHosts: null,
    reconsentPending: false,
    widenedNetHosts: [],
    builtAgainst: null,
    description: "A fixture plugin.",
    lastError: null,
    installedAt: FROZEN_AT_MS,
    updatedAt: FROZEN_AT_MS,
    ...overrides,
  });
}
