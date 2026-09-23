// domain/automation/substrate/plugin-subscribers — the plugin `events.on` fan-out (the
//  01 §2 TriggerFact is the delivered shape). A plugin's `events.on` handler is a NON-RULE
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
//       (`canInstallerSeeFact`: chat's `resolveViewerVisibility` op for a chat fact — membership AND the D16
//       history floor; owned character/asset for chat-less domain facts). A PUSH delivery carries no admitted
//       opaque handle, so the fan-out itself is the caller-gate (INFO-5 / the injected-op-caller-gate class) —
//       checked BEFORE `deliver`.
//   (c) DECLARED-MATCH — only the trigger types the plugin DECLARED (its `events.on` registrations) deliver.
// SELF-SAFE: a throwing guest `deliver` is caught + logged — it never breaks the fan-out loop or the bus.

import type { TriggerFact } from "@orb/contracts/automation";
import { AUTOMATION_DEPTH_HARD_CAP } from "@orb/contracts/chat";
import type { Db } from "@orb/db";
import { stripHiddenSpans } from "@orb/kit/content";
import type { ChatId, MessageId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { getLog } from "#foundation/observability";
import type { AutomationOps, ResolvedTrigger } from "../contract/ops.ts";
import type { PluginSubscriberRegistry, PluginTriggerSubscriber } from "../contract/plugin-subscribers.ts";
import { ownsFactSubject } from "./fact-scope.ts";

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

/** The deps the visibility gate needs: the db (the chat-less ownership arms), chat's injected
 *  `resolveViewerVisibility` op (the chat arm), and `getMessageFact` — the ONE way this domain resolves a
 *  message id to its canon `seq` for a fact that REFERENCES a row without carrying it (see
 *  {@link isBelowHistoryFloor}). Threaded from `AutomationContext` at the fan-out's front door; both chat ops
 *  are already wired at compose, so the gate borrows rather than growing a new seam. */
interface VisibilityDeps {
  readonly db: Db;
  readonly resolveViewerVisibility: AutomationOps["chat"]["resolveViewerVisibility"];
  readonly getMessageFact: AutomationOps["chat"]["getMessageFact"];
}

/**
 * The plugin fan-out's leak-free VISIBILITY gate: may `installer` SEE this fact?
 *
 * CHAT-SCOPED fact → chat's `resolveViewerVisibility` op, which answers membership AND the D16 history floor
 * as ONE value. Membership alone is NOT the verdict: this gate used to be `loadCallerRole(...) !== undefined`,
 * and that is exactly how a `from-join`-clamped member's plugin received the CONTENT of a pre-join canon row
 * (a host edit / re-voice of a pre-join slot resolves the selected variant's text into the fact) that every
 * direct read path withholds from that same member. So a fact ANCHORED to canon — carrying it (`fact.message`)
 * or merely referencing it (`fact.reaction.messageId`, #1428) — delivers only when its anchor seq is at or
 * above the caller's own floor. {@link isBelowHistoryFloor} owns that verdict.
 *
 * ACTIVITY-PLANE facts are NOT clamped, by the same ruling that lets id-only bus events ride through the
 * per-event clamp: a chat-scoped fact with NO canon anchor (chatScope / turn / worldInfo / persona — ids,
 * counts, lifecycle) carries no canon bytes, and the ids it names resolve only through equally-clamped
 * reads. Withholding them would blind a clamped member's plugin to its own post-join room activity.
 *
 * A chat-less DOMAIN fact (all four members — character/asset/persona/world-info) requires OWNERSHIP of the
 * referenced resource. Any other chat-less fact fails CLOSED.
 */
/** The per-installer visibility verdict for one fact: denied (no delivery), or visible WITH the §3.6 / D106
 *  hidden-content read decision (`readsHidden` false ⇒ strip `<lie>`/`<ofilter>` from the delivered body). A
 *  chat-less fact carries no canon body, so its `readsHidden` is `true` (nothing to strip — the gate is ownership). */
type FactVisibility = { readonly visible: false } | { readonly visible: true; readonly readsHidden: boolean };

/**
 * Does the caller's D16 floor withhold this chat fact? The chat-side twin is
 * `chat/substrate/auth::isBelowHistoryFloor`, and the rule is the same: the verdict is keyed on WHICH CARRIER
 * anchors the fact to canon, never on its trigger type.
 *
 * TWO CARRIERS TODAY, and a fact that references canon WITHOUT carrying it is still anchored (#1428). The
 * `message` shape carries its own `seq`. The `reaction` shape (`reactionsChanged`) carries `messageId` but
 * NEVER a `message`, so the old `fact.message !== undefined` guard short-circuited and the gate fell back to
 * membership alone — more permissive than chat's OWN read of that plane, whose window is floored
 * (`chat/persistence/reactions::listChatReactions`: "a pill row naming who laughed at a message the reader is
 * not allowed to see is the same leak one seq lower"). Its anchor is RESOLVED through the injected
 * `getMessageFact`, fail-CLOSED on a miss (a raced delete ⇒ withhold).
 *
 * A fact with NO canon carrier at all (chatScope / turn / worldInfo / persona — ids, counts, lifecycle) is
 * room-activity metadata and rides through unclamped, per D106 and for the same reason the id-only bus events
 * do: withholding them would blind a clamped member's plugin to its own post-join room.
 *
 * AN UNCLAMPED INSTALLER PAYS NOTHING: `floorSeq <= 0` (a host, a `full` member, any born-here seat) decides
 * on the first compare, before any read — the same short-circuit the per-event bus clamp makes.
 */
async function isBelowHistoryFloor(deps: VisibilityDeps, fact: TriggerFact, floorSeq: number): Promise<boolean> {
  if (floorSeq <= 0) {
    return false;
  }
  if (fact.message !== undefined) {
    return fact.message.seq < floorSeq;
  }
  if (fact.reaction !== undefined && fact.chatId !== null) {
    const anchor = await deps.getMessageFact(castId<ChatId>(fact.chatId), castId<MessageId>(fact.reaction.messageId));
    return anchor === null || anchor.seq < floorSeq;
  }
  return false;
}

async function resolveFactVisibility(deps: VisibilityDeps, installer: UserId, fact: TriggerFact): Promise<FactVisibility> {
  if (fact.chatId !== null) {
    // Ids arrive UNBRANDED (the TriggerFact wire shape) and are re-branded only to query — a re-read gate,
    // never a trust transfer. A garbage/forged chatId resolves to no membership ⇒ `null` ⇒ no delivery.
    const visibility = await deps.resolveViewerVisibility(castId<ChatId>(fact.chatId), installer);
    if (visibility === null) {
      return { visible: false };
    }
    if (await isBelowHistoryFloor(deps, fact, visibility.historyFloorSeq)) {
      return { visible: false };
    }
    // Membership + floor pass. The §3.6 hidden verdict rides the SAME visibility answer (chat's ONE home) —
    // a member's delivered `message.content` is hidden-stripped below; a host reads verbatim (reveal plane).
    return { visible: true, readsHidden: visibility.readsHidden };
  }
  // The chat-less DOMAIN arm — OWNERSHIP of the row the fact names, resolved through the ONE home
  // (`substrate/fact-scope.ts`) the owner-global RULE gate also reads, so the two consumers of that question
  // cannot answer it differently. `readsHidden: true` because a chat-less fact carries no canon body to
  // strip. A fact naming no owned row is fail-CLOSED inside `ownsFactSubject`.
  return { visible: await ownsFactSubject(deps.db, fact, installer), readsHidden: true };
}

/** §3.6 / D106: project the fact's message body for THIS installer — a member's delivered `message.content` is
 *  hidden-stripped so a non-host member's plugin never receives a lie's truth; a host reads verbatim. Identity
 *  when the fact carries no message or nothing is hidden. */
function projectFactForInstaller(fact: TriggerFact, readsHidden: boolean): TriggerFact {
  if (readsHidden || fact.message === undefined) {
    return fact;
  }
  const stripped = stripHiddenSpans(fact.message.content);
  return stripped.hadHidden ? { ...fact, message: { ...fact.message, content: stripped.content } } : fact;
}

/** Deliver one subscriber's fact behind the VISIBILITY gate — self-safe (a throwing guest `deliver` is
 *  isolated). `resolveFactVisibility` is fail-closed on `denied` OR a throwing read (a raced delete / a bad id). */
async function deliverIfVisible(deps: VisibilityDeps, sub: PluginTriggerSubscriber, resolved: ResolvedTrigger): Promise<void> {
  let verdict: FactVisibility;
  // @orb-waive caught-failure-ownership(catch): FAIL-CLOSED — a raced delete / a bad id / any
  // throwing visibility read collapses to `visible: false`, the same posture `resolveFactVisibility`'s own
  // fail-closed contract states (header, `ownsFactSubject` is fail-CLOSED). Never a leaked fact. Ends if the
  // gate needs to tell a raced-delete failure apart from a real denial.
  try {
    verdict = await resolveFactVisibility(deps, sub.installer, resolved.fact);
  } catch {
    verdict = { visible: false };
  }
  if (!verdict.visible) {
    return;
  }
  const fact = projectFactForInstaller(resolved.fact, verdict.readsHidden);
  try {
    sub.deliver(fact, resolved.automationDepth);
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
  deps: VisibilityDeps & { readonly registry: PluginSubscriberRegistry },
  resolved: ResolvedTrigger,
): Promise<void> {
  // (a) HARD CAP — nothing reaches a guest at/above the cascade ceiling, opt-in or not. Cheap, fact-wide.
  if (resolved.automationDepth >= AUTOMATION_DEPTH_HARD_CAP) {
    return;
  }
  const matched = deps.registry.list().filter((sub) => passesCheapGates(sub, resolved));
  await Promise.all(matched.map((sub) => deliverIfVisible(deps, sub, resolved)));
}
