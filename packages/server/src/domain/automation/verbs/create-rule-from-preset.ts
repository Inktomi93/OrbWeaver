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

import { automationTriggerFor } from "@orb/contracts/automation";
import { RuleValidationError } from "../contract/errors.ts";
import type { CreateRuleFromPresetParams } from "../contract/params.ts";
import type { ErasedRulePresetDef } from "../contract/presets.ts";
import { RULE_PRESETS } from "../contract/presets.ts";
import type { RuleView } from "../contract/results.ts";
import type { AutomationService } from "../contract/service.ts";
import { resolveRulePresetKnobs } from "../substrate/presets.ts";

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

export function createCreateRuleFromPreset(createRule: AutomationService["createRule"]): AutomationService["createRuleFromPreset"] {
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
    const knobs = resolveRulePresetKnobs(preset.knobs, params.knobs ?? {});
    const rules = preset.rules(knobs);

    // `position = max+1` is read per call, so each rule must commit before the next one is minted.
    const created: RuleView[] = [];
    for (const [index, def] of rules.entries()) {
      const view = await createRule({
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
      });
      created.push(view);
    }
    return created;
  };
}
