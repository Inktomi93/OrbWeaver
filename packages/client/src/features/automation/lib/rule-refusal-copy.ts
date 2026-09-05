// The rule row's REFUSALS — what a host is told when a control on the row cannot do what it says.
//
// Extracted from `rule-copy.ts` when #1673's third refusal pushed that file past the `component-size` cap
// (453 > 450), and it is the extraction that gate names: a self-contained VOCABULARY rather than a slice of
// component logic. It is also the honest boundary. `rule-copy.ts` translates a rule's wire values into
// sentences that describe what a rule IS and DID — its trigger, its arms, its last run, a fire's detail.
// This module answers a different question, about the SURFACE rather than the rule: which doors are shut,
// and why. The two grew apart the moment there was more than one refusal to keep consistent.
//
// THERE IS NO RE-EXPORT FROM `rule-copy.ts`. Both consumers (`components/rule-row.tsx` and this module's
// own test) import from here, so a back-compat alias would be a second import path for one concept —
// exactly the doubling the extraction exists to avoid — and knip would call it dead.
//
// ONE GRAMMAR ACROSS EVERY DOOR, and that is the whole reason they share a home. A refusal opens `Can't
// <verb> "<rule>" — <why>`, names the rule (N rows give N identical controls), and states the reason in the
// HOST's words rather than the wire's: never `actionsCorrupt`, never `transform_not_runnable`, never
// "corrupt". A host is told what is true of THEIR rule and, where one exists, the one move that fixes it.
//
// WHY EACH REFUSAL EXISTS — all three are the #924 dead-end class, a door whose every branch fails:
//   · UNREADABLE (#1558/#1655): the stored actions blob does not parse. `RuleView.actionsCorrupt` (#1422)
//     rode the wire with no client reader, and `actions` projects to `[]` for BOTH an unparseable blob and
//     a rule nobody has added an arm to, so a rule that could never do anything rendered as a benign empty
//     one with a live enable switch on top. Enable is refused because the server would refuse it; Run-now
//     is refused because `engine/dispatch.ts::runRule` re-parses, fails, and calls
//     `disableRule(…, "auto-disabled: corrupt actions blob")` — the only reachable outcome of pressing it
//     is to turn the rule OFF behind the host's back (and on an already-disabled one,
//     `verbs/run-rule-now.ts` throws `rule_disabled` first).
//   · DRAFT-REWRITING (#1673): a `transform_draft` rule never dispatches at all — it REGISTERS a
//     `PromptTransform` into chat's turn pipeline (`engine/prompt-transforms.ts`) and the engine skips it
//     by name, so `substrate/run-now.ts::dispatchRuleNow` returns `null` and `verbs/run-rule-now.ts` turns
//     that into a typed `transform_not_runnable`. Only Run-now is refused: a draft rewriter is a perfectly
//     healthy rule that simply has no out-of-turn meaning, so its enable switch, Test and Delete stay live.

import type { AutomationActionType } from "@orb/contracts/automation";

/** The badge on a rule whose stored actions did not parse. A WORD, never intent colour alone — the same bar
 *  every other verdict badge on this surface meets. */
export const RULE_UNREADABLE_BADGE = "Can't run";

/** The unreadable rule's own sentence: what is wrong, what it means, and the one move that fixes it. The
 *  rule's `lastError` is appended when it has one — a corrupt rule that already dispatched carries the
 *  engine's reason there, and it is the only concrete detail a host can quote for help.
 *
 *  It names REMOVE-AND-ADD-AGAIN rather than a repair, because there is no in-app repair for a blob the
 *  schema rejects and pretending otherwise would be the lie this state exists to remove. */
export function ruleUnreadableLine(lastError: string | null): string {
  const base = "This rule can't run — what it was told to do can no longer be read. Remove it and add the rule again.";
  return lastError === null || lastError.trim() === "" ? base : `${base} Its last run reported: ${lastError}`;
}

/** The accessible name of the enable control on an unreadable rule. It states the REFUSAL rather than the
 *  action, because the control is NOT offered: a switch announced "Enable X" that cannot be operated is the
 *  dead affordance this state exists to remove. */
export function ruleUnreadableEnableRefusal(ruleName: string): string {
  return `Can't enable "${ruleName}" — its saved actions can't be read`;
}

/** The reason on the Run-now door of an unreadable rule (#1655) — the SAME refusal as the enable control's,
 *  in the same grammar, because the two doors are answers to one question and a surface that refuses to
 *  switch a rule on while still offering to run it says two different things about the same rule. */
export function ruleUnreadableRunRefusal(ruleName: string): string {
  return `Can't run "${ruleName}" — its saved actions can't be read`;
}

/** Does this rule do nothing but rewrite the draft inside a turn? Mirrors `engine/dispatch.ts::runRule`'s
 *  own `parsed.data.every((action) => action.type === "transform_draft")`, with the empty list excluded.
 *
 *  THE SHAPE IS ALL-OR-NOTHING BY VALIDATION and this says so rather than assuming it: the write path
 *  guarantees a rule carrying ANY `transform_draft` arm carries ONLY transform arms. The length guard is
 *  load-bearing — an arm-less rule, and an UNREADABLE one whose arms project to `[]`, would satisfy a bare
 *  `every` vacuously and be handed the wrong refusal. */
export function isTransformOnlyRule(actions: readonly { readonly type: AutomationActionType }[]): boolean {
  return actions.length > 0 && actions.every((action) => action.type === "transform_draft");
}

/** The reason on the Run-now door of a draft-rewriting rule (#1673) — the same door grammar as the
 *  unreadable rule's two refusals, because a host meeting either one is being told the same KIND of thing:
 *  this control cannot do what it says. The sentence is the server's own reason in the host's words —
 *  "there is no draft to rewrite out of turn" — rather than the wire code `transform_not_runnable`. */
export function ruleTransformOnlyRunRefusal(ruleName: string): string {
  return `Can't run "${ruleName}" — it rewrites your draft while a reply is being built, so there's nothing to run out of turn`;
}
