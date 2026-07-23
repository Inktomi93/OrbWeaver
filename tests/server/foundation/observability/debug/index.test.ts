// foundation/observability/debug/routes — the /api/_debug/rpg/traces read surface (R-OBS). Registered only when
// an `rpgTrace` inspector is wired (tracing on); host-only behind the same debug gate; forwards the chatId /
// turnId / limit query filters to the recorder's `recent`. Exercised through a real Hono app + fetch.

import type { RpgTraceInspector } from "@orb/server/foundation/observability/debug";
import { registerDebugRoutes } from "@orb/server/foundation/observability/debug";
import { Hono } from "hono";
import { describe } from "vitest";
import { expect, test } from "../../../../support/fixtures";

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
});
