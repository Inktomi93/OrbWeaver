// verb: createRuleFromPreset — mint a §4 catalogue preset's ordered RULE SET into a chat (host-only).
// Resolves the caller's partial knob overrides against the preset's own descriptors, builds the rule set with
// the knobs substituted into the CEL sources AS LITERALS, and creates each rule through the EXISTING
// `createRule` verb — the same host gate, the same trigger-liveness / CEL-parse / arm-shape / book-attachment
// validation, the same born-DISABLED posture (enabling is the consent act), the same `rulesChanged` emission.
// There is NO second write path: a preset is DATA over the arm vocabulary, and a minted rule is
// indistinguishable from a hand-authored one.
//
// `createRule` is INJECTED rather than imported: a verb reaching a sibling verb has no precedent in this tree
// and would hide the dependency from the composition root. `service.ts` builds `createRule` once and hands it
// here — the same one-directional-flow discipline the cross-feature ops follow, one tier down.
//
// Multi-rule sets are titled `<preset title> (i/n)` so the rules list reads as one unit; a single-rule preset
// keeps its bare title. Order matters and is preserved: `createRule` assigns `position = max+1` per call, and
// a preset's rule order IS its semantics (the clock's counter must sit above its threshold so the shared-env
// write-through composes within one batch).
//
// NOT TRANSACTIONAL, deliberately: if rule i of n is refused (an over-cap CEL source from an extreme knob, a
// raced host handoff), rules 1..i-1 stay. That is SAFE and self-evident rather than silent — every minted rule
// is born DISABLED, so a half set does nothing at all until the host enables it, and the `(i/n)` titles make
// the missing half visible in the rules list. A compensating rollback would have to survive its own failure
// path; deleting the incomplete set is one host click, and the knob resolution that could realistically fail
// already ran BEFORE the first write.

import type { CreateRuleFromPresetParams } from "../contract/params.ts";
import type { ErasedRulePresetDef, RulePresetRuleDef } from "../contract/presets.ts";
import { RULE_PRESETS } from "../contract/presets.ts";
import type { RuleView } from "../contract/results.ts";
import type { AutomationService } from "../contract/service.ts";
import { resolveRulePresetKnobs } from "../substrate/presets.ts";

/** The mint's title for rule `i` of `n`. */
function ruleTitle(preset: ErasedRulePresetDef, index: number, count: number): string {
  return count > 1 ? `${preset.title} (${index + 1}/${count})` : preset.title;
}

export function createCreateRuleFromPreset(createRule: AutomationService["createRule"]): AutomationService["createRuleFromPreset"] {
  return async (params: CreateRuleFromPresetParams): Promise<RuleView[]> => {
    // The id is a closed union and `RULE_PRESETS` is exhaustive over it — the lookup is total by `tsc`.
    const preset: ErasedRulePresetDef = RULE_PRESETS[params.presetId];
    const knobs = resolveRulePresetKnobs(preset.knobs, params.knobs ?? {});
    const rules = preset.rules(knobs);

    // Sequential (recursion, not a loop — the `noAwaitInLoops` discipline): `position = max+1` is read per
    // call, so a parallel mint would race the whole set onto one position and lose the preset's order.
    const mint = async (index: number, acc: readonly RuleView[]): Promise<RuleView[]> => {
      const def: RulePresetRuleDef | undefined = rules[index];
      if (def === undefined) {
        return [...acc];
      }
      const view = await createRule({
        principal: params.principal,
        chatId: params.chatId,
        name: ruleTitle(preset, index, rules.length),
        description: preset.summary,
        trigger: { bus: "chat", type: def.triggerType },
        predicateCel: def.predicate,
        actions: def.arms,
        cooldownSeconds: def.cooldownSeconds ?? 0,
        ...(def.maxFiresPerHour !== undefined ? { maxFiresPerHour: def.maxFiresPerHour } : {}),
      });
      return mint(index + 1, [...acc, view]);
    };
    return await mint(0, []);
  };
}
