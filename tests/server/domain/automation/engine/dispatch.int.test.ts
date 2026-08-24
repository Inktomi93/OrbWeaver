// .int tests for the D146-d PAUSE GATE in `engine/dispatch.ts` — "pause, don't rot".
//
// THE FAILURE THIS SUITE EXISTS TO PREVENT, stated once so a future reader knows what a red here means: a
// plugin is disabled, upgraded or uninstalled by ordinary user action at any time. If a rule naming that
// plugin's tool treated the disappearance as an ERROR, `arm_error` → `action_error` would increment
// `consecutive_errors`, the rule would AUTO-DISABLE at 20, the author would get a durable notice naming the
// RULE (not the plugin), and re-enabling the plugin would NOT bring the rule back. One toggle would silently
// eat every rule that mentions that plugin. A first-party contributor cannot vanish, so no other seam in this
// domain needs this; the contributor seam does, which is the whole reason D146-d exists as its own clause.
//
// The property being pinned is therefore NOT "a paused rule reports paused" — it is that a paused rule CHANGES
// NOTHING: no fire row, no error tick, no `last_fired_at`, no auto-disable, no arm effects. Self-healing is
// what falls out of that, and the re-enable row proves it costs no repair step.

import type { AutomationRuleId, UserId } from "@orb/kit/ids";
import type { VarOp } from "@orb/kit/macro";
import type { AutomationOps, AutomationToolOutcome, AutomationToolRequest } from "@orb/server/domain/automation";
import { describe } from "vitest";
import type { AutomationContext } from "../../../../../packages/server/src/domain/automation/contract/service.ts";
import { createArmExecutors } from "../../../../../packages/server/src/domain/automation/engine/arm-executors.ts";
import { createAutomationService } from "../../../../../packages/server/src/domain/automation/service.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { principal, ruleFixture } from "../_support.ts";

const TOOL = "plugin_mood_report";
/** The auto-disable ceiling the rot would have walked to (`engine/dispatch.ts`). Restated rather than imported
 *  because it is a module-private const — if it MOVES, this suite's "20 events change nothing" row is still
 *  the honest shape of the claim, and the row asserting the rule is still enabled is what would catch a drift. */
const CONSECUTIVE_ERROR_DISABLE_AT = 20;

/** A stand-in for the plugin lifecycle: `installed` is the live registry, flipped by the tests the way an
 *  owner flips a plugin. `asks` records every reachability question so a test can assert WHO it was asked
 *  about — the rule's AUTHOR, never the caller. */
interface ToolGate {
  installed: Set<string>;
  readonly asks: { name: string; userId: UserId }[];
  readonly calls: AutomationToolRequest[];
  readonly owner: UserId;
}

function toolsFor(gate: ToolGate): AutomationOps["tools"] {
  return {
    isToolDrivableBy: (name, userId): boolean => {
      gate.asks.push({ name, userId });
      return gate.installed.has(name) && userId === gate.owner;
    },
    runTool: (req): Promise<AutomationToolOutcome> => {
      // The op re-checks itself (compose does the same) — this is what makes the deactivate-mid-dispatch race
      // an `unavailable` rather than a fabricated success.
      if (!gate.installed.has(req.name)) {
        return Promise.resolve({ ok: false, reason: "unavailable" });
      }
      gate.calls.push(req);
      return Promise.resolve({ ok: true, result: "tense" });
    },
  };
}

type Fixture = Awaited<ReturnType<typeof ruleFixture>>;

/** A fixture whose dispatch runs the REAL arm executors over the gated tool seam — no fake `runArm`, so the
 *  arm's own paused outcome and the engine's terminal are both the real ones.
 *
 *  `varOps` is CAPTURED rather than left to the shared harness's inert `applyVariableOps`. That default writes
 *  nothing anywhere, so an assertion phrased as "the chat variable was not written" passes whether or not the
 *  arm ran — a lying test, and this suite caught itself doing exactly that under a planted control. Capturing
 *  the call is the only way "the other arm did NOT run" is an observation. */
async function pauseFixture(): Promise<{ fixture: Fixture; gate: ToolGate; varOps: VarOp[] }> {
  const base = await ruleFixture();
  const gate: ToolGate = { installed: new Set([TOOL]), asks: [], calls: [], owner: base.host };
  const varOps: VarOp[] = [];
  const ops: AutomationOps = {
    ...base.ctx.ops,
    tools: toolsFor(gate),
    chat: {
      ...base.ctx.ops.chat,
      applyVariableOps: (_chatId, written): Promise<void> => {
        varOps.push(...written);
        return Promise.resolve();
      },
    },
  };
  const ctx: AutomationContext = {
    ...base.ctx,
    ops,
    runArm: createArmExecutors({
      db: base.db,
      ops,
      prng: () => 0.42,
      notify: base.ctx.notify,
      suggestions: base.ctx.suggestions,
      newSuggestionId: base.ctx.newSuggestionId,
    }),
  };
  return { fixture: { ...base, ctx, svc: createAutomationService(ctx) }, gate, varOps };
}

/** Mint + enable a rule whose arms are `run_tool` plus (optionally) a bookkeeping `set_variable` BEFORE it. */
async function enableToolRule(fx: Fixture, withSideEffectArm = false): Promise<AutomationRuleId> {
  const rule = await fx.svc.createRule({
    principal: principal(fx.host),
    chatId: fx.chatId,
    name: "mood watch",
    trigger: { bus: "chat", type: "chatOpened" },
    actions: withSideEffectArm
      ? [
          { type: "set_variable", scope: "chat", key: "ticks", op: "inc" },
          { type: "run_tool", name: TOOL, resultVar: "mood" },
        ]
      : [{ type: "run_tool", name: TOOL, resultVar: "mood" }],
  });
  await fx.svc.setRuleEnabled({ principal: principal(fx.host), ruleId: rule.id, enabled: true });
  await fx.ctx.enabled.reload();
  return rule.id;
}

async function ruleRow(fx: Fixture, ruleId: AutomationRuleId): Promise<{ enabled: boolean; consecutiveErrors: number; lastFiredAt: number | null }> {
  const rules = await fx.svc.listRules({ principal: principal(fx.host), chatId: fx.chatId });
  const row = rules.find((r) => r.id === ruleId);
  if (row === undefined) {
    throw new Error("the rule vanished");
  }
  return { enabled: row.enabled, consecutiveErrors: row.consecutiveErrors, lastFiredAt: row.lastFiredAt };
}

// THE CONTROL. Without this row every assertion below could pass on a rule that never worked at all — the
// classic vacuous-pause shape. It also fixes what "before" looks like: a real fire row and a real stamp.
test("CONTROL: while the plugin is installed the rule FIRES and the tool really runs", async () => {
  const { fixture, gate } = await pauseFixture();
  const ruleId = await enableToolRule(fixture);

  await fixture.svc.handleEvent({ type: "chatOpened", chatId: fixture.chatId });

  expect(gate.calls).toHaveLength(1);
  expect(gate.calls[0]).toMatchObject({ authorUserId: fixture.host, chatId: fixture.chatId, name: TOOL });
  const fires = await fixture.svc.listFires({ principal: principal(fixture.host), ruleId });
  expect(fires.map((f) => f.outcome)).toEqual(["fired"]);
  expect((await ruleRow(fixture, ruleId)).lastFiredAt).not.toBeNull();
});

describe("D146-d: a deactivated contributor PAUSES the rule and changes nothing", () => {
  test("the bus path writes NO fire row, spends NO error budget, and stamps NO fire", async () => {
    const { fixture, gate } = await pauseFixture();
    const ruleId = await enableToolRule(fixture);
    gate.installed = new Set(); // the owner switched the plugin off.

    await fixture.svc.handleEvent({ type: "chatOpened", chatId: fixture.chatId });

    expect(gate.calls).toEqual([]); // the gate refused before any arm ran — the tool was never invoked
    // NO ROW. A pause is not a fire and not a fault, so the one surface that answers "why did this run" must
    // not claim either. (`action_error` here would be the rot; `fired` would be a lie.)
    expect(await fixture.svc.listFires({ principal: principal(fixture.host), ruleId })).toEqual([]);
    expect(await ruleRow(fixture, ruleId)).toEqual({ enabled: true, consecutiveErrors: 0, lastFiredAt: null });
  });

  test("MORE events than the auto-disable ceiling still leave the rule enabled with a ZERO error count", async () => {
    // THE ROT PIN, at the exact size of the failure it prevents. Pre-D146-d these 21 events would have walked
    // `consecutive_errors` to 20, auto-disabled the rule, and posted the author a durable notice blaming the
    // RULE — for a plugin they merely turned off.
    const { fixture, gate } = await pauseFixture();
    const ruleId = await enableToolRule(fixture);
    gate.installed = new Set();

    for (let i = 0; i <= CONSECUTIVE_ERROR_DISABLE_AT; i += 1) {
      // biome-ignore lint/performance/noAwaitInLoops: the count IS the point — these must be sequential dispatches, not a batch.
      await fixture.svc.handleEvent({ type: "chatOpened", chatId: fixture.chatId });
    }

    expect(await ruleRow(fixture, ruleId)).toMatchObject({ enabled: true, consecutiveErrors: 0 });
  });

  test("a rule mixing a bookkeeping arm with the tool arm runs NEITHER — the pause is atomic", async () => {
    // Why the gate is rule-level and not arm-level: an arm-level pause would let the `set_variable` arm tick a
    // counter on every event forever while the act the rule exists for never happens. Partial execution is its
    // own kind of rot, and "the rule is waiting for your plugin" is only true if the rule really does nothing.
    const { fixture, gate, varOps } = await pauseFixture();
    const ruleId = await enableToolRule(fixture, true);

    // THE CONTROL FIRST, because the assertion below is an ABSENCE: with the plugin installed the bookkeeping
    // arm really does write, so "it did not write" afterwards is an observation rather than an inert stub.
    await fixture.svc.handleEvent({ type: "chatOpened", chatId: fixture.chatId });
    expect(varOps).toEqual([
      { op: "set", key: "ticks", value: "1" },
      { op: "set", key: "mood", value: "tense" },
    ]);
    varOps.length = 0;

    gate.installed = new Set();
    await fixture.svc.handleEvent({ type: "chatOpened", chatId: fixture.chatId });

    expect(varOps).toEqual([]); // the bookkeeping arm never ran — the pause is atomic, not per-arm
    expect(gate.calls).toHaveLength(1); // ...and still only the CONTROL's tool call
    expect((await fixture.svc.listFires({ principal: principal(fixture.host), ruleId })).map((f) => f.outcome)).toEqual(["fired"]);
  });

  test("re-enabling the plugin resumes the rule on the very next event — no repair step", async () => {
    // Self-healing falls out of "changes nothing": there is no disabled flag to clear, no counter to reset and
    // no stored attach list to refresh, so the next dispatch simply finds the tool again.
    const { fixture, gate } = await pauseFixture();
    const ruleId = await enableToolRule(fixture);

    gate.installed = new Set();
    await fixture.svc.handleEvent({ type: "chatOpened", chatId: fixture.chatId });
    expect(gate.calls).toEqual([]);

    gate.installed = new Set([TOOL]);
    await fixture.svc.handleEvent({ type: "chatOpened", chatId: fixture.chatId });

    expect(gate.calls).toHaveLength(1);
    expect((await fixture.svc.listFires({ principal: principal(fixture.host), ruleId })).map((f) => f.outcome)).toEqual(["fired"]);
  });
});

describe("the pause gate and the rest of the engine", () => {
  test("Run now on a paused rule answers `paused`, not `action_error` — the two features meet here", async () => {
    // `run_tool` is SPEND-classed, so a rate refusal raises the F4 invitation whose confirm is a fresh
    // `runRuleNow`. If the manual path reported a fault for a switched-off plugin, confirming that invitation
    // would spend the rule's error budget — the exact rot, arriving through the affordance meant to help.
    const { fixture, gate } = await pauseFixture();
    const ruleId = await enableToolRule(fixture);
    gate.installed = new Set();

    const result = await fixture.svc.runRuleNow({ principal: principal(fixture.host), ruleId });

    expect(result).toEqual({ outcome: "paused" });
    expect(await fixture.svc.listFires({ principal: principal(fixture.host), ruleId })).toEqual([]);
    expect(await ruleRow(fixture, ruleId)).toMatchObject({ consecutiveErrors: 0 });
  });

  test("reachability is asked about the rule's AUTHOR — not the host who pressed Run now", async () => {
    // The identity question the gate must not get wrong. A successor host running someone else's rule does not
    // lend it THEIR plugins, and does not have their own reachability stand in for the author's.
    const { fixture, gate } = await pauseFixture();
    const ruleId = await enableToolRule(fixture);
    gate.asks.length = 0;

    await fixture.svc.runRuleNow({ principal: principal(fixture.host), ruleId });

    expect(gate.asks).not.toEqual([]);
    expect(gate.asks.every((ask) => ask.userId === fixture.host)).toBe(true);
    // AND THE CONTROL that makes the assertion mean something: the stub only answers `true` for its declared
    // owner, so if the gate had asked about anyone else it would have reported the tool missing and this
    // rule would have PAUSED instead of firing.
    expect(await fixture.svc.runRuleNow({ principal: principal(fixture.host), ruleId })).toEqual({ outcome: "fired" });
  });
});
