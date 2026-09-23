// verb: runRuleNow — R7 (interaction-direction-spec §6 R7). The host runs ONE rule NOW.
//
// What this suite is really pinning is the GATE LINE, because that line is the whole argument of the verb:
// a manual run lifts the two WHETHER-TO-FIRE-BY-ITSELF gates (the fire-rate cap, the CEL predicate) and
// LIFTS NOTHING ELSE. So the rows here are, deliberately, one per side of it —
//   lifted: a rate-capped rule really runs · a `false` predicate really runs (catalogue #10's shape)
//   kept:   host-gated · the rule must be enabled · the fire row says a HUMAN forced it · THE AUTHOR'S
//           STANDING HOST AUTHORITY, checked at DISPATCH and separated from the caller's verb gate by a
//           host handoff (#612 — the one state where reordering `runGates` reds something)
// plus the property that makes F4 non-circular: a manual run can never raise an invitation, because it
// cannot reach `budget_refused` at all.

import { chatParticipants } from "@orb/db";
import type { AutomationRuleId } from "@orb/kit/ids";
import type { AutomationOps, AutomationTurnRequest } from "@orb/server/domain/automation";
import { and, eq, isNull } from "drizzle-orm";
import { describe } from "vitest";
import type { AutomationContext } from "../../../../../packages/server/src/domain/automation/contract/service.ts";
import { createArmExecutors } from "../../../../../packages/server/src/domain/automation/engine/arm-executors.ts";
import { createAutomationService } from "../../../../../packages/server/src/domain/automation/service.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { seedParticipant } from "../../chat/_support.ts";
import { principal, ruleFixture, seedUser } from "../_support.ts";

const DISABLED_REFUSAL = /this rule is disabled/u;

/** A fixture whose dispatch runs the REAL arms, with `requestTurn` captured (the assertion is "it ran"). */
async function runNowFixture(): Promise<{ fixture: Awaited<ReturnType<typeof ruleFixture>>; turns: AutomationTurnRequest[] }> {
  const base = await ruleFixture();
  const turns: AutomationTurnRequest[] = [];
  const ops: AutomationOps = {
    ...base.ctx.ops,
    chat: {
      ...base.ctx.ops.chat,
      requestTurn: (req): Promise<{ messageCount: number }> => {
        turns.push(req);
        return Promise.resolve({ messageCount: 1 });
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
  return { fixture: { ...base, ctx, svc: createAutomationService(ctx) }, turns };
}

/** Mint + enable a `trigger_turn` rule whose PREDICATE is the given source (`null` = always). */
/** `maxFiresPerHour: 0` slams the rule's own fire-rate cap shut, so every bus-driven fire is `budget_refused`. */
async function enableRule(fx: Awaited<ReturnType<typeof ruleFixture>>, predicateCel: string | null, maxFiresPerHour?: number): Promise<AutomationRuleId> {
  const rule = await fx.svc.createRule({
    principal: principal(fx.host),
    chatId: fx.chatId,
    name: "vote",
    trigger: { bus: "chat", type: "chatOpened" },
    predicateCel,
    actions: [{ type: "trigger_turn", guidedTemplate: "Do the thing." }],
    ...(maxFiresPerHour === undefined ? {} : { maxFiresPerHour }),
  });
  await fx.svc.setRuleEnabled({ principal: principal(fx.host), ruleId: rule.id, enabled: true });
  await fx.ctx.enabled.reload();
  return rule.id;
}

describe("what a manual run LIFTS", () => {
  test("a rule whose predicate is a constant `false` RUNS (catalogue #10's on-demand-only shape)", async () => {
    const { fixture, turns } = await runNowFixture();
    const ruleId = await enableRule(fixture, "false");

    // Proof the predicate really is false: the same rule on the BUS path fires nothing.
    await fixture.svc.handleEvent({ type: "chatOpened", chatId: fixture.chatId });
    expect(turns).toEqual([]);

    const result = await fixture.svc.runRuleNow({ principal: principal(fixture.host), ruleId });

    expect(result).toEqual({ outcome: "fired" });
    expect(turns).toEqual([{ authorUserId: fixture.host, chatId: fixture.chatId, automationDepth: 1, guided: "Do the thing." }]);
  });

  test("a rate-capped rule RUNS (without this, confirming an F4 invitation would refuse identically)", async () => {
    const { fixture, turns } = await runNowFixture();
    const ruleId = await enableRule(fixture, null, 0);

    // The bus path is refused by the ceiling…
    await fixture.svc.handleEvent({ type: "chatOpened", chatId: fixture.chatId });
    expect(turns).toEqual([]);
    const refused = await fixture.svc.listFires({ principal: principal(fixture.host), ruleId });
    expect(refused[0]?.outcome).toBe("budget_refused");

    // …and the host's own run is not.
    expect(await fixture.svc.runRuleNow({ principal: principal(fixture.host), ruleId })).toEqual({ outcome: "fired" });
    expect(turns).toHaveLength(1);
  });

  test("a manual run can never raise an invitation — it cannot reach `budget_refused` at all (no F4 loop)", async () => {
    const { fixture } = await runNowFixture();
    const ruleId = await enableRule(fixture, null, 0);

    await fixture.svc.runRuleNow({ principal: principal(fixture.host), ruleId });

    expect(fixture.ctx.suggestions.countForChat(fixture.chatId)).toBe(0);
  });
});

describe("what a manual run KEEPS", () => {
  test("host-gated: a member who is not host is refused and nothing runs", async () => {
    const { fixture, turns } = await runNowFixture();
    const ruleId = await enableRule(fixture, null);
    const member = await seedUser(fixture.db, "user_member");
    await seedParticipant(fixture.db, { chatId: fixture.chatId, key: "member", userId: member, role: "member" });

    await expect(fixture.svc.runRuleNow({ principal: principal(member), ruleId })).rejects.toThrow();
    expect(turns).toEqual([]);
  });

  test("a DISABLED rule is refused — run-now is not a back door around withdrawn consent", async () => {
    const { fixture, turns } = await runNowFixture();
    const ruleId = await enableRule(fixture, null);
    await fixture.svc.setRuleEnabled({ principal: principal(fixture.host), ruleId, enabled: false });

    await expect(fixture.svc.runRuleNow({ principal: principal(fixture.host), ruleId })).rejects.toThrow(DISABLED_REFUSAL);
    expect(turns).toEqual([]);
  });

  test("the fire row SAYS a human forced it (the log never reads as a condition-met fire)", async () => {
    const { fixture } = await runNowFixture();
    const ruleId = await enableRule(fixture, "false");

    await fixture.svc.runRuleNow({ principal: principal(fixture.host), ruleId });

    const fires = await fixture.svc.listFires({ principal: principal(fixture.host), ruleId });
    expect(fires).toHaveLength(1);
    expect(fires[0]).toMatchObject({ outcome: "fired" });
    expect(fires[0]?.detail).toEqual({ runNow: true, byUserId: fixture.host });
  });

  // #612 — THE DISPATCH-LEVEL AUTHORITY BELT, pinned at the ONE state where it is the thing being tested.
  //
  // `runGates` runs depth → `holdsAuthority(author)` → the manual short-circuit, in that order, and the
  // order is load-bearing: it is what stops a manual run from reaching an arm when the rule's AUTHOR has
  // lost host. Swapping those two lines reds nothing else in the tree — the manual path's authority check
  // is otherwise pinned only INDIRECTLY (`requireRuleHost` at this verb, `assertStillLive` in the confirm
  // verb, `trigger_turn`'s own D17 belt), and every one of those asks about a DIFFERENT user.
  //
  // So the state below is built specifically to separate them: a HOST HANDOFF. The author (A) wrote and
  // enabled the rule while host, then was demoted; a successor host (B) presses Run now. B's verb gate
  // PASSES — B really is host — so `requireRuleHost` cannot be what refuses. The only thing standing
  // between a demoted ex-host's rule and a real turn is the dispatch gate.
  //
  // The handoff is written in the ORDER the schema forces: ONE present host per chat is PHYSICS
  // (`chat_participants_chat_host_unique`, #390 — partial on `role='host' and left_seq is null`), so the
  // seat must be VACATED before it is re-taken, exactly as `acceptHostHandoffSwapStatements` does it.
  // A two-simultaneous-hosts setup is not merely unrealistic here; the db refuses to hold it.
  test("author-lost-host: the successor host's Run now is REFUSED at DISPATCH and no arm runs", async () => {
    const { fixture, turns } = await runNowFixture();
    const ruleId = await enableRule(fixture, null);
    const successor = await seedUser(fixture.db, "user_successor");
    // Demote the AUTHOR, then seat the successor — the rule outlives the seat its author used to hold.
    await fixture.db
      .update(chatParticipants)
      .set({ role: "member" })
      .where(and(eq(chatParticipants.chatId, fixture.chatId), eq(chatParticipants.userId, fixture.host), isNull(chatParticipants.leftSeq)));
    await seedParticipant(fixture.db, { chatId: fixture.chatId, key: "successor", userId: successor, role: "host" });

    const result = await fixture.svc.runRuleNow({ principal: principal(successor), ruleId });

    expect(result).toEqual({ outcome: "authority_refused" });
    expect(turns).toEqual([]); // the belt's whole claim: a demoted ex-host's rule reaches NO arm

    // AND THE PREMISE, proven rather than assumed: `listFires` is host-gated through the SAME
    // `requireRuleHost` guard, on the SAME rule, for the SAME principal — it would throw if B's caller-side
    // gate were what refused above. It returns the row instead, so the refusal came from `runGates`.
    const fires = await fixture.svc.listFires({ principal: principal(successor), ruleId });
    expect(fires[0]).toMatchObject({ outcome: "authority_refused", detail: { code: "author-lost-authority" } });
  });

  test("testRule still executes NOTHING — the dry run and the real run stay separate verbs", async () => {
    const { fixture, turns } = await runNowFixture();
    const ruleId = await enableRule(fixture, null);

    await fixture.svc.testRule({ principal: principal(fixture.host), ruleId });

    expect(turns).toEqual([]);
    const fires = await fixture.svc.listFires({ principal: principal(fixture.host), ruleId });
    expect(fires.map((f) => f.outcome)).toEqual(["test_run"]);
  });
});

test("a manual run of a CONFIRM-FIRST rule still ASKS (the arm's authored posture is not overridden)", async () => {
  const { fixture, turns } = await runNowFixture();
  const rule = await fixture.svc.createRule({
    principal: principal(fixture.host),
    chatId: fixture.chatId,
    name: "recap",
    trigger: { bus: "chat", type: "chatOpened" },
    actions: [{ type: "trigger_turn", guidedTemplate: "Recap.", confirmFirst: true }],
  });
  await fixture.svc.setRuleEnabled({ principal: principal(fixture.host), ruleId: rule.id, enabled: true });
  await fixture.ctx.enabled.reload();

  const result = await fixture.svc.runRuleNow({ principal: principal(fixture.host), ruleId: rule.id });

  // "Run this rule now" means run the RULE, and this rule's rule is to ask. The host gets a card, not a turn.
  expect(result).toEqual({ outcome: "suggested" });
  expect(turns).toEqual([]);
  expect(fixture.ctx.suggestions.countForChat(fixture.chatId)).toBe(1);
  // …and no fire row: a suggestion is not a fire (§3-S4's fire-log honesty).
  expect(await fixture.svc.listFires({ principal: principal(fixture.host), ruleId: rule.id })).toEqual([]);
});
