// domain/automation/substrate/handle-event — the watcher front door. SUBSTRATE mediates
// the verbs↔subsystem seam (the engine is a named subsystem verbs can't reach directly). The watcher subsystem
// stays dumb and hands every bus event here; this does the cheap in-process pre-check (skip a chat with no
// enabled rule / a domain event with no enabled domain rule — no DB touch), resolves the taxonomy fact ONCE,
// loads the matched enabled rules (one indexed read), and runs the dispatch sequence. SELF-SAFE: the whole
// body is caught + logged, so it NEVER throws into the fire-and-forget bus loop (the buddy `react()` rule). A
// rule that disables itself (corrupt blob / error ceiling) reloads the enabled index so the pre-check stays
// accurate.
//
// SERIALIZED PER SCOPE at this door (`createHandleEvent`): same-chat events queue behind each other instead of
// racing, unrelated chats stay parallel. Process-local by construction — see the export's own comment for the
// key and `substrate/serial-lanes.ts` for what a lane does and does not promise.

import type { AutomationTrigger, AutomationTriggerBus } from "@orb/contracts/automation";
import { triggerBusOf } from "@orb/contracts/automation";
import type { ChatBusEvent } from "@orb/contracts/chat";
import type { DomainEvent } from "@orb/contracts/events";
import type { ChatId } from "@orb/kit/ids";
import { getLog } from "#foundation/observability";
import type { AutomationContext, AutomationService } from "../contract/service.ts";
import { runDispatch } from "../engine/dispatch.ts";
import { loadEnabledChatRules, loadEnabledDomainRules } from "../persistence/rules.ts";
import { holdsChatHostAuthority } from "./authority.ts";
import { resolveTrigger } from "./fact-resolver.ts";
import { fanOutToPluginSubscribers } from "./plugin-subscribers.ts";
import { runInLane } from "./serial-lanes.ts";

type BusEvent = ChatBusEvent | DomainEvent;

/** The cheap in-process gate — whether ANY enabled RULE could match this event without a DB
 *  read. The plugin fan-out has its own (also in-process) interest pre-check (`hasSubscriberFor`).
 *
 *  A `null` bus is an event on NEITHER trigger tuple, and `false` is then a FACT rather than an optimisation:
 *  `automation_rules.trigger_type` is bound to those tuples by a db CHECK, so no stored rule can name it. */
function rulesInterested(ctx: AutomationContext, bus: AutomationTriggerBus | null, chatId: ChatId | null): boolean {
  if (bus === null) {
    return false;
  }
  if (bus === "domain") {
    return ctx.enabled.hasDomainRules();
  }
  return chatId !== null && ctx.enabled.has(chatId);
}

/** #1431 — the STALE-INDEX retry. Both in-process indexes latch stale when a post-mutation refresh failed
 *  (the write committed, the snapshot did not follow); this is the "mandatory rebuild" that clears it. The
 *  watcher front door is the right place for it because it is the ONE path every bus event takes, so a stale
 *  latch survives at most one event — no timer, no process handle, and no clock this domain does not inject.
 *  A retry that fails again simply re-latches; the enabled index keeps failing OPEN in the meantime. */
async function healStaleIndexes(ctx: AutomationContext): Promise<void> {
  const pending: Promise<void>[] = [];
  if (ctx.enabled.isStale()) {
    pending.push(ctx.enabled.refresh());
  }
  if (ctx.transforms.isStale()) {
    pending.push(ctx.transforms.refresh());
  }
  await Promise.all(pending);
}

/** Load the enabled rules matching this event's trigger — domain rules span chats, chat rules are chat-scoped. */
function loadMatchedRules(
  ctx: AutomationContext,
  bus: AutomationTriggerBus,
  chatId: ChatId | null,
  triggerType: AutomationTrigger["type"],
): ReturnType<typeof loadEnabledDomainRules> {
  if (bus === "domain") {
    return loadEnabledDomainRules(ctx.db, triggerType);
  }
  if (chatId === null) {
    return Promise.resolve([]);
  }
  return loadEnabledChatRules(ctx.db, chatId, triggerType);
}

/** The resolve → fan-out + dispatch core (throws propagate to the self-safe wrapper). The resolved fact feeds
 *  TWO independent consumers: the rule dispatch AND the plugin `events.on` fan-out.
 *  Either alone is enough to resolve the fact — a chat with no rules but a plugin subscriber still delivers,
 *  and vice versa. When NEITHER is interested the event is dropped before any DB read (the pre-check no-op). */
/** RULED (§8, VOID-ALL on host handoff) — "authority died, its pending asks die with it; a re-fire under the
 *  new host mints fresh". This is where that ruling meets the tree.
 *
 *  THE EDGE IT RIDES: `chatUpdated`. `acceptHostHandoff` (chat's roster verb) emits it after the atomic role
 *  swap, and the automation domain has no other sight of a handoff — there is no `hostChanged` member, and
 *  inventing one on the FROZEN chat bus to serve this sweep would be a bus edit for an in-RAM map. So the
 *  sweep is stated as what it actually checks: on any chat-row change, RE-PROVE each pending ask's author
 *  still holds host, and drop the ones that fail. A handoff is the case that fails; a title edit costs one
 *  role read per pending ask and voids nothing.
 *
 *  It runs BEFORE the enabled-rule pre-check on purpose: a pending ask outlives its rule's enablement (a
 *  host can disable the rule and the ask is voided by that verb, but the reverse — a chat whose last rule was
 *  disabled while an ask was live — must still sweep). The cost when nothing is pending is ONE Map-key scan
 *  (`countForChat`), which is why the guard is that and not a db read. */
async function voidAsksOnLostAuthority(ctx: AutomationContext, chatId: ChatId): Promise<void> {
  if (ctx.suggestions.countForChat(chatId) === 0) {
    return;
  }
  const pending = ctx.suggestions.listForChat(chatId, ctx.now());
  // `actorUserId` is the rule AUTHOR or the plugin INSTALLER — one field, because the sweep asks the same
  // question of both: does the identity this ask would EXECUTE AS still hold host here? A plugin's card dies
  // on a handoff exactly as a rule's does (owner ruling 2026-08-24: fail-closed, no re-mint, no transfer).
  const held = await Promise.all(pending.map((ask) => holdsChatHostAuthority(ctx, chatId, ask.actorUserId)));
  pending.forEach((ask, i) => {
    if (held[i] !== true) {
      ctx.suggestions.drop(ask.id, ctx.now());
    }
  });
}

async function handle(ctx: AutomationContext, event: BusEvent): Promise<void> {
  await healStaleIndexes(ctx);
  // WHICH BUS, by TUPLE MEMBERSHIP (#1433) — `triggerBusOf` is the contracts home the db's bus↔type CHECK is
  // generated from. It replaced a `event.type.includes(".")` punctuation test here, which was a claim about
  // today's NAMES rather than about the taxonomy: a domain event without a dot would have taken the chat
  // pre-check and never dispatched, and a chat event with one would have gone looking for domain rules.
  const bus = triggerBusOf(event.type);
  const chatId: ChatId | null = "chatId" in event ? event.chatId : null;
  if (event.type === "chatUpdated" && chatId !== null) {
    await voidAsksOnLostAuthority(ctx, chatId);
  }
  const wantRules = rulesInterested(ctx, bus, chatId);
  const wantPlugins = ctx.pluginSubscribers.hasSubscriberFor(event.type);
  if (!(wantRules || wantPlugins)) {
    return;
  }
  const resolved = await resolveTrigger(ctx.ops, event);
  if (resolved === null) {
    return; // non-taxonomy event.
  }
  if (wantPlugins) {
    // The plugin fan-out runs its OWN three gates (depth / visibility / declared-match) — leak-free by
    // construction, and it never touches the rule dispatch's state.
    await fanOutToPluginSubscribers(
      {
        db: ctx.db,
        registry: ctx.pluginSubscribers,
        resolveViewerVisibility: ctx.ops.chat.resolveViewerVisibility,
        // The D16 anchor resolver for a fact that REFERENCES canon without carrying it (#1428) — the same op
        // the message-shaped resolve already uses, so the gate adds no seam and no second canon reader.
        getMessageFact: ctx.ops.chat.getMessageFact,
      },
      resolved,
    );
  }
  if (!wantRules || bus === null) {
    return;
  }
  const rules = await loadMatchedRules(ctx, bus, chatId, event.type as AutomationTrigger["type"]);
  if (rules.length === 0) {
    return;
  }
  const summary = await runDispatch(ctx, rules, resolved);
  if (summary.anyDisabled) {
    await ctx.enabled.reload();
  }
}

/** THE SERIALIZATION KEY — one lane per CHAT, and ONE lane for the whole domain bus.
 *
 *  A chat's key is obvious: the state two same-chat events contend over (the chat variable plane, the rules'
 *  `last_fired_at`/error ledger, the rate window) is chat-scoped, and two different rooms share none of it.
 *
 *  THE DOMAIN BUS GETS A SINGLE LANE, deliberately, and NOT one per subject id. The domain bus is a global
 *  firehose whose matched rules span EVERY owner (`loadEnabledDomainRules`), and what those rules contend
 *  over is their AUTHOR's own variable plane — which is not knowable here, before the rule read. Keying by
 *  `characterId`/`assetId`/… would look like scope and buy nothing: two events about different subjects still
 *  drive the same owner-global rule through the same read-modify-write. The cost is head-of-line latency on a
 *  low-frequency bus (card/persona/book/asset writes), which is the same trade the per-chat lane makes. */
function laneKeyFor(event: BusEvent): string {
  const chatId = "chatId" in event ? event.chatId : null;
  return chatId === null ? "automation:domain" : `automation:chat:${chatId}`;
}

/** The front door, and the ONE place the ordering promise is kept.
 *
 *  EVERY entry lands here — both watcher taps AND the D81 `chatOpened` tap, which the composition root feeds
 *  directly and which therefore never passes through `watcher/start-automation-watcher.ts`. That is why the
 *  queue is here and not in the watcher: a watcher-side queue would leave a whole trigger unserialized.
 *
 *  Dispatch is written as if order were semantics (arms mutate a shared env; `runDispatch` recurses rather
 *  than loops; clock/callback presets count beats), but each event arrived DETACHED, so that promise held
 *  inside one event and nowhere between two: two same-chat events read one variable snapshot, computed one
 *  increment, and wrote one value. Serializing here keeps the whole resolve → fan-out → dispatch sequence
 *  indivisible per key. It is PROCESS-LOCAL (`substrate/serial-lanes.ts`) — a second app process would still
 *  interleave, which is the separately-filed process-locality row, not something an in-RAM queue can claim.
 *
 *  Still self-safe and still fire-and-forget for the caller: the lane never surfaces a throw (the catch is
 *  INSIDE the queued job, so a failing event neither escapes nor blocks its successor). */
export function createHandleEvent(ctx: AutomationContext): AutomationService["handleEvent"] {
  return (event: BusEvent): Promise<void> =>
    runInLane(laneKeyFor(event), async (): Promise<void> => {
      try {
        await handle(ctx, event);
      } catch (err) {
        getLog().warn({ err: err instanceof Error ? err.message : String(err), type: event.type }, "automation handleEvent failed (isolated)");
      }
    });
}
