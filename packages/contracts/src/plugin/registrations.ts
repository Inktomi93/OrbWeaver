// @orb/contracts/plugin/registrations — the infra↔domain WIRE shapes for a resident guest instance's collected
// registrations (03 §2). These cross the sealed `infra/plugin-host` → `domain/plugin` seam BOTH ways: the
// runtime PRODUCES them at activation (what `main.js` registered), the domain CONSUMES them (hands each to its
// registrar). A cross-tier shape has exactly ONE home BELOW server — contracts (the cake) — so infra can mint a
// real `PluginInstance` without importing a domain (plugin-no-ambient), and the domain reads the same shape.

import type { Branded } from "@orb/kit/ids";
import type { ChatTriggerType, DomainTriggerType } from "#automation";
import type { PromptTransformPoint } from "#chat";

/** An opaque ref to a guest-registered callback, minted host-side during activation and carried on a collected
 *  registration. The port's `invoke` resolves it back into the resident guest; the domain treats it as opaque
 *  (never forges or inspects it — the membrane principle). */
export type PluginHandlerRef = Branded<"PluginHandlerRef">;

/** A tool the guest registered via `host.tools.register` (03 §5) — collected at activation. `parameters` is the
 *  guest-supplied raw JSON Schema (lifted host-side at registration — PL-B); `name` is the guest-local name the
 *  host namespaces to `plugin_<slug'>_<name>` before registering into the ONE tool-use registry. */
export interface PluginToolRegistration {
  readonly name: string;
  readonly description: string;
  readonly parameters: Record<string, unknown>;
  readonly handler: PluginHandlerRef;
}

/** A D50 prompt transform the guest registered via `host.transforms.register` (03 §6) — collected at
 *  activation. Occupies the plugin band (order 1000+, assigned by activation order). */
export interface PluginTransformRegistration {
  readonly name: string;
  readonly point: PromptTransformPoint;
  readonly handler: PluginHandlerRef;
}

/** An event subscription the guest registered via `host.events.on` (03 §2) — the type is the SAME closed
 *  Tier-1 trigger taxonomy the automation watcher reads (plugins get no private event vocabulary). */
export interface PluginEventSubscription {
  readonly type: ChatTriggerType | DomainTriggerType;
  readonly handler: PluginHandlerRef;
}

/** A resident guest instance's collected registrations (03 §2) — what `main.js` registered at activation. The
 *  concrete runtime carries the guest handles + log ring internally (opaque to the domain, read via the port);
 *  the domain reads only these registration records to hand to the registrar ops. */
export interface PluginInstance {
  readonly tools: readonly PluginToolRegistration[];
  readonly transforms: readonly PluginTransformRegistration[];
  readonly events: readonly PluginEventSubscription[];
}
