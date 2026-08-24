// domain/automation/substrate/handle-event — the watcher front door. SUBSTRATE mediates
// the verbs↔subsystem seam (the engine is a named subsystem verbs can't reach directly). The watcher subsystem
// stays dumb and hands every bus event here; this does the cheap in-process pre-check (skip a chat with no
// enabled rule / a domain event with no enabled domain rule — no DB touch), resolves the taxonomy fact ONCE,
// loads the matched enabled rules (one indexed read), and runs the dispatch sequence. SELF-SAFE: the whole
// body is caught + logged, so it NEVER throws into the fire-and-forget bus loop (the buddy `react()` rule). A
// rule that disables itself (corrupt blob / error ceiling) reloads the enabled index so the pre-check stays
// accurate.

import type { AutomationTrigger } from "@orb/contracts/automation";
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

type BusEvent = ChatBusEvent | DomainEvent;

/** A domain-bus event's type is dot-namespaced (character.updated / crew.*); a ChatBusEvent is a bare word. */
function isDomainEvent(event: BusEvent): event is DomainEvent {
  return event.type.includes(".");
}

/** The cheap in-process gate — whether ANY enabled RULE could match this event without a DB
 *  read. The plugin fan-out has its own (also in-process) interest pre-check (`hasSubscriberFor`). */
function rulesInterested(ctx: AutomationContext, domain: boolean, chatId: ChatId | null): boolean {
  if (domain) {
    return ctx.enabled.hasDomainRules();
  }
  return chatId !== null && ctx.enabled.has(chatId);
}

/** Load the enabled rules matching this event's trigger — domain rules span chats, chat rules are chat-scoped. */
function loadMatchedRules(
  ctx: AutomationContext,
  domain: boolean,
  chatId: ChatId | null,
  triggerType: AutomationTrigger["type"],
): ReturnType<typeof loadEnabledDomainRules> {
  if (domain) {
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
  const held = await Promise.all(pending.map((ask) => holdsChatHostAuthority(ctx, chatId, ask.authorUserId)));
  pending.forEach((ask, i) => {
    if (held[i] !== true) {
      ctx.suggestions.drop(ask.id, ctx.now());
    }
  });
}

async function handle(ctx: AutomationContext, event: BusEvent): Promise<void> {
  const domain = isDomainEvent(event);
  const chatId: ChatId | null = "chatId" in event ? event.chatId : null;
  if (event.type === "chatUpdated" && chatId !== null) {
    await voidAsksOnLostAuthority(ctx, chatId);
  }
  const wantRules = rulesInterested(ctx, domain, chatId);
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
    await fanOutToPluginSubscribers({ db: ctx.db, registry: ctx.pluginSubscribers, resolveViewerVisibility: ctx.ops.chat.resolveViewerVisibility }, resolved);
  }
  if (!wantRules) {
    return;
  }
  const rules = await loadMatchedRules(ctx, domain, chatId, event.type as AutomationTrigger["type"]);
  if (rules.length === 0) {
    return;
  }
  const summary = await runDispatch(ctx, rules, resolved);
  if (summary.anyDisabled) {
    await ctx.enabled.reload();
  }
}

export function createHandleEvent(ctx: AutomationContext): AutomationService["handleEvent"] {
  return async (event: BusEvent): Promise<void> => {
    try {
      await handle(ctx, event);
    } catch (err) {
      getLog().warn({ err: err instanceof Error ? err.message : String(err), type: event.type }, "automation handleEvent failed (isolated)");
    }
  };
}
