// verb: createRule — author-created rule creation, in EITHER scope. Gates the scope's own authority,
// validates the whole payload (trigger liveness · CEL parse · action shapes/caps/reserved-arm refusal · the
// C5 owner-global scope matrix · book consent · cooldown floor), assigns `position = max+1` WITHIN that
// scope, and inserts the rule BORN DISABLED (enabling is the consent act). Returns the stored view.
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

import type { CreateRuleParams } from "../contract/params.ts";
import type { RuleView } from "../contract/results.ts";
import type { AutomationContext, AutomationService } from "../contract/service.ts";
import { requireChatHost } from "../guard.ts";
import { insertRule, maxPosition, selectRuleRow, toRuleView } from "../persistence/rules.ts";
import { notifyRulesChanged } from "../substrate/rule-feed.ts";
import { RULE_MAX_FIRES_DEFAULT, validateRuleInput } from "../substrate/validate.ts";

export function createCreateRule(ctx: AutomationContext): AutomationService["createRule"] {
  return async (params: CreateRuleParams): Promise<RuleView> => {
    const chatId = params.chatId;
    if (chatId !== null) {
      await requireChatHost(ctx, params.principal, chatId);
    }
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
    const id = ctx.newRuleId();
    // Mint provenance (§3-S3 flip shape) — present ONLY when `createRuleFromPreset` is the caller (the
    // field is verb-only, never on the tRPC wire; a hand-authored rule stores the null pair).
    const provenance = params.presetProvenance ?? null;
    const position = (await maxPosition(ctx.db, chatId, params.principal.userId)) + 1;
    await insertRule(ctx.db, {
      id,
      ownerId: params.principal.userId,
      chatId,
      name: params.name,
      description: params.description ?? null,
      position,
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
    });
    // The row exists — it was just inserted in this transaction-less path (single-writer, no concurrent delete).
    const row = await selectRuleRow(ctx.db, id);
    if (row === undefined) {
      throw new Error(`createRule: row ${id} vanished immediately after insert`);
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
