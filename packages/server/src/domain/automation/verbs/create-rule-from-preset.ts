// verb: createRuleFromPreset — mint a §4 catalogue preset's ordered RULE SET into a chat (host-only).
// Resolves the caller's partial knob overrides against the preset's own descriptors, builds the rule set with
// the knobs substituted into the CEL sources AS LITERALS, and mints each rule through `createRule`'s OWN
// planner — the same host gate, the same trigger-liveness / CEL-parse / arm-shape / book-attachment
// validation, the same born-DISABLED posture (enabling is the consent act), the same `rulesChanged` emission.
// There is NO second write path: a preset is DATA over the arm vocabulary, and a minted rule is
// indistinguishable from a hand-authored one.
//
// `planRule` is INJECTED rather than imported: a verb reaching a sibling verb has no precedent in this tree
// and would hide the dependency from the composition root. `service.ts` builds it once and hands it here —
// the same one-directional-flow discipline the cross-feature ops follow, one tier down.
//
// Multi-rule sets are titled `<preset title> (i/n)` so the rules list reads as one unit; a single-rule preset
// keeps its bare title. Order matters and is preserved: the INSERT allocates `position = max+1` per statement
// and a batch's statements see the ones before them, so the set lands ascending in the order planned — and a
// preset's rule order IS its semantics (the clock's counter must sit above its threshold so the shared-env
// write-through composes within one batch).
//
// #1427 — ALL-OR-NOTHING NOW, AND WHY THE OLD RULING'S REASON SURVIVES IT. This verb used to commit each rule
// through the whole `createRule` verb in a loop and documented itself as NOT TRANSACTIONAL, on the grounds
// that a half set is harmless: every minted rule is born DISABLED, so it does nothing until a host enables it,
// and the `(i/n)` titles make the missing half visible. That reasoning was and is correct — it is why the
// partial set was never a live hazard — but "harmless" is not the bar for a mint whose ORDER is its meaning,
// and the loop had a second cost the reason did not cover: N `rulesChanged` emissions and N position
// allocations for one act. The shape that removes both is not a rollback (which would have to survive its own
// failure path) — it is planning the WHOLE set before the first write. Every refusal a member can raise
// (knob resolution, CEL parse, arm shape, book consent) happens in the planning pass, so a refused member
// costs nothing to undo; the surviving members then commit in ONE `db.batch`, and the roster announces once.

import { automationTriggerFor } from "@orb/contracts/automation";
import { RuleValidationError } from "../contract/errors.ts";
import type { PlannedRuleInsert, PlanRule } from "../contract/ops.ts";
import type { CreateRuleFromPresetParams } from "../contract/params.ts";
import type { ErasedRulePresetDef } from "../contract/presets.ts";
import { RULE_PRESETS } from "../contract/presets.ts";
import type { RuleView } from "../contract/results.ts";
import type { AutomationContext, AutomationService } from "../contract/service.ts";
import { requireChatHost } from "../guard.ts";
import { insertRules, selectRuleRowsByIds, toRuleView } from "../persistence/rules.ts";
import { resolveRulePresetKnobs } from "../substrate/presets.ts";
import { notifyRulesChanged } from "../substrate/rule-feed.ts";

/** Refuse a preset/chat mismatch, in the host's own vocabulary. BOTH directions are refused, not just the
 *  obviously-wrong one: a chat preset with no chat has no room to act in, and a GLOBAL preset handed a chat
 *  is a caller who thinks they are adding a room rule and would get a library-wide one — silently honouring
 *  either would be a surprise about scope, which is the one thing a rule must never be. */
function assertScopeMatches(preset: ErasedRulePresetDef, chatId: CreateRuleFromPresetParams["chatId"]): void {
  if (preset.scope === "global" && chatId !== null) {
    throw new RuleValidationError("preset_scope", `"${preset.title}" is a library-wide rule — it is added from Settings → Automation, not to one chat`);
  }
  if (preset.scope === "chat" && chatId === null) {
    throw new RuleValidationError("preset_scope", `"${preset.title}" watches one chat — open the chat you want it in and add it there`);
  }
}

/** The mint's title for rule `i` of `n`. */
function ruleTitle(preset: ErasedRulePresetDef, index: number, count: number): string {
  return count > 1 ? `${preset.title} (${index + 1}/${count})` : preset.title;
}

export function createCreateRuleFromPreset(ctx: AutomationContext, planRule: PlanRule): AutomationService["createRuleFromPreset"] {
  return async (params: CreateRuleFromPresetParams): Promise<RuleView[]> => {
    // The id is a closed union and `RULE_PRESETS` is exhaustive over it — the lookup is total by `tsc`.
    const preset: ErasedRulePresetDef = RULE_PRESETS[params.presetId];
    // THE SCOPE IS THE PRESET'S, and the caller's chat must AGREE with it. A preset's rules are authored
    // against one scope — a global preset's arms are drawn from the chat-INDEPENDENT set and its predicate
    // may not read a room — so pairing it with the wrong chat is an authoring mistake, not a configuration.
    // Refusing it HERE, by name, is what keeps the failure legible: minting anyway would produce a cascade of
    // per-arm refusals from `createRule` that describe the symptom and never the cause.
    assertScopeMatches(preset, params.chatId);
    const chatId = preset.scope === "global" ? null : params.chatId;
    // The scope's authority gate is per-SCOPE and the whole set shares one, so it runs ONCE — before any
    // planning, so a non-host is refused without a single validation read.
    if (chatId !== null) {
      await requireChatHost(ctx, params.principal, chatId);
    }
    const knobs = resolveRulePresetKnobs(preset.knobs, params.knobs ?? {});
    const rules = preset.rules(knobs);

    // PASS 1 — plan every member, writing nothing. A member's refusal lands here, where there is nothing to
    // roll back.
    const planned: PlannedRuleInsert[] = [];
    for (const [index, def] of rules.entries()) {
      planned.push(
        await planRule({
          principal: params.principal,
          chatId,
          name: ruleTitle(preset, index, rules.length),
          description: preset.summary,
          // The BUS is derived from the type against the contracts tuples (`automationTriggerFor`) — a preset
          // def names a trigger type and cannot spell an inconsistent `{bus, type}` pair.
          trigger: automationTriggerFor(def.triggerType),
          predicateCel: def.predicate,
          actions: def.arms,
          cooldownSeconds: def.cooldownSeconds ?? 0,
          ...(def.maxFiresPerHour !== undefined ? { maxFiresPerHour: def.maxFiresPerHour } : {}),
          // The §3-S3 provenance stamp: EVERY rule of the set carries the preset id + the COMPLETE
          // resolved bag (not the caller's partial overrides), so a reader re-mints byte-identically
          // even after a descriptor DEFAULT later changes.
          presetProvenance: { rulePresetId: params.presetId, knobs },
        }),
      );
    }

    // PASS 2 — one batch: the set lands whole or not at all, at ascending positions allocated by the INSERTs
    // themselves, and the roster announces ONCE for the one act the host performed.
    await insertRules(ctx.db, planned);
    const rows = await selectRuleRowsByIds(
      ctx.db,
      planned.map((rule) => rule.id),
    );
    notifyRulesChanged(ctx, chatId);
    return rows.map(toRuleView);
  };
}
