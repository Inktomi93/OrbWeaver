// S4 — THE AUTHORITY MATRIX (interaction-direction-spec §3-S4 + the §7 acceptance matrix). Every row here is
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

import { automationBudgets, chatParticipants } from "@orb/db";
import type { ChatId, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import type { AutomationOps, AutomationTurnRequest } from "@orb/server/domain/automation";
import { and, eq } from "drizzle-orm";
import { describe } from "vitest";
import type { AutomationContext } from "../../../../../packages/server/src/domain/automation/contract/service.ts";
import { createArmExecutors } from "../../../../../packages/server/src/domain/automation/engine/arm-executors.ts";
import { createAutomationService } from "../../../../../packages/server/src/domain/automation/service.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { seedChat, seedParticipant } from "../../chat/_support.ts";
import { FIXED_NOW_MS, principal, ruleFixture, seedUser } from "../_support.ts";

/** The typed refusal spellings the verbs throw (top-level — `useTopLevelRegex`). */
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
    expect(ask).toMatchObject({ kind: "confirm", ruleId, chatId: fixture.chatId, authorUserId: fixture.host });
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
    // THE IDENTITY LAW: the frame that executed is the AUTHOR's, with the author's steer, at the rule's own
    // cascade depth — the confirmer authorized it, they did not become its author.
    expect(turns).toEqual([{ authorUserId: fixture.host, chatId: fixture.chatId, automationDepth: 1, guided: "Recap the scene." }]);
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
  /** Enable a SPEND rule and slam the chat's fire-rate ceiling shut. */
  async function enableRateCappedSpendRule(fx: Awaited<ReturnType<typeof ruleFixture>>): Promise<ChatId> {
    const rule = await fx.svc.createRule({
      principal: principal(fx.host),
      chatId: fx.chatId,
      name: "pacing",
      trigger: { bus: "chat", type: "chatOpened" },
      actions: [{ type: "trigger_turn", guidedTemplate: "Nudge the pacing." }],
    });
    await fx.svc.setRuleEnabled({ principal: principal(fx.host), ruleId: rule.id, enabled: true });
    await fx.ctx.enabled.reload();
    // A per-chat ceiling of ZERO — the loop-safety belt the host themselves sets.
    await fx.db.insert(automationBudgets).values({ chatId: fx.chatId, maxFiresPerHour: 0, updatedAt: FIXED_NOW_MS });
    return fx.chatId;
  }

  test("a budget_refused on a SPEND rule raises the invitation — rule reference only, no stashed payload", async () => {
    const { fixture, turns } = await suggestFixture();
    await enableRateCappedSpendRule(fixture);
    await fireChatOpened(fixture);

    expect(turns).toEqual([]);
    const [ask] = fixture.ctx.suggestions.listForChat(fixture.chatId, FIXED_NOW_MS);
    expect(ask?.kind).toBe("invitation");
    // No TOCTOU by construction: `budget_refused` precedes predicate and env, so there is nothing to stash.
    expect(ask?.stashed).toBeNull();
    expect(ask?.summary).toContain("rate cap");
  });

  test("CONFIRMING an invitation is a FRESH host run — it runs past the rate cap that raised it", async () => {
    const { fixture, turns } = await suggestFixture();
    await enableRateCappedSpendRule(fixture);
    await fireChatOpened(fixture);
    const [ask] = fixture.ctx.suggestions.listForChat(fixture.chatId, FIXED_NOW_MS);

    const result = await fixture.svc.confirmSuggestion({
      principal: principal(fixture.host),
      suggestionId: ask?.id ?? mintTypeId(ID_PREFIX.automationSuggestion),
    });

    expect(result).toEqual({ ran: "fresh-run", outcome: "fired" });
    // The arm really ran, as the AUTHOR, at depth 0's child depth.
    expect(turns).toEqual([{ authorUserId: fixture.host, chatId: fixture.chatId, automationDepth: 1, guided: "Nudge the pacing." }]);
  });

  test("a NON-spend rule's refusal raises NO invitation (F4 is ON for spend arms, and only those)", async () => {
    const { fixture } = await suggestFixture();
    const rule = await fixture.svc.createRule({
      principal: principal(fixture.host),
      chatId: fixture.chatId,
      name: "bookkeeping",
      trigger: { bus: "chat", type: "chatOpened" },
      actions: [{ type: "set_variable", scope: "chat", key: "opened", op: "inc" }],
    });
    await fixture.svc.setRuleEnabled({ principal: principal(fixture.host), ruleId: rule.id, enabled: true });
    await fixture.ctx.enabled.reload();
    await fixture.db.insert(automationBudgets).values({ chatId: fixture.chatId, maxFiresPerHour: 0, updatedAt: FIXED_NOW_MS });

    await fireChatOpened(fixture);

    expect(fixture.ctx.suggestions.countForChat(fixture.chatId)).toBe(0);
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
