// verb: createRule — author-created rule creation, in EITHER scope. Gates the scope's own authority,
// validates the whole payload (trigger liveness · CEL parse · action shapes/caps/reserved-arm refusal · the
// C5 owner-global scope matrix · book consent · cooldown floor), and inserts the rule BORN DISABLED (enabling
// is the consent act). Returns the stored view. `position = max+1` within the scope is allocated by the
// INSERT's own subquery, not read here — read-then-write is the race (#1427; `persistence/rules.ts`).
//
// THE TWO SCOPES AND THEIR TWO GATES (C5 — the platform ruling: automation is a PLATFORM, and "not in v1"
// only ever meant unwired-but-typed):
//   • `chatId` set — `requireChatHost`. Unchanged: rule authoring IS room-host authority.
//   • `chatId` NULL — the owner-GLOBAL lane. There is no room, so there is no roster and `can()` has no
//     resource to decide over. The authority is the AUTHOR THEMSELVES, and BOTH halves of it already exist
//     rather than being invented here (the committed spec's authority law: a feature may CITE an existing
//     axis, never invent one). (a) `users.enabled` — every authenticated request re-checks it (D40 /
//     invariant #8), so a disabled account cannot reach this verb at all. (b) the OWNER check — the row's
//     `ownerId` is stamped from `params.principal.userId` and is NOT a parameter, so a caller can only ever
//     create a global rule on their OWN lane. There is no third user for a gate to compare.
// What actually bounds a global rule is the ARM MATRIX (`substrate/validate.ts`) and the owner rate belt
// (`automation_owner_budgets`), not a new permission kind.

import type { PlannedRuleInsert, PlanRule } from "../contract/ops.ts";
import type { CreateRuleParams } from "../contract/params.ts";
import type { RuleView } from "../contract/results.ts";
import type { AutomationContext, AutomationService } from "../contract/service.ts";
import { requireChatHost } from "../guard.ts";
import { insertRule, selectRuleRow, toRuleView } from "../persistence/rules.ts";
import { notifyRulesChanged } from "../substrate/rule-feed.ts";
import { RULE_MAX_FIRES_DEFAULT, validateRuleInput } from "../substrate/validate.ts";

/**
 * The verb's WRITE-NOTHING half: validate the payload and mint the row it would insert. Split out so
 * `createRuleFromPreset` can validate a whole set before its first write and then commit it in ONE batch
 * (#1427) WITHOUT a second write path — it is injected there exactly as the whole verb used to be, since a
 * verb may not import a sibling verb. The scope's authority gate is deliberately NOT here: it is per-SCOPE,
 * not per-rule, and a set shares one scope, so each caller runs it once (see the two call sites).
 */
export function createPlanRule(ctx: AutomationContext): PlanRule {
  return async (params: CreateRuleParams): Promise<PlannedRuleInsert> => {
    const chatId = params.chatId;
    const cooldownSeconds = params.cooldownSeconds ?? 0;
    const maxFiresPerHour = params.maxFiresPerHour ?? RULE_MAX_FIRES_DEFAULT;
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

export function createCreateRule(ctx: AutomationContext, planRule: PlanRule): AutomationService["createRule"] {
  return async (params: CreateRuleParams): Promise<RuleView> => {
    const chatId = params.chatId;
    if (chatId !== null) {
      await requireChatHost(ctx, params.principal, chatId);
    }
    const planned = await planRule(params);
    await insertRule(ctx.db, planned);
    // The row exists — it was just inserted in this transaction-less path (single-writer, no concurrent delete).
    const row = await selectRuleRow(ctx.db, planned.id);
    if (row === undefined) {
      throw new Error(`createRule: row ${planned.id} vanished immediately after insert`);
    }
    // THE RULE ROSTER ANNOUNCES ITSELF (event-bus coverage survey H2/F5). `rulesChanged` was declared on
    // `AutomationBusEvent` and emitted NOWHERE — the D50 dead-wire class, alive on the bus built AFTER the
    // ratchets. Emitted AFTER the durable insert, through the SAME injected `notify` sink the four other
    // members ride (D38: the domain never reaches at transport). Host-only at the room by classification —
    // `transport/trpc/automation-bus.ts` filters everything but `quickReplySurfaced` per subscriber tier.
    // …and only a ROOM can hear it — `substrate/rule-feed.ts` is the one home for why a chat-less rule
    // announces nothing.
    notifyRulesChanged(ctx, chatId);
    return toRuleView(row);
  };
}
