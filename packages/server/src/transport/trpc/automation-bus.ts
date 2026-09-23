// The per-chat live fan-out the `automation` ROOM tails (the room source is
// `stream/sources/automation.ts` — since SSE-1 S4 there is no standalone subscription, only the ONE socket). The
// automation domain emits a bus event through the injected `notify` sink (`EmitAutomationEvent`); entry
// composes that sink onto `publishAutomationEvent` here, so a rule's `surface_quick_reply` arm (and the
// host-only fire/error/disable events) reach every subscriber to that chat's channel. TRANSIENT by design:
// unlike the notifications bus this half is the WHOLE story — there is no durable row, no resume cursor (the
// chips are ephemeral, 03 §1.4). Rides `defineBusChannel` keyed by chatId (the rpg/agents own-bus precedent —
// NOT the frozen chat bus, D50), with NO firehose opt-in (client-architecture-lockdown.md §13/§16 G10).
//
// ASSUMES(single-replica): module-scope emitter, per-process — the enabled-index / rpg-bus annotation. The
// VISIBILITY gate is NOT here: the room refuses at ATTACH and its pump resolves the caller's
// membership+authority FIRST (`resolveStreamAuthority` throws NOT_FOUND for a non-member) and filters
// host-only events per subscriber, so publishing to a chat's channel is safe — only a gated subscriber is
// ever attached to it.

import type { AutomationBusEvent } from "@orb/contracts/automation";
import type { ChatId } from "@orb/kit/ids";
import { defineBusChannel } from "./bus-channel.ts";

const channelFor = (chatId: ChatId): string => `automation:${chatId}`;

const bus = defineBusChannel<ChatId, AutomationBusEvent>(channelFor);

/** The automation domain's `notify` sink (`EmitAutomationEvent`) — fan one bus event to its chat's live
 *  channel. Wired onto `AutomationContext.notify` (and the arm executors' `notify`) at compose.
 *
 *  This is ALSO the frame-free emit seam the plugin `chat.quick_reply` capability rides
 *  (`surfaceQuickReply`): the `quickReplySurfaced` emit is NOT automation-rule-private — it needs only an
 *  `AutomationBusEvent`, no `DispatchFrame`. The plugin membrane sits BELOW transport (infra/domain), so the
 *  plugin lane injects a compose-built op that closes over THIS function (the `automationNotify` precedent),
 *  reaching the same per-chat channel every `automation` ROOM subscriber tails. The `quickReplySurfaced`
 *  event carries the `AutomationEmitSource` union (`kind:"rule"|"plugin"`) — a rule stamps `kind:"rule"`, the
 *  plugin op stamps `kind:"plugin"` with its `pluginId` (no synthetic rule id). */
export function publishAutomationEvent(event: AutomationBusEvent): void {
  bus.publish(event.chatId, event);
}

/** The `automation` room's live tail for a chat, torn down on `signal` abort. The room source filters the
 *  host-only events per subscriber (the `member` tier sees only `quickReplySurfaced`). */
export function subscribeAutomation(chatId: ChatId, signal: AbortSignal): AsyncIterable<AutomationBusEvent> {
  return bus.subscribe(chatId, signal);
}
