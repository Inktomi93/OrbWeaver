// domain/plugin/substrate/plugin-event-bus — the PRIVATE plugin-event plane. An
// INSTALLER-SCOPED resident pub-sub: a plugin `host.pubsub.emit(name, data)` publishes on the channel
// `plugin:<emitter-slug>:<name>`, and every SAME-installer plugin that `host.pubsub.on(emitterSlug, name, …)`'d
// that exact channel receives `{name, data}`. The `PluginMacroRegistry`/surface-state precedent: ONE per
// process, minted at compose, `ASSUMES(single-replica)`, respawn wipes (durable state is the plugin's own
// `storage.kv` job, never this).
//
// THIS FILE IS THE FORGERY WALL, and the wall is STRUCTURAL, not a check that could be forgotten:
//   1. CROSS-USER ISOLATION — the channel key is `${installer}:${emitterSlug}:${name}`, so an emit for installer
//      A can only ever look up A's subscribers. There is no code path from A's emit to B's set.
//   2. NO DOMAIN/CHAT BUS — this registry has NO bus sink of any kind (it imports no `publishAutomationEvent`,
//      no user bus, nothing). The ONLY thing an emit does is `invoke` resident sibling handlers. A plugin
//      literally cannot reach a domain event from here (§5.24 — a plugin-emitted domain event would be a forged
//      fact; this plane is a closed, plugin-authored vocabulary that never touches the closed domain one).
//   3. NO TRIGGERFACT — the delivered payload is `JSON.stringify({name, data})`, a plain object. It carries no
//      trigger `type`, no cascade depth, no `chatId` — nothing the automation fan-out could consume. Automation
//      reach is a FUTURE explicit `pluginEvent` trigger member, and it is NOT this plane.
//
// Bounds (§5a "its own caps/budgets under the existing FIFO"): the per-emit `data` is capped
// (`PLUGIN_PUBSUB_PAYLOAD_MAX_BYTES`) so the fan-out cost is bounded (one emit is re-delivered to each
// subscriber), and the number of subscriptions per plugin is capped at COLLECTION (the membrane). Delivery is
// fire-and-forget under each subscriber's own invocation budget (the FIFO + CPU guard) — one plugin's slow
// handler cannot block the emitter or a sibling.

import { PLUGIN_PUBSUB_PAYLOAD_MAX_BYTES } from "@orb/contracts/plugin";
import type { UserId } from "@orb/kit/ids";
import { superviseDetached } from "#foundation/observability";
import type { PluginEventBus, PluginRegistrationHandle } from "../contract/ops.ts";

/** One resident subscriber on a channel: the delivering plugin's slug (for the deactivate sweep) + the closure
 *  that re-enters its guest handler with the JSON payload, under that plugin's own invocation budget. */
interface Subscriber {
  readonly subscriberSlug: string;
  readonly deliver: (payloadJson: string) => void;
}

/** The channel key — `${installer}:${emitterSlug}:${name}`. Colon-separated and unambiguous: a UserId is a
 *  TypeID (colon-free), and both slug and name are validated to colon-free grammars (`SLUG_RE` / the pubsub name
 *  RE) at the membrane, so no two distinct channels can alias. Keying on the INSTALLER is the cross-user wall. */
function channelKey(installer: UserId, emitterSlug: string, name: string): string {
  return `${installer}:${emitterSlug}:${name}`;
}

/** Mint the process-wide private plugin-event bus. */
export function createPluginEventBus(): PluginEventBus {
  const channels = new Map<string, Set<Subscriber>>();
  return {
    register: ({ installer, subscriberSlug, subscriptions, invoke }): PluginRegistrationHandle => {
      // One Subscriber per collected subscription, added to its channel's set. A plugin listening to
      // `(emitterSlug, name)` joins the channel `installer:emitterSlug:name`; if that emitter is not installed (or
      // never emits) the channel simply never fires — a bogus emitterSlug costs one idle set entry, nothing more.
      const added: { readonly key: string; readonly entry: Subscriber }[] = [];
      for (const sub of subscriptions) {
        const key = channelKey(installer, sub.emitterSlug, sub.name);
        const entry: Subscriber = {
          subscriberSlug,
          deliver: (payloadJson): void => {
            // Fire-and-forget under the subscriber's OWN invocation budget (the port's `invoke` runs the guest
            // handler under the FIFO + CPU guard). A throwing/slow handler is contained to that plugin's crash
            // policy and never blocks the emitter or a sibling.
            superviseDetached(`plugin-pubsub:${sub.emitterSlug}:${sub.name}`, "plugin.pubsub.deliver", { emitterSlug: sub.emitterSlug, name: sub.name }, () =>
              invoke(sub.handler, payloadJson, null),
            );
          },
        };
        const set = channels.get(key) ?? new Set<Subscriber>();
        set.add(entry);
        channels.set(key, set);
        added.push({ key, entry });
      }
      return {
        unregister: (): void => {
          for (const { key, entry } of added) {
            const set = channels.get(key);
            if (set === undefined) {
              continue;
            }
            set.delete(entry);
            if (set.size === 0) {
              channels.delete(key);
            }
          }
        },
      };
    },
    emit: ({ installer, emitterSlug, name, data }): void => {
      // THE PER-EMIT PAYLOAD CAP — enforced BEFORE any fan-out, so an over-cap emit is refused ENTIRELY (a
      // rejected guest promise upstream) rather than amplified across every subscriber. The membrane's inbound
      // arg cap already bounds the call, but a private-event plane's own bound is the fan-out DoS belt.
      const payloadJson = JSON.stringify({ name, data });
      if (Buffer.byteLength(payloadJson, "utf8") > PLUGIN_PUBSUB_PAYLOAD_MAX_BYTES) {
        throw new Error(`plugin host: pubsub.emit payload exceeds the ${PLUGIN_PUBSUB_PAYLOAD_MAX_BYTES}-byte cap`);
      }
      // The lookup is the WHOLE isolation story: an emit for `installer` resolves ONLY the channel keyed by that
      // installer, so a subscriber of another user's identically-named channel is a DIFFERENT key and is never
      // reached. A miss (no subscribers) is silence, not an error.
      const set = channels.get(channelKey(installer, emitterSlug, name));
      if (set === undefined) {
        return;
      }
      for (const subscriber of set) {
        subscriber.deliver(payloadJson);
      }
    },
  };
}

/** Build the `PluginHostOps["pubsub"]["emit"]` op over the shared bus (compose wires the store; homed here beside
 *  the factory, the surface-state-publisher precedent). A payload-cap throw in the sync `bus.emit` propagates when
 *  the closure is CALLED, and the membrane's async `pubsub.emit` impl catches it — so the guest sees the refusal
 *  as a rejected promise, matching every other membrane refusal, without this closure needing to be `async`. */
export function createPluginEventEmitter(
  bus: PluginEventBus,
): (req: { installerUserId: UserId; emitterSlug: string; name: string; data: Record<string, unknown> }) => Promise<void> {
  return ({ installerUserId, emitterSlug, name, data }): Promise<void> => {
    bus.emit({ installer: installerUserId, emitterSlug, name, data });
    return Promise.resolve();
  };
}
