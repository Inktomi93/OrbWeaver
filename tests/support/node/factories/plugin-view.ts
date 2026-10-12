// Wire-output builder for an installed-plugin row (`plugin.list`): an enabled, uploaded plugin holding the one
// `ui.surface` capability it declared. An override is spread after the defaults.

import { ID_PREFIX } from "@orb/kit/ids";
import { FROZEN_AT_MS } from "../../iso/clock.ts";
import { createSeededIds } from "../../iso/ids.ts";
import type { TrpcWireOutput } from "../route-trpc.ts";

const ids = createSeededIds();

type PluginRowWire = TrpcWireOutput<"plugin.list">[number];

export function makePluginRow(overrides: Partial<PluginRowWire> = {}): PluginRowWire {
  return {
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
  };
}
