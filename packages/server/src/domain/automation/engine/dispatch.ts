// domain/automation/engine/dispatch — the per-event dispatch sequence. For each matched enabled rule,
// SEQUENTIALLY (arms mutate the shared variable env — order IS semantics): parse the actions (corrupt blob →
// disable that ONE rule), gate cascade depth → author authority → the fire-rate cap → the CEL predicate, then
// run the arms through the injected `runArm` dispatcher seam (a refused arm records `action_error`).
// Every rule body is independent — a throw/failure never touches
// sibling rules, the watcher loop, or the turn (the handler is fire-and-forget off the bus).
// `consecutive_errors` increments on predicate/action/authority errors, resets on a clean fire, and
// auto-disables the rule at 20 with a DURABLE `automation-notice` to the author (so a rotting rule is
// visible even if the author has no live `automation.stream` open) PLUS the transient `ruleAutoDisabled` bus
// event (host-only on the member-stream).
//
// This module owns the ENGINE + the typed dispatch seam + the arm dispatcher. Reserved arms never reach here
// (createRule refuses them); the v1-unwired arms return a typed refusal.
//
// S4 (interaction-direction-spec §3-S4) touches this sequence in exactly two places, both narrow:
//   • the fire-rate refusal raises the RULED-F4 INVITATION (`inviteOnRefusal`) — it must live at that gate
//     because `budget_refused` is decided BEFORE the predicate and before the env exists, which is the whole
//     reason the invitation carries a rule reference instead of a rendered arm;
//   • `manual` (R7's `runRuleNow`) skips that ONE gate and nothing else.
// The confirm-first STASH is not here: it is the arm dispatcher's chokepoint (`engine/arm-executors.ts`),
// because the thing stashed is one ARM.
//
// D146-d (the CONTRIBUTOR-seam clause) adds ONE gate and ONE terminal, and both exist to keep a switched-off
// plugin from eating its author's rules. A rule naming a `run_tool` arm whose tool its AUTHOR cannot currently
// drive PAUSES: `runGates` refuses it before any arm runs, `finalizeRule` records `paused`, and the pause
// writes NOTHING — no fire row, no `consecutive_errors` tick, no `last_fired_at`. That is what makes it
// self-healing: the rule's stored state is byte-identical before and after, so the first event once the plugin
// is re-enabled dispatches normally with no repair step. The alternative — treating a vanished contributor as
// an `arm_error` — would consume 20 errors and auto-disable the rule, and re-enabling the plugin would NOT
// re-enable it. A first-party contributor cannot vanish, which is why no other seam here needs this.

import type { AutomationAction, AutomationCelEnv, AutomationFireOutcome, AutomationRunOutcome } from "@orb/contracts/automation";
import { automationActionsSchema } from "@orb/contracts/automation";
import { AUTOMATION_DEPTH_HARD_CAP } from "@orb/contracts/chat";
import { AUTOMATION_NOTICE_MESSAGE_MAX } from "@orb/contracts/notifications";
import type { ChatId, UserId } from "@orb/kit/ids";
import { getLog } from "#foundation/observability";
import type { ArmOutcome, DispatchFrame, DispatchOptions, DispatchSummary, ResolvedTrigger, RuleRow } from "../contract/ops.ts";
import type { AutomationContext } from "../contract/service.ts";
import { insertFire } from "../persistence/fires.ts";
import { disableRule, recordRuleError, stampRuleFired } from "../persistence/rules.ts";
import { holdsChatHostAuthority } from "../substrate/authority.ts";
import { buildCelEnv } from "../substrate/cel-env.ts";
import { evaluatePredicate } from "../substrate/dry-run.ts";
import { AUTOMATION_SUGGESTION_TTL_MS, invitesOnRefusal, summarizeRateRefusal } from "../substrate/suggestions.ts";
import { checkBudget } from "./budget-gate.ts";

// The hard cascade-depth cap is homed ONCE in `@orb/contracts/chat` (turn-origin depth vocabulary, below both
// chat + automation — chat's `requestTurn` write-side belt cannot import automation, so the shared home must
// sit under both, and every consumer imports it from there: rule dispatch (here) + chat requestTurn + the
// plugin subscriber fan-out — ONE cascade guard).
/** Consecutive predicate/action/authority errors that auto-disable a rule. */
const CONSECUTIVE_ERROR_DISABLE_AT = 20;

/** One rule's dispatch terminal: whether the rule was disabled this dispatch (a corrupt blob or the 20-error
 *  ceiling — the caller reloads the enabled index when true) and WHICH terminal it reached. `outcome` is
 *  `null` only for the two paths that reach no terminal at all (a cascade-suppressed event, a transform-only
 *  rule); R7's `runRuleNow` reads it to answer "I pressed Run now — what happened?" in the fire log's own
 *  vocabulary. */
interface RuleResult {
  readonly disabled: boolean;
  readonly outcome: AutomationRunOutcome | null;
}

const SKIPPED: RuleResult = { disabled: false, outcome: null };
const CORRUPT_DISABLED: RuleResult = { disabled: true, outcome: "action_error" };
/** D146-d — the rule is HOLDING for a contributor that is not currently available to its author. Not a fire,
 *  not an error, and above all not a state change: nothing is written, so the rule resumes by itself. */
const PAUSED: RuleResult = { disabled: false, outcome: "paused" };

function ended(outcome: AutomationRunOutcome, disabled = false): RuleResult {
  return { disabled, outcome };
}

interface DispatchDeps {
  readonly resolved: ResolvedTrigger;
  readonly nowMs: number;
  /** Per-chat CEL env cache — chat-bus rules share one chat; a domain event's rules span chats. */
  readonly envCache: Map<ChatId, AutomationCelEnv>;
  /** R7 — the HOST who pressed "run it now", or `null` for an ordinary bus fire. Presence IS the manual
   *  flag (one field, so a run can never be manual-but-unattributed) and it is stamped on the fire row; the
   *  gates it lifts are stated at `runGates`. */
  readonly manualBy: UserId | null;
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

/** The DURABLE author notice on auto-disable: the transient `ruleAutoDisabled` bus event only
 *  reaches an author with a live `automation.stream` open, so a rule could rot unseen. This emits an
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
    // S4: a disabled rule's pending asks are moot — its consent question can no longer be answered.
    rc.ctx.suggestions.voidRule(rc.rule.id);
    return ended(outcome, true);
  }
  return ended(outcome);
}

/** The author still holds host on the chat — a demoted/removed ex-host's rule stops firing. The predicate
 *  itself is `substrate/authority` (ONE home: the dispatch gate, the S4 confirm re-check and the handoff
 *  VOID sweep must never answer this differently). */
function holdsAuthority(rc: RuleCtx): Promise<boolean> {
  return holdsChatHostAuthority(rc.ctx, rc.chatId, rc.rule.ownerId);
}

/** RULED F4 — the rate-refusal INVITATION. A `budget_refused` happens BEFORE the predicate and before the
 *  env exists, so there is no rendered arm to stash: the ask carries the RULE REFERENCE only, and its
 *  confirm is a fresh host run (R7). Raised only for a rule carrying a SPEND arm (the ruling's default; the
 *  per-rule opt-out is recorded-unbuilt — `substrate/suggestions.ts::invitesOnRefusal`), and never on a
 *  MANUAL run, which cannot reach this path at all (the manual gate skips the rate cap) — so a host who
 *  confirms an invitation can never be handed another one by the run they just asked for. */
function inviteOnRefusal(rc: RuleCtx, actions: readonly AutomationAction[], limitDetail: string): void {
  if (!invitesOnRefusal(actions)) {
    return;
  }
  const id = rc.ctx.newSuggestionId();
  const expiresAt = rc.deps.nowMs + AUTOMATION_SUGGESTION_TTL_MS;
  const summary = summarizeRateRefusal(rc.rule.name, limitDetail);
  const source = { kind: "rule", ruleId: rc.rule.id } as const;
  rc.ctx.suggestions.raise({
    id,
    kind: "invitation",
    chatId: rc.chatId,
    source,
    actorUserId: rc.rule.ownerId,
    summary,
    expiresAt,
    payload: null,
  });
  rc.ctx.notify({ type: "suggestionRaised", chatId: rc.chatId, source, suggestionId: id, kind: "invitation", summary, expiresAt });
}

/** A rule's arm run: the aborting arm's `arm_error` detail (`null` = no arm errored), plus the two terminal
 *  MODIFIERS an arm can raise — `suggested` (the S4 stash: the arm ASKED instead of acting) and `paused`
 *  (D146-d: the arm's contributor vanished mid-dispatch). Each changes the rule's TERMINAL and nothing else. */
interface ArmsResult {
  readonly detail: Record<string, unknown> | null;
  readonly suggested: boolean;
  readonly paused: boolean;
}

/** The recursion's seed — the accumulator rides as ONE param (the 4-param bar). */
const ARMS_START: ArmsResult & { i: number } = { i: 0, detail: null, suggested: false, paused: false };

/** Run a rule's arms sequentially through the injected seam; the FIRST non-ok outcome aborts the rest
 *  (arms may depend on each other). Recursion (not a loop) expresses the sequential-with-early-abort:
 *  arms share + mutate the env, order IS semantics.
 *
 *  BOTH non-ok kinds abort, and they diverge only in what the rule is CHARGED: an `arm_error` carries a detail
 *  that becomes the `action_error` fire row (and one tick of the error budget); a `paused` carries no detail at
 *  all, because there is nothing to log — the rule did not do anything wrong (D146-d). */
async function runArms(
  ctx: AutomationContext,
  actions: readonly AutomationAction[],
  frame: DispatchFrame,
  from: ArmsResult & { i: number } = ARMS_START,
): Promise<ArmsResult> {
  const arm = actions[from.i];
  if (arm === undefined) {
    return { detail: null, suggested: from.suggested, paused: false }; // past the last arm — every arm succeeded.
  }
  const outcome: ArmOutcome = await ctx.runArm(arm, frame);
  if (!outcome.ok) {
    return outcome.kind === "paused"
      ? { detail: null, suggested: from.suggested, paused: true }
      : { detail: { armIndex: from.i, armType: arm.type, error: outcome.detail }, suggested: from.suggested, paused: false };
  }
  return runArms(ctx, actions, frame, { i: from.i + 1, detail: null, suggested: from.suggested || outcome.suggested === true, paused: false });
}

/** The env for a rule's chat — built once per chat per dispatch batch (fold cache read). */
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

/** Depth + authority + budget gates. `null` ⇒ proceed to the predicate; else the rule's terminal result.
 *
 *  THE MANUAL EXEMPTION (R7), stated as the LINE it draws rather than as a list of two skips. A dispatch
 *  runs two KINDS of gate:
 *    • WHETHER-TO-FIRE-BY-ITSELF — the fire-rate cap (here) and the CEL predicate (`dispatchRule`). Both
 *      answer "should this rule act on its own right now", and a HOST PRESSING RUN NOW HAS ANSWERED THAT
 *      QUESTION PERSONALLY. A manual run skips exactly these two.
 *    • WHETHER-IT-MAY-ACT-AT-ALL — the cascade-depth cap, the author's standing host authority, and every
 *      belt INSIDE the executed arm's own pipeline (`trigger_turn`'s D17 by-proxy consent wall and the turn
 *      engine's per-member budget, imagery's gates). A manual run skips NONE of these. A confirmed
 *      invitation authorizes ONE run past a ceiling the host themselves set; it launders past nothing.
 *  WHY EACH SKIP IS LOAD-BEARING, not convenience: F4's invitation is RAISED BY a `budget_refused`, so a
 *  confirm that re-ran the rate cap would refuse identically for the rest of the hour; and a cadence rule
 *  (`int(chat.messageCount) % N == 0`) or an on-demand-only rule (predicate `false` — catalogue #10's call-a-
 *  vote) would answer every "Run now" with `predicate_false`, which is the same affordance-that-does-nothing
 *  one screen over. The fire row records `runNow` + the invoking host, so the log never claims a rule fired
 *  on its own condition when a human overrode it. */
/** D146-d — THE PAUSE GATE. The name of the first `run_tool` arm whose tool this rule's AUTHOR cannot
 *  currently drive, or `null` when every named contributor is present.
 *
 *  IT IS A RULE-LEVEL GATE, not an arm-level outcome, and that placement is the design: a rule mixing a
 *  `set_variable` bookkeeping arm with a `run_tool` arm would otherwise increment its counter on every event
 *  forever while the act it exists for never happens — partial execution is its own kind of rot, and "the rule
 *  is waiting for your plugin" is only true if the rule really does nothing. (The arm-level `paused` outcome
 *  still exists, for the deactivate that lands INSIDE the dispatch: `engine/arm-executors.ts::runRunTool`.)
 *
 *  Reachability is asked of the ROLE the arm will run as — the rule's OWNER — never the caller who happens to
 *  have triggered the event, and never the host who pressed "Run now". The gate is a synchronous in-process
 *  Map lookup, so putting it on the hot bus path costs nothing. */
function pausingToolName(rc: RuleCtx, actions: readonly AutomationAction[]): string | null {
  const named = actions.filter((action) => action.type === "run_tool").map((action) => action.name);
  return named.find((name) => !rc.ctx.ops.tools.isToolDrivableBy(name, rc.rule.ownerId)) ?? null;
}

async function runGates(rc: RuleCtx, actions: readonly AutomationAction[]): Promise<RuleResult | null> {
  // FIRST, ahead of every other gate including the depth cap: a paused rule is not asking to act, so there is
  // nothing for the other gates to refuse and nothing they could record without misattributing it. Recording a
  // `depth_refused` or an `authority_refused` for a rule whose plugin is simply switched off would put a
  // wrong answer in the one surface that exists to answer "why didn't my rule fire".
  const paused = pausingToolName(rc, actions);
  if (paused !== null) {
    return PAUSED;
  }
  const eventDepth = rc.deps.resolved.automationDepth;
  if (eventDepth >= AUTOMATION_DEPTH_HARD_CAP) {
    await record(rc, "depth_refused", { eventDepth });
    return ended("depth_refused");
  }
  if (eventDepth >= 1 && !rc.rule.matchAutomationEvents) {
    return SKIPPED; // default-suppressed cascade event — record NOTHING (dispatch step 1).
  }
  if (!(await holdsAuthority(rc))) {
    return onRuleError(rc, "authority_refused", { code: "author-lost-authority" });
  }
  if (rc.deps.manualBy !== null) {
    return null;
  }
  const budget = await checkBudget(rc.ctx.db, { rule: rc.rule, chatId: rc.chatId, nowMs: rc.deps.nowMs });
  if (!budget.ok) {
    await record(rc, "budget_refused", { limit: budget.detail });
    inviteOnRefusal(rc, actions, budget.detail);
    return ended("budget_refused");
  }
  return null;
}

/** Dispatch ONE rule through the full sequence. Any thrown error is caught by the caller (error isolation). */
async function dispatchRule(rc: RuleCtx, actions: readonly AutomationAction[]): Promise<RuleResult> {
  const gated = await runGates(rc, actions);
  if (gated !== null) {
    return gated;
  }
  const env = await envFor(rc);
  // The PREDICATE is the rule's whether-to-fire-by-itself condition, so a MANUAL run skips it (`runGates`
  // states the line and why both skips are load-bearing). It is still EVALUATED on the bus path — including
  // its error arm, which is a real authoring bug worth surfacing — and a manual run's own fire row carries
  // `runNow` so the log never reads as "the condition held".
  const predicate = rc.deps.manualBy !== null || evaluatePredicate(rc.rule.predicateCel, env);
  if (typeof predicate === "object") {
    return onRuleError(rc, "predicate_error", { error: predicate.error });
  }
  if (!predicate) {
    if (rc.rule.lastFiredAt !== null) {
      await record(rc, "predicate_false", null); // logged only after a first fire (LEAN first-match debug).
    }
    return ended("predicate_false");
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
  let armsResult: ArmsResult;
  try {
    armsResult = await runArms(rc.ctx, actions, frame);
  } catch (err) {
    // A throwing arm (a bad op / db fault mid-rule) — treat as `action_error`.
    getLog().warn({ err: err instanceof Error ? err.message : String(err), ruleId: rc.rule.id }, "automation dispatch: arm threw (isolated)");
    armsResult = { detail: { error: err instanceof Error ? err.message : String(err) }, suggested: false, paused: false };
  }
  return finalizeRule(rc, armsResult);
}

/** Record the rule's terminal (dispatch step 6): `action_error` when an arm aborted, `fired` when the arms
 *  ACTED — and NOTHING AT ALL when they only ASKED.
 *
 *  THE SUGGEST TERMINAL WRITES NO ROW, which is §3-S4's fire-log honesty made mechanical: a raised card is
 *  not a fire, so it must not appear as one in the host's "why did this run" log, must not stamp
 *  `last_fired_at` (it consumed no cooldown), and must not count toward the per-hour rate cap (only `fired`
 *  rows do — `persistence/fires.ts`). The CONFIRM writes the `fired` row, stamped with the confirmer, when
 *  the host says yes. A rule that mixed postures — a direct arm beside a confirm-first one — still lands
 *  here as `suggested`: the direct arm's own effect already happened, and claiming the RULE fired would
 *  overstate what a host will see. */
async function finalizeRule(rc: RuleCtx, armsResult: ArmsResult): Promise<RuleResult> {
  if (armsResult.detail !== null) {
    return onRuleError(rc, "action_error", armsResult.detail);
  }
  // D146-d — an arm PAUSED (its contributor was deactivated between the pause gate and the call). Terminates
  // exactly like the gate would have: no fire row, no error tick, no `last_fired_at`. Checked before the
  // `suggested` branch only because a pause aborts the remaining arms while a stash does not, so the two can
  // never both be true — the order states which one is the abort.
  if (armsResult.paused) {
    return PAUSED;
  }
  if (armsResult.suggested) {
    return ended("suggested");
  }
  await stampRuleFired(rc.ctx.db, rc.rule.id, rc.deps.nowMs);
  // A manual fire says so in its own row: the fire log's whole job is answering "why did/didn't this run",
  // and a host-forced run that reads identically to a condition-met fire makes that answer a lie.
  await record(rc, "fired", rc.deps.manualBy === null ? null : { runNow: true, byUserId: rc.deps.manualBy });
  rc.ctx.notify({ type: "ruleFired", chatId: rc.chatId, ruleId: rc.rule.id });
  return ended("fired");
}

/** Parse a rule's actions (corrupt blob → disable that one rule) then dispatch it, error-isolated. */
async function runRule(ctx: AutomationContext, rule: RuleRow, deps: DispatchDeps): Promise<RuleResult> {
  if (rule.chatId === null) {
    return SKIPPED; // v1 has no chat-less rule (the guard refuses it); defensive skip.
  }
  const rc: RuleCtx = { ctx, rule, chatId: rule.chatId, deps };
  const parsed = automationActionsSchema.safeParse(rule.actions);
  if (!parsed.success) {
    await disableRule(ctx.db, rule.id, "auto-disabled: corrupt actions blob", deps.nowMs);
    ctx.notify({ type: "ruleAutoDisabled", chatId: rc.chatId, ruleId: rule.id });
    ctx.suggestions.voidRule(rule.id);
    return CORRUPT_DISABLED;
  }
  // A transform-only rule (validate guarantees a `transform_draft` arm ⇒ ALL arms transform + turnStarted) is
  // NOT watcher-dispatched — it registers into the turn pipeline (`engine/prompt-transforms`). Skip it here
  // silently: running its arms would record a spurious `action_error` (the arm's typed refusal) every turn.
  if (parsed.data.every((action) => action.type === "transform_draft")) {
    return SKIPPED;
  }
  try {
    return await dispatchRule(rc, parsed.data);
  } catch (err) {
    getLog().warn({ err: err instanceof Error ? err.message : String(err), ruleId: rule.id }, "automation dispatch: rule body threw (isolated)");
    return onRuleError(rc, "action_error", { error: err instanceof Error ? err.message : String(err) });
  }
}

/** Run the dispatch sequence over the matched rules, sequentially (recursion, not a loop — position order IS
 *  semantics: arms mutate a shared per-chat env). Each rule is error-isolated — a throw never aborts the
 *  batch. */
export function runDispatch(
  ctx: AutomationContext,
  rules: readonly RuleRow[],
  resolved: ResolvedTrigger,
  options: DispatchOptions = {},
): Promise<DispatchSummary> {
  const deps: DispatchDeps = { resolved, nowMs: ctx.now(), envCache: new Map(), manualBy: options.manualBy ?? null };
  const step = async (i: number, anyDisabled: boolean, outcomes: readonly (AutomationRunOutcome | null)[]): Promise<DispatchSummary> => {
    const rule = rules[i];
    if (rule === undefined) {
      return { anyDisabled, outcomes };
    }
    const result = await runRule(ctx, rule, deps);
    return step(i + 1, anyDisabled || result.disabled, [...outcomes, result.outcome]);
  };
  return step(0, false, []);
}
