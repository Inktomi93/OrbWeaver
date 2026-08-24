// B2 — the automation RULES write verbs the "This chat" Rules section drives (interaction-direction-spec
// §7 B2). Each is a module-scope `createEntityMutation` (§13.1 — the ONE mutation home; a call site never
// hand-rolls `useMutation` + cache surgery). TVars/TData are tRPC-INFERRED, so a wire reshape breaks here
// at compile time.
//
// FRESHNESS — why `invalidates`, never `busDriven`: the automation bus IS live (rulesChanged/ruleFired/
// ruleErrored reach the client), but its client consumer is a REDUCER over the pending-ask list
// (`apply-automation-bus-event.ts`), not an invalidation seam — that bus has no query behind its pending
// asks. The rule-lifecycle READS (`listRules`/`listFires`) have no bus-driven invalidation, so a write
// reconciles them itself. `rules-section.tsx` ALSO invalidates these same reads off the live bus (a rule
// firing from a real turn moves `lastFiredAt`/the fire log with no local mutation) — the two paths cover
// the local-action edge and the remote-fire edge respectively.
//
// `chatId` rides the vars of the ruleId-keyed verbs PURELY to address `listRules({chatId})` for
// invalidation — the wire schema is `{ruleId, …}` and zod strips the extra key server-side (the
// setChatInjection precedent, where the id addresses the list filter).

import type { AutomationRuleId, ChatId } from "@orb/kit/ids";
import type { inferInput, inferOutput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import { createEntityMutation } from "#data";

/** The `listRules` read this section reconciles — tRPC-inferred (`readonly RuleView[]`), so the optimistic
 *  enable/disable patch below stays honest against the wire shape. */
type RuleList = inferOutput<Trpc["automation"]["listRules"]>;

/** The ruleId-keyed verbs carry the target chat so their settle can invalidate `listRules({chatId})`. */
interface RuleActionVars {
  readonly ruleId: AutomationRuleId;
  readonly chatId: ChatId;
}

/** Enable/disable a rule (host-only; the consent act). OPTIMISTIC on the `listRules` cache so the switch
 *  paints before the round trip — a discrete-write control outside any autosave form — then reconciled by
 *  the settle invalidate (createEntityMutation's onSettled always repaints from the true server state). */
export const useSetRuleEnabled = createEntityMutation<
  inferInput<Trpc["automation"]["setRuleEnabled"]> & { readonly chatId: ChatId },
  inferOutput<Trpc["automation"]["setRuleEnabled"]>,
  RuleList
>({
  options: (trpc) => trpc.automation.setRuleEnabled.mutationOptions(),
  optimistic: {
    readKey: (trpc, vars) => trpc.automation.listRules.queryKey({ chatId: vars.chatId }),
    update: (old, vars) => (old === undefined ? old : old.map((rule) => (rule.id === vars.ruleId ? { ...rule, enabled: vars.enabled } : rule))),
  },
  invalidates: (trpc, vars) => [trpc.automation.listRules.queryFilter({ chatId: vars.chatId })],
  errorToast: "Couldn't change whether that rule is on.",
});

/** Delete a rule (host-only). No optimistic removal — a failed delete flashing a row back is worse than the
 *  brief settle-refetch, and the row carries no in-flight state a member could act on meanwhile. */
export const useDeleteRule = createEntityMutation<RuleActionVars, inferOutput<Trpc["automation"]["deleteRule"]>>({
  options: (trpc) => trpc.automation.deleteRule.mutationOptions(),
  invalidates: (trpc, vars) => [trpc.automation.listRules.queryFilter({ chatId: vars.chatId })],
  errorToast: "Couldn't delete that rule.",
});

/** DRY-RUN a rule (host-only): evaluate the predicate + render every arm's templates, executing NOTHING.
 *  The verb logs a `test_run` fire row, so the settle invalidates the fire log; the caller reads the
 *  returned `TestRunResult` (predicate verdict + per-arm previews) via `mutateAsync` to show it inline. */
export const useTestRule = createEntityMutation<RuleActionVars, inferOutput<Trpc["automation"]["testRule"]>>({
  options: (trpc) => trpc.automation.testRule.mutationOptions(),
  invalidates: (trpc, vars) => [trpc.automation.listFires.queryFilter({ ruleId: vars.ruleId })],
  errorToast: "Couldn't test that rule.",
});

/** R7 — run ONE rule NOW (host-only): a fresh dispatch at depth 0. Records the SAME fire terminal a
 *  bus-driven fire would, so the settle invalidates both the fire log (the new row) and the rules list
 *  (`lastFiredAt`/`lastError` moved). The caller reads the returned outcome to confirm what happened. */
export const useRunRuleNow = createEntityMutation<RuleActionVars, inferOutput<Trpc["automation"]["runRuleNow"]>>({
  options: (trpc) => trpc.automation.runRuleNow.mutationOptions(),
  invalidates: (trpc, vars) => [trpc.automation.listFires.queryFilter({ ruleId: vars.ruleId }), trpc.automation.listRules.queryFilter({ chatId: vars.chatId })],
  errorToast: "Couldn't run that rule.",
});

/** The inline refusal copy for a preset mint — the verb's own leak-free reason when it threw one (an
 *  off-bounds knob, an empty/invalid book id, a book not attached to this chat), else a generic fallback.
 *  This is what surfaces "the book must already be attached to this chat" rather than a silent no-op. */
function mintFailureToast(error: unknown): string {
  return error instanceof Error && error.message.length > 0 ? error.message : "Couldn't add that rule.";
}

/** Mint a preset's ordered rule SET into a chat (host-only; born disabled). Invalidates the rules list on
 *  settle. A typed mint refusal (knob bounds / book attachment) rides `errorToast` so the host sees the
 *  reason instead of a card that quietly did nothing. */
export const useCreateRuleFromPreset = createEntityMutation<
  inferInput<Trpc["automation"]["createRuleFromPreset"]>,
  inferOutput<Trpc["automation"]["createRuleFromPreset"]>
>({
  options: (trpc) => trpc.automation.createRuleFromPreset.mutationOptions(),
  invalidates: (trpc, vars) => [trpc.automation.listRules.queryFilter({ chatId: vars.chatId })],
  errorToast: mintFailureToast,
});
