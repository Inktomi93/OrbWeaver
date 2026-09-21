// domain/automation/contract/results — the rule-lifecycle read models. RuleView/FireView/TestRunResult
// stay in the DOMAIN contract (not `@orb/contracts/automation`) until the client type-imports them —
// the AdminUserView precedent. They project the persistence rows onto the closed contract vocabulary
// (`AutomationTrigger`/`AutomationAction`/`AutomationFireOutcome`), never re-spelling those shapes.

import type {
  AutomationAction,
  AutomationActionType,
  AutomationFireOutcome,
  AutomationRunOutcome,
  AutomationTrigger,
  RulePresetId,
  RulePresetKnobValues,
} from "@orb/contracts/automation";
import type { AutomationFireId, AutomationRuleId, ChatId } from "@orb/kit/ids";

/** One host-authored automation rule, projected for the editor + list surfaces. `actions` is the
 *  lazy-parsed arm list; `trigger` recomposes the stored `{bus, type}` pair. */
export interface RuleView {
  readonly id: AutomationRuleId;
  readonly chatId: ChatId | null;
  readonly name: string;
  readonly description: string | null;
  readonly enabled: boolean;
  readonly position: number;
  readonly trigger: AutomationTrigger;
  readonly predicateCel: string | null;
  readonly actions: readonly AutomationAction[];
  /** #1422 — the stored `actions` blob did not parse, so {@link RuleView.actions} above is EMPTY BECAUSE IT
   *  IS UNREADABLE, not because the rule has no arms. Without this the two states projected identically and a
   *  broken rule read as benign in management until an event happened to dispatch it (which is where the
   *  auto-disable lives). A surface renders the difference; nothing else about the row is changed by it. */
  readonly actionsCorrupt: boolean;
  /** Mint provenance (§3-S3 flip shape): the rule preset this rule was minted from, or NULL for a
   *  hand-authored/hand-EDITED rule (`updateRule` clears the pair). Both-or-neither with
   *  {@link RuleView.rulePresetKnobs} (db CHECK). The saved-cast capture + B2's knob editor read these. */
  readonly rulePresetId: RulePresetId | null;
  /** The COMPLETE resolved knob bag the mint ran with. */
  readonly rulePresetKnobs: RulePresetKnobValues | null;
  readonly matchAutomationEvents: boolean;
  /** RULED F4's per-rule opt-out (spec row B4): whether a RATE REFUSAL of this rule still offers the host
   *  the "run it now?" invitation. Defaults TRUE (the ruling's own default); the host turns it off per
   *  rule via `setRuleSuggestOnRefusal`. Only observable on a rule carrying a SPEND arm — the arm shape
   *  still decides whether a refusal could earn an ask at all. */
  readonly suggestOnRefusal: boolean;
  readonly cooldownSeconds: number;
  readonly maxFiresPerHour: number;
  readonly lastError: string | null;
  readonly lastFiredAt: number | null;
  readonly createdAt: number;
  readonly updatedAt: number;
}

/** One fire-log row — the host's "why didn't my rule fire" surface (`listFires`). `detail` carries the
 *  per-arm results / the error / the rendered previews (test_run), read-seam parsed. */
export interface FireView {
  readonly id: AutomationFireId;
  readonly ruleId: AutomationRuleId;
  readonly chatId: ChatId | null;
  readonly triggerType: string;
  readonly outcome: AutomationFireOutcome;
  readonly detail: Record<string, unknown> | null;
  readonly firedAt: number;
}

/** One arm's dry-run preview (`testRule`): the macro-rendered template, or the render error. Executes
 *  NOTHING — no op is called, no budget debited. */
export interface ArmPreview {
  readonly type: AutomationActionType;
  readonly renderedPreview?: string;
  readonly error?: string;
}

/** The `testRule` dry-run contract: the predicate verdict (or its error) + every arm's rendered
 *  preview. A template bug — the dominant authoring failure — surfaces here without a spend. */
export interface TestRunResult {
  readonly predicate: boolean | { readonly error: string };
  readonly arms: readonly ArmPreview[];
}

/** R7 — what a host's "run it now" produced. `outcome` is the SAME fire terminal the bus-driven dispatch
 *  records, so the answer to "I pressed Run now, what happened?" is one word in the same vocabulary the fire
 *  log speaks (a `predicate_false` is the common honest answer — the rule's own condition no longer holds). */
export interface RunRuleNowResult {
  readonly outcome: AutomationRunOutcome;
}

/** S4 — what a confirm did. `ran` names WHICH of the two classes executed: the STASHED arm (confirm class —
 *  the act the host was shown, in the author's own frame) or a FRESH rule dispatch (invitation class — a
 *  pre-predicate refusal had nothing to stash, so its confirm is R7). `outcome` is the fire terminal either
 *  way, in the fire log's own vocabulary: a stashed arm terminates `fired` or `action_error`; a fresh run can
 *  additionally come back `predicate_false` — the honest answer when the rule's condition has since moved. */
export interface ConfirmSuggestionResult {
  readonly ran: "stashed-arm" | "fresh-run";
  readonly outcome: AutomationRunOutcome;
}

/** The `automation.stream` subscriber's authority tier over a chat. The stream is the ONE procedure
 *  projecting by caller authority (the agents host/member filter): a `host` subscriber receives every bus event;
 *  a `member` receives only the room-visible `quickReplySurfaced` (rule fire/error/disable are the host's hidden
 *  hand). A non-present member never resolves an authority (the verb throws a leak-free `AutomationChatNotFound`
 *  → NOT_FOUND) — the fail-closed visibility gate the subscription tail is built on. */
export type StreamAuthority = "host" | "member";
