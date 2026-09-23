// domain/automation/contract/service — the typed API surface: `AutomationContext` (the DI bundle the verbs
// close over) + `AutomationService` (the verb interface). HONEST-INTERFACE RULE (owner directive): this
// declares ONLY what the global-var slice + the contracts/store/lifecycle slice + the
// watcher/dispatch slice implement. The action-arms slice wires the injected `runArm` dispatcher + WIDENS
// `AutomationOps` with the write ops — no stubs, no reserved slots here.

import type { GlobalVariableView, OwnerBudgetView, RulePresetView } from "@orb/contracts/automation";
import type { ChatBusEvent } from "@orb/contracts/chat";
import type { DomainEvent } from "@orb/contracts/events";
import type { Can } from "@orb/contracts/identity";
import type { Db } from "@orb/db";
import type { AutomationFireId, AutomationRuleId, AutomationSuggestionId } from "@orb/kit/ids";
import type {
  ApplyProseRewrite,
  ArmDispatch,
  AutomationOps,
  EmitAutomationEvent,
  EnabledRuleIndex,
  ExecutePluginSuggestion,
  IsAuthorEnabled,
  IsPluginLive,
  PromptTransformIndex,
  ResolveAuthorPrincipal,
  SuggestionStore,
} from "./ops.ts";
import type {
  ConfirmSuggestionParams,
  CreateRuleFromPresetParams,
  CreateRuleParams,
  DeleteGlobalVariableParams,
  DeleteRuleParams,
  DismissSuggestionParams,
  GetGlobalVariableParams,
  GetOwnerBudgetsParams,
  ListChatActivityParams,
  ListFiresParams,
  ListGlobalVariablesParams,
  ListOwnerRulesParams,
  ListRulesParams,
  ReorderRulesParams,
  ResolveStreamAuthorityParams,
  RunRuleNowParams,
  SetGlobalVariableParams,
  SetOwnerBudgetsParams,
  SetRuleEnabledParams,
  SetRuleSuggestOnRefusalParams,
  TestRuleParams,
  UpdateRuleParams,
} from "./params.ts";
import type { PluginSubscriberRegistry } from "./plugin-subscribers.ts";
import type { ConfirmSuggestionResult, FireView, RuleView, RunRuleNowResult, StreamAuthority, TestRunResult } from "./results.ts";

/** The DI bundle the automation verbs close over. Assembled at the entry composition root and handed to
 *  `createAutomationService`. `now` is the injected clock; `prng` is the injected [0,1) source the dry-run
 *  template render passes to `{{random}}`/`{{roll}}` (test-determinism gate); `can` is the ONE authority
 *  seam (D17 — automation never compares `role === 'host'` itself). */
export interface AutomationContext {
  readonly db: Db;
  readonly now: () => number;
  readonly prng: () => number;
  readonly newRuleId: () => AutomationRuleId;
  readonly newFireId: () => AutomationFireId;
  /** S4 — the pending-ask id minter (an EPHEMERAL TypeID: no table, the id is the claim handle). */
  readonly newSuggestionId: () => AutomationSuggestionId;
  readonly can: Can;
  /** The injected cross-feature READ ops (chat projections) the fact resolver + CEL env consume. */
  readonly ops: AutomationOps;
  /** The arm dispatcher seam — the injected `runArm` the dispatch invokes per matched
   *  arm. A not-yet-filled default records `action_error` for every arm until the real switch is wired. */
  readonly runArm: ArmDispatch;
  /** The in-process pre-check index — maintained by the enable/disable/delete/trigger-change verbs. */
  readonly enabled: EnabledRuleIndex;
  /** S4 — the in-RAM pending-ask map (RULED F1). One per process, created at compose beside `enabled`;
   *  the dispatch RAISES into it, the confirm/dismiss verbs TAKE from it, and the lifecycle verbs + the
   *  host-handoff sweep VOID from it. */
  readonly suggestions: SuggestionStore;
  /** The plugin `events.on` subscriber registry — the watcher fans every resolved
   *  TriggerFact to the matching, authorized subscribers alongside the rule dispatch. Created at compose and
   *  handed to the membrane host (`register` is the seam `events.on` closes over); the fan-out reads it here. */
  readonly pluginSubscribers: PluginSubscriberRegistry;
  /** The prompt-transform index — `transform_draft` rules register into chat's turn pipeline as
   *  they enable/disable/reorder. Reloaded alongside `enabled` by the lifecycle verbs (never watcher-run). */
  readonly transforms: PromptTransformIndex;
  /** Resolve a rule author's Principal for the dispatch-time host re-check (minted at entry). */
  readonly resolveAuthor: ResolveAuthorPrincipal;
  /** C5 — the OWNER-GLOBAL lane's standing-authority read: is a chat-less rule's author still an ENABLED
   *  account? Injected rather than selected locally because `users` belongs to `domain/sessions` +
   *  `domain/admin` alone (see {@link IsAuthorEnabled}). */
  readonly isAuthorEnabled: IsAuthorEnabled;
  /** S4 plugin arm — the PLUGIN-origin confirm's executor. Wired at compose to `domain/plugin` (the cake:
   *  automation never imports a sibling domain). It re-enters the PLUGIN's own bridge, so a confirmed act
   *  takes the plugin's gates and belts — NOT automation's `runArm`, whose arms carry a different
   *  enforcement set for acts that look identical (`verbs/confirm-suggestion.ts::runPluginAct`). */
  readonly executePluginSuggestion: ExecutePluginSuggestion;
  /** S4 plugin arm — the plugin half of the confirm-time liveness re-check (still installed AND enabled).
   *  Wired at compose to `domain/plugin`'s owner-scoped read; fail-CLOSED on anything else. */
  readonly isPluginLive: IsPluginLive;
  /** C3 — the CONFIRM-ONLY prose-rewrite executor, wired at compose to chat's own host-gated verb. It sits
   *  here rather than on `ops` precisely so no ARM can reach it (see {@link ApplyProseRewrite}): a rewrite of
   *  settled canon happens on a host's yes or not at all. */
  readonly applyProseRewrite: ApplyProseRewrite;
  /** The automation feedback-bus sink — wired at compose to `publishAutomationEvent`, fanning
   *  the event to the chat's `automation.stream` subscribers (member-visible chips + host-only fire/error). */
  readonly notify: EmitAutomationEvent;
}

/** The automation surface. The global-variable slice is owner-scoped on `principal.userId`; the
 *  rule-lifecycle slice gates host authority over the chat's membership. */
export interface AutomationService {
  /** Read the caller's global by key, or `null` when unset. */
  readonly getGlobalVariable: (params: GetGlobalVariableParams) => Promise<string | null>;
  /** Upsert the caller's global (last-write-wins). Validates the caps before the write. */
  readonly setGlobalVariable: (params: SetGlobalVariableParams) => Promise<void>;
  /** Remove the caller's global by key. Idempotent on an absent key. */
  readonly deleteGlobalVariable: (params: DeleteGlobalVariableParams) => Promise<void>;
  /** List the caller's globals (key-sorted); `prefix` narrows the read — the settings-page surface. */
  readonly listGlobalVariables: (params: ListGlobalVariablesParams) => Promise<GlobalVariableView[]>;

  /** Create a rule in EITHER scope — a chat (host-gated) or the caller's owner-GLOBAL lane (`chatId: null`,
   *  C5). Validates trigger liveness, CEL parse, the action schemas + arm caps + reserved-arm refusal, the
   *  owner-global scope matrix, book consent, and the cooldown floor. Assigns `position = max+1` WITHIN the
   *  scope; the rule is born DISABLED (enabling is the consent act). */
  readonly createRule: (params: CreateRuleParams) => Promise<RuleView>;
  /** Mint a §4 catalogue PRESET's ordered rule set into a chat (host-only). Resolves the caller's partial
   *  knob overrides against the preset's descriptors (a typed refusal on anything off-shape), substitutes
   *  them into the preset's CEL sources as literals, and creates each rule through `createRule` — same gate,
   *  same validation, born DISABLED. Returns the minted rules in mint (position) order. */
  readonly createRuleFromPreset: (params: CreateRuleFromPresetParams) => Promise<RuleView[]>;
  /** The preset picker's read model — the committed catalogue projected to id/title/summary/knob
   *  descriptors, in catalogue order. Static: no principal, no chat, no db. */
  readonly listRulePresets: () => RulePresetView[];
  /** Replace a rule's editable fields (host-only). Same validation; resets `consecutive_errors`. */
  readonly updateRule: (params: UpdateRuleParams) => Promise<RuleView>;
  /** Enable/disable a rule (host-only) — the watcher's chat-Set is maintained off this. */
  readonly setRuleEnabled: (params: SetRuleEnabledParams) => Promise<void>;
  /** RULED F4's per-rule opt-out (host-only; spec row B4) — flip whether a RATE REFUSAL of this rule still
   *  offers the host the "run it now?" invitation. Touches ONE column: the rule's authored shape, its
   *  enablement and its mint provenance are all untouched. */
  readonly setRuleSuggestOnRefusal: (params: SetRuleSuggestOnRefusalParams) => Promise<void>;
  /** Delete a rule (host-only). */
  readonly deleteRule: (params: DeleteRuleParams) => Promise<void>;
  /** Rewrite `position` over a chat's rules (host-only; the ST-familiar drag list — a TOTAL reorder). */
  readonly reorderRules: (params: ReorderRulesParams) => Promise<void>;
  /** List a chat's rules (host-only in v1), ordered by position. */
  readonly listRules: (params: ListRulesParams) => Promise<RuleView[]>;
  /** C5 — list the caller's OWN owner-global (chat-less) rules, ordered by position. The D18 single-owned
   *  read: the scope is `principal.userId`, so there is no id to pass and no lane but your own to see. */
  readonly listOwnerRules: (params: ListOwnerRulesParams) => Promise<RuleView[]>;
  /** The debug surface: a rule's recent fire log (host-only), newest first. */
  readonly listFires: (params: ListFiresParams) => Promise<FireView[]>;
  /** B11 — the room ACTIVITY read: a chat's recent fire log across ALL its rules (host-only), newest first.
   *  The per-chat twin of `listFires`, over the same `automation_fires` store (ONE-HOME). */
  readonly listChatActivity: (params: ListChatActivityParams) => Promise<FireView[]>;
  /** C5 — the caller's OWN owner-global fire-rate ceiling: the belt every chat-less rule of theirs counts
   *  against. An absent row projects to the DDL default (the value the dispatch already uses for it). */
  readonly getOwnerBudgets: (params: GetOwnerBudgetsParams) => Promise<OwnerBudgetView>;
  /** C5 — upsert that ceiling. Single-owned: there is no other lane to write. */
  readonly setOwnerBudgets: (params: SetOwnerBudgetsParams) => Promise<void>;
  /** Dry-run a rule (host-only): evaluate the predicate + render every arm's templates, executing NOTHING
   *  (no op, no budget debit); logs an `outcome:"test_run"` fire row. */
  readonly testRule: (params: TestRuleParams) => Promise<TestRunResult>;

  /** R7 — run ONE rule NOW (host-only): a fresh dispatch at cascade depth 0, the same gates a bus-driven
   *  fire runs EXCEPT the engine's fire-RATE cap (see the verb's header — the F4 invitation exists because
   *  that cap refused, so re-applying it would make "run it now" refuse identically forever). Deliberately
   *  NOT `testRule`, which executes nothing and stays that way. */
  readonly runRuleNow: (params: RunRuleNowParams) => Promise<RunRuleNowResult>;

  /** S4 — CONFIRM a pending ask (host-only). Take-once by id; re-checks rule-enabled + the AUTHOR's host
   *  authority; then either executes the STASHED arm (confirm class) or runs the rule fresh (invitation
   *  class). The confirmer AUTHORIZES; the executed frame stays the author's. */
  readonly confirmSuggestion: (params: ConfirmSuggestionParams) => Promise<ConfirmSuggestionResult>;
  /** S4 — the explicit dismiss (host-only): take the ask and run nothing. Idempotent-by-collapse — a
   *  second dismiss finds nothing and refuses leak-free, exactly like a double confirm. */
  readonly dismissSuggestion: (params: DismissSuggestionParams) => Promise<void>;

  /** The `automation.stream` subscribe-time visibility gate — resolve the caller's authority tier
   *  over the chat (`host` receives every bus event; `member` only the room-visible `quickReplySurfaced`), or
   *  throw a leak-free AutomationChatNotFound for a non-present member. MEMBER-level (not the host gate):
   *  the transient chips reach every participant, the tier only decides whether the host-only events flow. */
  readonly resolveStreamAuthority: (params: ResolveStreamAuthorityParams) => Promise<StreamAuthority>;

  /** The watcher front door — resolve one bus event into a fact, gate the chat's enabled rules
   *  (depth/authority/budget/predicate), and run their arms. SELF-SAFE: never throws (a throwing rule leaves
   *  siblings + the turn untouched — the fire-and-forget bus discipline). A no-op when the event's chat has no
   *  enabled rule (the pre-check). */
  readonly handleEvent: (event: ChatBusEvent | DomainEvent) => Promise<void>;
}

/** The injected event sources + the service front door the watcher subsystem consumes (assembled at
 *  entry/compose — the buddy-observer / agents-scheduler env precedent). */
export interface AutomationWatcherEnv {
  /** The per-chat firehose subscription (the buddy/agents `subscribeAllChatEvents` seam); returns unsubscribe. */
  readonly onChatEvent: (handler: (event: ChatBusEvent) => void) => () => void;
  /** The domain-event bus subscription (wired at entry/compose/event-bus.ts, D38); returns unsubscribe. */
  readonly onDomainEvent: (handler: (event: DomainEvent) => void) => () => void;
  readonly automation: Pick<AutomationService, "handleEvent">;
}

export interface AutomationWatcherHandle {
  readonly stop: () => void;
}
