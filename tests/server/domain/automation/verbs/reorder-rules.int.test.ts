// verb: reorderRules — total position rewrite (host-only); listRules reads position order.

import { DomainOperationError } from "@orb/kit/errors";
import type { AutomationRuleId } from "@orb/kit/ids";
import { describe } from "vitest";
import { expect, test } from "../../../../support/fixtures.ts";
import { MSG_COMMITTED, principal, ruleFixture, SET_VAR } from "../_support.ts";

test("reorderRules rewrites position as a total order, and announces once", async () => {
  const { host, chatId, svc, events } = await ruleFixture();
  const a = await svc.createRule({ principal: principal(host), chatId, name: "a", trigger: MSG_COMMITTED, actions: [SET_VAR] });
  const b = await svc.createRule({ principal: principal(host), chatId, name: "b", trigger: MSG_COMMITTED, actions: [SET_VAR] });
  const c = await svc.createRule({ principal: principal(host), chatId, name: "c", trigger: MSG_COMMITTED, actions: [SET_VAR] });
  await svc.reorderRules({ principal: principal(host), chatId, orderedIds: [c.id, a.id, b.id] });
  const listed = await svc.listRules({ principal: principal(host), chatId });
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
    const a = await fx.svc.createRule({ principal: principal(fx.host), chatId: fx.chatId, name: "a", trigger: MSG_COMMITTED, actions: [SET_VAR] });
    const b = await fx.svc.createRule({ principal: principal(fx.host), chatId: fx.chatId, name: "b", trigger: MSG_COMMITTED, actions: [SET_VAR] });
    const c = await fx.svc.createRule({ principal: principal(fx.host), chatId: fx.chatId, name: "c", trigger: MSG_COMMITTED, actions: [SET_VAR] });
    return { fx, a: a.id, b: b.id, c: c.id };
  }

  test("a PARTIAL list is refused, and the stored order is untouched", async () => {
    const { fx, a, b } = await threeRules();
    expect(await refusalCode(fx.svc.reorderRules({ principal: principal(fx.host), chatId: fx.chatId, orderedIds: [b, a] }))).toBe(
      "automation_reorder_incomplete",
    );
    const listed = await fx.svc.listRules({ principal: principal(fx.host), chatId: fx.chatId });
    // The refusal happens BEFORE the batch: names and positions are exactly as created.
    expect(listed.map((r) => r.name)).toEqual(["a", "b", "c"]);
    expect(listed.map((r) => r.position)).toEqual([0, 1, 2]);
  });

  test("a DUPLICATE id is refused", async () => {
    const { fx, a, b } = await threeRules();
    expect(await refusalCode(fx.svc.reorderRules({ principal: principal(fx.host), chatId: fx.chatId, orderedIds: [a, b, a] }))).toBe(
      "automation_reorder_duplicate",
    );
  });

  test("a FOREIGN rule id is refused — and the refusal names no id (a guessed id must not become an existence oracle)", async () => {
    const { fx, a, b } = await threeRules();
    const other = await ruleFixture();
    const stranger = await other.svc.createRule({
      principal: principal(other.host),
      chatId: other.chatId,
      name: "stranger",
      trigger: MSG_COMMITTED,
      actions: [SET_VAR],
    });
    expect(await refusalCode(fx.svc.reorderRules({ principal: principal(fx.host), chatId: fx.chatId, orderedIds: [a, b, stranger.id] }))).toBe(
      "automation_reorder_foreign",
    );
    // The refusal text names no id.
    await expect(fx.svc.reorderRules({ principal: principal(fx.host), chatId: fx.chatId, orderedIds: [a, b, stranger.id] })).rejects.toThrow(
      /may only list this chat's own rules/,
    );
  });

  test("the COMPLETE permutation still applies (the gate refuses malformed input, not the feature)", async () => {
    const { fx, a, b, c } = await threeRules();
    await fx.svc.reorderRules({ principal: principal(fx.host), chatId: fx.chatId, orderedIds: [c, b, a] });
    const listed = await fx.svc.listRules({ principal: principal(fx.host), chatId: fx.chatId });
    expect(listed.map((r) => r.name)).toEqual(["c", "b", "a"]);
  });

  test("an EMPTY list is admitted for a chat with no rules (the trivially total order)", async () => {
    const fx = await ruleFixture();
    await expect(fx.svc.reorderRules({ principal: principal(fx.host), chatId: fx.chatId, orderedIds: [] })).resolves.toBeUndefined();
  });
});
