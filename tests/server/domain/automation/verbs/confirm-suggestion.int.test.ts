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
import type { AutomationSuggestionId, ChatId, PluginId, UserId } from "@orb/kit/ids";
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
    expect(ask?.payload).toBeNull();
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
