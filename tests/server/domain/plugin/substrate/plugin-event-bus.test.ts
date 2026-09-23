// The PRIVATE plugin-event bus — the forgery wall, red where the wall is the point.
// This suite pins the three walls the design names as absolute:
//   1. CROSS-USER ISOLATION — an emit for installer A never reaches installer B's subscriber, even on an
//      identically-named channel.
//   2. NO TRIGGERFACT / NO DOMAIN BUS — the delivered payload is exactly `{name, data}` (the guest's own inert
//      data), never a trigger fact; and the bus has no domain/chat-bus sink at all (proven structurally — the
//      ONLY observable effect of an emit is the `invoke` of a resident sibling handler).
//   3. NAMESPACING — an emit on `(slug, name)` reaches only subscribers of that exact channel, never a
//      different name or a different emitter slug.
// Plus the fan-out DoS bound (the per-emit payload cap) and the deactivate-sweep (unregister stops delivery).

import type { InvocationChat, PluginHandlerRef, PluginInvokeArgs } from "@orb/contracts/plugin";
import { PLUGIN_PUBSUB_PAYLOAD_MAX_BYTES } from "@orb/contracts/plugin";
import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { PluginInvokeHandler } from "@orb/server/domain/plugin";
import { createPluginEventBus } from "@orb/server/domain/plugin";
import { expect, test } from "../../../../support/fixtures.ts";

const A = castId<UserId>("user_installer_a000000000000");
const B = castId<UserId>("user_installer_b000000000000");
const H1 = "plugin-handler-1" as PluginHandlerRef;
const H2 = "plugin-handler-2" as PluginHandlerRef;

/** A recording `invoke`: captures every delivery (handler, the JSON payload, the chat scope) synchronously — the
 *  bus calls it inside `superviseDetached`, which invokes the fn immediately, so a delivery is observable right
 *  after `emit`. Returns a settled string so nothing is left pending. */
function recordingInvoke(): {
  invoke: PluginInvokeHandler;
  calls: { handler: PluginHandlerRef; argsJson: PluginInvokeArgs; chat: InvocationChat | null }[];
} {
  const calls: { handler: PluginHandlerRef; argsJson: PluginInvokeArgs; chat: InvocationChat | null }[] = [];
  const invoke: PluginInvokeHandler = (handler, argsJson, chat) => {
    calls.push({ handler, argsJson, chat });
    return Promise.resolve("");
  };
  return { calls, invoke };
}

test("an emit delivers `{name, data}` (NOT a TriggerFact) to a subscriber of the exact channel, with NO chat scope", () => {
  const bus = createPluginEventBus();
  const rec = recordingInvoke();
  bus.register({ installer: A, subscriberSlug: "listener", subscriptions: [{ emitterSlug: "scraper", name: "found", handler: H1 }], invoke: rec.invoke });

  bus.emit({ installer: A, emitterSlug: "scraper", name: "found", data: { url: "x", count: 3 } });

  expect(rec.calls).toHaveLength(1);
  const call = rec.calls[0];
  if (call === undefined) {
    throw new Error("expected one delivery");
  }
  expect(call.handler).toBe(H1);
  // The payload is the plugin's OWN inert data — a plain `{name, data}`, never a trigger fact (no `type`, no
  // `chatId`, no `automationDepth`, nothing the automation fan-out could consume).
  expect(JSON.parse(String(call.argsJson))).toEqual({ name: "found", data: { url: "x", count: 3 } });
  // NO chat scope — a private event is not a room write; the handler runs chat-less.
  expect(call.chat).toBeNull();
});

test("CROSS-USER ISOLATION — installer A's emit NEVER reaches installer B's subscriber on the same channel", () => {
  const bus = createPluginEventBus();
  const recA = recordingInvoke();
  const recB = recordingInvoke();
  // Both installers have a plugin `scraper` emitting `found`, and a listener subscribed to it — identical
  // coordinates, DIFFERENT users.
  bus.register({ installer: A, subscriberSlug: "listener", subscriptions: [{ emitterSlug: "scraper", name: "found", handler: H1 }], invoke: recA.invoke });
  bus.register({ installer: B, subscriberSlug: "listener", subscriptions: [{ emitterSlug: "scraper", name: "found", handler: H2 }], invoke: recB.invoke });

  bus.emit({ installer: A, emitterSlug: "scraper", name: "found", data: { secret: "A-only" } });

  expect(recA.calls).toHaveLength(1);
  // THE WALL: B's identically-named channel is a DIFFERENT key (keyed by installer), so B is never invoked.
  expect(recB.calls).toHaveLength(0);
});

test("NAMESPACING — an emit reaches only its exact `(emitterSlug, name)` channel, never a sibling name or slug", () => {
  const bus = createPluginEventBus();
  const rec = recordingInvoke();
  bus.register({
    installer: A,
    subscriberSlug: "listener",
    subscriptions: [
      { emitterSlug: "scraper", name: "found", handler: H1 },
      { emitterSlug: "scraper", name: "done", handler: H2 }, // same emitter, different name
      { emitterSlug: "other", name: "found", handler: H2 }, // different emitter, same name
    ],
    invoke: rec.invoke,
  });

  bus.emit({ installer: A, emitterSlug: "scraper", name: "found", data: {} });

  // Only the exact `(scraper, found)` subscriber fires — not `(scraper, done)`, not `(other, found)`.
  expect(rec.calls.map((c) => c.handler)).toEqual([H1]);
});

test("the per-emit payload cap bounds the fan-out — an over-cap emit THROWS before any delivery", () => {
  const bus = createPluginEventBus();
  const rec = recordingInvoke();
  bus.register({ installer: A, subscriberSlug: "listener", subscriptions: [{ emitterSlug: "scraper", name: "found", handler: H1 }], invoke: rec.invoke });

  const huge = "x".repeat(PLUGIN_PUBSUB_PAYLOAD_MAX_BYTES + 1);
  expect(() => bus.emit({ installer: A, emitterSlug: "scraper", name: "found", data: { huge } })).toThrow(/payload exceeds/u);
  // Refused ENTIRELY — no subscriber saw the over-cap payload.
  expect(rec.calls).toHaveLength(0);
});

test("unregister (the deactivate sweep) stops delivery — a disabled plugin's subscription vanishes", () => {
  const bus = createPluginEventBus();
  const rec = recordingInvoke();
  const handle = bus.register({
    installer: A,
    subscriberSlug: "listener",
    subscriptions: [{ emitterSlug: "scraper", name: "found", handler: H1 }],
    invoke: rec.invoke,
  });

  bus.emit({ installer: A, emitterSlug: "scraper", name: "found", data: {} });
  expect(rec.calls).toHaveLength(1);

  handle.unregister();
  bus.emit({ installer: A, emitterSlug: "scraper", name: "found", data: {} });
  // No new delivery after unregister.
  expect(rec.calls).toHaveLength(1);
});

test("an emit with no subscribers is silent (a bogus emitter slug never fires), never an error", () => {
  const bus = createPluginEventBus();
  expect(() => bus.emit({ installer: A, emitterSlug: "nobody-listens", name: "x", data: {} })).not.toThrow();
});
