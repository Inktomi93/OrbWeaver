// verb: confirmSuggestion — S4's HOST YES (interaction-direction-spec §3-S4). Host-gated, take-once, and
// re-checked at the moment of execution rather than at the moment of asking.
//
// THE IDENTITY LAW, which is the whole point of the verb and the thing most likely to be "simplified" later:
// the executed frame's `authorUserId` STAYS THE RULE AUTHOR. Ownership, funding, the D19 triple and the
// variable namespace all key off the author — a confirmed turn is the AUTHOR's turn, funded by the author,
// writing into the author's namespace. The CONFIRMER is the AUTHORIZER ONLY: host-gated at the door and
// stamped on the fire row, never substituted into the frame. Running the arm as the confirmer would silently
// re-attribute spend and state to whoever happened to click.
//
// THE SEQUENCE, and why every step is where it is:
//   1. PEEK, then gate the caller as HOST OF THE ASK'S OWN CHAT. Peek first because the ask carries the chat
//      the gate needs; a caller who is not a present member collapses to the leak-free suggestion-not-found
//      (never `AutomationChatNotFound`, which would name a chat id the caller never supplied).
//   2. CLAIM — id-match, delete-on-take. This is the double-click / replace-race answer: two confirms of one
//      id both peek and both gate, and exactly ONE claims; the loser refuses typed. The claim happens BEFORE
//      the re-checks and is not rolled back if they fail, because a claimed ask is spent either way — the
//      alternative (put it back) is what turns a refusal into a retry loop against dead state.
//   3. RE-CHECK the two things that can have died since the ask was raised — BY ORIGIN. For a rule: it still
//      exists and is enabled (the host may have withdrawn consent). For a PLUGIN: it is still installed and
//      enabled (the injected read). For BOTH: the ACTOR still holds host, which is one ruling with two
//      spellings — the confirmer's own host role never stands in for the actor's, and on a handoff the
//      pending ask dies fail-closed (owner ruling 2026-08-24: no re-mint, no transfer).
//   4. EXECUTE by ORIGIN, then by class. A rule's `confirm` runs the STASHED arm through the injected
//      dispatcher with `confirmFirst` cleared, in the STORED frame, and records a `fired` row stamped with
//      the confirmer; its `invitation` has no stored payload by construction (`budget_refused` precedes
//      predicate and env), so it runs the rule FRESH through R7. A PLUGIN ask runs its stashed act back
//      through the PLUGIN's own bridge (see `runPluginAct` — the enforcement set follows the origin, not the
//      executor) and writes no fire row.
//
// PLUGINS JOINED THIS LAW POST-#24. A plugin whose installer is not host of the invocation chat used to get a
// flat refusal at the membrane, which is posture 3 wearing posture 2's clothes: safe, but it made "ask"
// unexpressible. Its ask now lands in this same store and is answered by this same verb — one inbox, one host
// answer. Nothing about the class-1 wall moves: a suggestion is an ASK, and the confirmed act is the SAME set
// of ops the plugin could already perform WITH standing authority, never a new one.
//
// FIRE-LOG HONESTY (§3-S4 + §6 R5): `AUTOMATION_FIRE_OUTCOMES` gains NO suggestion terminal here. Nothing is
// written when an ask is RAISED — a suggestion is not a fire — and the CONFIRMED execution writes `fired`
// with the confirmer in `detail`. Adding a `suggested` terminal is a CHECK edit on a generated baseline and
// is recorded-unbuilt as R5, together with the per-rule `suggestOnRefusal` opt-out column.

import type { AutomationRunOutcome } from "@orb/contracts/automation";
import type { Principal } from "@orb/contracts/identity";
import type { AutomationRuleId, PluginId } from "@orb/kit/ids";
import { SuggestionNotFoundError, SuggestionRefusedError } from "../contract/errors.ts";
import type { ArmOutcome, PendingSuggestion, RuleRow } from "../contract/ops.ts";
import type { ConfirmSuggestionParams } from "../contract/params.ts";
import type { ConfirmSuggestionResult } from "../contract/results.ts";
import type { AutomationContext, AutomationService } from "../contract/service.ts";
import { loadCallerRole } from "../persistence/canon-reads.ts";
import { insertFireWithRuleStamp } from "../persistence/fires.ts";
import { selectRuleRow } from "../persistence/rules.ts";
import { runAnalysisConfirm } from "../substrate/analysis-confirm.ts";
import { holdsChatHostAuthority } from "../substrate/authority.ts";
import type { ArmsResult } from "../substrate/run-now.ts";
import { dispatchRuleNow, runStashedContinuation } from "../substrate/run-now.ts";
import { automationChatLaneKey, runInLane } from "../substrate/serial-lanes.ts";
import { armToExecute } from "../substrate/suggestions.ts";

/** Gate the caller as HOST of the ask's chat. A non-present member collapses onto the ask's own leak-free
 *  not-found (so a stranger learns nothing, not even that the chat exists); a member-who-is-not-host is a
 *  KNOWN existence and gets `can()`'s FORBIDDEN — the `requireChatHost` split, re-spelled here only to
 *  change WHICH not-found is thrown. */
async function requireSuggestionHost(ctx: AutomationContext, principal: Principal, pending: PendingSuggestion): Promise<void> {
  const role = await loadCallerRole(ctx.db, pending.chatId, principal.userId);
  if (role === undefined) {
    throw new SuggestionNotFoundError(pending.id);
  }
  ctx.can(principal, "host", { kind: "chat", membership: { role } });
}

/** The ACTOR-authority half of the liveness re-check, shared by BOTH origins because it is one ruling, not
 *  two. §3-S4: confirm re-runs `holdsAuthority(actor)` exactly as dispatch does, and the CONFIRMER's own host
 *  role never stands in for the actor's. Owner ruling 2026-08-24: on a host handoff this VOIDS the pending
 *  ask, fail-closed — no re-mint, no transfer to the new host. The ask was "may THIS actor do this here", and
 *  the actor no longer may. */
async function assertActorStillHosts(ctx: AutomationContext, pending: PendingSuggestion, lostMessage: string): Promise<void> {
  if (!(await holdsChatHostAuthority(ctx, pending.chatId, pending.actorUserId))) {
    throw new SuggestionRefusedError("author_lost_authority", lostMessage);
  }
}

/** The RULE origin's liveness: the rule still exists, is still enabled, and its AUTHOR still hosts. */
async function assertRuleStillLive(ctx: AutomationContext, pending: PendingSuggestion, ruleId: AutomationRuleId): Promise<RuleRow> {
  const rule = await selectRuleRow(ctx.db, ruleId);
  if (rule === undefined || rule.chatId === null) {
    throw new SuggestionRefusedError("rule_gone", "the rule behind this suggestion no longer exists");
  }
  if (!rule.enabled) {
    throw new SuggestionRefusedError("rule_disabled", "the rule behind this suggestion has been disabled");
  }
  await assertActorStillHosts(ctx, pending, "the rule's author no longer hosts this room");
  return rule;
}

/** The PLUGIN origin's liveness — the exact twin, one branch down: the plugin is still installed AND enabled
 *  (the INJECTED read; automation holds no `plugins` table and may not query one), and its INSTALLER still
 *  hosts. Fail-CLOSED both ways, and both ways matter: a disabled plugin's card must not be a way to run one
 *  more act after the owner turned it off, and a demoted installer's card must not be executable by the new
 *  host. Each refuses typed, so a host who kept a card open learns WHICH thing changed. */
async function assertPluginStillLive(ctx: AutomationContext, pending: PendingSuggestion, pluginId: PluginId): Promise<void> {
  if (!(await ctx.isPluginLive(pluginId, pending.actorUserId))) {
    throw new SuggestionRefusedError("rule_disabled", "the plugin behind this suggestion is no longer installed or enabled");
  }
  await assertActorStillHosts(ctx, pending, "the plugin's installer no longer hosts this room");
}

/** Execute a CONFIRMED PLUGIN act through the PLUGIN's OWN executor (the injected op).
 *
 *  THE ENFORCEMENT SET FOLLOWS THE ORIGIN, and this is the whole reason the payload is a union rather than an
 *  `AutomationAction`. Two of the three plugin acts have an automation arm that looks identical, so routing
 *  them through `ctx.runArm` would compile, demo correctly, and be wrong: they would take AUTOMATION's belts
 *  instead of the plugin bridge's — the book-attached-to-chat gate, the per-plugin 64-entry ceiling and
 *  `neutralizeMacros`. A plugin would then gain reach BY BEING CONFIRMED that it does not have when it acts
 *  directly, which is an enforcement swap hidden inside a UX affordance. The injected op rebuilds the
 *  plugin's own bridge, so a confirmed act meets exactly the gates the direct act would have met.
 *
 *  NO FIRE ROW, deliberately: `automation_fires` is keyed to a rule by FK and a plugin has none. Minting a
 *  synthetic rule id to write one would put a lie in the log this domain works to keep honest (§3-S4
 *  fire-log honesty), and a durable plugin-act log is its own row, not a forged automation fire. The
 *  CONFIRMER is the AUTHORIZER only and is deliberately NOT a parameter here: there is nothing to stamp them
 *  onto, and the act runs as the INSTALLER — on the installer's budget, in the installer's namespace. Their
 *  authorization was spent at the host gate and the take-once claim, upstream. */
async function runPluginAct(ctx: AutomationContext, pending: PendingSuggestion, pluginId: PluginId): Promise<AutomationRunOutcome> {
  const payload = pending.payload;
  if (payload === null || payload.via !== "plugin-act") {
    throw new SuggestionRefusedError("no_stashed_arm", "this suggestion carries nothing to execute");
  }
  try {
    await ctx.executePluginSuggestion({ pluginId, installerUserId: pending.actorUserId, chatId: pending.chatId, act: payload.act });
  } catch {
    // Errors-as-data, matching the arm path: a refused/failed act is an OUTCOME the host reads, never a
    // thrown 500 — and the ask is already spent, so there is nothing to retry against.
    return "action_error";
  }
  return "fired";
}

/** Execute a CONFIRMED analysis act (the `{via:"analysis"}` payload — S5's confirm-routed outputs) and
 *  record the confirmed fire, stamped with who authorized it. The act executes through the analysis
 *  engine's OWN confirm executor (`substrate/analysis-confirm.ts`), NOT `ctx.runArm`: a re-synthesized arm
 *  would macro-render the model's bytes (§2 law 6) and could not advance the settled-span watermark on
 *  apply — the enforcement set still has one home (the lore act rides the same `applyRuleLoreWrite` belt
 *  the arm does, re-checked at confirm time). Errors-as-data like the stashed-arm path: a refusal is an
 *  `action_error` outcome the host reads, never a thrown 500 — the ask is already spent. */
async function runAnalysisAct(ctx: AutomationContext, pending: PendingSuggestion, rule: RuleRow, confirmer: Principal): Promise<AutomationRunOutcome> {
  const payload = pending.payload;
  if (payload === null || payload.via !== "analysis") {
    throw new SuggestionRefusedError("no_stashed_arm", "this suggestion carries nothing to execute");
  }
  const nowMs = ctx.now();
  let outcome: AutomationRunOutcome;
  let error: string | null = null;
  // @orb-waive caught-failure-ownership(err): errors-as-data — the file header states the contract:
  // a refusal is an `action_error` outcome the host reads, never a thrown 500 (the ask is already spent). The
  // caught message is preserved into `error` and surfaces on the recorded fire below. Ends if this act stops
  // being errors-as-data.
  try {
    await runAnalysisConfirm({ db: ctx.db, ops: ctx.ops, nowMs, applyProseRewrite: ctx.applyProseRewrite }, pending, rule, payload.act);
    outcome = "fired";
  } catch (err) {
    outcome = "action_error";
    error = err instanceof Error ? err.message : String(err);
  }
  // ONE batch: the act already landed, so the terminal and the cooldown stamp must become visible together
  // (`persistence/fires.ts::insertFireWithRuleStamp` states why the confirm path cannot afford two writes).
  await insertFireWithRuleStamp(
    ctx.db,
    {
      id: ctx.newFireId(),
      ruleId: rule.id,
      chatId: pending.chatId,
      triggerType: rule.triggerType,
      outcome,
      detail: {
        confirmedByUserId: confirmer.userId,
        suggestionId: pending.id,
        armType: "run_analysis",
        analysisAct: payload.act.kind,
        ...(error === null ? {} : { error }),
      },
      automationDepth: 0,
      firedAt: nowMs,
    },
    outcome === "fired" ? nowMs : null,
  );
  ctx.notify(
    outcome === "fired" ? { type: "ruleFired", chatId: pending.chatId, ruleId: rule.id } : { type: "ruleErrored", chatId: pending.chatId, ruleId: rule.id },
  );
  return outcome;
}

/** Execute the STASHED arm and record the confirmed fire, stamped with who authorized it.
 *
 *  #1565 — ON THE CHAT'S OWN SERIAL LANE, the same one the bus door and "Run now" take
 *  (`automationChatLaneKey` is the one home for the key). A confirmed arm is a real dispatch: it renders
 *  against the chat variable
 *  env, writes through it, and stamps the rule — so a host answering a card while a bus event was mid-arm
 *  interleaved exactly as two bus events used to. The confirm's OTHER execution branches are deliberately
 *  NOT here: `dispatchRuleNow` (the invitation) takes the lane itself, one level down, and the two branches
 *  are mutually exclusive at the `claimed.kind` fork — so the lane is entered exactly once, never nested.
 *
 *  A PLUGIN act (`runPluginAct`) stays OFF this lane on purpose. Its three act kinds — `requestTurn`,
 *  `worldInfoUpsert`, `generatePicture` (`@orb/contracts/plugin/suggestion.ts:44-60`) — touch no automation
 *  rule state and no chat variable plane, and they run through the PLUGIN's bridge with the plugin's own
 *  belts. Putting an unrelated executor behind the chat's dispatch lane would buy nothing and would make a
 *  slow generation delay every rule in the room. */
function runStashedArm(ctx: AutomationContext, pending: PendingSuggestion, rule: RuleRow, confirmer: Principal): Promise<AutomationRunOutcome> {
  return runInLane(automationChatLaneKey(pending.chatId), () => executeStashedArm(ctx, pending, rule, confirmer));
}

/** #1553 (OWNER RULING: STASH the continuation) — combine the confirmed arm's own outcome with its
 *  CONTINUATION's (the arms that sat behind it, run against the same frame once the confirmed arm
 *  succeeded), into ONE `ArmsResult`-shaped verdict — the exact terminal `engine/dispatch.ts::finalizeRule`
 *  would have reached had this all run as one fresh dispatch. `null` continuation-result = the confirmed
 *  arm itself failed (or there was nothing behind it to run), so its OWN outcome decides everything. */
function combinedOutcome(armOutcome: ArmOutcome, continuationResult: ArmsResult | null): ArmsResult {
  // Only `arm_error` can reach here as a non-ok outcome — the `paused` kind throws above before this is
  // ever called, so `armOutcome.kind` is narrowed to `"arm_error"` by construction.
  if (!armOutcome.ok && armOutcome.kind === "arm_error") {
    return { detail: { error: armOutcome.detail }, suggested: false, paused: false };
  }
  return continuationResult ?? { detail: null, suggested: false, paused: false };
}

async function executeStashedArm(ctx: AutomationContext, pending: PendingSuggestion, rule: RuleRow, confirmer: Principal): Promise<AutomationRunOutcome> {
  const payload = pending.payload;
  if (payload !== null && payload.via === "analysis") {
    return runAnalysisAct(ctx, pending, rule, confirmer);
  }
  const stashed = payload !== null && payload.via === "arm" ? payload.stashed : null;
  if (stashed === null) {
    // Unreachable through the store (a `confirm` always carries one), and a THROW rather than a silent
    // no-op: a confirm class with no payload is a broken invariant, not a user outcome.
    throw new SuggestionRefusedError("no_stashed_arm", "this suggestion carries nothing to execute");
  }
  const armOutcome = await ctx.runArm(armToExecute(stashed.action), stashed.frame, stashed.continuation);
  if (!armOutcome.ok && armOutcome.kind === "paused") {
    // UNREACHABLE BY THE ARM VOCABULARY: only `run_tool` can pause (D146-d) and `run_tool` is deliberately not
    // suggestible, so nothing that can pause can ever have been stashed. Spelled as a loud invariant rather
    // than folded into the `action_error` arm below, because folding it would make the day that changes a
    // SILENT mislabel — a paused act written to the fire log as a fault, spending exactly the error budget the
    // pause exists to protect. The same posture as the missing-payload throw above: a broken invariant is not
    // a user outcome.
    throw new Error(`confirm: a stashed ${stashed.action.type} arm paused — no suggestible arm can pause`);
  }
  // The CONTINUATION runs only when the confirmed arm itself succeeded (order is semantics — an error aborts
  // whatever was behind it, exactly as `runArms` aborts on an in-flight arm's own error) and only when there
  // IS one (the stashed arm may have been the rule's last). It shares `stashed.frame`, mutated in place by
  // the confirmed arm's own execution above, so a continuation `set_variable` reading what the confirmed arm
  // just wrote sees it — the same env-sharing `runArms` already guarantees within one dispatch pass.
  const continuationResult = armOutcome.ok && stashed.continuation.length > 0 ? await runStashedContinuation(ctx, stashed.continuation, stashed.frame) : null;
  const combined = combinedOutcome(armOutcome, continuationResult);
  if (combined.paused) {
    // D146-d, reached only through the CONTINUATION (the confirmed arm itself cannot pause — the invariant
    // above): no fire row, no error tick, no `last_fired_at` — the same "nothing to log" the gate itself
    // would produce had this been a fresh dispatch that paused on this arm.
    return "paused";
  }
  if (combined.suggested) {
    // A LATER arm in the continuation ALSO stashed itself — S4's fire-log honesty (header, "nothing is
    // written when an ask is RAISED") applies here exactly as it does to a fresh dispatch: the confirmed
    // arm's own effect already happened, but the rule as a whole is not "fired" while a fresh ask is live.
    // The new ask's OWN `suggestionRaised` notify already fired inside `stashConfirmFirstArm`; nothing more
    // to announce or record here.
    return "suggested";
  }
  const outcome: AutomationRunOutcome = combined.detail === null ? "fired" : "action_error";
  const nowMs = ctx.now();
  // ONE batch — the arm(s) already ran and the ask is spent, so a terminal without its stamp (or a stamp
  // without its terminal) is unrecoverable state; `persistence/fires.ts::insertFireWithRuleStamp` carries
  // the argument.
  await insertFireWithRuleStamp(
    ctx.db,
    {
      id: ctx.newFireId(),
      ruleId: rule.id,
      chatId: pending.chatId,
      triggerType: rule.triggerType,
      outcome,
      detail: {
        confirmedByUserId: confirmer.userId,
        suggestionId: pending.id,
        armType: stashed.action.type,
        ...(combined.detail === null ? {} : { error: combined.detail }),
      },
      automationDepth: stashed.frame.origin.automationDepth,
      firedAt: nowMs,
    },
    outcome === "fired" ? nowMs : null,
  );
  ctx.notify(
    outcome === "fired" ? { type: "ruleFired", chatId: pending.chatId, ruleId: rule.id } : { type: "ruleErrored", chatId: pending.chatId, ruleId: rule.id },
  );
  return outcome;
}

export function createConfirmSuggestion(ctx: AutomationContext): AutomationService["confirmSuggestion"] {
  return async ({ principal, suggestionId }: ConfirmSuggestionParams): Promise<ConfirmSuggestionResult> => {
    const nowMs = ctx.now();
    const seen = ctx.suggestions.peek(suggestionId, nowMs);
    if (seen === null) {
      throw new SuggestionNotFoundError(suggestionId);
    }
    await requireSuggestionHost(ctx, principal, seen);
    // TAKE-ONCE. The gate above awaited, so a racing confirm may have taken it in the meantime — that is
    // exactly the race this claim resolves, and the loser gets the same leak-free refusal as a stale id.
    const claimed = ctx.suggestions.claim(suggestionId, nowMs);
    if (claimed === null) {
      throw new SuggestionNotFoundError(suggestionId);
    }
    // #700 — RETIRE THE CARD ON EVERY ATTACHED HOST TAB. The claim just deleted the ask from the in-RAM store,
    // so it can never be answered again; emit here — BEFORE the origin re-checks — so even a refused confirm
    // retires the card (the ask is spent either way). The acting tab also drops it optimistically via the
    // mutation's onSuccess, but the host's OTHER tabs/devices have no query and no replay behind this
    // live-only room, so this host-only event is their only retirement channel (§3-S4 spec delta).
    //
    // IT IS A RETIREMENT, NOT A TERMINAL, and the distinction is why it stays ahead of the re-checks (#1425
    // read the position as "announcing the outcome early"). The payload is `{chatId, suggestionId}` — no
    // outcome, no verdict — and the client fold does exactly one thing with it: drop the ask with that id
    // (`features/automation/lib/apply-automation-bus-event.ts`). The OUTCOME is announced only after
    // execution, by `ruleFired`/`ruleErrored` plus the fire row. Moving this after the re-checks would leave a
    // REFUSED confirm's card sitting live on the host's other tabs against a store entry the claim already
    // deleted — unanswerable, and the only thing the ask could still do is mislead.
    ctx.notify({ type: "suggestionResolved", chatId: claimed.chatId, suggestionId });
    // BRANCH ON THE ORIGIN, not on the class — the liveness question and the executor are both origin-owned.
    // A plugin ask has no rule to re-read and no `runRuleNow` to fall back on: the invitation class is
    // structurally rule-only (it exists because `budget_refused` fires pre-predicate on a RULE), so a plugin
    // ask is always `confirm` and always carries its act.
    if (claimed.source.kind === "plugin") {
      const { pluginId } = claimed.source;
      await assertPluginStillLive(ctx, claimed, pluginId);
      return { ran: "stashed-arm", outcome: await runPluginAct(ctx, claimed, pluginId) };
    }
    const rule = await assertRuleStillLive(ctx, claimed, claimed.source.ruleId);
    if (claimed.kind === "confirm") {
      return { ran: "stashed-arm", outcome: await runStashedArm(ctx, claimed, rule, principal) };
    }
    // The invitation class: no payload existed to stash, so the confirm is a FRESH host run (R7).
    const outcome = await dispatchRuleNow(ctx, rule, claimed.chatId, principal.userId);
    if (outcome === null) {
      throw new SuggestionRefusedError("not_runnable", "this rule cannot be run on demand");
    }
    return { ran: "fresh-run", outcome };
  };
}
