import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { CHAT_TRIGGER_TYPES, DOMAIN_TRIGGER_TYPES } from "@orb/contracts/automation";
import { PROMPT_TRANSFORM_POINTS } from "@orb/contracts/chat";
import {
  HOST_FUNCTION_CAPABILITY,
  PLUGIN_ANCHOR_TIERS,
  PLUGIN_CAPABILITIES,
  PLUGIN_COMMAND_PLACEMENT_TARGETS,
  PLUGIN_SURFACE_ANCHORS,
  PLUGIN_SURFACE_TIERS,
  PLUGIN_TIER_REGISTRAR,
  UI_PROXYABLE_HOST_FUNCTIONS,
} from "@orb/contracts/plugin";
import type { PluginAuthorSupport, PluginAuthorSupportSource } from "@orb/plugin-toolchain";
import {
  createPluginAuthorSupport,
  PLUGIN_AUTHOR_SUPPORT,
  pluginAuthorSupportDrift,
  pluginAuthorSupportGuideIsCurrent,
  renderPluginAuthorSupport,
  writePluginAuthorSupportGuide,
} from "@orb/plugin-toolchain";
import { expect, test } from "../support/tool-fixtures.ts";

function liveSupportSource(): PluginAuthorSupportSource {
  return {
    capabilities: PLUGIN_CAPABILITIES,
    hostFunctionCapability: HOST_FUNCTION_CAPABILITY,
    uiProxyableHostFunctions: UI_PROXYABLE_HOST_FUNCTIONS,
    chatEventHooks: CHAT_TRIGGER_TYPES,
    domainEventHooks: DOMAIN_TRIGGER_TYPES,
    promptTransformPoints: PROMPT_TRANSFORM_POINTS,
    surfaceAnchors: PLUGIN_SURFACE_ANCHORS,
    surfaceTiers: PLUGIN_SURFACE_TIERS,
    anchorTiers: PLUGIN_ANCHOR_TIERS,
    tierRegistrar: PLUGIN_TIER_REGISTRAR,
    commandPlacements: PLUGIN_COMMAND_PLACEMENT_TARGETS,
  };
}

test("the packed author support registry exactly follows executable contract registries", () => {
  const expected = createPluginAuthorSupport(liveSupportSource());

  expect(pluginAuthorSupportDrift(expected, PLUGIN_AUTHOR_SUPPORT)).toEqual([]);
  expect(PLUGIN_AUTHOR_SUPPORT.runtimes.main.hostFunctions).toEqual(Object.keys(HOST_FUNCTION_CAPABILITY));
  expect(PLUGIN_AUTHOR_SUPPORT.runtimes.ui.hostFunctions).toEqual(UI_PROXYABLE_HOST_FUNCTIONS);
  expect(PLUGIN_AUTHOR_SUPPORT.runtimes.frame.hostFunctions).toEqual(UI_PROXYABLE_HOST_FUNCTIONS);
});

test("registry drift controls catch omitted, extra, and wrong-world support", () => {
  const source = liveSupportSource();
  const omittedCapability = createPluginAuthorSupport({ ...source, capabilities: source.capabilities.slice(1) });
  const extraPlacement = createPluginAuthorSupport({ ...source, commandPlacements: [...source.commandPlacements, "not-a-real-placement"] });
  const wrongWorld: PluginAuthorSupport = {
    ...PLUGIN_AUTHOR_SUPPORT,
    runtimes: {
      ...PLUGIN_AUTHOR_SUPPORT.runtimes,
      ui: { ...PLUGIN_AUTHOR_SUPPORT.runtimes.ui, execution: "server-quickjs" },
    },
  };

  expect(pluginAuthorSupportDrift(PLUGIN_AUTHOR_SUPPORT, omittedCapability)).toContain("capabilities");
  expect(pluginAuthorSupportDrift(PLUGIN_AUTHOR_SUPPORT, extraPlacement)).toContain("ui");
  expect(pluginAuthorSupportDrift(PLUGIN_AUTHOR_SUPPORT, wrongWorld)).toContain("runtimes");
});

test("support guide writes are deterministic and freshness checks do not rewrite", async ({ scratch }) => {
  const markdownPath = join(scratch, "AUTHORING-SUPPORT.md");
  await writePluginAuthorSupportGuide(markdownPath, "markdown");

  expect(await pluginAuthorSupportGuideIsCurrent(markdownPath, "markdown")).toBe(true);
  expect(renderPluginAuthorSupport("markdown")).toContain("## Composer placements");
  expect(JSON.parse(renderPluginAuthorSupport("json"))).toEqual(PLUGIN_AUTHOR_SUPPORT);

  await writeFile(markdownPath, "stale\n");
  expect(await pluginAuthorSupportGuideIsCurrent(markdownPath, "markdown")).toBe(false);
});
