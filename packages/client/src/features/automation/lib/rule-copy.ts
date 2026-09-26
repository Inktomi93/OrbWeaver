// B2 — the RULES surface's host-facing COPY: everything that turns a wire value into a sentence a host can
// read. One home, because the same three translations were being skipped in three places at once
// (side-eye 2026-08-24, #621): the rule row subtitled the raw camelCase trigger discriminator plus an arm
// COUNT, the fire log rendered the same raw discriminator in its middle column, and `FireView.detail` — the
// per-arm result / error / preview the contract documents at `contract/results.ts:31` — was never rendered
// at all, while the Run-now error toast pointed the host AT the fire log to find it.
//
// VOCABULARY (owner ruling, #599): bare "preset" means a GENERATION preset in this app, so nothing here
// says it — these are rule presets, and a rule is a "rule".
//
// THE DISPATCHES ARE SWITCHES, NOT OBJECT LITERALS: the wire vocabularies are snake_case (`set_variable`)
// and dotted (`character.updated`), and an object literal keyed by them fights `useNamingConvention`. Each
// switch is exhaustive over its closed tuple with a `never` default, so a new trigger/arm/outcome fails `tsc`
// HERE until it is given copy (§5.5). `fireOutcomeView` (the outcome→badge dispatch) lives here for that
// one-home reason: it was co-located with the per-rule log until B11 added a SECOND fire surface (the room
// Activity log), at which point re-spelling the outcome vocabulary in two places would break §5.5.
//
// `triggerLabel` takes a plain `string` on purpose: `FireView.triggerType` is a stored column typed
// `string`, not the union — a fire written before a vocabulary change must still render. An unknown value
// falls back to itself, which is the honest answer and is exactly what the guarded narrow buys.

import type { AutomationActionType, AutomationFireOutcome, AutomationRunOutcome, ChatTriggerType, DomainTriggerType } from "@orb/contracts/automation";
import { AUTOMATION_ACTION_TYPES, AUTOMATION_ARM_BINDING_TASK, CHAT_TRIGGER_TYPES, DOMAIN_TRIGGER_TYPES, SPEND_ARM_TYPES } from "@orb/contracts/automation";
import type { RoutableTask } from "@orb/contracts/inference";
import type { BadgeProps } from "@orb/ui/badge";
import { timeLib } from "#lib";

/** The plain-English phrase for a CHAT-bus trigger — "when this rule looks", in the room's own terms. */
function chatTriggerLabel(type: ChatTriggerType): string {
  switch (type) {
    case "chatOpened":
      return "when you open this chat";
    case "messageCommitted":
      return "after every message";
    case "messageEdited":
      return "when a message is edited";
    case "variantSelected":
      return "when a swipe is picked";
    case "turnStarted":
      return "when a reply starts";
    case "turnCompleted":
      return "after each reply";
    case "turnAborted":
      return "when a reply is stopped";
    case "worldInfoActivated":
      return "when a lore entry fires";
    case "personaSwitched":
      return "when the persona changes";
    case "chatCreated":
      return "when the chat is created";
    case "messageHidden":
      return "when a message is hidden";
    case "messagesDeleted":
      return "when messages are deleted";
    case "reactionsChanged":
      return "when someone reacts to a message";
    case "chatUpdated":
      return "when this chat's settings change";
    case "wiEntryAttached":
      return "when a lore entry is attached";
    case "wiEntryDetached":
      return "when a lore entry is detached";
    default: {
      const exhaustive: never = type;
      throw new Error(`unhandled chat trigger type: ${JSON.stringify(exhaustive)}`);
    }
  }
}

/** The plain-English phrase for a DOMAIN-bus trigger (library events, not room events). */
function domainTriggerLabel(type: DomainTriggerType): string {
  switch (type) {
    case "character.updated":
      return "when a character is edited";
    case "asset.created":
      return "when an image is saved";
    case "persona.updated":
      return "when a persona is edited";
    case "world-info.updated":
      return "when a world book is edited";
    default: {
      const exhaustive: never = type;
      throw new Error(`unhandled domain trigger type: ${JSON.stringify(exhaustive)}`);
    }
  }
}

function isChatTriggerType(type: string): type is ChatTriggerType {
  return (CHAT_TRIGGER_TYPES as readonly string[]).includes(type);
}

function isDomainTriggerType(type: string): type is DomainTriggerType {
  return (DOMAIN_TRIGGER_TYPES as readonly string[]).includes(type);
}

/** A trigger discriminator as a host-facing phrase. Unknown values (a stored fire from an older
 *  vocabulary) fall back to the raw value rather than throwing away the row. */
export function triggerLabel(type: string): string {
  if (isChatTriggerType(type)) {
    return chatTriggerLabel(type);
  }
  return isDomainTriggerType(type) ? domainTriggerLabel(type) : type;
}

/** One action arm as the THING IT DOES, not its wire discriminator. */
export function armLabel(type: AutomationActionType): string {
  switch (type) {
    case "set_variable":
      return "set a variable";
    case "transform_draft":
      return "rewrite part of the prompt";
    case "insert_world_info_entry":
      return "write a lore entry";
    case "surface_quick_reply":
      return "offer quick replies";
    case "post_notification":
      return "post a notice";
    case "trigger_turn":
      return "ask for a reply";
    case "generate_image":
      return "generate an image";
    case "set_chat_background":
      return "change the background";
    // The quiet think-first pass (S5). "Study", not "analyze": the label names what the host FEELS the rule
    // doing (reading the scene and steering quietly), not the wire mechanism.
    case "run_analysis":
      return "study the story";
    // Names the ACT, not the mechanism: the arm's payload carries WHICH tool, and a label that said "run_tool"
    // would leak the wire discriminator into the one surface whose job is to not speak it.
    case "run_tool":
      return "run a tool";
    default: {
      const exhaustive: never = type;
      throw new Error(`unhandled automation action type: ${JSON.stringify(exhaustive)}`);
    }
  }
}

/** Does this rule's arm list contain one that COSTS a model call? Drives the row's spend affordance — the
 *  FIRST client consumer of `SPEND_ARM_TYPES`, which shipped with none (side-eye #621 P1-1/P1-2: Test,
 *  Run-now and Delete all painted as the same ghost control while only one of them spends and only one is
 *  irreversible). The set is the contract's, never re-spelled here. */
export function hasSpendArm(actions: readonly { readonly type: AutomationActionType }[]): boolean {
  return actions.some((action) => (SPEND_ARM_TYPES as readonly AutomationActionType[]).includes(action.type));
}

/** The tasks a rule's arms spend through its own binding, in no particular order and without repeats. */
export function ruleBindingTasks(actions: readonly { readonly type: AutomationActionType }[]): readonly RoutableTask[] {
  return [...new Set(actions.map((action) => AUTOMATION_ARM_BINDING_TASK[action.type]).filter((task): task is RoutableTask => task !== null))];
}

// ── B4, the rate-capped OFFER toggle's copy ─────────────────────────────────────────────────────────────
// The wire calls it `suggestOnRefusal` and the spec calls it RULED F4; a host is told neither. What they
// actually see when it is ON is the invitation card the server writes as `“<rule>” hit its rate cap (…).
// Run it now?` (`domain/automation/substrate/suggestions.ts::summarizeRateRefusal`), so the switch is named
// for THAT — the offer, not the ruling. It is shown only on a rule that can raise one at all (a SPEND arm),
// because a switch that provably changes nothing is worse than no switch.

/** The VISIBLE label beside the switch. The accessible name is built to CONTAIN this string verbatim
 *  (WCAG 2.5.3 label-in-name) — see {@link suggestOnRefusalAccessibleName}. */
export const SUGGEST_ON_REFUSAL_LABEL = "Offer to run it when rate-capped";

/** The switch's help line — what the host will SEE if they leave it on, and what "off" buys them. */
export const SUGGEST_ON_REFUSAL_HELP =
  "When this rule hits a fire-rate cap, this chat offers you a card to run it anyway. Turn it off to let this one rule stay quiet when it's capped.";

/** N rules give N identical switches, so the accessible name carries the rule's own name to tell them apart
 *  — appended AFTER the visible label so the visible text is contained exactly, which is what 2.5.3 asks
 *  and what a voice-control user speaks. */
export function suggestOnRefusalAccessibleName(ruleName: string): string {
  return `${SUGGEST_ON_REFUSAL_LABEL} — ${ruleName}`;
}

/** The rule row's SECOND line: what this rule does, in the words the rule itself carries. A minted rule
 *  stores its catalogue entry's own summary as `description` (`createRuleFromPreset` writes
 *  `description: preset.summary`), so the catalogue's plain-English sentence — the copy the review called
 *  the only place a user learns what a rule does — follows the rule onto the row. A hand-authored rule with
 *  no description falls back to WHEN it looks + WHAT it does, never a discriminator and an arm count.
 *
 *  THE FALLBACK MAY NOT SAY "does nothing" WHEN IT MEANS "cannot be read" (#1558). `actions` is `[]` in both
 *  cases and only `actionsCorrupt` separates them, so the empty-arm phrasing — a statement about what the
 *  AUTHOR configured — is simply false of an unreadable blob. The unreadable arm names the trigger it still
 *  honestly knows and stops there; the row's error notice carries the rest. */
export function ruleGloss(rule: {
  readonly description: string | null;
  readonly trigger: { readonly type: string };
  readonly actions: readonly { readonly type: AutomationActionType }[];
  readonly actionsCorrupt?: boolean;
}): string {
  if (rule.description !== null && rule.description.trim() !== "") {
    return rule.description;
  }
  if (rule.actionsCorrupt === true) {
    return `Runs ${triggerLabel(rule.trigger.type)} — but what it does can't be read.`;
  }
  const first = rule.actions[0];
  const does = first === undefined ? "does nothing" : armLabel(first.type);
  const more = rule.actions.length > 1 ? `, +${rule.actions.length - 1} more` : "";
  return `Runs ${triggerLabel(rule.trigger.type)} — ${does}${more}.`;
}

/** The rule row's STATE line: when it last did anything. `lastFiredAt` was on the view and rendered
 *  nowhere, which is why two rules could look byte-identical. */
export function lastRunLine(lastFiredAt: number | null): string {
  return lastFiredAt === null ? "Hasn't run yet." : `Last ran ${timeLib.formatRelativeAgo(lastFiredAt)}.`;
}

/** The caps a `budget_refused` fire needs to become an ANSWER instead of a label ("Rate-capped" tells a
 *  host nothing; "it had already run 30 times this hour" tells them what to change). */
export interface RuleFireCaps {
  readonly cooldownSeconds: number;
  readonly maxFiresPerHour: number;
}

/** Read one string field off an open detail blob (`FireView.detail` is `Record<string, unknown>`). */
function detailString(detail: Record<string, unknown>, key: string): string | null {
  const value = detail[key];
  return typeof value === "string" && value !== "" ? value : null;
}

/** Read one number field off an open detail blob. */
function detailNumber(detail: Record<string, unknown>, key: string): number | null {
  const value = detail[key];
  return typeof value === "number" ? value : null;
}

/** Arm discriminator → label for a detail blob whose `armType` is an untyped string. Derived from the
 *  contract tuple through the exhaustive switch above, so it can never drift from either. */
const ARM_LABELS: Readonly<Record<string, string>> = Object.fromEntries(AUTOMATION_ACTION_TYPES.map((type) => [type, armLabel(type)]));

/** The `action_error` sentence: WHICH arm aborted and why. The engine writes
 *  `{armIndex, armType, error}` (`engine/dispatch.ts::runArms`) — or a bare `{error}` when an arm THREW. */
function actionErrorLine(detail: Record<string, unknown>): string {
  const error = detailString(detail, "error") ?? "no reason recorded";
  const armType = detailString(detail, "armType");
  if (armType === null) {
    return `An action failed: ${error}`;
  }
  const index = detailNumber(detail, "armIndex");
  const which = index === null ? "" : ` (step ${index + 1})`;
  return `Couldn't ${ARM_LABELS[armType] ?? armType}${which}: ${error}`;
}

/** The `budget_refused` sentence — which cap turned the rule away, with the number a host can act on.
 *  `caps` is `null` on the room ACTIVITY log (B11): that surface spans every rule, so it holds no single
 *  rule's caps and the cooldown/rule-hourly arms fall to the generic line (the number would be a lie).
 *
 *  THE NUMBER IS ATTRIBUTED TO NOW, NEVER TO THEN (#1502). Every row in this log is HISTORICAL, and the
 *  only caps any caller can supply are the rule's CURRENT ones — the engine records which limit refused
 *  (`engine/dispatch.ts` writes `{ limit }`) and no threshold, so what was in force at the time is simply
 *  not on the record. The old wording spent that gap: raise a rule's hourly cap from 3 to 30 and every
 *  past refusal re-read as "it had already run 30 times this hour", a count that never happened under a
 *  cap that did not exist yet — the log retroactively rewriting its own history. So the past clause states
 *  only what the row actually proves (a cap turned it away) and the number is presented as the rule's
 *  present setting, which is both true and the thing a host is about to act on. */
function budgetRefusedLine(detail: Record<string, unknown>, caps: RuleFireCaps | null): string {
  // `?? ""` rather than a `case null`: the switch is over a HOST-facing vocabulary, and "absent" and
  // "unrecognized" get the same honest generic line.
  switch (detailString(detail, "limit") ?? "") {
    case "cooldown":
      return caps === null ? "Its cooldown hadn't elapsed." : `Its cooldown hadn't elapsed — it now runs at most once every ${caps.cooldownSeconds}s.`;
    case "rule_hourly":
      return caps === null ? "It had already hit its own hourly cap." : `It had already hit its own hourly cap — now ${caps.maxFiresPerHour} per hour.`;
    case "chat_hourly":
      return "This chat had already hit its hourly cap across all rules.";
    default:
      return "A fire-rate cap turned it away.";
  }
}

/** The dry-run (`test_run`) verdict a stored fire carries: `{predicate, arms}`, the same shape `testRule`
 *  returns. Only the predicate half fits a log line; the arm previews are the inline Test verdict's job. */
function testRunLine(detail: Record<string, unknown>): string {
  const predicate = detail["predicate"];
  if (typeof predicate === "boolean") {
    return predicate ? "Dry run — its condition would have matched." : "Dry run — its condition would NOT have matched.";
  }
  return "Dry run — nothing was executed.";
}

/** ONE fire row's detail as a host-facing sentence, or `null` when the row genuinely has nothing to add
 *  (a plain condition-not-met fire is fully described by its badge). This is the read the contract
 *  promised and the surface never made: without it the Run-now toast's "see the fire log" pointed at a log
 *  that showed a badge, a raw discriminator, and a timestamp. */
export function fireDetailLine(outcome: string, detail: Record<string, unknown> | null, caps: RuleFireCaps | null): string | null {
  if (detail === null) {
    return null;
  }
  switch (outcome) {
    case "action_error":
      return actionErrorLine(detail);
    case "predicate_error":
      return `Its condition errored: ${detailString(detail, "error") ?? "no reason recorded"}`;
    case "budget_refused":
      return budgetRefusedLine(detail, caps);
    case "depth_refused": {
      const depth = detailNumber(detail, "eventDepth");
      return depth === null ? "It was refused: too many rules had already chained." : `It was refused — another rule had already chained ${depth} deep.`;
    }
    case "authority_refused":
      return "Its author no longer hosts this chat, so it may not act here.";
    case "fired":
      return detail["runNow"] === true ? "You ran this by hand." : null;
    case "test_run":
      return testRunLine(detail);
    default:
      return null;
  }
}

/** A run-now outcome as a host-facing line PLUS the channel it belongs on (side-eye #621 P2-1: every
 *  outcome — including `action_error` and `authority_refused` — went out as a SUCCESS toast, which is the
 *  notify seam's own header argument made concrete). `warn` is the honest-degrade channel: the rule is
 *  healthy, it simply declined to act; `error` is reserved for the two arms where something BROKE. */
export function runOutcomeNotice(name: string, outcome: AutomationRunOutcome): { readonly channel: "success" | "warn" | "error"; readonly line: string } {
  switch (outcome) {
    case "fired":
      return { channel: "success", line: `Ran "${name}" — it fired.` };
    case "suggested":
      return { channel: "success", line: `Ran "${name}" — it raised a suggestion card.` };
    case "predicate_false":
      return { channel: "warn", line: `Ran "${name}" — its condition did not hold, so nothing happened.` };
    case "predicate_error":
      return { channel: "error", line: `Ran "${name}" — its condition errored. Its recent activity has the reason.` };
    case "budget_refused":
      return { channel: "warn", line: `Ran "${name}" — the fire-rate cap turned it away.` };
    case "depth_refused":
      return { channel: "warn", line: `Ran "${name}" — the cascade-depth cap turned it away.` };
    case "action_error":
      return { channel: "error", line: `Ran "${name}" — an action errored. Its recent activity has the reason.` };
    case "authority_refused":
      return { channel: "warn", line: `Ran "${name}" — you no longer hold the authority it needs.` };
    // D146-d: the rule is HOLDING for a plugin that is switched off, not broken. `warn`, never `error` — the
    // whole point of the pause terminal is that nothing went wrong and nothing was spent, so the line says
    // what to DO (turn the plugin back on) instead of sending the host to a fire log with nothing in it.
    case "paused":
      return { channel: "warn", line: `Ran "${name}" — it uses a tool from a plugin that isn't enabled, so it's paused until you turn that plugin back on.` };
    case "test_run":
      return { channel: "success", line: `Ran "${name}".` };
    default: {
      const exhaustive: never = outcome;
      throw new Error(`unhandled automation run outcome: ${JSON.stringify(exhaustive)}`);
    }
  }
}

/** One fire outcome as a badge label + tone. */
export interface FireOutcomeView {
  readonly label: string;
  readonly intent: BadgeProps["intent"];
}

/** One fire outcome's host-facing copy + badge tone, dispatched EXHAUSTIVELY (§5.5 — a new
 *  `AutomationFireOutcome` fails `tsc` at the `never` default). `fired` is the only success; the refusals are
 *  neutral facts (the rule is healthy, its condition simply did not hold), and the error terminals are the
 *  ones a host must notice. `test_run` marks a dry run so a Test press does not read as a real fire. A switch
 *  (not an object literal) keeps the snake_case wire terminals off the `useNamingConvention` lint.
 *
 *  ONE HOME for both fire surfaces (§5.5): the per-rule `RuleFireLog` and B11's room `RoomActivityLog` render
 *  the SAME badge from this dispatch, so a new terminal is written once. */
export function fireOutcomeView(outcome: AutomationFireOutcome): FireOutcomeView {
  switch (outcome) {
    case "fired":
      return { label: "Fired", intent: "success" };
    case "predicate_false":
      return { label: "Condition not met", intent: "neutral" };
    case "predicate_error":
      return { label: "Condition errored", intent: "danger" };
    case "budget_refused":
      return { label: "Rate-capped", intent: "warning" };
    case "depth_refused":
      return { label: "Cascade-capped", intent: "warning" };
    case "action_error":
      return { label: "Action errored", intent: "danger" };
    case "authority_refused":
      return { label: "No authority", intent: "danger" };
    case "test_run":
      return { label: "Test run", intent: "info" };
    default: {
      const exhaustive: never = outcome;
      throw new Error(`unhandled automation fire outcome: ${JSON.stringify(exhaustive)}`);
    }
  }
}
