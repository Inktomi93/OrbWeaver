// domain/automation/contract/service — the typed API surface: `AutomationContext` (the DI bundle the verbs
// close over) + `AutomationService` (the verb interface). HONEST-INTERFACE RULE (owner directive): this
// declares ONLY what the A3 global-var slice + the A4 contracts/store/lifecycle slice + the A5
// watcher/dispatch slice implement. A6 (action arms) wires the injected `runArm` dispatcher + WIDENS
// `AutomationOps` with the write ops — no stubs, no reserved slots here.

import type { BudgetView, GlobalVariableView } from "@orb/contracts/automation";
import type { ChatBusEvent } from "@orb/contracts/chat";
import type { DomainEvent } from "@orb/contracts/events";
import type { Can } from "@orb/contracts/identity";
import type { Db } from "@orb/db";
import type { AutomationFireId, AutomationRuleId } from "@orb/kit/ids";
import type { ArmDispatch, AutomationOps, EmitAutomationEvent, EnabledRuleIndex, PromptTransformIndex, ResolveAuthorPrincipal } from "./ops.ts";
import type {
  CreateRuleParams,
  DeleteGlobalVariableParams,
  DeleteRuleParams,
  GetBudgetsParams,
  GetGlobalVariableParams,
  ListFiresParams,
  ListGlobalVariablesParams,
  ListRulesParams,
  ReorderRulesParams,
  ResolveStreamAuthorityParams,
  SetBudgetsParams,
  SetGlobalVariableParams,
  SetRuleEnabledParams,
  TestRuleParams,
  UpdateRuleParams,
} from "./params.ts";
import type { PluginSubscriberRegistry } from "./plugin-subscribers.ts";
import type { FireView, RuleView, StreamAuthority, TestRunResult } from "./results.ts";

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
  readonly can: Can;
  /** The injected cross-feature READ ops (chat projections) the fact resolver + CEL env consume (A5). */
  readonly ops: AutomationOps;
  /** The arm dispatcher seam A6 populates (04 §4) — the injected `runArm` A5's dispatch invokes per matched
   *  arm. A5 wired a not-yet-filled default (every arm records `action_error`); A6 wires the real switch. */
  readonly runArm: ArmDispatch;
  /** The in-process pre-check index (01 §3) — maintained by the enable/disable/delete/trigger-change verbs. */
  readonly enabled: EnabledRuleIndex;
  /** The plugin `events.on` subscriber registry (plugin-design/04 §P4) — the watcher fans every resolved
   *  TriggerFact to the matching, authorized subscribers alongside the rule dispatch. Created at compose and
   *  handed to the membrane host (`register` is the seam `events.on` closes over); the fan-out reads it here. */
  readonly pluginSubscribers: PluginSubscriberRegistry;
  /** The A7 prompt-transform index (04 §6) — `transform_draft` rules register into chat's turn pipeline as
   *  they enable/disable/reorder. Reloaded alongside `enabled` by the lifecycle verbs (never watcher-run). */
  readonly transforms: PromptTransformIndex;
  /** Resolve a rule author's Principal for the dispatch-time host re-check (minted at entry; 03 §2). */
  readonly resolveAuthor: ResolveAuthorPrincipal;
  /** The automation feedback-bus sink (04 §5) — wired at compose to `publishAutomationEvent` (A8b), fanning
   *  the event to the chat's `automation.stream` subscribers (member-visible chips + host-only fire/error). */
  readonly notify: EmitAutomationEvent;
}

/** The automation surface. The A3 global-variable slice is owner-scoped on `principal.userId`; the A4
 *  rule-lifecycle slice gates host authority over the chat's membership (04 §2). */
export interface AutomationService {
  /** Read the caller's global by key, or `null` when unset. */
  readonly getGlobalVariable: (params: GetGlobalVariableParams) => Promise<string | null>;
  /** Upsert the caller's global (last-write-wins). Validates the caps before the write. */
  readonly setGlobalVariable: (params: SetGlobalVariableParams) => Promise<void>;
  /** Remove the caller's global by key. Idempotent on an absent key. */
  readonly deleteGlobalVariable: (params: DeleteGlobalVariableParams) => Promise<void>;
  /** List the caller's globals (key-sorted); `prefix` narrows the read — the settings-page surface. */
  readonly listGlobalVariables: (params: ListGlobalVariablesParams) => Promise<GlobalVariableView[]>;

  /** Create a chat-scoped rule (host-only). Validates trigger liveness (01 §1), CEL parse (02 §1), the
   *  action schemas + arm caps + reserved-arm refusal (03), book attachment (03 §1.3), and the cooldown
   *  floor. Assigns `position = max+1`; the rule is born DISABLED (enabling is the consent act). */
  readonly createRule: (params: CreateRuleParams) => Promise<RuleView>;
  /** Replace a rule's editable fields (host-only). Same validation; resets `consecutive_errors`. */
  readonly updateRule: (params: UpdateRuleParams) => Promise<RuleView>;
  /** Enable/disable a rule (host-only) — the watcher's chat-Set is maintained off this (A5). */
  readonly setRuleEnabled: (params: SetRuleEnabledParams) => Promise<void>;
  /** Delete a rule (host-only). */
  readonly deleteRule: (params: DeleteRuleParams) => Promise<void>;
  /** Rewrite `position` over a chat's rules (host-only; the ST-familiar drag list — a TOTAL reorder). */
  readonly reorderRules: (params: ReorderRulesParams) => Promise<void>;
  /** List a chat's rules (host-only in v1), ordered by position. */
  readonly listRules: (params: ListRulesParams) => Promise<RuleView[]>;
  /** The debug surface: a rule's recent fire log (host-only), newest first. */
  readonly listFires: (params: ListFiresParams) => Promise<FireView[]>;
  /** Upsert the per-chat fire-rate cap (host-only; the loop-safety belt). */
  readonly setBudgets: (params: SetBudgetsParams) => Promise<void>;
  /** Read the per-chat fire-rate cap (host-only): the host-editable fire-rate ceiling. An absent budget row
   *  projects to the defaulted view (what the write path stamps on insert). */
  readonly getBudgets: (params: GetBudgetsParams) => Promise<BudgetView>;
  /** Dry-run a rule (host-only): evaluate the predicate + render every arm's templates, executing NOTHING
   *  (no op, no budget debit); logs an `outcome:"test_run"` fire row (04 §2). */
  readonly testRule: (params: TestRuleParams) => Promise<TestRunResult>;

  /** The `automation.stream` subscribe-time visibility gate (04 §5) — resolve the caller's authority tier
   *  over the chat (`host` receives every bus event; `member` only the room-visible `quickReplySurfaced`), or
   *  throw a leak-free AutomationChatNotFound for a non-present member. MEMBER-level (not the host gate):
   *  the transient chips reach every participant, the tier only decides whether the host-only events flow. */
  readonly resolveStreamAuthority: (params: ResolveStreamAuthorityParams) => Promise<StreamAuthority>;

  /** The watcher front door (A5) — resolve one bus event into a fact, gate the chat's enabled rules
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
