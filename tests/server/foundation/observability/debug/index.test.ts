// foundation/observability/debug/routes — the two INJECTED read surfaces (both structural-injection, because
// foundation may not import the tiers above it):
//   • /api/_debug/rpg/traces  (R-OBS) — registered only when an `rpgTrace` inspector is wired (tracing on);
//     forwards the chatId / turnId / limit query filters to the recorder's `recent`.
//   • /api/_debug/stream/sockets (SSE-1 §12) — the STARVATION REGRESSION PIN. "One socket per tab, and
//     opening a game chat adds ZERO" is a claim about a COUNT nothing outside the process can otherwise see;
//     this route is how an e2e/live check asserts it in one request.
// Both are host-only behind the same debug gate, and both are exercised through a real Hono app + fetch.

import type { ChatId, ChatTurnId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createRpgTraceRecorder } from "@orb/server/domain/rpg";
import type { RpgTraceInspector, SocketInspector } from "@orb/server/foundation/observability/debug";
import { registerDebugRoutes } from "@orb/server/foundation/observability/debug";
import { Hono } from "hono";
import { describe } from "vitest";
import { expect, test } from "../../../../support/fixtures.ts";

const TOKEN = "debug-secret-token";

/** A stub inspector that records the last filter it received and returns a fixed event list. */
function stubInspector(): { inspector: RpgTraceInspector; lastFilter: () => unknown } {
  let seen: unknown;
  return {
    inspector: {
      recent: (filter): readonly object[] => {
        seen = filter;
        return [{ phase: "tool", name: "roll_dice" }];
      },
    },
    lastFilter: () => seen,
  };
}

function appWith(inspector?: RpgTraceInspector): Hono {
  const app = new Hono();
  registerDebugRoutes(app, { auth: TOKEN, ...(inspector !== undefined ? { rpgTrace: inspector } : {}) });
  return app;
}

const authed = (path: string): Request => new Request(`http://x${path}`, { headers: { "x-debug-token": TOKEN } });

describe("/api/_debug/rpg/traces", () => {
  test("returns the recorder's recent events (host-only, behind the debug gate)", async () => {
    const { inspector } = stubInspector();
    const res = await appWith(inspector).fetch(authed("/api/_debug/rpg/traces"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { count: number; events: unknown[] };
    expect(body.count).toBe(1);
    expect(body.events[0]).toEqual({ phase: "tool", name: "roll_dice" });
  });

  test("forwards chatId + turnId + limit query filters to the recorder", async () => {
    const { inspector, lastFilter } = stubInspector();
    await appWith(inspector).fetch(authed("/api/_debug/rpg/traces?chatId=chat_x&turnId=chatturn_y&limit=5"));
    expect(lastFilter()).toEqual({ chatId: "chat_x", turnId: "chatturn_y", limit: 5 });
  });

  test("an unauthorized request is rejected by the gate (401), never reaching the recorder", async () => {
    const { inspector } = stubInspector();
    const res = await appWith(inspector).fetch(new Request("http://x/api/_debug/rpg/traces"));
    expect(res.status).toBe(401);
  });

  test("the route is absent when no inspector is wired (tracing off) — 404", async () => {
    const res = await appWith(undefined).fetch(authed("/api/_debug/rpg/traces"));
    expect(res.status).toBe(404);
  });

  test("the REAL recorder serves real events end to end — the shape a host actually reads", async () => {
    // Every case above drives a STUB, which proves the route and proves nothing about the thing behind it.
    // This one wires the actual ring (`domain/rpg/trace.ts`) exactly as `lifecycle.ts` does — including the
    // brand cast the entry seam applies to the raw query string — so the route's JSON is the recorder's own.
    // RPG-TRACE-DEAD was precisely a route with nothing behind it; that gap closes here.
    const recorder = createRpgTraceRecorder({ now: () => 1_700_000_000_000 });
    recorder.sink({ phase: "mount", chatId: castId<ChatId>("chat_live"), toolNames: ["update_scene"] });
    recorder.sink({
      phase: "tool",
      chatId: castId<ChatId>("chat_live"),
      turnId: castId<ChatTurnId>("chat_turn_live"),
      vehicle: "folded extraction",
      calls: [{ name: "update_scene", args: '{"weather":{"type":"indoors"}}', verdict: "dropped", issues: ["weather.type: Invalid option"] }],
    });

    const inspector: RpgTraceInspector = {
      recent: (filter): readonly object[] =>
        recorder.recent({
          ...(filter.chatId === undefined ? {} : { chatId: castId<ChatId>(filter.chatId) }),
          ...(filter.turnId === undefined ? {} : { turnId: castId<ChatTurnId>(filter.turnId) }),
          ...(filter.limit === undefined ? {} : { limit: filter.limit }),
        }),
    };

    const res = await appWith(inspector).fetch(authed("/api/_debug/rpg/traces?turnId=chat_turn_live"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { count: number; events: { seq: number; event: Record<string, unknown> }[] };
    // The turn filter excluded the id-less mount, and the surviving record carries the raw args + the verdict
    // — the two fields that turn "a tool was dropped" into "WHY it was dropped".
    expect(body.count).toBe(1);
    expect(body.events[0]?.event).toMatchObject({
      phase: "tool",
      calls: [{ name: "update_scene", verdict: "dropped", args: '{"weather":{"type":"indoors"}}' }],
    });
  });
});

describe("/api/_debug/stream/sockets — the one-socket-per-tab pin", () => {
  /** A stub counter that records the userId narrowing it was asked for. */
  function stubSockets(count: number): { inspector: SocketInspector; lastUserId: () => string | undefined } {
    let seen: string | undefined;
    return {
      inspector: {
        liveSocketCount: (userId): number => {
          seen = userId;
          return count;
        },
      },
      lastUserId: () => seen,
    };
  }

  function socketsApp(inspector?: SocketInspector): Hono {
    const app = new Hono();
    registerDebugRoutes(app, { auth: TOKEN, ...(inspector === undefined ? {} : { sockets: inspector }) });
    return app;
  }

  test("reports the live socket count for the whole process when no userId is given", async () => {
    const { inspector, lastUserId } = stubSockets(2);
    const res = await socketsApp(inspector).fetch(authed("/api/_debug/stream/sockets"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ liveSockets: 2 });
    expect(lastUserId()).toBeUndefined();
  });

  test("narrows to one principal with ?userId=", async () => {
    const { inspector, lastUserId } = stubSockets(1);
    await socketsApp(inspector).fetch(authed("/api/_debug/stream/sockets?userId=user_nate"));
    expect(lastUserId()).toBe("user_nate");
  });

  test("an unauthorized request is rejected by the gate (401), never reaching the registry", async () => {
    const { inspector, lastUserId } = stubSockets(3);
    const res = await socketsApp(inspector).fetch(new Request("http://x/api/_debug/stream/sockets"));
    expect(res.status).toBe(401);
    expect(lastUserId()).toBeUndefined();
  });

  test("the route is absent when no registry is wired — 404", async () => {
    const res = await socketsApp(undefined).fetch(authed("/api/_debug/stream/sockets"));
    expect(res.status).toBe(404);
  });
});
