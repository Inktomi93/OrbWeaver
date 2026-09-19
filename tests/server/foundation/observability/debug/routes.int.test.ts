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
import { BUG_REPORT_MAX_BODY_BYTES, registerDebugRoutes } from "@orb/server/foundation/observability/debug";
import { Hono } from "hono";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const TOKEN = "operator-token";
const UNAUTHORIZED = 401;
const OK = 200;
const NOT_FOUND = 404;
const BAD_REQUEST = 400;
const PAYLOAD_TOO_LARGE = 413;
const UNSUPPORTED_MEDIA_TYPE = 415;
/** An EMPTY note, so a request that reaches the handler dies at the SCHEMA (400) and writes no artifact —
 *  which is what lets the content-type belt's pins read a 415 as "refused before the parse". */
const EMPTY_NOTE_BODY = JSON.stringify({ note: "", windowMinutes: null, client: { ring: "x" } });

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

// THE ONE WRITE ON THIS SURFACE (#1473). `client` is deliberately `z.unknown()` — the page owns its own
// bundle shape — so the SCHEMA bounds nothing about its size, and `readJsonBody` calls `c.req.json()`
// BEFORE validation runs. Without a byte cap in front of the parse, a caller past the gate turns one POST
// into unbounded buffering, JSON parsing and (on a valid note) an unbounded artifact on disk. The sibling
// ingest routes all carry `bodyLimit`; this one did not.
describe("POST /api/_debug/bug-report — the body cap in front of the JSON parse", () => {
  function capApp(): Hono {
    const app = new Hono();
    registerDebugRoutes(app, { auth: { expectedToken: TOKEN } });
    return app;
  }

  async function post(app: Hono, body: string): Promise<Response> {
    return await app.request("/api/_debug/bug-report", {
      method: "POST",
      headers: { "content-type": "application/json", "x-debug-token": TOKEN },
      body,
    });
  }

  test("an over-cap body is refused with 413 BEFORE it is parsed", async () => {
    // An empty note, so that if the cap is missing the body still parses to a 400 and never writes a file —
    // the failure mode this pin distinguishes is "413 refused" vs "400 parsed the whole thing".
    const oversized = JSON.stringify({ note: "", windowMinutes: null, client: "x".repeat(BUG_REPORT_MAX_BODY_BYTES) });
    expect(oversized.length).toBeGreaterThan(BUG_REPORT_MAX_BODY_BYTES);
    expect((await post(capApp(), oversized)).status).toBe(PAYLOAD_TOO_LARGE);
  });

  // POSITIVE CONTROL — a cap that refused everything would pass the pin above. A real report's client bundle
  // is capped rings (128 flags, 64 bus events, …), so a legitimately sized capture must still reach the
  // handler: an empty note proves admission by failing the SCHEMA (400), writing nothing.
  test("a legitimately sized report still reaches the schema (400 from the note, not 413 from the cap)", async () => {
    const realistic = JSON.stringify({ note: "", windowMinutes: null, client: { rings: "y".repeat(64_000) } });
    expect((await post(capApp(), realistic)).status).toBe(BAD_REQUEST);
  });

  test("the cap does not open the gate — an un-credentialed over-cap POST is still refused as unauthorized", async () => {
    const oversized = JSON.stringify({ note: "", windowMinutes: null, client: "x".repeat(BUG_REPORT_MAX_BODY_BYTES) });
    const res = await capApp().request("/api/_debug/bug-report", { method: "POST", headers: { "content-type": "application/json" }, body: oversized });
    expect(res.status).toBe(UNAUTHORIZED);
  });
});

// THE CSRF CONTENT-TYPE BELT on the one WRITE this surface carries (#2376, the #300 class). The gate's
// admin-session arm admits AMBIENT credentials — a `via:"cookie"` session and, wherever `AUTH_FALLBACK=owner`
// is live (every dev stack, every single-user box), the loopback owner `fallback` arm — so a page in the
// owner's own browser can drive this POST cross-site IF the browser can be made to send it with no preflight.
// `c.req.json()` is `text()` + `JSON.parse` and reads NO content-type, so before this belt a CORS-SIMPLE
// `text/plain` POST carrying a JSON body reached the handler and wrote an artifact — the same door
// `entry/app.ts`'s `trpcJsonOnly` closed on the tRPC mount (spine invariant #9). The physics the belt rests
// on, stated so it can be re-checked: `application/json` is NOT a CORS-simple content-type and this app
// mounts no CORS middleware, so a cross-site page cannot make the browser send one.
//
// Every arm posts an EMPTY note, so the pre-belt outcome is a schema 400 (handler entered, body parsed, no
// artifact written) and the post-belt outcome is 415 (refused before the parse). The status is therefore a
// claim about WHERE the request died, not about the schema.
describe("POST /api/_debug/bug-report — the CSRF content-type belt (#2376)", () => {
  function beltApp(): Hono {
    const app = new Hono();
    registerDebugRoutes(app, { auth: { expectedToken: TOKEN } });
    return app;
  }

  async function postAs(contentType: string | undefined): Promise<Response> {
    return await beltApp().request("/api/_debug/bug-report", {
      method: "POST",
      headers: { ...(contentType === undefined ? {} : { "content-type": contentType }), "x-debug-token": TOKEN },
      body: EMPTY_NOTE_BODY,
    });
  }

  // The CORS-simple content-types — the complete set a cross-site page can send with no preflight.
  test.each([
    "text/plain",
    "text/plain;charset=UTF-8",
    "multipart/form-data; boundary=x",
    "application/x-www-form-urlencoded",
  ])("a CORS-simple %s POST is refused 415 before the JSON parse", async (contentType) => {
    expect((await postAs(contentType)).status).toBe(UNSUPPORTED_MEDIA_TYPE);
  });

  test("a POST with NO content-type is refused too (a body whose type nothing declared is not JSON)", async () => {
    expect((await postAs(undefined)).status).toBe(UNSUPPORTED_MEDIA_TYPE);
  });

  // POSITIVE CONTROLS — a belt that refused everything would pass every pin above. The real client sends a
  // bare `application/json`; a `; charset=utf-8` suffix is legal and must still pass (the prefix test), and
  // the match is case-insensitive because media types are.
  test.each([
    "application/json",
    "application/json; charset=utf-8",
    "APPLICATION/JSON",
  ])("%s still reaches the schema (400 from the empty note, not 415 from the belt)", async (contentType) => {
    expect((await postAs(contentType)).status).toBe(BAD_REQUEST);
  });

  test("the belt does not open the gate — an un-credentialed text/plain POST is still refused as unauthorized", async () => {
    const res = await beltApp().request("/api/_debug/bug-report", { method: "POST", headers: { "content-type": "text/plain" }, body: EMPTY_NOTE_BODY });
    expect(res.status).toBe(UNAUTHORIZED);
  });

  // The READ probes are untouched: a GET carries no content-type, and a cross-site page cannot read the
  // response anyway (no CORS grant). A belt that had leaked onto the gate middleware would red this.
  test("the belt is scoped to the POST — a GET probe with no content-type still serves", async () => {
    const res = await beltApp().request("/api/_debug/info", { headers: { "x-debug-token": TOKEN } });
    expect(res.status).toBe(OK);
  });
});
