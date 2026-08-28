// @orb/contracts/plugin/registrations — the infra↔domain WIRE shapes for a resident guest instance's collected
// registrations. These cross the sealed `infra/plugin-host` → `domain/plugin` seam BOTH ways: the
// runtime PRODUCES them at activation (what `main.js` registered), the domain CONSUMES them (hands each to its
// registrar). A cross-tier shape has exactly ONE home BELOW server — contracts (the cake) — so infra can mint a
// real `PluginInstance` without importing a domain (plugin-no-ambient), and the domain reads the same shape.

import type { Branded } from "@orb/kit/ids";
import type { ChatTriggerType, DomainTriggerType } from "#automation";
import type { PromptTransformPoint } from "#chat";
import type { PluginSurfaceRegistrationMeta } from "./ui.ts";

/** An opaque ref to a guest-registered callback, minted host-side during activation and carried on a collected
 *  registration. The port's `invoke` resolves it back into the resident guest; the domain treats it as opaque
 *  (never forges or inspects it — the membrane principle). */
export type PluginHandlerRef = Branded<"PluginHandlerRef">;

/** The JSON payload one handler invocation carries into the guest — either a FIXED string, or a BUILDER the
 *  runtime calls with this invocation's opaque chat handle.
 *
 *  WHY THE BUILDER ARM EXISTS (row 777, and it is the only shape that works). A chat-scoped handler's argument
 *  object is supposed to carry `chat: ChatHandle | null` (`PluginHostV1["ui"]["register"]`'s `onAction`), and
 *  that handle is the per-invocation opaque token — which is MINTED INSIDE the runtime when the invocation's
 *  chat scope is set, i.e. strictly after the domain has finished building its arguments. A domain caller
 *  therefore cannot put the real handle in a string it hands down, and the two alternatives are both wrong: the
 *  token cannot be handed UP (it is a security token whose whole point is that only the guest and the membrane
 *  ever see it, and the membrane validates by identity), and passing `chat: null` into a room-scoped action
 *  would hand the guest a lie it has no way to detect.
 *
 *  So the caller passes a function of the handle and the runtime applies it at the one moment the handle
 *  exists. Every EXISTING caller keeps passing a plain string — the arm is additive, and a handler with no chat
 *  scope is called with `null`. */
export type PluginInvokeArgs = string | ((chatHandle: string | null) => string);

/** A tool the guest registered via `host.tools.register` — collected at activation. `parameters` is the
 *  guest-supplied raw JSON Schema (lifted host-side at registration); `name` is the guest-local name the
 *  host namespaces to `plugin_<slug'>_<name>` before registering into the ONE tool-use registry. */
export interface PluginToolRegistration {
  readonly name: string;
  readonly description: string;
  readonly parameters: Record<string, unknown>;
  readonly handler: PluginHandlerRef;
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

/** A resident guest instance's collected registrations — what `main.js` registered at activation. The
 *  concrete runtime carries the guest handles + log ring internally (opaque to the domain, read via the port);
 *  the domain reads only these registration records to hand to the registrar ops (tools/transforms/events) or,
 *  for `surfaces`, to project directly to the client + re-enter on an action. */
export interface PluginInstance {
  readonly tools: readonly PluginToolRegistration[];
  readonly transforms: readonly PluginTransformRegistration[];
  readonly events: readonly PluginEventSubscription[];
  readonly surfaces: readonly PluginSurfaceRegistration[];
}
