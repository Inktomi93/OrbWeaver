// @orb/contracts/plugin/registrations — the infra↔domain WIRE shapes for a resident guest instance's collected
// registrations. These cross the sealed `infra/plugin-host` → `domain/plugin` seam BOTH ways: the
// runtime PRODUCES them at activation (what `main.js` registered), the domain CONSUMES them (hands each to its
// registrar). A cross-tier shape has exactly ONE home BELOW server — contracts (the cake) — so infra can mint a
// real `PluginInstance` without importing a domain (plugin-no-ambient), and the domain reads the same shape.

import type { Branded } from "@orb/kit/ids";
import type { ChatTriggerType, DomainTriggerType } from "#automation";
import type { PromptTransformPoint } from "#chat";
import type { PluginCommandRegistrationMeta, PluginSurfaceRegistrationMeta } from "./ui.ts";

/** An opaque ref to a guest-registered callback, minted host-side during activation and carried on a collected
 *  registration. The port's `invoke` resolves it back into the resident guest; the domain treats it as opaque
 *  (never forges or inspects it — the membrane principle). */
export type PluginHandlerRef = Branded<"PluginHandlerRef">;

/** A tool the guest registered via `host.tools.register` — collected at activation. `parameters` is the
 *  guest-supplied raw JSON Schema (lifted host-side at registration); `name` is the guest-local name the
 *  host namespaces to `plugin_<slug'>_<name>` before registering into the ONE tool-use registry. */
export interface PluginToolRegistration {
  readonly name: string;
  readonly description: string;
  readonly parameters: Record<string, unknown>;
  readonly handler: PluginHandlerRef;
}

/** THE ONE MINT of a plugin tool's MODEL-VISIBLE wire name, `plugin_<slug'>_<name>` (`slug'` = the install
 *  slug with `-` → `_`, because the OpenAI/MCP function-name charset has no hyphen).
 *
 *  WHY IT IS A FUNCTION AND NOT A TEMPLATE LITERAL AT THE REGISTRAR (U3): two call sites now need the same
 *  answer — `entry/compose` mints it when it registers the guest's tool, and `plugin.listSurfaces` derives it
 *  so a `tool-card` surface can be MATCHED to a persisted `ToolCallRecord.name` on the client. A second
 *  spelling of the rule would silently unmatch every card the day either changed. It lives in `contracts`
 *  because both callers are above it and the format is part of what a plugin author is promised.
 *
 *  The client never derives this: it consumes the projected name (the slug is not part of the surface wire
 *  shape, and a client-side re-spelling would be a third home). What the client DOES take from here is
 *  {@link PLUGIN_TOOL_NAME_PREFIX} — the namespace the first-party `pluginToolRenderer` claims — so the prefix
 *  it matches on and the prefix this mint emits are the same string by construction. */
export const PLUGIN_TOOL_NAME_PREFIX = "plugin_";

export function pluginToolWireName(slug: string, name: string): string {
  return `${PLUGIN_TOOL_NAME_PREFIX}${slug.replaceAll("-", "_")}_${name}`;
}

/** A D50 prompt transform the guest registered via `host.transforms.register` — collected at
 *  activation. Occupies the plugin band (order 1000+, assigned by activation order). */
export interface PluginTransformRegistration {
  readonly name: string;
  readonly point: PromptTransformPoint;
  readonly handler: PluginHandlerRef;
}

/** An event subscription the guest registered via `host.events.on` — the type is the SAME closed
 *  Tier-1 trigger taxonomy the automation watcher reads (plugins get no private event vocabulary). */
export interface PluginEventSubscription {
  readonly type: ChatTriggerType | DomainTriggerType;
  readonly handler: PluginHandlerRef;
}

/** A UI surface the guest registered via `host.ui.register` — collected at activation (plugin-ui-plane #679
 *  U1, seam 4). Unlike tools/transforms/events, a surface needs NO external registrar: it is READ directly off
 *  the resident instance by `plugin.listSurfaces`, and its `onAction` handler is re-entered by
 *  `plugin.invokeUiAction` through the port's `invoke`. `spec` is the guest-supplied declarative node tree
 *  (zod-validated host-side at collection — an invalid spec is a REGISTRATION refusal, the surface absent, never
 *  activation-fatal); `onAction` is the opaque handler ref the action round-trip re-invokes (absent = a
 *  display-only surface with no actions). `anchor`/`tier`/`spec` are the U0 vocabulary (`ui.ts`). */
export type PluginSurfaceRegistration = PluginSurfaceRegistrationMeta & {
  readonly onAction?: PluginHandlerRef;
};

/** A COMMAND the guest registered via `host.ui.registerCommand` — collected at activation (plugin-ui-plane #679
 *  U5, §4.5). Like a surface it needs NO external registrar: it is read directly off the resident instance by
 *  `plugin.listCommands` (which the `/plugin` dispatcher and the Plugins chrome menu both fan off) and re-entered
 *  by `plugin.invokeUiCommand` through the port's `invoke`. `onRun` is REQUIRED — unlike a surface, a command
 *  with nothing to run is not a display-only affordance, it is a dead menu row. */
export type PluginCommandRegistration = PluginCommandRegistrationMeta & {
  readonly onRun: PluginHandlerRef;
};

/** A resident guest instance's collected registrations — what `main.js` registered at activation. The
 *  concrete runtime carries the guest handles + log ring internally (opaque to the domain, read via the port);
 *  the domain reads only these registration records to hand to the registrar ops (tools/transforms/events) or,
 *  for `surfaces`/`commands`, to project directly to the client + re-enter on an action. */
export interface PluginInstance {
  readonly tools: readonly PluginToolRegistration[];
  readonly transforms: readonly PluginTransformRegistration[];
  readonly events: readonly PluginEventSubscription[];
  readonly surfaces: readonly PluginSurfaceRegistration[];
  readonly commands: readonly PluginCommandRegistration[];
}
