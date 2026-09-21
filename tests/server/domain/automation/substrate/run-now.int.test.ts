// substrate/run-now — the verbs↔ENGINE mediator for a manual run. Pins directly (the verb-level suite pins the
// GATE LINE; this pins the mediator's own two claims): the run starts at MANUAL_DEPTH 0 with a SYNTHESIZED
// fact (no real event), and a `transform_draft` rule (which registers into the pipeline and never dispatches
// a terminal) resolves to `null` rather than a fabricated fire.

import { automationFires, automationRules } from "@orb/db";
import type { AutomationRuleId, MessageId } from "@orb/kit/ids";
import { mintTypeId } from "@orb/kit/ids";
import { createEnabledRuleIndex } from "@orb/server/domain/automation";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import type { RuleRow } from "../../../../../packages/server/src/domain/automation/contract/ops.ts";
import type { AutomationContext } from "../../../../../packages/server/src/domain/automation/contract/service.ts";
import { listFiresForRule } from "../../../../../packages/server/src/domain/automation/persistence/fires.ts";
import { insertRule, selectRuleRow, setRuleEnabledRow } from "../../../../../packages/server/src/domain/automation/persistence/rules.ts";
import { createAutomationService } from "../../../../../packages/server/src/domain/automation/service.ts";
import { dispatchRuleNow } from "../../../../../packages/server/src/domain/automation/substrate/run-now.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { seedMessage } from "../../chat/_support.ts";
import { FIXED_NOW_MS, readFailingDb, ruleFixture } from "../_support.ts";

async function seedEnabledRule(
  fixture: Awaited<ReturnType<typeof ruleFixture>>,
  actions: Parameters<typeof insertRule>[1]["actions"],
): Promise<AutomationRuleId> {
  const id = mintTypeId("automation_rule");
  await insertRule(fixture.db, {
    id,
    ownerId: fixture.host,
    chatId: fixture.chatId,
    name: "r",
    description: null,
    triggerBus: "chat",
    triggerType: "messageCommitted",
    predicateCel: null,
    actions,
    rulePresetId: null,
    rulePresetKnobs: null,
    matchAutomationEvents: false,
    cooldownSeconds: 0,
    maxFiresPerHour: 30,
    createdAt: FIXED_NOW_MS,
    updatedAt: FIXED_NOW_MS,
  });
  await setRuleEnabledRow(fixture.db, id, true, FIXED_NOW_MS);
  const rule = await selectRuleRow(fixture.db, id);
  if (rule === undefined) {
    throw new Error("fixture bug: just-inserted rule not found");
  }
  return rule.id;
}

/** Overwrite a rule's stored arms with a blob no arm schema can parse — the A5 corrupt-blob state, which
 *  dispatch answers by DISABLING the rule (`engine/dispatch.ts`). Written through the raw table because no
 *  verb will store one: that is the whole point of the mint validation. */
async function corruptActions(fixture: Awaited<ReturnType<typeof ruleFixture>>, ruleId: AutomationRuleId): Promise<void> {
  await fixture.db
    .update(automationRules)
    // @orb-waive no-test-fabrication(never): the A5 CORRUPT-BLOB state is by definition a value no schema admits — a typed factory Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    // could not produce it, and it is exactly the invalid input the disable-on-corrupt path exists to answer.
    .set({ actions: [{ not: "an arm" }] as never })
    .where(eq(automationRules.id, ruleId));
}

describe("dispatchRuleNow", () => {
  // #1564 — the second half of #1431's sweep. A manual run that AUTO-DISABLES a corrupt rule reconciles the
  // enabled index afterwards, and that reconcile is derived state exactly like the verbs': the disable is
  // already committed, so a failed rebuild must latch stale (and be retried at the watcher front door), never
  // reject a run whose write landed.
  test("an index-refresh failure after a manual run's auto-disable does not reject the run — it latches stale", async () => {
    const fixture = await ruleFixture();
    // A blob no arm schema can parse ⇒ dispatch disables the rule ⇒ `summary.anyDisabled` ⇒ the reconcile.
    const ruleId = await seedEnabledRule(fixture, [{ type: "set_variable", scope: "chat", key: "k", op: "set", value: "v" }]);
    await corruptActions(fixture, ruleId);
    const failing = { fail: false };
    const enabled = createEnabledRuleIndex(readFailingDb(fixture.db, failing));
    await enabled.reload();
    const ctx = { ...fixture.ctx, enabled };
    const rule = await selectRuleRow(fixture.db, ruleId);
    expect(rule).toBeDefined();
    if (rule === undefined) {
      return;
    }

    failing.fail = true;
    await expect(dispatchRuleNow(ctx, rule, fixture.chatId, fixture.host)).resolves.not.toBeNull();
    expect(enabled.isStale()).toBe(true);

    // THE PREMISE, proven: the disable really did commit, so the reconcile this test is about really ran.
    const after = await selectRuleRow(fixture.db, ruleId);
    expect(after?.enabled).toBe(false);
  });
  test("a transform_draft rule reaches NO terminal — dispatchRuleNow answers null rather than fabricate a fire", async () => {
    const fixture = await ruleFixture();
    const ruleId = await seedEnabledRule(fixture, [{ type: "transform_draft", target: "user_input", template: "x" }]);
    await fixture.ctx.enabled.reload();
    const rule = await selectRuleRow(fixture.db, ruleId);
    expect(rule).toBeDefined();
    if (rule === undefined) {
      return;
    }
    const outcome = await dispatchRuleNow(fixture.ctx, rule, fixture.chatId, fixture.host);
    expect(outcome).toBeNull();
  });

  test("a set_variable rule dispatches through to a terminal at MANUAL_DEPTH 0 with a synthesized fact", async () => {
    const fixture = await ruleFixture();
    const ruleId = await seedEnabledRule(fixture, [{ type: "set_variable", scope: "chat", key: "mood", op: "set", value: "grim" }]);
    await fixture.ctx.enabled.reload();
    const rule = await selectRuleRow(fixture.db, ruleId);
    expect(rule).toBeDefined();
    if (rule === undefined) {
      return;
    }
    // The shared harness's default `runArm` is NOT_WIRED (arm_error) — this pins the MEDIATOR's own claims
    // (it reached dispatch, not null, and the fire row is stamped at depth 0), not arm success (the
    // verb-level suite `run-rule-now.int.test.ts` pins the wired-arm "fired" outcome).
    const outcome = await dispatchRuleNow(fixture.ctx, rule, fixture.chatId, fixture.host);
    expect(outcome).not.toBeNull();

    const fires = await listFiresForRule(fixture.db, ruleId);
    expect(fires).toHaveLength(1);
    expect(fires[0]).toMatchObject({ outcome: "action_error" });
    expect(fires[0]).not.toHaveProperty("automationDepth");
    const [stored] = await fixture.db
      .select({ automationDepth: automationFires.automationDepth })
      .from(automationFires)
      .where(eq(automationFires.ruleId, ruleId));
    expect(stored?.automationDepth).toBe(0);
  });
});

// -- #1565: a MANUAL run shares the chat's serial lane with the bus door -------------------------------------
// #1423 serialized the bus door. `dispatchRuleNow` is the OTHER full dispatch over the same chat variable env
// -- the host's "Run now" and the S4 invitation confirm -- and it ran outside every lane, so a host pressing
// the button while a bus event was mid-arm read the same snapshot, computed the same increment and wrote the
// same value. Same defect, different door.
describe("#1565 Run now and the bus door queue on ONE lane", () => {
  function deferred(): { readonly promise: Promise<void>; readonly resolve: () => void } {
    let resolve!: () => void;
    const promise = new Promise<void>((done) => {
      resolve = done;
    });
    return { promise, resolve };
  }

  /** The seeded rule, re-read as the row `dispatchRuleNow` takes. */
  async function ruleRowFor(fixture: Awaited<ReturnType<typeof ruleFixture>>, ruleId: AutomationRuleId): Promise<RuleRow> {
    const rule = await selectRuleRow(fixture.db, ruleId);
    if (rule === undefined) {
      throw new Error("fixture bug: just-inserted rule not found");
    }
    return rule;
  }

  test("a manual run raised while a bus event is mid-arm is QUEUED -- the two never interleave", async () => {
    const order: string[] = [];
    const gate = deferred();
    let n = 0;
    const base = await ruleFixture();
    const ctx: AutomationContext = {
      ...base.ctx,
      runArm: async (): Promise<{ readonly ok: true }> => {
        n += 1;
        const tag = n === 1 ? "bus" : "manual";
        order.push(`${tag}:enter`);
        if (n === 1) {
          await gate.promise;
        }
        order.push(`${tag}:exit`);
        return { ok: true };
      },
    };
    const svc = createAutomationService(ctx);
    const ruleId = await seedEnabledRule(base, [{ type: "set_variable", scope: "chat", key: "beats", op: "inc" }]);
    await ctx.enabled.reload();
    const rule = await ruleRowFor(base, ruleId);
    const { messageId } = await seedMessage(base.db, base.chatId, 1, { content: "hi" });

    // The bus event enters first and parks inside its arm; the host presses Run now while it is parked.
    const bus = svc.handleEvent({ type: "messageCommitted", chatId: base.chatId, messageId });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const manual = dispatchRuleNow(ctx, rule, base.chatId, base.host);
    await new Promise((resolve) => setTimeout(resolve, 0));
    gate.resolve();
    await Promise.all([bus, manual]);

    // Unlaned this reads ["bus:enter", "manual:enter", "manual:exit", "bus:exit"] -- the interleave, observed.
    expect(order).toEqual(["bus:enter", "bus:exit", "manual:enter", "manual:exit"]);
  });

  // THE RE-ENTRANCY PROOF, and it is the one shape that could deadlock a lane: an arm that generates chat
  // activity (`trigger_turn` -> `requestTurn`) causes new bus events for the SAME chat. Those events reach
  // `handleEvent` only through `superviseDetached` roots (`watcher/start-automation-watcher.ts:17,22`,
  // `entry/lifecycle.ts:480`), so the arm never AWAITS them -- the re-entrant event queues behind the job
  // that raised it and runs after. If anything ever awaits that call from inside a lane, this test hangs.
  // HONEST LABEL: this is a FENCE, not a defect proof -- it is green before the lane exists (nothing to
  // deadlock against) and its whole job is to stay green after it.
  test("an arm that raises a same-chat event from inside the lane completes -- the re-entry queues, it does not deadlock", async () => {
    const order: string[] = [];
    const base = await ruleFixture();
    let svc!: ReturnType<typeof createAutomationService>;
    const reentry: Promise<void>[] = [];
    let messageId: MessageId | null = null;
    const ctx: AutomationContext = {
      ...base.ctx,
      runArm: (): Promise<{ readonly ok: true }> => {
        order.push("arm");
        if (reentry.length === 0 && messageId !== null) {
          // Detached exactly as the composed watcher taps are -- raised, never awaited, from INSIDE the lane.
          reentry.push(svc.handleEvent({ type: "messageCommitted", chatId: base.chatId, messageId }));
        }
        return Promise.resolve({ ok: true });
      },
    };
    svc = createAutomationService(ctx);
    const ruleId = await seedEnabledRule(base, [{ type: "set_variable", scope: "chat", key: "beats", op: "inc" }]);
    await ctx.enabled.reload();
    const rule = await ruleRowFor(base, ruleId);
    messageId = (await seedMessage(base.db, base.chatId, 1, { content: "hi" })).messageId;

    // The outer manual run RESOLVES (it would hang forever if the re-entry were awaited on its own lane), and
    // the re-entrant event has NOT run its arm yet at that point -- it is queued behind the job that raised it.
    await expect(dispatchRuleNow(ctx, rule, base.chatId, base.host)).resolves.not.toBeNull();
    expect(order).toEqual(["arm"]);

    // Draining it runs the queued event, second and separately.
    await Promise.all(reentry);
    expect(order).toEqual(["arm", "arm"]);
  });
});
