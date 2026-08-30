// `/api/_debug/memory/recalls` — the memory-recall flight recorder's READ route (#250). Two pins that matter:
// it sits BEHIND the same two-tier gate as every other probe (an un-credentialed caller never reads a room's
// recall queries, which are RP-derived text), and it passes `chatId`/`limit` through to the injected ring.
//
// Registered over a FAKE inspector — the port is structural injection precisely so foundation never imports
// domain/chat; a test that reached for the real recorder would be testing the wrong seam.
//
// ALSO PINNED HERE (#412, same source file): the two wire probes publish the RECORDER'S OWN STATE as
// `enabled`, per arm. That field is what lets `wire-tap captures` exit 2 on an off recorder (apparatus
// absent) instead of printing a caveat and exiting clean on a zero it cannot interpret — so a pin that
// only checked `count` would leave the whole point of the change untested.

import { automationFires, automationRules, chats, users } from "@orb/db";
import type { AutomationFireId, AutomationRuleId, ChatId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { registerDebugRoutes } from "@orb/server/foundation/observability/debug";
import { Hono } from "hono";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const TOKEN = "operator-token";
const UNAUTHORIZED = 401;
const OK = 200;
const NOT_FOUND = 404;

/** The port's own filter shape — `chatId` BRANDED, because the entry seam applies the brand before the ring
 *  ever sees it (`lifecycle.ts`), and a bare `string` here would let a wrong-id call type-check. */
interface RecallFilter {
  readonly chatId?: ChatId;
  readonly limit?: number;
}

/** The recorded filters the route handed the ring — the passthrough proof. */
function makeApp(): { app: Hono; seen: RecallFilter[] } {
  const seen: RecallFilter[] = [];
  const app = new Hono();
  registerDebugRoutes(app, {
    auth: { expectedToken: TOKEN },
    memoryRecall: {
      recent: (filter: RecallFilter): readonly object[] => {
        seen.push(filter);
        return [{ seq: 1, at: 10, chatId: "chat_a", scopedCharacterId: "character_group", trace: { mode: "mixC", surfaced: 2 } }];
      },
    },
  });
  return { app, seen };
}

describe("/api/_debug/memory/recalls", () => {
  test("an un-credentialed caller is refused — a recall query is RP-derived text, not public", async () => {
    const { app, seen } = makeApp();
    const res = await app.request("/api/_debug/memory/recalls");
    expect(res.status).toBe(UNAUTHORIZED);
    // …and the ring was never even consulted.
    expect(seen).toEqual([]);
  });

  test("serves the ring with the operator token, and passes chatId + limit through to it", async () => {
    const { app, seen } = makeApp();
    const res = await app.request("/api/_debug/memory/recalls?chatId=chat_a&limit=5", { headers: { "x-debug-token": TOKEN } });
    expect(res.status).toBe(OK);
    expect(await res.json()).toMatchObject({ count: 1, recalls: [{ seq: 1, trace: { mode: "mixC", surfaced: 2 } }] });
    expect(seen).toEqual([{ chatId: castId<ChatId>("chat_a"), limit: 5 }]);
  });

  test("no chatId ⇒ the whole ring (the filter key is OMITTED, never a literal undefined)", async () => {
    const { app, seen } = makeApp();
    await app.request("/api/_debug/memory/recalls", { headers: { "x-debug-token": TOKEN } });
    expect(seen.at(0)).not.toHaveProperty("chatId");
  });

  test("the route does not exist when no recorder is injected (the rpgTrace contract)", async () => {
    const app = new Hono();
    registerDebugRoutes(app, { auth: { expectedToken: TOKEN } });
    const res = await app.request("/api/_debug/memory/recalls", { headers: { "x-debug-token": TOKEN } });
    expect(res.status).toBe(NOT_FOUND);
  });
});

describe("/api/_debug/wire — the recorder-state field (#412)", () => {
  /** The suite runs with `WIRE_CAPTURE` unset, so the env half of the gate is OFF. That is the arm that
   *  matters: it is the state a reader must be able to tell apart from a quiet-but-live recorder. */
  async function readWire(path: string, options: Parameters<typeof registerDebugRoutes>[1] = {}): Promise<unknown> {
    const app = new Hono();
    registerDebugRoutes(app, { auth: { expectedToken: TOKEN }, ...options });
    const res = await app.request(path, { headers: { "x-debug-token": TOKEN } });
    expect(res.status).toBe(OK);
    return await res.json();
  }

  test("captures reports enabled:false with the sink unwired — the empty read is about the RECORDER", async () => {
    expect(await readWire("/api/_debug/wire/captures")).toMatchObject({ enabled: false, count: 0, captures: [] });
  });

  test("captures reports enabled:true from the INJECTED compose decision, not a re-derivation of the env", async () => {
    // The force-flag arm: compose wired the sink although `WIRE_CAPTURE` is off. Without the injection this
    // route would report `false` while the ring was live — the exact lie the field exists to prevent.
    expect(await readWire("/api/_debug/wire/captures", { wireCaptureEnabled: () => true })).toMatchObject({ enabled: true });
  });

  test("outcomes reports the ENV self-gate, ignoring the injected request-sink decision (the gating asymmetry)", async () => {
    // `recordTurnOutcome` early-returns on `isWireCaptureEnabled()` alone, so a forced-on compose records
    // requests and NO outcomes. Publishing the injected flag here would tell a reader to trust an empty ring.
    expect(await readWire("/api/_debug/wire/outcomes", { wireCaptureEnabled: () => true })).toMatchObject({ enabled: false, count: 0 });
  });
});

describe("/api/_debug/automation/fires — the durable fire log behind the gate", () => {
  const Now = 1_700_000_000_000;

  /** A real db with one owner, two rooms, one rule each, and one terminal fire per room. */
  async function seededApp(): Promise<{ app: Hono; chatA: ChatId; chatB: ChatId }> {
    const db = await freshDb();
    const ownerId = castId<UserId>("user_fires_route");
    await db.insert(users).values({ id: ownerId, handle: castId<Handle>("user_fires_route") });
    const chatA = castId<ChatId>("chat_fires_route_a");
    const chatB = castId<ChatId>("chat_fires_route_b");
    await db.insert(chats).values([
      { id: chatA, title: "A", updatedAt: Now },
      { id: chatB, title: "B", updatedAt: Now },
    ]);
    const ruleA = castId<AutomationRuleId>("automation_rule_fires_route_a");
    const ruleB = castId<AutomationRuleId>("automation_rule_fires_route_b");
    const rule = (id: AutomationRuleId, chatId: ChatId): typeof automationRules.$inferInsert => ({
      id,
      ownerId,
      chatId,
      name: "r",
      position: 0,
      triggerBus: "chat",
      triggerType: "messageCommitted",
      actions: [{ type: "set_variable", scope: "chat", key: "k", op: "set", value: "v" }],
    });
    await db.insert(automationRules).values([rule(ruleA, chatA), rule(ruleB, chatB)]);
    await db.insert(automationFires).values([
      {
        id: castId<AutomationFireId>("automation_fire_route_a"),
        ruleId: ruleA,
        chatId: chatA,
        triggerType: "messageCommitted",
        outcome: "fired",
        detail: { arms: 1 },
        automationDepth: 0,
        firedAt: Now + 1,
      },
      {
        id: castId<AutomationFireId>("automation_fire_route_b"),
        ruleId: ruleB,
        chatId: chatB,
        triggerType: "messageCommitted",
        outcome: "predicate_false",
        detail: null,
        automationDepth: 0,
        firedAt: Now + 2,
      },
    ]);
    const app = new Hono();
    registerDebugRoutes(app, { auth: { expectedToken: TOKEN }, db });
    return { app, chatA, chatB };
  }

  test("an un-credentialed caller is refused — the fire log names rooms and rules across every owner", async () => {
    const { app } = await seededApp();
    expect((await app.request("/api/_debug/automation/fires")).status).toBe(UNAUTHORIZED);
  });

  test("serves the seeded fires newest-first with the operator token (the PLANTED rows are what comes back)", async () => {
    const { app, chatA, chatB } = await seededApp();
    const res = await app.request("/api/_debug/automation/fires", { headers: { "x-debug-token": TOKEN } });
    expect(res.status).toBe(OK);
    expect(await res.json()).toMatchObject({
      count: 2,
      fires: [
        { id: "automation_fire_route_b", chatId: chatB, outcome: "predicate_false", detail: null },
        { id: "automation_fire_route_a", chatId: chatA, outcome: "fired", detail: { arms: 1 } },
      ],
    });
  });

  test("?chatId= narrows to one room (and an unknown room is an honest zero)", async () => {
    const { app, chatA } = await seededApp();
    const res = await app.request(`/api/_debug/automation/fires?chatId=${chatA}`, { headers: { "x-debug-token": TOKEN } });
    expect(await res.json()).toMatchObject({ count: 1, fires: [{ id: "automation_fire_route_a" }] });
    const none = await app.request("/api/_debug/automation/fires?chatId=chat_nobody", { headers: { "x-debug-token": TOKEN } });
    expect(await none.json()).toMatchObject({ count: 0, fires: [] });
  });

  test("the route does not exist without a db (it rides the db arm)", async () => {
    const app = new Hono();
    registerDebugRoutes(app, { auth: { expectedToken: TOKEN } });
    expect((await app.request("/api/_debug/automation/fires", { headers: { "x-debug-token": TOKEN } })).status).toBe(NOT_FOUND);
  });
});
