// domain/automation/engine/prompt-transforms — the automation side of the D50 `PromptTransform` seam (03 §1.2,
// 04 §6; A7). A `transform_draft` arm is the ONE arm that does NOT run through the watcher/dispatch engine
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
import { loadEnabledTurnStartedRules } from "../persistence/rules.ts";
import { authorGlobals } from "../substrate/cel-env.ts";
import { evaluatePredicate, nowFields } from "../substrate/dry-run.ts";
import { renderArmTemplate } from "../substrate/macro-render.ts";

/** The `PromptTransform.id` namespace for automation-registered transforms (`automation:<ruleId>:<armIndex>` —
 *  the arm index disambiguates a rule with more than one `transform_draft` arm; every id is unique in the
 *  shared registry, and the `automation:` prefix scopes this index's reconciliation to its OWN rows). */
const AUTOMATION_TRANSFORM_ID_PREFIX = "automation:";
/** The top of automation's `order` band (04 §6 — automation 0–999, plugins 1000+; host policy wraps guest).
 *  A rule's `position` is its order; clamped so a pathologically deep list can never cross into the plugin band. */
const AUTOMATION_ORDER_MAX = 999;
/** The `{{draft}}` macro name a `transform_draft` template addresses — seeded into the render's name→value env
 *  as the CURRENT target text; its render REPLACES the target (03 §1.2). */
const DRAFT_MACRO_KEY = "draft";

/** Build the CEL activation a transform's predicate + template render evaluates against — the same planes the
 *  live dispatch env carries, MINUS `event` (a transform applies inside the pipeline; there is no trigger fact
 *  synchronously — the `{{expr::…}}` posture, 02 §2/§3). `vars` is the pipeline-supplied runtime fold-cache
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

/** Build ONE `PromptTransform` from a rule's `transform_draft` arm. The `apply` closure re-reads room state
 *  every turn (the rule's config is captured; the state is live) and: (1) self-guards on chatId — the registry
 *  is a shared, chat-blind Map, so a transform must ignore other chats' turns; (2) evaluates the rule's
 *  predicate over the event-less env — false OR error ⇒ the draft passes through UNCHANGED; (3) renders the
 *  template with `{{draft}}` = the current target text; a strict-arg render error passes the draft through
 *  UNCHANGED (a broken rule must never eat the user's message — 03 §1.2). */
function buildRuleTransform(deps: PromptTransformIndexDeps, rule: RuleRow, spec: TransformArmSpec): PromptTransform {
  return {
    id: `${AUTOMATION_TRANSFORM_ID_PREFIX}${rule.id}:${spec.armIndex}`,
    point: spec.target,
    order: Math.min(rule.position, AUTOMATION_ORDER_MAX),
    apply: async (draft, env): Promise<string> => {
      if (env.chatId !== spec.chatId) {
        return draft;
      }
      const celEnv = await buildTransformEnv(deps, spec.chatId, rule.ownerId, env.vars);
      if (evaluatePredicate(rule.predicateCel, celEnv) !== true) {
        return draft;
      }
      const rendered = renderArmTemplate({ env: celEnv, nowMs: deps.now(), prng: deps.prng, template: spec.template, macroEnv: { [DRAFT_MACRO_KEY]: draft } });
      return rendered.error === undefined ? rendered.text : draft;
    },
  };
}

/** The `transform_draft` transforms a single enabled turnStarted rule contributes — one per `transform_draft`
 *  arm. A rule that carries NO `transform_draft` arm (a normal turnStarted watcher rule) contributes none; a
 *  corrupt actions blob (disabled at dispatch) parses to none here. `validate` guarantees a rule with any
 *  `transform_draft` arm is turnStarted + all-transform, so this only ever fires for genuine transform rules. */
function ruleTransforms(deps: PromptTransformIndexDeps, rule: RuleRow): PromptTransform[] {
  if (rule.chatId === null) {
    return []; // v1 has no chat-less rule; a transform needs its chat for the self-guard.
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

/** Build the A7 prompt-transform index over the injected registry. `reload` reconciles the registered set
 *  with canon: register/replace every enabled transform rule's transforms, and unregister any id this index
 *  previously registered that is no longer desired (a disabled/deleted/edited-away rule). Idempotent — a
 *  re-register replaces by id (a rule edit). Call `reload()` once at boot after chat's registry exists. */
export function createPromptTransformIndex(deps: PromptTransformIndexDeps): PromptTransformIndex {
  // ASSUMES(single-replica): the id set is a per-process snapshot, eventually-consistent within one reload.
  let registeredIds = new Set<string>();
  return {
    reload: async (): Promise<void> => {
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
    },
  };
}
