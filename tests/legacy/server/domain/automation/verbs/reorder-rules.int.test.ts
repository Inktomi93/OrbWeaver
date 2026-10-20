// verb: reorderRules — total position rewrite (host-only); listRules reads position order.
// @subject packages/server/src/domain/automation/verbs/reorder-rules.ts

import { automationRules } from "@orb/db";
import { DomainOperationError } from "@orb/kit/errors";
import type { AutomationRuleId } from "@orb/kit/ids";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { freshHeldDb } from "@orb/testkit/node/db.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { createAutomationService } from "#server/domain/automation/index.ts";
import { FIXED_NOW_MS, MSG_COMMITTED, principal, ruleFixture, SET_VAR, seedUser } from "../_support.ts";

const REORDER_NOW = FIXED_NOW_MS + 1000;
/** The reorder's one SQL-time write (the position CASE rewrite), the only statement the race tests park. */
const REORDER_WRITE = /^update "automation_rules" set .*\bcase\b/isu;

test("global totality refuses duplicate, partial, foreign, nonexistent and empty orders without writes or events", async () => {
  const fx = await ruleFixture();
  const other = await seedUser(fx.db, "foreign-global-gate");
  const body = { chatId: null, trigger: { bus: "domain" as const, type: "character.updated" as const }, actions: [{ ...SET_VAR, scope: "global" as const }] };
  const a = await fx.svc.createRule({ timeZone: UTC_TIME_ZONE, ...body, principal: await principal(fx.db, fx.host), name: "a" });
  const b = await fx.svc.createRule({ timeZone: UTC_TIME_ZONE, ...body, principal: await principal(fx.db, fx.host), name: "b" });
  const foreign = await fx.svc.createRule({ timeZone: UTC_TIME_ZONE, ...body, principal: await principal(fx.db, other), name: "foreign" });
  const before = await fx.db.select().from(automationRules);
  const orders = [
    { ids: [a.id, a.id], code: "duplicate" },
    { ids: [a.id], code: "incomplete" },
    { ids: [a.id, foreign.id], code: "foreign" },
    { ids: [a.id, mintTypeId(ID_PREFIX.automationRule)], code: "foreign" },
    { ids: [], code: "incomplete" },
  ];
  for (const order of orders) {
    await expect(fx.svc.reorderRules({ principal: await principal(fx.db, fx.host), chatId: null, orderedIds: order.ids })).rejects.toMatchObject({
      code: `automation_reorder_${order.code}`,
    });
    expect(await fx.db.select().from(automationRules)).toEqual(before);
  }
  await fx.svc.reorderRules({ principal: await principal(fx.db, fx.host), chatId: null, orderedIds: [b.id, a.id] });
  expect((await fx.svc.listOwnerRules({ principal: await principal(fx.db, fx.host) })).map((rule) => [rule.id, rule.position])).toEqual([
    [b.id, 0],
    [a.id, 1],
  ]);
  expect(await fx.svc.listOwnerRules({ principal: await principal(fx.db, other) })).toEqual([foreign]);
  expect(fx.events).toEqual([]);
});

test("global exact-set reorder rejects delete-C/create-D after admission and never touches another owner's rows", async () => {
  const held = await freshHeldDb();
  const fx = await ruleFixture({}, held.db);
  const other = await seedUser(fx.db, "other-global-order");
  const body = { chatId: null, trigger: { bus: "domain" as const, type: "character.updated" as const }, actions: [{ ...SET_VAR, scope: "global" as const }] };
  const rules = await Promise.all(
    ["a", "b", "c"].map(async (name) => fx.svc.createRule({ timeZone: UTC_TIME_ZONE, ...body, principal: await principal(fx.db, fx.host), name })),
  );
  const foreign = await fx.svc.createRule({ timeZone: UTC_TIME_ZONE, ...body, principal: await principal(fx.db, other), name: "foreign marker" });
  const c = rules[2];
  if (c === undefined) {
    throw new Error("expected third rule");
  }
  const write = held.hold(REORDER_WRITE);
  let operation: Promise<string> | undefined;
  try {
    const svc = createAutomationService({ ...fx.ctx, now: () => REORDER_NOW });
    operation = svc.reorderRules({ principal: await principal(fx.db, fx.host), chatId: null, orderedIds: rules.toReversed().map((rule) => rule.id) }).then(
      () => "resolved",
      (error) => (error instanceof DomainOperationError ? error.code : String(error)),
    );
    await write.reached;
    write.disarm();
    await fx.svc.deleteRule({ principal: await principal(fx.db, fx.host), ruleId: c.id });
    await fx.svc.createRule({ timeZone: UTC_TIME_ZONE, ...body, principal: await principal(fx.db, fx.host), name: "d" });
    const before = await fx.db.select().from(automationRules);
    write.release();
    expect(await operation).toBe("automation_reorder_changed");
    expect(await fx.db.select().from(automationRules)).toEqual(before);
    expect(before.find((row) => row.id === foreign.id)?.position).toBe(0);
    expect(fx.events).toEqual([]);
    await expect(fx.svc.reorderRules({ principal: await principal(fx.db, fx.host), chatId: null, orderedIds: [foreign.id] })).rejects.toMatchObject({
      code: "automation_reorder_foreign",
    });
  } finally {
    write.release();
    await operation;
  }
});

for (const mutation of ["addition", "deletion", "replacement"] as const) {
  test(`SQL-time reorder refuses concurrent ${mutation} after its real admission read without touching current rows`, async () => {
    const held = await freshHeldDb();
    const fx = await ruleFixture({}, held.db);
    const rules = await Promise.all(
      ["a", "b", "c"].map(async (name) =>
        fx.svc.createRule({
          timeZone: UTC_TIME_ZONE,
          principal: await principal(fx.db, fx.host),
          chatId: fx.chatId,
          name,
          trigger: MSG_COMMITTED,
          actions: [SET_VAR],
        }),
      ),
    );
    const c = rules[2];
    expect(c).toBeDefined();
    if (c === undefined) {
      throw new Error("expected third rule fixture");
    }
    const write = held.hold(REORDER_WRITE);
    let settled: Promise<string> | undefined;
    try {
      const svc = createAutomationService({ ...fx.ctx, now: () => REORDER_NOW });
      settled = svc.reorderRules({ principal: await principal(fx.db, fx.host), chatId: fx.chatId, orderedIds: rules.toReversed().map((rule) => rule.id) }).then(
        () => "resolved",
        (error) => (error instanceof DomainOperationError ? error.code : String(error)),
      );
      await write.reached;
      write.disarm();
      if (mutation !== "addition") {
        await fx.svc.deleteRule({ principal: await principal(fx.db, fx.host), ruleId: c.id });
      }
      if (mutation !== "deletion") {
        await fx.svc.createRule({
          timeZone: UTC_TIME_ZONE,
          principal: await principal(fx.db, fx.host),
          chatId: fx.chatId,
          name: "d",
          trigger: MSG_COMMITTED,
          actions: [SET_VAR],
        });
      }
      const before = await fx.db.select().from(automationRules).where(eq(automationRules.chatId, fx.chatId));
      const notificationCount = fx.events.length;
      write.release();
      const outcome = await settled;
      const after = await fx.db.select().from(automationRules).where(eq(automationRules.chatId, fx.chatId));
      expect.soft(after).toEqual(before);
      expect.soft(fx.events).toHaveLength(notificationCount);
      expect(outcome).toBe("automation_reorder_changed");
    } finally {
      write.release();
      await settled;
    }
  });
}

test("reorderRules rewrites position as a total order, and announces once", async () => {
  const { host, chatId, svc, events, db } = await ruleFixture();
  const a = await svc.createRule({
    timeZone: UTC_TIME_ZONE,
    principal: await principal(db, host),
    chatId,
    name: "a",
    trigger: MSG_COMMITTED,
    actions: [SET_VAR],
  });
  const b = await svc.createRule({
    timeZone: UTC_TIME_ZONE,
    principal: await principal(db, host),
    chatId,
    name: "b",
    trigger: MSG_COMMITTED,
    actions: [SET_VAR],
  });
  const c = await svc.createRule({
    timeZone: UTC_TIME_ZONE,
    principal: await principal(db, host),
    chatId,
    name: "c",
    trigger: MSG_COMMITTED,
    actions: [SET_VAR],
  });
  await svc.reorderRules({ principal: await principal(db, host), chatId, orderedIds: [c.id, a.id, b.id] });
  const listed = await svc.listRules({ principal: await principal(db, host), chatId });
  expect(listed.map((r) => r.name)).toEqual(["c", "a", "b"]);
  expect(listed.map((r) => r.position)).toEqual([0, 1, 2]);
  // Three creates + ONE reorder — the reorder announces once for the whole total rewrite, not once per moved
  // row. Order IS semantics here (arms mutate the shared env in position order), so it is a real change.
  expect(events).toEqual([
    { type: "rulesChanged", chatId },
    { type: "rulesChanged", chatId },
    { type: "rulesChanged", chatId },
    { type: "rulesChanged", chatId },
  ]);
});

// #1429 — THE ORDER MUST BE TOTAL. `applyReorder` writes `position = array index`, so anything that is not a
// permutation of the chat's current rule set produces a broken order while reporting success: an omitted rule
// keeps a position that now collides, a duplicate is written twice, a foreign id consumes an index and touches
// no row. Order is SEMANTICS (arms mutate the shared variable env in position order), so the verb refuses.
describe("the total-order gate", () => {
  /** The typed refusal's machine CODE, or "resolved" when the call did not refuse at all.
   *
   *  Asserted as a CODE rather than by importing the error class, deliberately: the code is what the transport
   *  maps and what an editor surfaces, and asserting it keeps this pin runnable against a tree that does not
   *  have the class yet — which is what makes the red-first receipt a DEFECT proof ("it resolved") rather than
   *  a module that failed to load. */
  async function refusalCode(op: Promise<unknown>): Promise<string> {
    try {
      await op;
    } catch (err) {
      return err instanceof DomainOperationError ? err.code : `not-a-domain-error: ${String(err)}`;
    }
    return "resolved";
  }

  interface Three {
    readonly fx: Awaited<ReturnType<typeof ruleFixture>>;
    readonly a: AutomationRuleId;
    readonly b: AutomationRuleId;
    readonly c: AutomationRuleId;
  }

  async function threeRules(): Promise<Three> {
    const fx = await ruleFixture();
    const a = await fx.svc.createRule({
      timeZone: UTC_TIME_ZONE,
      principal: await principal(fx.db, fx.host),
      chatId: fx.chatId,
      name: "a",
      trigger: MSG_COMMITTED,
      actions: [SET_VAR],
    });
    const b = await fx.svc.createRule({
      timeZone: UTC_TIME_ZONE,
      principal: await principal(fx.db, fx.host),
      chatId: fx.chatId,
      name: "b",
      trigger: MSG_COMMITTED,
      actions: [SET_VAR],
    });
    const c = await fx.svc.createRule({
      timeZone: UTC_TIME_ZONE,
      principal: await principal(fx.db, fx.host),
      chatId: fx.chatId,
      name: "c",
      trigger: MSG_COMMITTED,
      actions: [SET_VAR],
    });
    return { fx, a: a.id, b: b.id, c: c.id };
  }

  test("a PARTIAL list is refused, and the stored order is untouched", async () => {
    const { fx, a, b } = await threeRules();
    expect(await refusalCode(fx.svc.reorderRules({ principal: await principal(fx.db, fx.host), chatId: fx.chatId, orderedIds: [b, a] }))).toBe(
      "automation_reorder_incomplete",
    );
    const listed = await fx.svc.listRules({ principal: await principal(fx.db, fx.host), chatId: fx.chatId });
    // The refusal happens BEFORE the batch: names and positions are exactly as created.
    expect(listed.map((r) => r.name)).toEqual(["a", "b", "c"]);
    expect(listed.map((r) => r.position)).toEqual([0, 1, 2]);
  });

  test("a DUPLICATE id is refused", async () => {
    const { fx, a, b } = await threeRules();
    expect(await refusalCode(fx.svc.reorderRules({ principal: await principal(fx.db, fx.host), chatId: fx.chatId, orderedIds: [a, b, a] }))).toBe(
      "automation_reorder_duplicate",
    );
  });

  test("a FOREIGN rule id is refused — and the refusal names no id (a guessed id must not become an existence oracle)", async () => {
    const { fx, a, b } = await threeRules();
    const other = await ruleFixture();
    const stranger = await other.svc.createRule({
      timeZone: UTC_TIME_ZONE,
      principal: await principal(other.db, other.host),
      chatId: other.chatId,
      name: "stranger",
      trigger: MSG_COMMITTED,
      actions: [SET_VAR],
    });
    expect(await refusalCode(fx.svc.reorderRules({ principal: await principal(fx.db, fx.host), chatId: fx.chatId, orderedIds: [a, b, stranger.id] }))).toBe(
      "automation_reorder_foreign",
    );
    // The refusal text names no id.
    await expect(fx.svc.reorderRules({ principal: await principal(fx.db, fx.host), chatId: fx.chatId, orderedIds: [a, b, stranger.id] })).rejects.toThrow(
      /may only list this chat's own rules/,
    );
  });

  test("the COMPLETE permutation still applies (the gate refuses malformed input, not the feature)", async () => {
    const { fx, a, b, c } = await threeRules();
    await fx.svc.reorderRules({ principal: await principal(fx.db, fx.host), chatId: fx.chatId, orderedIds: [c, b, a] });
    const listed = await fx.svc.listRules({ principal: await principal(fx.db, fx.host), chatId: fx.chatId });
    expect(listed.map((r) => r.name)).toEqual(["c", "b", "a"]);
  });

  test("an EMPTY list is admitted for a chat with no rules (the trivially total order)", async () => {
    const fx = await ruleFixture();
    await expect(fx.svc.reorderRules({ principal: await principal(fx.db, fx.host), chatId: fx.chatId, orderedIds: [] })).resolves.toBeUndefined();
  });
});
