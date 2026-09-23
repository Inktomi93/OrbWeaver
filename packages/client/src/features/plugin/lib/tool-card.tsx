// The plugin plane's TOOL-RENDERER contribution (U3, seam 7) — the door-side half of the
// `tool-card` anchor. ONE fixed first-party member of chat's `toolRenderers` registry, claiming the
// `plugin_` NAMESPACE rather than a name: which plugin tools exist depends on who installed what, so a
// per-name contribution would mean the composition root growing per plugin — the one-assembly law (G8) says
// the door never does that, and the per-plugin fan happens inside the body instead (`PluginToolCard`).
//
// Chat imports nothing from here: the door assembles it into the registry chat consumes blind, and a build
// with the member removed renders every plugin tool in the generic `ToolCallBlock` again — byte-identically,
// because that is exactly what the body falls back to when it has no card to draw.

import { PLUGIN_TOOL_NAME_PREFIX } from "@orb/contracts/plugin";
import type { ReactElement } from "react";
import type { ToolRenderer } from "#lib";
import { PluginToolCard } from "../components/plugin-tool-card.tsx";

/** Claims every `plugin_<slug'>_<name>` wire tool for the plugin plane's card renderer. The prefix is the ONE
 *  the namespacing mint emits (`pluginToolWireName`), imported rather than spelled, so the claim and the mint
 *  can never drift apart. An EXACT (`match: "name"`) claim still wins over this one — a first-party renderer
 *  that names a tool outright is never shadowed by the namespace. */
export const pluginToolRenderer: ToolRenderer = {
  id: PLUGIN_TOOL_NAME_PREFIX,
  match: "prefix",
  render: (record): ReactElement => <PluginToolCard record={record} />,
};
