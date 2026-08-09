// domain/automation/contract/results — the rule-lifecycle read models (A4). RuleView/FireView/TestRunResult
// stay in the DOMAIN contract (not `@orb/contracts/automation`) until the Phase-6 client type-imports them —
// the AdminUserView precedent (04 §2). They project the persistence rows onto the closed contract vocabulary
// (`AutomationTrigger`/`AutomationAction`/`AutomationFireOutcome`), never re-spelling those shapes.

import type { AutomationAction, AutomationActionType, AutomationFireOutcome, AutomationTrigger } from "@orb/contracts/automation";
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
  readonly matchAutomationEvents: boolean;
  readonly cooldownSeconds: number;
  readonly maxFiresPerHour: number;
  readonly consecutiveErrors: number;
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
  readonly automationDepth: number;
  readonly firedAt: number;
}

/** One arm's dry-run preview (`testRule`): the macro-rendered template, or the render error. Executes
 *  NOTHING — no op is called, no budget debited (04 §2). */
export interface ArmPreview {
  readonly type: AutomationActionType;
  readonly renderedPreview?: string;
  readonly error?: string;
}

/** The `testRule` dry-run contract (04 §2): the predicate verdict (or its error) + every arm's rendered
 *  preview. A template bug — the dominant authoring failure — surfaces here without a spend. */
export interface TestRunResult {
  readonly predicate: boolean | { readonly error: string };
  readonly arms: readonly ArmPreview[];
}

/** The `automation.stream` subscriber's authority tier over a chat (04 §5). The stream is the ONE procedure
 *  projecting by caller authority (the agents host/member filter): a `host` subscriber receives every bus event;
 *  a `member` receives only the room-visible `quickReplySurfaced` (rule fire/error/disable are the host's hidden
 *  hand). A non-present member never resolves an authority (the verb throws a leak-free `AutomationChatNotFound`
 *  → NOT_FOUND) — the fail-closed visibility gate the subscription tail is built on. */
export type StreamAuthority = "host" | "member";
