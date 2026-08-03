// domain/automation/engine/dispatch — the per-event dispatch sequence (04 §3). For each matched enabled rule,
// SEQUENTIALLY (arms mutate the shared variable env — order IS semantics): parse the actions (corrupt blob →
// disable that ONE rule), gate cascade depth → author authority → the fire-rate cap → the CEL predicate, then
// run the arms through the injected `runArm` dispatcher seam (A6 fills it; a refused arm records `action_error`).
// Every rule body is independent — a throw/failure never touches
// sibling rules, the watcher loop, or the turn (the handler is fire-and-forget off the bus).
// `consecutive_errors` increments on predicate/action/authority errors, resets on a clean fire, and
// auto-disables the rule at 20 (02 §1) with a DURABLE `automation-notice` to the author (so a rotting rule is
// visible even if the author has no live `automation.stream` open) PLUS the transient `ruleAutoDisabled` bus
// event (host-only on the A8b member-stream).
//
// A5 owns the ENGINE + the typed dispatch seam; A6 wires the arm dispatcher in. Reserved arms never reach here
// (createRule refuses them); the v1-unwired arms return a typed refusal.

import type { AutomationAction, AutomationCelEnv, AutomationFireOutcome } from "@orb/contracts/automation";
import { automationActionsSchema } from "@orb/contracts/automation";
import { AUTOMATION_DEPTH_HARD_CAP } from "@orb/contracts/chat";
import { AUTOMATION_NOTICE_MESSAGE_MAX } from "@orb/contracts/notifications";
import type { ChatId } from "@orb/kit/ids";
import { getLog } from "#foundation/observability";
import type { ArmOutcome, DispatchFrame, ResolvedTrigger, RuleRow } from "../contract/ops.ts";
import type { AutomationContext } from "../contract/service.ts";
import { loadCallerRole } from "../persistence/canon-reads.ts";
import { insertFire } from "../persistence/fires.ts";
import { disableRule, recordRuleError, stampRuleFired } from "../persistence/rules.ts";
import { buildCelEnv } from "../substrate/cel-env.ts";
import { evaluatePredicate } from "../substrate/dry-run.ts";
import { checkBudget } from "./budget-gate.ts";

// The hard cascade-depth cap is homed ONCE in `@orb/contracts/chat` (turn-origin depth vocabulary, below both
// chat + automation — chat's `requestTurn` write-side belt cannot import automation, so the shared home must
// sit under both, and every consumer imports it from there: rule dispatch (here) + chat requestTurn + the
// plugin subscriber fan-out — ONE cascade guard, per plugin-design/04 §P4 flag 3).
/** Consecutive predicate/action/authority errors that auto-disable a rule (02 §1). */
const CONSECUTIVE_ERROR_DISABLE_AT = 20;

/** Whether a rule was disabled this dispatch (a corrupt blob or the 20-error ceiling) — the caller reloads
 *  the enabled index when true. */
interface RuleResult {
  readonly disabled: boolean;
}

const NOT_DISABLED: RuleResult = { disabled: false };
const DISABLED: RuleResult = { disabled: true };

interface DispatchDeps {
  readonly resolved: ResolvedTrigger;
  readonly nowMs: number;
  /** Per-chat CEL env cache — chat-bus rules share one chat; a domain event's rules span chats. */
  readonly envCache: Map<ChatId, AutomationCelEnv>;
}

/** One rule's dispatch bundle — the rule + its resolved chat + the batch deps (keeps the gate/record helpers
 *  under the 4-param bar). */
interface RuleCtx {
  readonly ctx: AutomationContext;
  readonly rule: RuleRow;
  readonly chatId: ChatId;
  readonly deps: DispatchDeps;
}

/** Write a fire-log row for a rule×event terminal. */
function record(rc: RuleCtx, outcome: AutomationFireOutcome, detail: Record<string, unknown> | null): Promise<void> {
  return insertFire(rc.ctx.db, {
    id: rc.ctx.newFireId(),
    ruleId: rc.rule.id,
    chatId: rc.chatId,
    triggerType: rc.rule.triggerType,
    outcome,
    detail,
    automationDepth: rc.deps.resolved.automationDepth,
    firedAt: rc.deps.nowMs,
  });
}

/** The DURABLE author notice on auto-disable (02 §1 / 04 §3): the transient `ruleAutoDisabled` bus event only
 *  reaches an author with a live `automation.stream` open (A8b), so a rule could rot unseen. This emits an
 *  `automation-notice` to the rule AUTHOR through the SAME durable inbox path `post_notification` uses, so the
 *  author learns their rule stopped even with no live stream. Best-effort: a notify fault must never abort the
 *  (already-committed) disable — the rule IS disabled regardless of whether the notice delivered. */
async function notifyAutoDisabled(rc: RuleCtx): Promise<void> {
  const message = `Automation rule "${rc.rule.name}" was auto-disabled after ${CONSECUTIVE_ERROR_DISABLE_AT} consecutive errors.`.slice(
    0,
    AUTOMATION_NOTICE_MESSAGE_MAX,
  );
  try {
    await rc.ctx.ops.notifications.emit({
      type: "automation-notice",
      recipientUserId: rc.rule.ownerId,
      chatId: rc.chatId,
      source: { kind: "rule", ruleId: rc.rule.id },
      message,
    });
  } catch (err) {
    getLog().warn({ err: err instanceof Error ? err.message : String(err), ruleId: rc.rule.id }, "automation: auto-disable author notice failed (isolated)");
  }
}

/** Record a rule ERROR (predicate/action/authority): increment the ledger, log the fire, emit `ruleErrored`,
 *  and auto-disable at the ceiling — a DURABLE `automation-notice` to the author (`notifyAutoDisabled`) PLUS
 *  the transient `ruleAutoDisabled` bus event. Returns whether the rule was disabled. */
async function onRuleError(rc: RuleCtx, outcome: AutomationFireOutcome, detail: Record<string, unknown>): Promise<RuleResult> {
  await record(rc, outcome, detail);
  const errors = await recordRuleError(rc.ctx.db, rc.rule.id, outcome, rc.deps.nowMs);
  rc.ctx.notify({ type: "ruleErrored", chatId: rc.chatId, ruleId: rc.rule.id });
  if (errors >= CONSECUTIVE_ERROR_DISABLE_AT) {
    await disableRule(rc.ctx.db, rc.rule.id, "auto-disabled: consecutive error ceiling", rc.deps.nowMs);
    await notifyAutoDisabled(rc);
    rc.ctx.notify({ type: "ruleAutoDisabled", chatId: rc.chatId, ruleId: rc.rule.id });
    return DISABLED;
  }
  return NOT_DISABLED;
}

/** The author still holds host on the chat (03 §2) — a demoted/removed ex-host's rule stops firing. `null`
 *  role or a `can()` throw ⇒ refused. */
async function holdsAuthority(rc: RuleCtx): Promise<boolean> {
  const [author, role] = await Promise.all([rc.ctx.resolveAuthor(rc.rule.ownerId), loadCallerRole(rc.ctx.db, rc.chatId, rc.rule.ownerId)]);
  if (author === null || role === undefined) {
    return false;
  }
  try {
    rc.ctx.can(author, "host", { kind: "chat", roster: { role } });
    return true;
  } catch {
    return false;
  }
}

/** A rule's arm run terminal: `null` = every arm succeeded; else the aborting arm's `arm_error` detail. */
interface ArmsResult {
  readonly detail: Record<string, unknown>;
}

/** Run a rule's arms sequentially through the injected seam; the FIRST non-ok outcome aborts the rest (04 §3
 *  step 5 — arms may depend on each other). Recursion (not a loop) expresses the sequential-with-early-abort:
 *  arms share + mutate the env, order IS semantics. */
async function runArms(ctx: AutomationContext, actions: readonly AutomationAction[], frame: DispatchFrame, i = 0): Promise<ArmsResult | null> {
  const arm = actions[i];
  if (arm === undefined) {
    return null; // past the last arm — every arm succeeded.
  }
  const outcome: ArmOutcome = await ctx.runArm(arm, frame);
  if (!outcome.ok) {
    return { detail: { armIndex: i, armType: arm.type, error: outcome.detail } };
  }
  return runArms(ctx, actions, frame, i + 1);
}

/** The env for a rule's chat — built once per chat per dispatch batch (03 §3 fold cache read). */
async function envFor(rc: RuleCtx): Promise<AutomationCelEnv> {
  const cached = rc.deps.envCache.get(rc.chatId);
  if (cached !== undefined) {
    return cached;
  }
  const env = await buildCelEnv({
    ops: rc.ctx.ops,
    db: rc.ctx.db,
    authorUserId: rc.rule.ownerId,
    chatId: rc.chatId,
    fact: rc.deps.resolved.fact,
    nowMs: rc.deps.nowMs,
  });
  rc.deps.envCache.set(rc.chatId, env);
  return env;
}

/** Depth + authority + budget gates. `null` ⇒ proceed to the predicate; else the rule's terminal result. */
async function runGates(rc: RuleCtx): Promise<RuleResult | null> {
  const eventDepth = rc.deps.resolved.automationDepth;
  if (eventDepth >= AUTOMATION_DEPTH_HARD_CAP) {
    await record(rc, "depth_refused", { eventDepth });
    return NOT_DISABLED;
  }
  if (eventDepth >= 1 && !rc.rule.matchAutomationEvents) {
    return NOT_DISABLED; // default-suppressed cascade event — record NOTHING (04 §3 step 1).
  }
  if (!(await holdsAuthority(rc))) {
    return onRuleError(rc, "authority_refused", { code: "author-lost-authority" });
  }
  const budget = await checkBudget(rc.ctx.db, { rule: rc.rule, chatId: rc.chatId, nowMs: rc.deps.nowMs });
  if (!budget.ok) {
    await record(rc, "budget_refused", { limit: budget.detail });
    return NOT_DISABLED;
  }
  return null;
}

/** Dispatch ONE rule through the full sequence. Any thrown error is caught by the caller (error isolation). */
async function dispatchRule(rc: RuleCtx, actions: readonly AutomationAction[]): Promise<RuleResult> {
  const gated = await runGates(rc);
  if (gated !== null) {
    return gated;
  }
  const env = await envFor(rc);
  const predicate = evaluatePredicate(rc.rule.predicateCel, env);
  if (typeof predicate === "object") {
    return onRuleError(rc, "predicate_error", { error: predicate.error });
  }
  if (!predicate) {
    if (rc.rule.lastFiredAt !== null) {
      await record(rc, "predicate_false", null); // logged only after a first fire (LEAN first-match debug).
    }
    return NOT_DISABLED;
  }
  const eventDepth = rc.deps.resolved.automationDepth;
  const frame: DispatchFrame = {
    chatId: rc.chatId,
    authorUserId: rc.rule.ownerId,
    fact: rc.deps.resolved.fact,
    env,
    origin: { ruleId: rc.rule.id, automationDepth: eventDepth + 1 },
    now: rc.deps.nowMs,
  };
  let armsResult: ArmsResult | null;
  try {
    armsResult = await runArms(rc.ctx, actions, frame);
  } catch (err) {
    // A throwing arm (a bad op / db fault mid-rule) — treat as `action_error`.
    getLog().warn({ err: err instanceof Error ? err.message : String(err), ruleId: rc.rule.id }, "automation dispatch: arm threw (isolated)");
    armsResult = { detail: { error: err instanceof Error ? err.message : String(err) } };
  }
  return finalizeRule(rc, armsResult);
}

/** Record the rule's terminal fire (04 §3 step 6). `armsResult` null ⇒ every arm ok (fired); else the
 *  aborting arm's `action_error` detail. */
async function finalizeRule(rc: RuleCtx, armsResult: ArmsResult | null): Promise<RuleResult> {
  if (armsResult !== null) {
    return onRuleError(rc, "action_error", armsResult.detail);
  }
  await stampRuleFired(rc.ctx.db, rc.rule.id, rc.deps.nowMs);
  await record(rc, "fired", null);
  rc.ctx.notify({ type: "ruleFired", chatId: rc.chatId, ruleId: rc.rule.id });
  return NOT_DISABLED;
}

/** Parse a rule's actions (corrupt blob → disable that one rule) then dispatch it, error-isolated. */
async function runRule(ctx: AutomationContext, rule: RuleRow, deps: DispatchDeps): Promise<RuleResult> {
  if (rule.chatId === null) {
    return NOT_DISABLED; // v1 has no chat-less rule (the guard refuses it); defensive skip.
  }
  const rc: RuleCtx = { ctx, rule, chatId: rule.chatId, deps };
  const parsed = automationActionsSchema.safeParse(rule.actions);
  if (!parsed.success) {
    await disableRule(ctx.db, rule.id, "auto-disabled: corrupt actions blob", deps.nowMs);
    ctx.notify({ type: "ruleAutoDisabled", chatId: rc.chatId, ruleId: rule.id });
    return DISABLED;
  }
  // A transform-only rule (validate guarantees a `transform_draft` arm ⇒ ALL arms transform + turnStarted) is
  // NOT watcher-dispatched — it registers into the turn pipeline (A7, `engine/prompt-transforms`). Skip it here
  // silently: running its arms would record a spurious `action_error` (the arm's typed refusal) every turn.
  if (parsed.data.every((action) => action.type === "transform_draft")) {
    return NOT_DISABLED;
  }
  try {
    return await dispatchRule(rc, parsed.data);
  } catch (err) {
    getLog().warn({ err: err instanceof Error ? err.message : String(err), ruleId: rule.id }, "automation dispatch: rule body threw (isolated)");
    return onRuleError(rc, "action_error", { error: err instanceof Error ? err.message : String(err) });
  }
}

/** Run the dispatch sequence over the matched rules, sequentially (recursion, not a loop — position order IS
 *  semantics: arms mutate a shared per-chat env). Returns whether ANY rule was disabled (the caller reloads
 *  the enabled index). Each rule is error-isolated — a throw never aborts the batch. */
export function runDispatch(ctx: AutomationContext, rules: readonly RuleRow[], resolved: ResolvedTrigger): Promise<boolean> {
  const deps: DispatchDeps = { resolved, nowMs: ctx.now(), envCache: new Map() };
  const step = async (i: number, anyDisabled: boolean): Promise<boolean> => {
    const rule = rules[i];
    if (rule === undefined) {
      return anyDisabled;
    }
    const result = await runRule(ctx, rule, deps);
    return step(i + 1, anyDisabled || result.disabled);
  };
  return step(0, false);
}
