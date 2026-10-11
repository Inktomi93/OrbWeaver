// What an anchor can render out of the caller's registrations: the partition `buildCandidates` makes before any
// state is read. Pure, so it is pinned here; the CT proves the rendered arm.

import type { PluginId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { buildCandidates } from "../../../../../packages/client/src/features/plugin/hooks/use-visible-anchored-surfaces.ts";
import { expect, test } from "../../../../support/fixtures.ts";

type SurfaceRow = Parameters<typeof buildCandidates>[0][number];
type PluginRow = Parameters<typeof buildCandidates>[1][number];

const ORACLE = castId<PluginId>("plugin_dom_oracle00000001");
const GHOST = castId<PluginId>("plugin_dom_ghost000000001");

function pluginRow(id: PluginId, name: string): PluginRow {
  return {
    id,
    slug: name.toLowerCase(),
    name,
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
    installedAt: 0,
    updatedAt: 0,
  };
}

const STATIC_SPEC: NonNullable<SurfaceRow["spec"]> = { kind: "text", value: "hello" };

test("an anchor draws its own surfaces only, labelled by the plugin row it joins, and a surface with nothing to draw is skipped", () => {
  const surfaces: SurfaceRow[] = [
    { pluginId: ORACLE, id: "flank_static", anchor: "chat-flank", title: "Static", tier: "static", spec: STATIC_SPEC },
    { pluginId: ORACLE, id: "flank_frame", anchor: "chat-flank", title: "Frame", tier: "frame" },
    { pluginId: ORACLE, id: "flank_scripted", anchor: "chat-flank", title: "Scripted", tier: "scripted" },
    { pluginId: ORACLE, id: "settings_scripted", anchor: "chat-settings-section", title: "Elsewhere", tier: "scripted" },
    // No spec and no guest to compute one: nothing to draw.
    { pluginId: ORACLE, id: "flank_empty", anchor: "chat-flank", title: "Empty", tier: "static" },
    // Its plugin row has not resolved, and an unlabelled plugin surface is never drawn.
    { pluginId: GHOST, id: "flank_unnamed", anchor: "chat-flank", title: "Unnamed", tier: "static", spec: STATIC_SPEC },
  ];

  const candidates = buildCandidates(surfaces, [pluginRow(ORACLE, "Oracle")], "chat-flank");

  expect(candidates.map((candidate) => [candidate.surfaceId, candidate.tier, candidate.pluginName])).toEqual([
    ["flank_static", "static", "Oracle"],
    ["flank_frame", "frame", "Oracle"],
    ["flank_scripted", "scripted", "Oracle"],
  ]);
});

test("a scripted surface carries every scripted id its plugin registered, at any anchor — one worker serves them all", () => {
  const surfaces: SurfaceRow[] = [
    { pluginId: ORACLE, id: "flank_scripted", anchor: "chat-flank", title: "Scripted", tier: "scripted" },
    { pluginId: ORACLE, id: "settings_scripted", anchor: "chat-settings-section", title: "Elsewhere", tier: "scripted" },
  ];

  const [candidate] = buildCandidates(surfaces, [pluginRow(ORACLE, "Oracle")], "chat-flank");

  expect(candidate?.tier === "scripted" ? candidate.scriptedIds : undefined).toEqual(["flank_scripted", "settings_scripted"]);
});
