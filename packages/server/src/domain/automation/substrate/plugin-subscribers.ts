// domain/automation/substrate/plugin-subscribers — the plugin `events.on` fan-out (plugin-design/04 §P4; the
// automation-design 01 §2 TriggerFact is the delivered shape). A plugin's `events.on` handler is a NON-RULE
// consumer of the SAME resolved `TriggerFact` the rule dispatch consumes. The membrane host (infra/plugin-host,
// injected UP at compose) registers a subscriber into this in-process registry; the watcher front door
// (`substrate/handle-event`) fans every resolved fact to the matching, AUTHORIZED subscribers.
//
// THREE load-bearing gates, ALL fail-closed (this delivers to UNTRUSTED guests):
//   (a) CASCADE-DEPTH — the SAME guard the rule dispatch runs (`AUTOMATION_DEPTH_HARD_CAP`, homed in @orb/contracts/chat):
//       nothing delivers at depth ≥ cap (a plugin cannot launder an event→turn→event loop past the ceiling),
//       and a depth ≥ 1 automation-initiated fact delivers ONLY to a subscriber that opted in
//       (`matchAutomationEvents`, mirroring the rule column). ONE guard, two consumers.
//   (b) VISIBILITY — a plugin installed by user X receives a fact ONLY for a chat/resource X can SEE
//       (`canInstallerSeeFact`: present chat membership; owned character/asset for chat-less domain facts).
//       A PUSH delivery carries no admitted opaque handle, so the fan-out itself is the caller-gate
//       (INFO-5 / the injected-op-caller-gate class) — checked BEFORE `deliver`.
//   (c) DECLARED-MATCH — only the trigger types the plugin DECLARED (its `events.on` registrations) deliver.
// SELF-SAFE: a throwing guest `deliver` is caught + logged — it never breaks the fan-out loop or the bus.

import { AUTOMATION_DEPTH_HARD_CAP } from "@orb/contracts/chat";
import type { Db } from "@orb/db";
import { getLog } from "#foundation/observability";
import type { ResolvedTrigger } from "../contract/ops";
import type { PluginSubscriberRegistry, PluginTriggerSubscriber } from "../contract/plugin-subscribers";
import { canInstallerSeeFact } from "../persistence/canon-reads";

/** Build the in-process subscriber registry (`ASSUMES(single-replica)`). One instance is created at compose,
 *  injected into `AutomationContext` (read by the fan-out) and handed to the plugin-host wiring (`register` is
 *  the seam `events.on` closes over). */
export function createPluginSubscriberRegistry(): PluginSubscriberRegistry {
  const subscribers = new Set<PluginTriggerSubscriber>();
  return {
    register: (subscriber): (() => void) => {
      subscribers.add(subscriber);
      return (): void => void subscribers.delete(subscriber);
    },
    hasSubscriberFor: (type): boolean => {
      for (const s of subscribers) {
        if ((s.declaredEvents as ReadonlySet<string>).has(type)) {
          return true;
        }
      }
      return false;
    },
    list: (): readonly PluginTriggerSubscriber[] => [...subscribers],
  };
}

/** Deliver one subscriber's fact behind the VISIBILITY gate — self-safe (a throwing guest `deliver` is
 *  isolated). `canInstallerSeeFact` is fail-closed on `false` OR a throwing read (a raced delete / a bad id). */
async function deliverIfVisible(db: Db, sub: PluginTriggerSubscriber, resolved: ResolvedTrigger): Promise<void> {
  let visible: boolean;
  try {
    visible = await canInstallerSeeFact(db, sub.installer, resolved.fact);
  } catch {
    visible = false;
  }
  if (!visible) {
    return;
  }
  try {
    sub.deliver(resolved.fact, resolved.automationDepth);
  } catch (err) {
    getLog().warn({ err: err instanceof Error ? err.message : String(err), type: resolved.fact.type }, "plugin subscriber deliver threw (isolated)");
  }
}

/** Whether a subscriber passes the cheap, I/O-free gates (declared-match + cascade opt-in) — the filter run
 *  BEFORE the per-subscriber visibility read. */
function passesCheapGates(sub: PluginTriggerSubscriber, resolved: ResolvedTrigger): boolean {
  // (c) DECLARED-MATCH — only the trigger types this plugin subscribed to (a non-taxonomy type never matches).
  if (!(sub.declaredEvents as ReadonlySet<string>).has(resolved.fact.type)) {
    return false;
  }
  // (a) CASCADE OPT-IN — a depth ≥ 1 automation-initiated fact reaches a plugin ONLY if it opted in
  // (default-suppressed, exactly like an un-opted rule).
  return !(resolved.automationDepth >= 1 && !sub.matchAutomationEvents);
}

/** Fan a resolved trigger to every matching, authorized plugin subscriber. Awaited by `handle-event` (itself
 *  fire-and-forget off the bus). A no-op when no subscriber matches. Subscribers are independent, so the
 *  visibility reads + deliveries run in parallel (no shared env, unlike rule dispatch's sequential arms). */
export async function fanOutToPluginSubscribers(
  deps: { readonly db: Db; readonly registry: PluginSubscriberRegistry },
  resolved: ResolvedTrigger,
): Promise<void> {
  // (a) HARD CAP — nothing reaches a guest at/above the cascade ceiling, opt-in or not. Cheap, fact-wide.
  if (resolved.automationDepth >= AUTOMATION_DEPTH_HARD_CAP) {
    return;
  }
  const matched = deps.registry.list().filter((sub) => passesCheapGates(sub, resolved));
  await Promise.all(matched.map((sub) => deliverIfVisible(deps.db, sub, resolved)));
}
