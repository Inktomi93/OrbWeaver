// domain/automation/contract/plugin-subscribers — the plugin `events.on` fan-out SEAM types.
// Homed in its OWN contract file (not `ops.ts`) so the membrane-host wiring seam is disjoint from the
// injected cross-feature op bundle. The IMPLEMENTATION (registry + fan-out with the three gates) is
// `substrate/plugin-subscribers`; this is the type-only contract the compose root + the membrane host share.

import type { AutomationTrigger, TriggerFact } from "@orb/contracts/automation";
import type { UserId } from "@orb/kit/ids";

/** A registered plugin event subscriber — a NON-RULE consumer of the SAME resolved `TriggerFact` the rule
 *  dispatch consumes. The membrane host (`infra/plugin-host`, injected UP at compose — infra never imports a
 *  domain) builds ONE per plugin INSTANCE (aggregating the guest's `events.on(type,…)` calls) and registers it
 *  via `PluginSubscriberRegistry.register`; the watcher fan-out delivers matching, AUTHORIZED facts to
 *  `deliver`. The three delivery gates live in `substrate/plugin-subscribers`, ALL fail-closed (this delivers
 *  to UNTRUSTED guests). */
export interface PluginTriggerSubscriber {
  /** The INSTALLING user — the VISIBILITY principal. A fact delivers only for a chat/resource this user can
   *  SEE (present chat membership; owned character/asset for chat-less domain facts). A push delivery carries
   *  no admitted opaque handle, so the fan-out itself is the caller-gate (INFO-5 / injected-op-caller-gate). */
  readonly installer: UserId;
  /** The trigger types this plugin DECLARED (its `events.on(type,…)` registrations) — only these deliver
   *  (the declared-match gate). A plugin gets no private event vocabulary — the SAME closed taxonomy. */
  readonly declaredEvents: ReadonlySet<AutomationTrigger["type"]>;
  /** Cascade opt-in — mirrors the rule's `matchAutomationEvents` column so ONE depth guard serves both
   *  `false` ⇒ only human-plane (depth 0) facts reach this plugin; a depth ≥ 1 cascade fact
   *  is suppressed. The HARD depth cap (`AUTOMATION_DEPTH_HARD_CAP`) applies regardless of this opt-in. */
  readonly matchAutomationEvents: boolean;
  /** Deliver one matched, authorized fact into the guest, tagged with the fact's resolved cascade depth (the
   *  depth of the turn that triggered it — the plugin host folds `depth` onto the event handler's
   *  `InvocationChat.automationDepth` so a `chat.requestTurn` from the handler stamps `depth + 1`, closing the
   *  loop-prevention belt across the realm boundary). Fire-and-forget: the fan-out never awaits guest work and
   *  swallows a throw (self-safe — a hostile/broken guest never breaks the fan-out or the bus loop). */
  readonly deliver: (fact: TriggerFact, automationDepth: number) => void;
}

/** The in-process registry the membrane host registers plugin subscribers into. `ASSUMES(single-replica)`
 *  (the enabled-index / chat replay-ring annotation) — a per-process registration set. Created ONCE at compose,
 *  injected into `AutomationContext` (the fan-out reads it) and handed to the plugin-host wiring (`register`
 *  is the seam `events.on` closes over). */
export interface PluginSubscriberRegistry {
  /** Register a subscriber; returns an IDEMPOTENT unregister the membrane calls on disable/uninstall. */
  readonly register: (subscriber: PluginTriggerSubscriber) => () => void;
  /** Whether ANY registered subscriber declared `type` — the watcher's cheap pre-check (resolve no fact when
   *  neither a rule nor a plugin wants the event; preserves the "zero reads when unwatched" contract). */
  readonly hasSubscriberFor: (type: string) => boolean;
  /** Snapshot the current subscribers (the fan-out iterates this once per resolved event). */
  readonly list: () => readonly PluginTriggerSubscriber[];
}
