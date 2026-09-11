// domain/automation/engine/prompt-transforms — the automation side of the D50 `PromptTransform` seam.
// A `transform_draft` arm is the ONE arm that does NOT run through the watcher/dispatch engine
// (`arm-executors` records a typed refusal for it, `dispatch` skips a transform-only rule): prompt mutation
// cannot be a fire-and-forget bus effect — by the time a subscriber runs, the prompt has shipped. Instead a
// `transform_draft` rule REGISTERS a `PromptTransform` into chat's compose-wired registry, which the turn
// pipeline applies synchronously at its two fixed points (`user_input` in SEND after the macro pass, before
// USER_INPUT regex; `assembled_dynamic` at end of BUILD over the dynamic half). Chat owns the ORDER (automation
// 0–999, plugins 1000+) + the 250 ms per-apply deadline; this index owns WHICH transforms are registered.
//
// The registry is a per-deploy Map (`ASSUMES(single-replica)`); this index reconciles it against canon on
// `reload` (boot + every lifecycle mutation that can change an enabled transform rule). It tracks the ids IT
// registered so a removed/disabled rule's transform is deregistered without touching the plugin host's rows.

import type { AutomationCelEnv } from "@orb/contracts/automation";
import { automationActionsSchema } from "@orb/contracts/automation";
import type { PromptTransform } from "@orb/contracts/chat";
import type { ChatId, UserId } from "@orb/kit/ids";
import type { PromptTransformIndex, PromptTransformIndexDeps, RuleRow } from "../contract/ops.ts";
import { countChatMessages } from "../persistence/canon-reads.ts";
import { loadEnabledTurnStartedRules, recordRuleError } from "../persistence/rules.ts";
import { authorGlobals } from "../substrate/cel-env.ts";
import { evaluatePredicate, nowFields } from "../substrate/dry-run.ts";
import { renderArmTemplate } from "../substrate/macro-render.ts";

/** The `PromptTransform.id` namespace for automation-registered transforms (`automation:<ruleId>:<armIndex>` —
 *  the arm index disambiguates a rule with more than one `transform_draft` arm; every id is unique in the
 *  shared registry, and the `automation:` prefix scopes this index's reconciliation to its OWN rows). */
const AUTOMATION_TRANSFORM_ID_PREFIX = "automation:";
/** The top of automation's `order` band (automation 0–999, plugins 1000+; host policy wraps guest).
 *  A rule's `position` is its order; clamped so a pathologically deep list can never cross into the plugin band. */
const AUTOMATION_ORDER_MAX = 999;
/** The `{{draft}}` macro name a `transform_draft` template addresses — seeded into the render's name→value env
 *  as the CURRENT target text; its render REPLACES the target. */
const DRAFT_MACRO_KEY = "draft";

/** Build the CEL activation a transform's predicate + template render evaluates against — the same planes the
 *  live dispatch env carries, MINUS `event` (a transform applies inside the pipeline; there is no trigger fact
 *  synchronously — the `{{expr::…}}` posture). `vars` is the pipeline-supplied runtime fold-cache
 *  snapshot (read-only); choice/global/messageCount are read fresh so a predicate over them sees turn-time truth. */
async function buildTransformEnv(
  deps: PromptTransformIndexDeps,
  chatId: ChatId,
  authorUserId: UserId,
  vars: Record<string, string>,
): Promise<AutomationCelEnv> {
  const [choice, global, messageCount] = await Promise.all([
    deps.ops.chat.readChoicePicks(chatId),
    authorGlobals(deps.db, authorUserId),
    countChatMessages(deps.db, chatId),
  ]);
  return { vars, choice, global, chat: { id: chatId, messageCount }, now: nowFields(deps.now()) };
}

/** One `transform_draft` arm resolved to its pipeline coordinates — the chat it guards, its fixed point, the
 *  render template, and the arm index that disambiguates its id. */
interface TransformArmSpec {
  readonly chatId: ChatId;
  readonly target: PromptTransform["point"];
  readonly template: string;
  readonly armIndex: number;
}

/** How far the error ledger of a chronically broken transform is allowed to climb (#1422). It is a WRITE
 *  bound, not a disable threshold: past this the row already reads "this rule fails every turn", so further
 *  ticks buy nothing and would put one UPDATE per turn per broken transform on the pipeline's error path. */
const TRANSFORM_ERROR_LEDGER_MAX = 20;

/** Build ONE `PromptTransform` from a rule's `transform_draft` arm. The `apply` closure re-reads room state
 *  every turn (the rule's config is captured; the state is live) and: (1) self-guards on chatId — the registry
 *  is a shared, chat-blind Map, so a transform must ignore other chats' turns; (2) evaluates the rule's
 *  predicate over the event-less env — false is a quiet skip, an ERROR is recorded; (3) renders the
 *  template with `{{draft}}` = the current target text; a strict-arg render error passes the draft through
 *  UNCHANGED (a broken rule must never eat the user's message) and is recorded.
 *
 *  THE PASS-THROUGH STAYS AND THE SILENCE GOES (#1422). Returning the draft unchanged on any failure is the
 *  ruling — prompt mutation is synchronous inside the turn, so a broken rule must never cost the user their
 *  message. But a transform-only rule is SKIPPED by `dispatch` before its `consecutive_errors` logic, so
 *  nothing else in the system could ever notice: a dynamically broken transform failed on every turn forever
 *  with no fire row, no counter and no operator signal, reading exactly like a rule whose predicate is simply
 *  false. So the failure paths now tick the SAME error ledger the dispatch plane uses
 *  (`consecutive_errors`/`last_error`, both already on `RuleView`) — the surface a host already reads to
 *  answer "why isn't my rule doing anything". It does NOT auto-disable: that is dispatch's call about acts
 *  with side effects, and a transform's failure is inert by construction. */
function buildRuleTransform(deps: PromptTransformIndexDeps, rule: RuleRow, spec: TransformArmSpec): PromptTransform {
  // Per-registration, process-local: the ledger tick stops climbing at the bound above. Reset by a
  // re-register (a rule edit re-mints the closure), which is also when the stored counter is reset.
  let recordedErrors = 0;
  const note = async (reason: string): Promise<void> => {
    if (recordedErrors >= TRANSFORM_ERROR_LEDGER_MAX) {
      return;
    }
    recordedErrors = await recordRuleError(deps.db, rule.id, `transform_error: ${reason}`, deps.now());
  };
  return {
    id: `${AUTOMATION_TRANSFORM_ID_PREFIX}${rule.id}:${spec.armIndex}`,
    point: spec.target,
    order: Math.min(rule.position, AUTOMATION_ORDER_MAX),
    apply: async (draft, env): Promise<string> => {
      if (env.chatId !== spec.chatId) {
        return draft;
      }
      const celEnv = await buildTransformEnv(deps, spec.chatId, rule.ownerId, env.vars);
      const verdict = evaluatePredicate(rule.predicateCel, celEnv, true);
      if (verdict !== true) {
        // A FALSE predicate is the rule working — it is the whole point of having one, and recording it would
        // make "did not apply this turn" indistinguishable from "is broken". Only the error arm ticks.
        if (verdict !== false) {
          await note(`predicate: ${verdict.error}`);
        }
        return draft;
      }
      const rendered = renderArmTemplate({
        env: celEnv,
        chatScoped: true,
        nowMs: deps.now(),
        prng: deps.prng,
        template: spec.template,
        macroEnv: { [DRAFT_MACRO_KEY]: draft },
      });
      if (rendered.error !== undefined) {
        await note(`render: ${rendered.error}`);
        return draft;
      }
      return rendered.text;
    },
  };
}

/** The `transform_draft` transforms a single enabled turnStarted rule contributes — one per `transform_draft`
 *  arm. A rule that carries NO `transform_draft` arm (a normal turnStarted watcher rule) contributes none; a
 *  corrupt actions blob (disabled at dispatch) parses to none here. `validate` guarantees a rule with any
 *  `transform_draft` arm is turnStarted + all-transform, so this only ever fires for genuine transform rules. */
function ruleTransforms(deps: PromptTransformIndexDeps, rule: RuleRow): PromptTransform[] {
  if (rule.chatId === null) {
    // A `transform_draft` rule is CHAT-REQUIRED (`AUTOMATION_ARM_SCOPE`), so the mint refuses one on the
    // owner-global lane and a chat-less row here can only be a rule whose arms are something else. The
    // self-guard below needs a chat to compare the turn against, so there is nothing to register either way.
    return [];
  }
  const parsed = automationActionsSchema.safeParse(rule.actions);
  if (!parsed.success) {
    return [];
  }
  const chatId = rule.chatId;
  return parsed.data.flatMap((action, armIndex) =>
    action.type === "transform_draft" ? [buildRuleTransform(deps, rule, { chatId, target: action.target, template: action.template, armIndex })] : [],
  );
}

/** Build the prompt-transform index over the injected registry. `reload` reconciles the registered set
 *  with canon: register/replace every enabled transform rule's transforms, and unregister any id this index
 *  previously registered that is no longer desired (a disabled/deleted/edited-away rule). Idempotent — a
 *  re-register replaces by id (a rule edit). Call `reload()` once at boot after chat's registry exists. */
export function createPromptTransformIndex(deps: PromptTransformIndexDeps): PromptTransformIndex {
  // ASSUMES(single-replica): the id set is a per-process snapshot, eventually-consistent within one reload.
  let registeredIds = new Set<string>();
  // #1431 — the STALE latch, the enabled index's twin (that file's header carries the two-door argument).
  let stale = false;

  const reconcile = async (): Promise<void> => {
    const rules = await loadEnabledTurnStartedRules(deps.db);
    const desired = new Map<string, PromptTransform>();
    for (const rule of rules) {
      for (const transform of ruleTransforms(deps, rule)) {
        desired.set(transform.id, transform);
      }
    }
    for (const id of registeredIds) {
      if (!desired.has(id)) {
        deps.unregister(id);
      }
    }
    for (const transform of desired.values()) {
      deps.register(transform);
    }
    registeredIds = new Set(desired.keys());
    stale = false;
  };

  return {
    reload: reconcile,
    isStale: (): boolean => stale,
    refresh: async (): Promise<void> => {
      // @orb-waive caught-failure-ownership(catch): DELIBERATE ABSORBER, the enabled index's twin
      // (`substrate/enabled-index.ts` carries the full argument). The owner is the stale latch plus the
      // watcher front door's retry; propagating would reject a rule mutation that already committed (#1431).
      // Ends when a transform registration stops being reconcilable from canon.
      try {
        await reconcile();
      } catch {
        stale = true;
      }
    },
  };
}
