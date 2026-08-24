// verb: listRulePresets — the preset PICKER's read model. A pure projection of the committed catalogue
// (`contract/presets.ts`) onto `RulePresetView`: id, title, summary, rule count, confirm-first, and the knob
// DESCRIPTORS the picker renders editors for. Carries no CEL and no arm templates — a predicate is server
// logic and the client never re-derives one.
//
// No principal, no chat, no db: the catalogue is static. It is a verb rather than a bare const export so the
// transport surface (B2) has one door, and so the projection has exactly one home.

import type { RulePresetView } from "@orb/contracts/automation";
import { RULE_PRESET_IDS } from "@orb/contracts/automation";
import { RULE_PRESETS } from "../contract/presets.ts";
import type { AutomationService } from "../contract/service.ts";
import { toRulePresetView } from "../substrate/presets.ts";

export function createListRulePresets(): AutomationService["listRulePresets"] {
  // Tuple order IS catalogue order (the §4 suggested build/fun order) — never `Object.keys`, whose order is
  // an insertion accident rather than the declared vocabulary.
  return (): RulePresetView[] => RULE_PRESET_IDS.map((id) => toRulePresetView(RULE_PRESETS[id]));
}
