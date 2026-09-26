// S4 — THE AUTHORITY MATRIX (+ the §7 acceptance matrix). Every row here is
// a rule the spec states in prose; the point of the suite is that the prose is now mechanical.
//
//   the ask is RAISED, not run      — a confirm-first arm stashes at fire time; the op never fires
//   the CONFIRMER is the AUTHORIZER — the executed frame's author stays the RULE AUTHOR
//   non-host REFUSED               — a member-not-host gets FORBIDDEN, a non-member a leak-free NOT_FOUND
//   TAKE-ONCE                      — a double confirm executes exactly once
//   disabled rule VOIDS            — withdrawing consent kills the pending ask
//   author lost host REFUSED       — the confirmer's own host role never stands in for the author's
//   VOID-ALL on handoff            — the RULED sweep: authority died, its pending asks die
//   the INVITATION path            — a rate-capped SPEND rule invites, and the confirm is a FRESH run
//
// It drives the REAL dispatch with the REAL arm executors over a real db: the only fake is the injected
// cross-feature op bundle (a capturing `requestTurn`), because "the op did not fire" is the assertion.

import type { VariableWriteResult } from "@orb/contracts/chat";
import { automationFires, chatParticipants } from "@orb/db";
import type { AutomationRuleId, AutomationSuggestionId, ChatId, PluginId, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import type { AutomationOps, AutomationTurnRequest, ExecutePluginSuggestion } from "@orb/server/domain/automation";
import { and, eq } from "drizzle-orm";
import { describe } from "vitest";
import type { AutomationContext } from "../../../../../packages/server/src/domain/automation/contract/service.ts";
import { createArmExecutors } from "../../../../../packages/server/src/domain/automation/engine/arm-executors.ts";
import { createAutomationService } from "../../../../../packages/server/src/domain/automation/service.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { seedChat, seedParticipant } from "../../chat/_support.ts";
import { FIXED_NOW_MS, principal, ruleFixture, seedUser } from "../_support.ts";

const SUGGESTION_REFUSAL = /automation_suggestion/u;
/** `DomainOperationError` carries its machine code on `.code` and its REASON as the message, so a refusal
 *  assertion matches the reason (the sentence a host is shown) rather than the code. */
const AUTHOR_LOST = /author no longer hosts this room/u;

/** The capturing op bundle: every arm that could ACT records instead. `requestTurn` is the one under test —
 *  a stashed `trigger_turn` must reach it exactly ONCE, and only after a host says yes. */
function capturingOps(base: AutomationOps): { ops: AutomationOps; turns: AutomationTurnRequest[] } {
  const turns: AutomationTurnRequest[] = [];
  return {
    turns,
    ops: {
      ...base,
      chat: {
        ...base.chat,
        requestTurn: (req): Promise<{ messageCount: number }> => {
          turns.push(req);
          return Promise.resolve({ messageCount: 1 });
        },
      },
    },
  };
}

/** #1553's capturing bundle — BOTH `requestTurn` (the confirmed arm) and `applyVariableOps` (the
 *  continuation's `set_variable` arms) recorded, so a mixed `[set_variable, trigger_turn(confirmFirst),
 *  set_variable]` rule's confirm proves ALL THREE arms ran, in order, and the two `set_variable`s ran at the
 *  right TIMES (the first at fire time, the second only after the confirm). */
function capturingContinuationOps(base: AutomationOps): { ops: AutomationOps; turns: AutomationTurnRequest[]; varWrites: string[] } {
  const turns: AutomationTurnRequest[] = [];
  const varWrites: string[] = [];
  return {
    turns,
    varWrites,
    ops: {
      ...base,
      chat: {
        ...base.chat,
        requestTurn: (req): Promise<{ messageCount: number }> => {
          turns.push(req);
          return Promise.resolve({ messageCount: 1 });
        },
        applyVariableOps: (_chatId, varOps): Promise<VariableWriteResult> => {
          for (const op of varOps) {
            if (op.op === "set") {
              varWrites.push(`${op.key}=${op.value}`);
            }
          }
          return Promise.resolve({ outcome: "applied" });
        },
      },
    },
  };
}

/** A fixture whose dispatch runs the REAL arms over a capturing op bundle.
 *
 *  ONE fixture, re-wrapped — not two. The arm dispatcher and the confirm/dismiss verbs must share the SAME
 *  suggestion store (two stores make every confirm refuse as not-found) AND the same `notify` sink (a second
 *  collector would leave every `suggestionRaised` assertion looking at the wrong array). Both are properties
 *  of the ONE context, so the fixture builds it once and rebuilds only the service over it. */
async function suggestFixture(): Promise<{
  fixture: Awaited<ReturnType<typeof ruleFixture>>;
  turns: AutomationTurnRequest[];
}> {
  const base = await ruleFixture();
  const { ops, turns } = capturingOps(base.ctx.ops);
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

/** Mint + enable a confirm-first `trigger_turn` rule on the fixture's chat. */
async function enableConfirmFirstRule(fx: Awaited<ReturnType<typeof ruleFixture>>): Promise<string> {
  const rule = await fx.svc.createRule({
    principal: principal(fx.host),
    chatId: fx.chatId,
    name: "recap",
    trigger: { bus: "chat", type: "chatOpened" },
    actions: [{ type: "trigger_turn", guidedTemplate: "Recap the scene.", confirmFirst: true }],
  });
  await fx.svc.setRuleEnabled({ principal: principal(fx.host), ruleId: rule.id, enabled: true });
  await fx.ctx.enabled.reload();
  return rule.id;
}

/** #1553 — the STASH-the-continuation fixture: `capturingContinuationOps` wired in place of `capturingOps`. */
async function continuationFixture(): Promise<{
  fixture: Awaited<ReturnType<typeof ruleFixture>>;
  turns: AutomationTurnRequest[];
  varWrites: string[];
}> {
  const base = await ruleFixture();
  const { ops, turns, varWrites } = capturingContinuationOps(base.ctx.ops);
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
  return { fixture: { ...base, ctx, svc: createAutomationService(ctx) }, turns, varWrites };
}

/** Mint + enable a MIXED rule: a direct `set_variable`, a confirm-first `trigger_turn`, and a second
 *  direct `set_variable` behind it — #1553's own worked example. */
async function enableMixedRule(fx: Awaited<ReturnType<typeof ruleFixture>>): Promise<string> {
  const rule = await fx.svc.createRule({
    principal: principal(fx.host),
    chatId: fx.chatId,
    name: "mixed",
    trigger: { bus: "chat", type: "chatOpened" },
    actions: [
      { type: "set_variable", scope: "chat", key: "before", op: "set", value: "1" },
      { type: "trigger_turn", guidedTemplate: "Recap the scene.", confirmFirst: true },
      { type: "set_variable", scope: "chat", key: "after", op: "set", value: "2" },
    ],
  });
  await fx.svc.setRuleEnabled({ principal: principal(fx.host), ruleId: rule.id, enabled: true });
  await fx.ctx.enabled.reload();
  return rule.id;
}

/** A REAL host handoff, in the order the schema allows: `chat_participants` carries a PARTIAL unique index
 *  over `(chat_id) where role='host' and left_seq is null`, so the outgoing host is demoted FIRST and the
 *  incoming one seated second — the same order `acceptHostHandoff`'s atomic swap produces. Returns the new
 *  host's id. */
async function handOffHost(fx: Awaited<ReturnType<typeof ruleFixture>>, key: string): Promise<UserId> {
  const newHost = await seedUser(fx.db, key);
  await fx.db
    .update(chatParticipants)
    .set({ role: "member" })
    .where(and(eq(chatParticipants.chatId, fx.chatId), eq(chatParticipants.userId, fx.host)));
  await seedParticipant(fx.db, { chatId: fx.chatId, key: "newhost", userId: newHost, role: "host" });
  return newHost;
}

/** Drive one `chatOpened` through the real watcher front door. */
async function fireChatOpened(fx: Awaited<ReturnType<typeof ruleFixture>>): Promise<void> {
  await fx.svc.handleEvent({ type: "chatOpened", chatId: fx.chatId });
}

describe("the confirm-first card", () => {
  test("a confirm-first arm STASHES at fire time — the op does not run, and the host-only card event is raised", async () => {
    const { fixture, turns } = await suggestFixture();
    const ruleId = await enableConfirmFirstRule(fixture);
    await fireChatOpened(fixture);

    // The arm did NOT act.
    expect(turns).toEqual([]);
    // The ask exists, keyed to its rule, carrying the rendered summary the host reads.
    const [ask] = fixture.ctx.suggestions.listForChat(fixture.chatId, FIXED_NOW_MS);
    expect(ask).toMatchObject({ kind: "confirm", source: { kind: "rule", ruleId }, chatId: fixture.chatId, actorUserId: fixture.host });
    expect(ask?.summary).toBe("Take a turn: “Recap the scene.”");
    // …and the bus told the host, on the ONE new member (host-only by the room's default-deny filter).
    expect(fixture.events.filter((e) => e.type === "suggestionRaised")).toHaveLength(1);
    // NO fire row at suggest time — a suggestion is not a fire (§3-S4's fire-log honesty).
    expect(await fixture.svc.listFires({ principal: principal(fixture.host), ruleId: castId(ruleId) })).toEqual([]);
  });

  test("CONFIRM executes the stashed arm as the AUTHOR and records a `fired` row stamped with the confirmer", async () => {
    const { fixture, turns } = await suggestFixture();
    const ruleId = await enableConfirmFirstRule(fixture);
    await fireChatOpened(fixture);
    const [ask] = fixture.ctx.suggestions.listForChat(fixture.chatId, FIXED_NOW_MS);

    const result = await fixture.svc.confirmSuggestion({
      principal: principal(fixture.host),
      suggestionId: ask?.id ?? mintTypeId(ID_PREFIX.automationSuggestion),
    });

    expect(result).toEqual({ ran: "stashed-arm", outcome: "fired" });
    // #700 — the claim retires the card on every attached host tab: exactly one host-only `suggestionResolved`
    // for THIS ask (emitted at the claim, so it precedes the fire event and rides even a later refusal).
    expect(fixture.events.filter((e) => e.type === "suggestionResolved" && e.suggestionId === ask?.id)).toHaveLength(1);
    // THE IDENTITY LAW: the frame that executed is the AUTHOR's, with the author's steer, at the rule's own
    // cascade depth — the confirmer authorized it, they did not become its author.
    expect(turns).toEqual([{ authorUserId: fixture.host, ruleId, chatId: fixture.chatId, automationDepth: 1, guided: "Recap the scene." }]);
    const fires = await fixture.svc.listFires({ principal: principal(fixture.host), ruleId: castId(ruleId) });
    expect(fires).toHaveLength(1);
    expect(fires[0]?.outcome).toBe("fired");
    expect(fires[0]?.detail).toMatchObject({ confirmedByUserId: fixture.host, suggestionId: ask?.id, armType: "trigger_turn" });
  });

  test("TAKE-ONCE: a double confirm executes exactly once; the loser refuses leak-free", async () => {
    const { fixture, turns } = await suggestFixture();
    await enableConfirmFirstRule(fixture);
    await fireChatOpened(fixture);
    const [ask] = fixture.ctx.suggestions.listForChat(fixture.chatId, FIXED_NOW_MS);
    const suggestionId = ask?.id ?? mintTypeId(ID_PREFIX.automationSuggestion);

    // The REAL double-click shape: both confirms in flight at once, neither awaited before the other starts.
    const [first, second] = await Promise.allSettled([
      fixture.svc.confirmSuggestion({ principal: principal(fixture.host), suggestionId }),
      fixture.svc.confirmSuggestion({ principal: principal(fixture.host), suggestionId }),
    ]);

    const statuses = [first?.status, second?.status].toSorted();
    expect(statuses).toEqual(["fulfilled", "rejected"]);
    expect(turns).toHaveLength(1);
  });

  test("#1553 (OWNER RULING: STASH the continuation) — a mixed rule runs arm 1, raises, and on confirm runs BOTH remaining arms in order", async () => {
    const { fixture, turns, varWrites } = await continuationFixture();
    const ruleId = await enableMixedRule(fixture);
    await fireChatOpened(fixture);

    // Arm 1 (the direct `set_variable`) already ran at fire time; arm 2 raised the ask and arm 3 never ran
    // for this event — it is STASHED on the ask, not dropped and not run yet.
    expect(varWrites).toEqual(["before=1"]);
    expect(turns).toEqual([]);
    const [ask] = fixture.ctx.suggestions.listForChat(fixture.chatId, FIXED_NOW_MS);
    expect(ask).toBeDefined();

    const result = await fixture.svc.confirmSuggestion({
      principal: principal(fixture.host),
      suggestionId: ask?.id ?? mintTypeId(ID_PREFIX.automationSuggestion),
    });

    // BOTH remaining arms ran, IN ORDER: the confirmed trigger_turn, then the continuation's set_variable.
    expect(result).toEqual({ ran: "stashed-arm", outcome: "fired" });
    expect(turns).toEqual([{ authorUserId: fixture.host, ruleId, chatId: fixture.chatId, automationDepth: 1, guided: "Recap the scene." }]);
    expect(varWrites).toEqual(["before=1", "after=2"]);
    // ONE fire row for the confirm, naming the CONFIRMED arm (the continuation shares its terminal, exactly
    // as a fresh dispatch's `finalizeRule` writes one row for a whole rule's arm sequence).
    const fires = await fixture.svc.listFires({ principal: principal(fixture.host), ruleId: castId(ruleId) });
    expect(fires).toHaveLength(1);
    expect(fires[0]?.outcome).toBe("fired");
  });

  test("DISMISS takes the ask and runs nothing; a second dismiss refuses", async () => {
    const { fixture, turns } = await suggestFixture();
    await enableConfirmFirstRule(fixture);
    await fireChatOpened(fixture);
    const [ask] = fixture.ctx.suggestions.listForChat(fixture.chatId, FIXED_NOW_MS);
    const suggestionId = ask?.id ?? mintTypeId(ID_PREFIX.automationSuggestion);

    await fixture.svc.dismissSuggestion({ principal: principal(fixture.host), suggestionId });
    expect(turns).toEqual([]);
    expect(fixture.ctx.suggestions.countForChat(fixture.chatId)).toBe(0);
    await expect(fixture.svc.dismissSuggestion({ principal: principal(fixture.host), suggestionId })).rejects.toThrow(SUGGESTION_REFUSAL);
  });
});

describe("the authority matrix", () => {
  test("a MEMBER who is not host cannot confirm (a card is a host-tier ask)", async () => {
    const { fixture, turns } = await suggestFixture();
    await enableConfirmFirstRule(fixture);
    await fireChatOpened(fixture);
    const [ask] = fixture.ctx.suggestions.listForChat(fixture.chatId, FIXED_NOW_MS);
    const member = await seedUser(fixture.db, "user_member");
    await seedParticipant(fixture.db, { chatId: fixture.chatId, key: "member", userId: member, role: "member" });

    await expect(
      fixture.svc.confirmSuggestion({ principal: principal(member), suggestionId: ask?.id ?? mintTypeId(ID_PREFIX.automationSuggestion) }),
    ).rejects.toThrow();
    expect(turns).toEqual([]);
    // The ask SURVIVES a refused confirm — a member's click must not consume the host's question.
    expect(fixture.ctx.suggestions.countForChat(fixture.chatId)).toBe(1);
  });

  test("a NON-MEMBER gets the leak-free suggestion-not-found (never a chat id they never supplied)", async () => {
    const { fixture } = await suggestFixture();
    await enableConfirmFirstRule(fixture);
    await fireChatOpened(fixture);
    const [ask] = fixture.ctx.suggestions.listForChat(fixture.chatId, FIXED_NOW_MS);
    const stranger = await seedUser(fixture.db, "user_stranger");

    await expect(
      fixture.svc.confirmSuggestion({ principal: principal(stranger), suggestionId: ask?.id ?? mintTypeId(ID_PREFIX.automationSuggestion) }),
    ).rejects.toThrow(SUGGESTION_REFUSAL);
  });

  test("DISABLING the rule VOIDS its pending ask (consent withdrawn ⇒ the question is moot)", async () => {
    const { fixture, turns } = await suggestFixture();
    const ruleId = await enableConfirmFirstRule(fixture);
    await fireChatOpened(fixture);
    const [ask] = fixture.ctx.suggestions.listForChat(fixture.chatId, FIXED_NOW_MS);

    await fixture.svc.setRuleEnabled({ principal: principal(fixture.host), ruleId: castId(ruleId), enabled: false });

    expect(fixture.ctx.suggestions.countForChat(fixture.chatId)).toBe(0);
    await expect(
      fixture.svc.confirmSuggestion({ principal: principal(fixture.host), suggestionId: ask?.id ?? mintTypeId(ID_PREFIX.automationSuggestion) }),
    ).rejects.toThrow(SUGGESTION_REFUSAL);
    expect(turns).toEqual([]);
  });

  test("the AUTHOR losing host REFUSES the confirm — the confirmer's own host role never stands in", async () => {
    const { fixture, turns } = await suggestFixture();
    await enableConfirmFirstRule(fixture);
    await fireChatOpened(fixture);
    const [ask] = fixture.ctx.suggestions.listForChat(fixture.chatId, FIXED_NOW_MS);

    // A second human takes the room; the author is demoted to member. The NEW host confirms — and is
    // refused, because the ask would execute as the author, who no longer holds authority.
    const newHost = await handOffHost(fixture, "user_new_host");
    expect(newHost).not.toBe(fixture.host);

    await expect(
      fixture.svc.confirmSuggestion({ principal: principal(newHost), suggestionId: ask?.id ?? mintTypeId(ID_PREFIX.automationSuggestion) }),
    ).rejects.toThrow(AUTHOR_LOST);
    expect(turns).toEqual([]);
  });

  test("RULED — VOID-ALL on host handoff: the `chatUpdated` the handoff emits sweeps the room's asks", async () => {
    const { fixture } = await suggestFixture();
    await enableConfirmFirstRule(fixture);
    await fireChatOpened(fixture);
    expect(fixture.ctx.suggestions.countForChat(fixture.chatId)).toBe(1);

    // The handoff itself (chat's `acceptHostHandoff` swaps the roles and emits `chatUpdated`).
    const newHost = await handOffHost(fixture, "user_new_host");
    expect(newHost).not.toBe(fixture.host);

    await fixture.svc.handleEvent({ type: "chatUpdated", chatId: fixture.chatId });

    expect(fixture.ctx.suggestions.countForChat(fixture.chatId)).toBe(0);
  });

  test("a chat-row change that does NOT move authority keeps the ask (the sweep re-proves, it does not clear)", async () => {
    const { fixture } = await suggestFixture();
    await enableConfirmFirstRule(fixture);
    await fireChatOpened(fixture);

    await fixture.svc.handleEvent({ type: "chatUpdated", chatId: fixture.chatId });

    expect(fixture.ctx.suggestions.countForChat(fixture.chatId)).toBe(1);
  });
});

describe("the rate-refusal invitation (RULED F4)", () => {
  /** Enable a SPEND rule with its fire-rate ceiling slammed shut. */
  async function enableRateCappedSpendRule(fx: Awaited<ReturnType<typeof ruleFixture>>): Promise<AutomationRuleId> {
    const rule = await fx.svc.createRule({
      principal: principal(fx.host),
      chatId: fx.chatId,
      name: "pacing",
      trigger: { bus: "chat", type: "chatOpened" },
      actions: [{ type: "trigger_turn", guidedTemplate: "Nudge the pacing." }],
      // A per-rule ceiling of ZERO — the loop-safety belt the host themselves sets.
      maxFiresPerHour: 0,
    });
    await fx.svc.setRuleEnabled({ principal: principal(fx.host), ruleId: rule.id, enabled: true });
    await fx.ctx.enabled.reload();
    return rule.id;
  }

  test("a budget_refused on a SPEND rule raises the invitation — rule reference only, no stashed payload", async () => {
    const { fixture, turns } = await suggestFixture();
    await enableRateCappedSpendRule(fixture);
    await fireChatOpened(fixture);

    expect(turns).toEqual([]);
    const [ask] = fixture.ctx.suggestions.listForChat(fixture.chatId, FIXED_NOW_MS);
    expect(ask?.kind).toBe("invitation");
    // No TOCTOU by construction: `budget_refused` precedes predicate and env, so there is nothing to stash.
    expect(ask?.payload).toBeNull();
    expect(ask?.summary).toContain("rate cap");
  });

  test("CONFIRMING an invitation is a FRESH host run — it runs past the rate cap that raised it", async () => {
    const { fixture, turns } = await suggestFixture();
    const ruleId = await enableRateCappedSpendRule(fixture);
    await fireChatOpened(fixture);
    const [ask] = fixture.ctx.suggestions.listForChat(fixture.chatId, FIXED_NOW_MS);

    const result = await fixture.svc.confirmSuggestion({
      principal: principal(fixture.host),
      suggestionId: ask?.id ?? mintTypeId(ID_PREFIX.automationSuggestion),
    });

    expect(result).toEqual({ ran: "fresh-run", outcome: "fired" });
    // The arm really ran, as the AUTHOR, at depth 0's child depth.
    expect(turns).toEqual([{ authorUserId: fixture.host, ruleId, chatId: fixture.chatId, automationDepth: 1, guided: "Nudge the pacing." }]);
  });

  test("a NON-spend rule's refusal raises NO invitation (F4 is ON for spend arms, and only those)", async () => {
    const { fixture } = await suggestFixture();
    const rule = await fixture.svc.createRule({
      principal: principal(fixture.host),
      chatId: fixture.chatId,
      name: "bookkeeping",
      trigger: { bus: "chat", type: "chatOpened" },
      actions: [{ type: "set_variable", scope: "chat", key: "opened", op: "inc" }],
      maxFiresPerHour: 0,
    });
    await fixture.svc.setRuleEnabled({ principal: principal(fixture.host), ruleId: rule.id, enabled: true });
    await fixture.ctx.enabled.reload();

    await fireChatOpened(fixture);

    expect(fixture.ctx.suggestions.countForChat(fixture.chatId)).toBe(0);
  });

  // ── B4, the PER-RULE OPT-OUT. The pair below is the whole knob: the SAME refusal, on the SAME
  //    spend-armed rule, at the SAME cap, raises an ask when the rule offers and raises NOTHING when the
  //    host has opted that one rule out. One of them is already pinned above ("a budget_refused on a SPEND
  //    rule raises the invitation"), so the opted-out arm is the delta — and it is asserted on the ASK
  //    COUNT, which is what a host actually sees, rather than on the flag it was set from. ──
  test("B4 — an OPTED-OUT rule's refusal raises NO invitation, though its arms still qualify", async () => {
    const { fixture } = await suggestFixture();
    await enableRateCappedSpendRule(fixture);
    const [rule] = await fixture.svc.listRules({ principal: principal(fixture.host), chatId: fixture.chatId });
    if (rule === undefined) {
      throw new Error("the rate-capped spend rule was not listed");
    }
    // The arm shape has NOT changed — this rule still carries `trigger_turn`, so `invitesOnRefusal` still
    // says yes. Only the host's standing answer moved.
    expect(rule.suggestOnRefusal).toBe(true);
    await fixture.svc.setRuleSuggestOnRefusal({ principal: principal(fixture.host), ruleId: rule.id, suggestOnRefusal: false });

    await fireChatOpened(fixture);

    expect(fixture.ctx.suggestions.countForChat(fixture.chatId)).toBe(0);
  });

  test("B4 — turning the offer back ON restores the invitation on the very next refusal (no reload seam)", async () => {
    const { fixture } = await suggestFixture();
    await enableRateCappedSpendRule(fixture);
    const [rule] = await fixture.svc.listRules({ principal: principal(fixture.host), chatId: fixture.chatId });
    if (rule === undefined) {
      throw new Error("the rate-capped spend rule was not listed");
    }
    await fixture.svc.setRuleSuggestOnRefusal({ principal: principal(fixture.host), ruleId: rule.id, suggestOnRefusal: false });
    await fireChatOpened(fixture);
    expect(fixture.ctx.suggestions.countForChat(fixture.chatId)).toBe(0);

    await fixture.svc.setRuleSuggestOnRefusal({ principal: principal(fixture.host), ruleId: rule.id, suggestOnRefusal: true });
    await fireChatOpened(fixture);

    // The dispatch reads the column off the rule ROW it loads per fire, so there is no index to reconcile
    // and no stale-cache window — the flip is live on the next event.
    const [ask] = fixture.ctx.suggestions.listForChat(fixture.chatId, FIXED_NOW_MS);
    expect(ask?.kind).toBe("invitation");
  });

  test("repeated refusals REPLACE one invitation — a capped rule cannot wallpaper the band", async () => {
    const { fixture } = await suggestFixture();
    await enableRateCappedSpendRule(fixture);
    await fireChatOpened(fixture);
    await fireChatOpened(fixture);
    await fireChatOpened(fixture);

    expect(fixture.ctx.suggestions.countForChat(fixture.chatId)).toBe(1);
  });
});

/** A second chat proves `voidChat` is scoped — the handoff sweep must not touch another room. */
test("the handoff sweep is per-ROOM", async () => {
  const { fixture } = await suggestFixture();
  await enableConfirmFirstRule(fixture);
  await fireChatOpened(fixture);
  const otherChat: ChatId = await seedChat(fixture.db, "auto_other");
  const otherUser: UserId = fixture.host;
  await seedParticipant(fixture.db, { chatId: otherChat, key: "other_host", userId: otherUser, role: "host" });

  await fixture.svc.handleEvent({ type: "chatUpdated", chatId: otherChat });

  expect(fixture.ctx.suggestions.countForChat(fixture.chatId)).toBe(1);
});

// ── PLUGINS JOIN THE THREE-POSTURE LAW (the #24 follow-on) ────────────────────────────────────────────
// A plugin whose installer is not host of the invocation chat now ASKS instead of taking a flat refusal, and
// its ask lands in this SAME store, answered by this SAME verb. What these rows pin is the part that could
// silently go wrong: the confirmed act must re-enter through the PLUGIN's own executor (the enforcement set
// follows the ORIGIN), and the two liveness re-checks must each fail CLOSED.

const PLUGIN_ID = castId<PluginId>("plugin_confirm00000000000001");
const PLUGIN_GONE = /no longer installed or enabled/u;
const INSTALLER_LOST = /installer no longer hosts this room/u;

/** A fixture whose plugin arm RECORDS what it was asked to execute, with injectable liveness. */
async function pluginAskFixture(over: { readonly live?: boolean; readonly failExec?: boolean } = {}): Promise<{
  fixture: Awaited<ReturnType<typeof ruleFixture>>;
  executed: Parameters<ExecutePluginSuggestion>[0][];
}> {
  const executed: Parameters<ExecutePluginSuggestion>[0][] = [];
  const fixture = await ruleFixture({
    isPluginLive: () => Promise.resolve(over.live ?? true),
    executePluginSuggestion: (req): Promise<void> => {
      executed.push(req);
      return over.failExec === true ? Promise.reject(new Error("the book is not attached to this chat")) : Promise.resolve();
    },
  });
  return { fixture, executed };
}

/** Raise a plugin-origin ask straight into the fixture's store, as the membrane→bridge→raiser path would. */
function raisePluginAsk(fx: Awaited<ReturnType<typeof ruleFixture>>, actorUserId: UserId): AutomationSuggestionId {
  const id = mintTypeId(ID_PREFIX.automationSuggestion);
  fx.ctx.suggestions.raise({
    id,
    kind: "confirm",
    chatId: fx.chatId,
    source: { kind: "plugin", pluginId: PLUGIN_ID },
    actorUserId,
    summary: "“Weather Teller” wants to save a lore entry for “storm”. Allow it?",
    expiresAt: FIXED_NOW_MS + 1_800_000,
    payload: {
      via: "plugin-act",
      act: { kind: "worldInfoUpsert", entry: { bookId: "wbook_x", entryKey: "storm", keys: [], contentTemplate: "it rains", position: "before" } },
    },
  });
  return id;
}

describe("S4 — a PLUGIN-origin ask", () => {
  test("confirming runs it through the PLUGIN's executor, as the INSTALLER, and never through runArm", async () => {
    // THE ENFORCEMENT-SET PIN. `runArm` is the not-wired dispatcher in this harness, so if the confirm had
    // routed a plugin act through automation's arm path this would come back `action_error` with nothing
    // recorded. `fired` + one recorded call is the proof it took the plugin's own door.
    const { fixture, executed } = await pluginAskFixture();
    const id = raisePluginAsk(fixture, fixture.host);

    const result = await fixture.svc.confirmSuggestion({ principal: principal(fixture.host), suggestionId: id });

    expect(result).toEqual({ ran: "stashed-arm", outcome: "fired" });
    expect(executed).toHaveLength(1);
    // The act runs as the INSTALLER — the confirmer authorizes, never substitutes (§3-S4's identity law, in
    // the plugin's spelling).
    expect(executed[0]?.installerUserId).toBe(fixture.host);
    expect(executed[0]?.pluginId).toBe(PLUGIN_ID);
    expect(executed[0]?.act.kind).toBe("worldInfoUpsert");
  });

  test("a DISABLED / uninstalled plugin refuses typed — the card is not one more act after the owner said stop", async () => {
    const { fixture, executed } = await pluginAskFixture({ live: false });
    const id = raisePluginAsk(fixture, fixture.host);

    await expect(fixture.svc.confirmSuggestion({ principal: principal(fixture.host), suggestionId: id })).rejects.toThrow(PLUGIN_GONE);
    expect(executed).toEqual([]);
  });

  test("an installer who LOST host refuses — the confirmer's own host role never stands in (fail-closed handoff)", async () => {
    // The owner-ruled wall: on a handoff the pending ask dies. No re-mint, no transfer to the new host.
    const { fixture, executed } = await pluginAskFixture();
    const id = raisePluginAsk(fixture, fixture.host);
    const newHost = await handOffHost(fixture, "plugin_newhost");

    await expect(fixture.svc.confirmSuggestion({ principal: principal(newHost), suggestionId: id })).rejects.toThrow(INSTALLER_LOST);
    expect(executed).toEqual([]);
  });

  test("TAKE-ONCE holds across the origin branch — a double confirm executes exactly once", async () => {
    const { fixture, executed } = await pluginAskFixture();
    const id = raisePluginAsk(fixture, fixture.host);

    const settled = await Promise.allSettled([
      fixture.svc.confirmSuggestion({ principal: principal(fixture.host), suggestionId: id }),
      fixture.svc.confirmSuggestion({ principal: principal(fixture.host), suggestionId: id }),
    ]);

    expect(settled.filter((s) => s.status === "fulfilled")).toHaveLength(1);
    expect(executed).toHaveLength(1);
  });

  test("a non-host member cannot confirm a plugin's ask (the host gate is origin-blind)", async () => {
    const { fixture, executed } = await pluginAskFixture();
    const id = raisePluginAsk(fixture, fixture.host);
    const member = await seedUser(fixture.db, "plugin_member");
    await seedParticipant(fixture.db, { chatId: fixture.chatId, key: "plugin_member", userId: member, role: "member" });

    await expect(fixture.svc.confirmSuggestion({ principal: principal(member), suggestionId: id })).rejects.toThrow();
    expect(executed).toEqual([]);
  });

  test("a stranger gets the leak-free NOT_FOUND, learning nothing about the room or the plugin", async () => {
    const { fixture, executed } = await pluginAskFixture();
    const id = raisePluginAsk(fixture, fixture.host);
    const stranger = await seedUser(fixture.db, "plugin_stranger");

    await expect(fixture.svc.confirmSuggestion({ principal: principal(stranger), suggestionId: id })).rejects.toThrow(SUGGESTION_REFUSAL);
    expect(executed).toEqual([]);
  });

  test("a REFUSED act is errors-as-data (`action_error`), and the ask is spent either way", async () => {
    // The plugin's own gates run at confirm time on the CURRENT tree — a book detached between the ask and
    // the answer refuses, which is the room withdrawing its consent. The host is told; nothing is retried
    // against dead state.
    const { fixture, executed } = await pluginAskFixture({ failExec: true });
    const id = raisePluginAsk(fixture, fixture.host);

    const result = await fixture.svc.confirmSuggestion({ principal: principal(fixture.host), suggestionId: id });

    expect(result).toEqual({ ran: "stashed-arm", outcome: "action_error" });
    expect(executed).toHaveLength(1);
    expect(fixture.ctx.suggestions.peek(id, FIXED_NOW_MS)).toBeNull();
  });

  test("DISMISS works on a plugin ask exactly as on a rule's, and executes nothing", async () => {
    const { fixture, executed } = await pluginAskFixture();
    const id = raisePluginAsk(fixture, fixture.host);

    await fixture.svc.dismissSuggestion({ principal: principal(fixture.host), suggestionId: id });

    expect(fixture.ctx.suggestions.peek(id, FIXED_NOW_MS)).toBeNull();
    expect(executed).toEqual([]);
  });

  test("the host-handoff SWEEP voids a plugin's pending ask (the actor is the installer, one field, one rule)", async () => {
    const { fixture } = await pluginAskFixture();
    raisePluginAsk(fixture, fixture.host);
    expect(fixture.ctx.suggestions.countForChat(fixture.chatId)).toBe(1);

    await handOffHost(fixture, "plugin_sweep_newhost");
    await fixture.svc.handleEvent({ type: "chatUpdated", chatId: fixture.chatId });

    expect(fixture.ctx.suggestions.countForChat(fixture.chatId)).toBe(0);
  });
});

describe('S5 — an ANALYSIS-origin confirm (the {via:"analysis"} payload arm)', () => {
  test("confirming a steer card writes the guidance through the analysis executor and records a `fired` row naming the act", async () => {
    const { fixture } = await suggestFixture();
    // An enabled analysis rule (the state row's FK parent + the liveness re-check's subject).
    const rule = await fixture.svc.createRule({
      principal: principal(fixture.host),
      chatId: fixture.chatId,
      name: "analysis",
      trigger: { bus: "chat", type: "turnCompleted" },
      actions: [{ type: "run_analysis", brief: "b", routes: { steer: { apply: "confirm" } } }],
    });
    await fixture.svc.setRuleEnabled({ principal: principal(fixture.host), ruleId: rule.id, enabled: true });
    // The card, as the engine raises it (the raise mechanics have their own engine pins — this suite owns
    // the VERB branch: claim, re-checks, the analysis executor, the fire row).
    const suggestionId = castId<AutomationSuggestionId>(mintTypeId(ID_PREFIX.automationSuggestion));
    fixture.ctx.suggestions.raise({
      id: suggestionId,
      kind: "confirm",
      chatId: fixture.chatId,
      source: { kind: "rule", ruleId: rule.id },
      actorUserId: fixture.host,
      summary: "Adopt story guidance?",
      expiresAt: FIXED_NOW_MS + 1,
      payload: { via: "analysis", act: { kind: "steer", guidance: "Plant the courier's absence. {{getglobalvar::x}}" } },
    });

    const result = await fixture.svc.confirmSuggestion({ principal: principal(fixture.host), suggestionId });
    expect(result).toEqual({ ran: "stashed-arm", outcome: "fired" });

    // The guidance landed VERBATIM (braces intact — §2 law 6)…
    const { selectRuleState } = await import("../../../../../packages/server/src/domain/automation/persistence/rule-state.ts");
    expect((await selectRuleState(fixture.db, rule.id)).guidance).toBe("Plant the courier's absence. {{getglobalvar::x}}");
    // …and the fire log names the confirmer AND the act (the host's "why did this run" answer).
    const fires = await fixture.svc.listFires({ principal: principal(fixture.host), ruleId: rule.id });
    expect(fires[0]?.outcome).toBe("fired");
    expect(fires[0]?.detail).toMatchObject({ confirmedByUserId: fixture.host, suggestionId, armType: "run_analysis", analysisAct: "steer" });
  });
});

// -- #1425: the confirmed terminal is ONE write ------------------------------------------------------------
// A confirmed act has ALREADY happened by the time the terminal is written, and the ask is spent take-once --
// so there is no retry and no rollback. `stampRuleFired` and `insertFire` used to be two sequential awaited
// writes: a failure between them left an APPLIED action with `last_fired_at` moved and no fire row, i.e. a
// cooldown the host cannot see the reason for, in the one log that exists to answer "why did this run".
// They are one batch now, and this is the case that tells the two shapes apart.
describe("#1425 the confirmed fire row and the rule stamp land together or not at all", () => {
  test("a fire row the DB refuses leaves the rule UNSTAMPED — no half terminal", async () => {
    const base = await ruleFixture();
    const { ops, turns } = capturingOps(base.ctx.ops);
    // A FIXED fire id, so the row the confirm is about to write collides with one already in the table. This
    // is the "the second write fails" arm, made deterministic: the batch must take the stamp down with it.
    const collidingId = mintTypeId(ID_PREFIX.automationFire);
    const ctx: AutomationContext = {
      ...base.ctx,
      ops,
      newFireId: () => collidingId,
      runArm: createArmExecutors({
        db: base.db,
        ops,
        prng: () => 0.42,
        notify: base.ctx.notify,
        suggestions: base.ctx.suggestions,
        newSuggestionId: base.ctx.newSuggestionId,
      }),
    };
    const fixture = { ...base, ctx, svc: createAutomationService(ctx) };
    const ruleId = await enableConfirmFirstRule(fixture);
    await fireChatOpened(fixture);
    const [ask] = fixture.ctx.suggestions.listForChat(fixture.chatId, FIXED_NOW_MS);
    // Occupy the id the confirm will mint (a `test_run` row — an ordinary terminal, not a reservation).
    await fixture.db.insert(automationFires).values({
      id: collidingId,
      ruleId: castId(ruleId),
      chatId: fixture.chatId,
      triggerType: "chatOpened",
      outcome: "test_run",
      detail: null,
      automationDepth: 0,
      firedAt: FIXED_NOW_MS,
    });

    await expect(
      fixture.svc.confirmSuggestion({ principal: principal(fixture.host), suggestionId: ask?.id ?? mintTypeId(ID_PREFIX.automationSuggestion) }),
    ).rejects.toThrow();

    // The arm DID run (that is what makes the half-terminal unrecoverable) -- the control for the assertion below.
    expect(turns).toHaveLength(1);
    // And the rule is untouched: no cooldown stamp for a fire the log never recorded.
    const rows = await fixture.svc.listRules({ principal: principal(fixture.host), chatId: fixture.chatId });
    expect(rows.find((row) => row.id === castId(ruleId))?.lastFiredAt).toBeNull();
  });
});

// -- #1565: a CONFIRMED arm takes the chat's serial lane too -------------------------------------------------
// The third door into the same chat variable env, after the bus (#1423) and "Run now" (#1565's other half). A
// host answering a card while a bus event is mid-arm used to run beside it: same snapshot, same increment,
// same value written twice. The confirm's INVITATION branch is not laned here -- it goes through
// `dispatchRuleNow`, which takes the lane itself, and the two branches are exclusive so the lane is entered
// exactly once.
describe("#1565 a confirmed stashed arm queues behind an in-flight bus event", () => {
  test("the confirm's arm starts only after the bus event's arm finishes -- no interleave", async () => {
    const order: string[] = [];
    let releaseBus = (): void => undefined;
    const busHeld = new Promise<void>((done) => {
      releaseBus = done;
    });
    const base = await ruleFixture();
    const { ops, turns } = capturingOps(base.ctx.ops);
    const realArm = createArmExecutors({
      db: base.db,
      ops,
      prng: () => 0.42,
      notify: base.ctx.notify,
      suggestions: base.ctx.suggestions,
      newSuggestionId: base.ctx.newSuggestionId,
    });
    // Instrumented over the REAL executors, because the STASH is the real arm's own act -- a fake dispatcher
    // that merely answers `{suggested: true}` raises no card and there would be nothing to confirm.
    // `hold` is armed for exactly one `set_variable` (the bus rule's arm); the CONFIRMED arm is told apart by
    // `confirmFirst === false`, which is what `armToExecute` clears (`substrate/suggestions.ts:235`), so the
    // re-stash the held bus event also performs cannot be mistaken for it.
    let hold: Promise<void> | null = null;
    const ctx: AutomationContext = {
      ...base.ctx,
      ops,
      runArm: async (action, frame) => {
        if (action.type === "set_variable" && hold !== null) {
          const held = hold;
          hold = null;
          order.push("bus:enter");
          await held;
          const out = await realArm(action, frame);
          order.push("bus:exit");
          return out;
        }
        if (action.type === "trigger_turn" && !action.confirmFirst) {
          order.push("confirm:enter");
          const out = await realArm(action, frame);
          order.push("confirm:exit");
          return out;
        }
        return realArm(action, frame);
      },
    };
    const fixture = { ...base, ctx, svc: createAutomationService(ctx) };

    // TWO rules on one chat: an ordinary arm to hold the lane with, and the confirm-first arm that raises the
    // card. Both fire off the same `chatOpened`, in position order.
    const holder = await fixture.svc.createRule({
      principal: principal(fixture.host),
      chatId: fixture.chatId,
      name: "bookkeeping",
      trigger: { bus: "chat", type: "chatOpened" },
      actions: [{ type: "set_variable", scope: "chat", key: "beats", op: "inc" }],
    });
    const asker = await fixture.svc.createRule({
      principal: principal(fixture.host),
      chatId: fixture.chatId,
      name: "recap",
      trigger: { bus: "chat", type: "chatOpened" },
      actions: [{ type: "trigger_turn", guidedTemplate: "Recap the scene.", confirmFirst: true }],
    });
    await fixture.svc.setRuleEnabled({ principal: principal(fixture.host), ruleId: holder.id, enabled: true });
    await fixture.svc.setRuleEnabled({ principal: principal(fixture.host), ruleId: asker.id, enabled: true });
    await ctx.enabled.reload();

    // 1. Raise the card.
    await fixture.svc.handleEvent({ type: "chatOpened", chatId: fixture.chatId });
    const [ask] = fixture.ctx.suggestions.listForChat(fixture.chatId, FIXED_NOW_MS);
    expect(ask).toBeDefined();
    expect(turns).toEqual([]); // the ask did not act -- the control for everything below

    // 2. Park a bus event inside the bookkeeping arm.
    hold = busHeld;
    const bus = fixture.svc.handleEvent({ type: "chatOpened", chatId: fixture.chatId });
    await new Promise((resolve) => setTimeout(resolve, 0));

    // 3. The host says yes WHILE that arm is parked.
    const confirm = fixture.svc.confirmSuggestion({
      principal: principal(fixture.host),
      suggestionId: ask?.id ?? mintTypeId(ID_PREFIX.automationSuggestion),
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    releaseBus();
    await Promise.all([bus, confirm]);

    // Unlaned this reads ["bus:enter", "confirm:enter", "confirm:exit", "bus:exit"].
    expect(order).toEqual(["bus:enter", "bus:exit", "confirm:enter", "confirm:exit"]);
    expect(turns).toHaveLength(1); // and the confirmed act really ran, exactly once
  });
});
