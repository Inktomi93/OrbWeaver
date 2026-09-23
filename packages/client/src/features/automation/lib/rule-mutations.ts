// B2 — the automation RULES write verbs the "This chat" Rules section drives.
// Each is a module-scope `createEntityMutation` (§13.1 — the ONE mutation home; a call site never
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
// `chatId` rides the vars of the ruleId-keyed verbs PURELY to address the rule LIST for invalidation — the
// wire schema is `{ruleId, …}` and zod strips the extra key server-side (the setChatInjection precedent,
// where the id addresses the list filter).
//
// C5 — `chatId: null` ADDRESSES THE OWNER-GLOBAL LIST. The same five verbs drive both surfaces (the rule
// guard answers for a rule's scope server-side, so there are no second procedures), and what differs is
// purely WHICH cached list a settle repaints: `listRules({chatId})` for a room, `listOwnerRules()` for the
// Automation pane. `ruleListFilter` is the one place that decides, so a new call site cannot invalidate the
// wrong list — and the Automation pane's list is invalidation-only by necessity: the automation bus is
// per-CHAT, so an owner-global rule's fire reaches no live feed (`domain/automation/substrate/rule-feed.ts`).

import type { AutomationRuleId, ChatId } from "@orb/kit/ids";
import type { inferInput, inferOutput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import { createEntityMutation } from "#data";

/** The `listRules` read this section reconciles — tRPC-inferred (`readonly RuleView[]`), so the optimistic
 *  enable/disable patch below stays honest against the wire shape. */
type RuleList = inferOutput<Trpc["automation"]["listRules"]>;

/** The ruleId-keyed verbs carry the target SCOPE so their settle can invalidate the right rule list:
 *  a `ChatId` for a room's rule, `null` for an owner-global one. */
interface RuleActionVars {
  readonly ruleId: AutomationRuleId;
  readonly chatId: ChatId | null;
}

/** The cached rule LIST one scope's rules live in — the ONE scope→list mapping, read by every settle
 *  invalidate and by the optimistic enable patch. */
function ruleListFilter(trpc: Trpc, chatId: ChatId | null): ReturnType<Trpc["automation"]["listRules"]["queryFilter"]> {
  return chatId === null ? trpc.automation.listOwnerRules.queryFilter() : trpc.automation.listRules.queryFilter({ chatId });
}

/** The same mapping for the KEY (the optimistic read/write target). Separate from the filter because a
 *  filter matches a family and a key names one entry — `createEntityMutation` needs both. */
function ruleListKey(trpc: Trpc, chatId: ChatId | null): readonly unknown[] {
  return chatId === null ? trpc.automation.listOwnerRules.queryKey() : trpc.automation.listRules.queryKey({ chatId });
}

/** Enable/disable a rule (host-only; the consent act). OPTIMISTIC on the `listRules` cache so the switch
 *  paints before the round trip — a discrete-write control outside any autosave form — then reconciled by
 *  the settle invalidate (createEntityMutation's onSettled always repaints from the true server state). */
export const useSetRuleEnabled = createEntityMutation<
  inferInput<Trpc["automation"]["setRuleEnabled"]> & { readonly chatId: ChatId | null },
  inferOutput<Trpc["automation"]["setRuleEnabled"]>,
  RuleList
>({
  options: (trpc) => trpc.automation.setRuleEnabled.mutationOptions(),
  optimistic: {
    readKey: (trpc, vars) => ruleListKey(trpc, vars.chatId),
    update: (old, vars) => (old === undefined ? old : old.map((rule) => (rule.id === vars.ruleId ? { ...rule, enabled: vars.enabled } : rule))),
  },
  invalidates: (trpc, vars) => [ruleListFilter(trpc, vars.chatId)],
  errorToast: "Couldn't change whether that rule is on.",
});

/** B4 — RULED F4's per-rule opt-out: whether a RATE REFUSAL of this rule still offers the host the "run it
 *  now?" card. OPTIMISTIC for the same reason the enable flip is: a discrete-write switch outside any
 *  autosave form has to paint on press, and the settle invalidate reconciles it from the true server state.
 *  Its own procedure server-side (the rule PUT would clear the rule's mint provenance), so its own hook. */
export const useSetRuleSuggestOnRefusal = createEntityMutation<
  inferInput<Trpc["automation"]["setRuleSuggestOnRefusal"]> & { readonly chatId: ChatId | null },
  inferOutput<Trpc["automation"]["setRuleSuggestOnRefusal"]>,
  RuleList
>({
  options: (trpc) => trpc.automation.setRuleSuggestOnRefusal.mutationOptions(),
  optimistic: {
    readKey: (trpc, vars) => ruleListKey(trpc, vars.chatId),
    update: (old, vars) =>
      old === undefined ? old : old.map((rule) => (rule.id === vars.ruleId ? { ...rule, suggestOnRefusal: vars.suggestOnRefusal } : rule)),
  },
  invalidates: (trpc, vars) => [ruleListFilter(trpc, vars.chatId)],
  errorToast: "Couldn't change whether that rule offers to run when it's rate-capped.",
});

/** Delete a rule (host-only). No optimistic removal — a failed delete flashing a row back is worse than the
 *  brief settle-refetch, and the row carries no in-flight state a member could act on meanwhile. */
export const useDeleteRule = createEntityMutation<RuleActionVars, inferOutput<Trpc["automation"]["deleteRule"]>>({
  options: (trpc) => trpc.automation.deleteRule.mutationOptions(),
  invalidates: (trpc, vars) => [ruleListFilter(trpc, vars.chatId)],
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
  invalidates: (trpc, vars) => [trpc.automation.listFires.queryFilter({ ruleId: vars.ruleId }), ruleListFilter(trpc, vars.chatId)],
  errorToast: "Couldn't run that rule.",
});

/** The generic mint refusal — used when the verb's reason is empty or is an internal one no host can act
 *  on (an override naming a knob the rule preset does not declare is a client bug, not a user mistake). */
const MINT_FAILED = "Couldn't add that rule.";

/** The server's per-setting refusal shape (`substrate/presets.ts::refuse`) — the word "knob", the raw
 *  camelCase key in quotes, a colon, then the reason. Both the word and the key are developer vocabulary;
 *  side-eye #621 P2-4 caught them being shown to a host verbatim. */
const KNOB_REFUSAL_RE = /^knob '([^']+)': (.+)$/su;

/** `bookId` → `Book id` — the field as the picker names it, near enough to its own label to be found. */
function humanizeKnobKey(key: string): string {
  const spaced = key.replace(/([a-z\d])([A-Z])/gu, "$1 $2").toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** The inline refusal copy for a preset mint — the verb's own leak-free reason when it threw one (an
 *  off-bounds knob, an empty/invalid book id, a book not attached to this chat), else a generic fallback.
 *  This is what surfaces "the book must already be attached to this chat" rather than a silent no-op —
 *  with the server's developer-shaped per-setting refusals rewritten into the host's own vocabulary. */
function mintFailureToast(error: unknown): string {
  if (!(error instanceof Error) || error.message.length === 0) {
    return MINT_FAILED;
  }
  if (!error.message.startsWith("knob ")) {
    return error.message; // a plain typed refusal ("that book is not attached to this chat") — already host copy.
  }
  const knobRefusal = KNOB_REFUSAL_RE.exec(error.message);
  const key = knobRefusal?.[1];
  const reason = knobRefusal?.[2];
  // A non-matching `knob …` message is the "not a knob of this rule preset" arm — a client bug, not
  // something a host can fix, so it gets the generic line rather than the internals.
  return key === undefined || reason === undefined ? MINT_FAILED : `${humanizeKnobKey(key)}: ${reason}`;
}

/** Mint a preset's ordered rule SET into a chat (host-only; born disabled). Invalidates the rules list on
 *  settle. A typed mint refusal (knob bounds / book attachment) rides `errorToast` so the host sees the
 *  reason instead of a card that quietly did nothing. */
export const useCreateRuleFromPreset = createEntityMutation<
  // The `chatId` is RE-NARROWED off the inferred input, not re-declared: `brandedId<ChatId>().nullable()`
  // infers its branded half through a zod `.transform`, and the intersection is what keeps the mint's own
  // wire shape authoritative while giving `ruleListFilter` the scope type it needs.
  inferInput<Trpc["automation"]["createRuleFromPreset"]> & { readonly chatId: ChatId | null },
  inferOutput<Trpc["automation"]["createRuleFromPreset"]>
>({
  options: (trpc) => trpc.automation.createRuleFromPreset.mutationOptions(),
  invalidates: (trpc, vars) => [ruleListFilter(trpc, vars.chatId)],
  errorToast: mintFailureToast,
});
