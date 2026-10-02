// Scope-authorized creation and owner/request recovery: an existing exact-scope birth returns unchanged.
// Only absent births reach the shared planner; inserts are born disabled with statement-allocated position.
// Global authority is the authenticated author; chat authority remains the room host.

import { AUTOMATION_RULE_DEFAULT_MAX_FIRES_PER_HOUR } from "@orb/contracts/automation";
import type { AutomationRuleCreationId } from "@orb/kit/ids";
import { RuleCreationScopeConflictError } from "../contract/errors.ts";
import type { PlannedRuleInsert, PlanRule, RuleRow } from "../contract/ops.ts";
import type { CreateRuleParams } from "../contract/params.ts";
import type { RuleView } from "../contract/results.ts";
import type { AutomationContext, AutomationService } from "../contract/service.ts";
import { requireChatHost } from "../guard.ts";
import {
  insertRule,
  insertRuleForCreationRequest,
  selectRuleByCreationRequest,
  selectRuleCreationScope,
  selectRuleRow,
  toRuleView,
} from "../persistence/rules.ts";
import { notifyRulesChanged } from "../substrate/rule-feed.ts";
import { assertRuleName, validateRuleInput } from "../substrate/validate.ts";

/**
 * The verb's WRITE-NOTHING half: validate the payload and mint the row it would insert. Split out so
 * `createRuleFromPreset` can validate a whole set before its first write and then commit it in ONE batch
 * (#1427) WITHOUT a second write path — it is injected there exactly as the whole verb used to be, since a
 * verb may not import a sibling verb. The scope's authority gate is deliberately NOT here: it is per-SCOPE,
 * not per-rule, and a set shares one scope, so each caller runs it once (see the two call sites).
 */
export function createPlanRule(ctx: AutomationContext): PlanRule {
  return async (params: CreateRuleParams): Promise<PlannedRuleInsert> => {
    assertRuleName(params.name);
    const chatId = params.chatId;
    const cooldownSeconds = params.cooldownSeconds ?? 0;
    const maxFiresPerHour = params.maxFiresPerHour ?? AUTOMATION_RULE_DEFAULT_MAX_FIRES_PER_HOUR;
    const { actions } = await validateRuleInput(
      ctx,
      { chatId, authorUserId: params.principal.userId },
      {
        trigger: params.trigger,
        predicateCel: params.predicateCel,
        actions: params.actions,
        cooldownSeconds,
        maxFiresPerHour,
        // The creating host IS the rule's author, so they are also the identity a `run_tool` arm's tool must be
        // drivable by — the same user stamped as `ownerId` on the row below.
        authorUserId: params.principal.userId,
      },
    );
    const now = ctx.now();
    // Mint provenance (§3-S3 flip shape) — present ONLY when `createRuleFromPreset` is the caller (the
    // field is verb-only, never on the tRPC wire; a hand-authored rule stores the null pair).
    const provenance = params.presetProvenance ?? null;
    return {
      id: ctx.newRuleId(),
      ownerId: params.principal.userId,
      creationRequestId: params.creationRequestId ?? null,
      chatId,
      name: params.name,
      description: params.description ?? null,
      triggerBus: params.trigger.bus,
      triggerType: params.trigger.type,
      predicateCel: params.predicateCel ?? null,
      actions,
      rulePresetId: provenance === null ? null : provenance.rulePresetId,
      rulePresetKnobs: provenance === null ? null : provenance.knobs,
      matchAutomationEvents: params.matchAutomationEvents ?? false,
      cooldownSeconds,
      maxFiresPerHour,
      createdAt: now,
      updatedAt: now,
    };
  };
}

async function readRequestedBirth(ctx: AutomationContext, params: CreateRuleParams, creationRequestId: AutomationRuleCreationId): Promise<RuleRow | undefined> {
  const row = await selectRuleByCreationRequest(ctx.db, params.principal.userId, creationRequestId, params.chatId);
  if (row !== undefined) {
    return row;
  }
  const creationScope = await selectRuleCreationScope(ctx.db, params.principal.userId, creationRequestId);
  if (creationScope !== undefined && creationScope.chatId !== params.chatId) {
    throw new RuleCreationScopeConflictError();
  }
  return row;
}

async function insertUnkeyedRule(ctx: AutomationContext, planned: PlannedRuleInsert): Promise<RuleView> {
  await insertRule(ctx.db, planned);
  const row = await selectRuleRow(ctx.db, planned.id);
  if (row === undefined) {
    throw new Error(`createRule: row ${planned.id} vanished immediately after insert`);
  }
  notifyRulesChanged(ctx, planned.chatId);
  return toRuleView(row);
}

export function createCreateRule(ctx: AutomationContext, planRule: PlanRule): AutomationService["createRule"] {
  return async (params: CreateRuleParams): Promise<RuleView> => {
    const chatId = params.chatId;
    if (chatId !== null) {
      await requireChatHost(ctx, params.principal, chatId);
    }
    const creationRequestId = params.creationRequestId;
    if (creationRequestId !== undefined) {
      const recovered = await readRequestedBirth(ctx, params, creationRequestId);
      if (recovered !== undefined) {
        return toRuleView(recovered);
      }
    }
    const planned = await planRule(params);
    if (creationRequestId === undefined) {
      return insertUnkeyedRule(ctx, planned);
    }
    const inserted = await insertRuleForCreationRequest(ctx.db, planned);
    const row = await readRequestedBirth(ctx, params, creationRequestId);
    if (row === undefined) {
      throw new Error("createRule: requested birth is no longer available after insert");
    }
    if (inserted) {
      notifyRulesChanged(ctx, chatId);
    }
    return toRuleView(row);
  };
}
