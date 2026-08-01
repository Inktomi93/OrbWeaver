// The Prose settings-section form model (PROSE-1 S2) — the per-USER model-facing prose overrides stored in
// `UserSettings.prose`. Pure projection + patch helpers (no I/O), the imagery-templates-model precedent.
//
// The card list is DATA: `USER_PROSE_SLOT_IDS` (contracts) is every `home:"user"` slot whose override lives
// in the `prose` blob, derived from the registry — so a new slot table row reaches this editor with no edit
// here. Each field ghosts its shipped default as the `placeholder`: an EMPTY field means "no override" and
// resolves byte-identical to the shipped bytes (the default-identity discipline, §4.3).
//
// FIELD NAMES are the slot id with its dots swapped for dashes. TanStack Form reads `name` as a DOT PATH, so
// a literal `chat.arbiter.system` field name would address `values.chat.arbiter.system` — three levels of
// object that do not exist. The form value is therefore a FLAT bag keyed by the dashed name, and every
// projection/patch walks `USER_PROSE_SLOT_IDS` (never the reverse mapping — nothing needs name → id).

import type { ProseOverride, ProseOverrides, ProseSlotId } from "@orb/contracts/prose";
import { PROSE_SLOTS, USER_PROSE_SLOT_IDS } from "@orb/contracts/prose";
import type { SettingsSubcategory } from "#state";

export const PROSE_SETTINGS_SUBCATEGORY: SettingsSubcategory = {
  id: "prose",
  label: "Model-facing prose",
  navLabel: "Prose",
  keywords: ["prose", "prompt", "instruction", "wording", "summarizer", "digest", "memory", "arbiter", "director", "injection", "background", "distill"],
};

/** The TanStack-addressable field name for a slot (dots are path separators — see the header). */
export function proseFieldName(id: ProseSlotId): string {
  return id.replaceAll(".", "-");
}

/** Project the stored `UserSettings.prose` record into the flat form bag (an absent override ⇒ ""). Every
 *  editable slot is spelled, so the form's shape is stable across hosts and reseeds. */
export function projectProseForm(prose: ProseOverrides): Record<string, string> {
  return Object.fromEntries(USER_PROSE_SLOT_IDS.map((id) => [proseFieldName(id), prose[id]?.text ?? ""]));
}

/** The patch value for ONE slot: a trimmed non-empty field is an override stamped with the CURRENT slot
 *  version (§4.4 — any save re-stamps, which is what "keep mine" means); a blank field is the leaf `null`
 *  sentinel, because the server's section merge treats `undefined` as "don't touch" and a cleared override
 *  must actually clear (`imagery-templates-model` carries the same contract). */
export function proseSlotPatch(id: ProseSlotId, value: string): ProseOverride | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? { text: trimmed, baseVersion: PROSE_SLOTS[id].version } : null;
}

/** Build the `prose` section patch from the form bag — every editable slot spelled, so clearing a field
 *  resets it to the shipped default instead of silently keeping the stored override. */
export function toProsePatch(values: Record<string, string>): Record<string, ProseOverride | null> {
  return Object.fromEntries(USER_PROSE_SLOT_IDS.map((id) => [id, proseSlotPatch(id, values[proseFieldName(id)] ?? "")]));
}

/** One card's derived footer state — the guided-actions `guidedFooterState` shape, generalized over a slot.
 *  `stale` is §4.4's signal: the shipped default moved on since this override was authored. The lints are
 *  WARN-only by law (§6.3) — nothing here blocks a save. */
export interface ProseFooterState {
  readonly isDefault: boolean;
  readonly stale: boolean;
  readonly missing: readonly string[];
}

/** `value` is the LIVE field text; `stored` is the persisted override (for the version the edit was authored
 *  against). A field the host has emptied reads as Default, whatever is still stored — the next save clears
 *  it, and the placeholder already shows what will take over. */
export function proseFooterState(id: ProseSlotId, value: string, stored: ProseOverride | undefined): ProseFooterState {
  const slot = PROSE_SLOTS[id];
  const trimmed = value.trim();
  const isDefault = trimmed.length === 0;
  return {
    isDefault,
    stale: !isDefault && stored !== undefined && stored.text === trimmed && stored.baseVersion < slot.version,
    // A required macro/token is only meaningful against text the host actually wrote — the shipped default
    // carries them all by construction.
    missing: isDefault ? [] : [...slot.requiredMacros, ...slot.requiredTokens].filter((token) => !trimmed.includes(token)),
  };
}
