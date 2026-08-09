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
import { PROSE_SLOTS, proseOverBy, USER_PROSE_SLOT_IDS } from "@orb/contracts/prose";
import type { SettingsSubcategory } from "#state";

export const PROSE_SETTINGS_SUBCATEGORY: SettingsSubcategory = {
  id: "prose",
  label: "Model-facing prose",
  navLabel: "Prose",
  keywords: ["prose", "prompt", "instruction", "wording", "summarizer", "digest", "memory", "arbiter", "injection", "background", "distill"],
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

/**
 * THE SAVE REFUSAL for over-cap user overrides — the `onDynamic` form validator this section mounts, and the
 * exact twin of the preset editor's `validatePresetProse` (one defect, two editors, `PROSE_MAX_CHARS` spelled
 * in neither).
 *
 * `proseOverridesSchema`'s per-key `.catch(undefined)` heals an over-cap override to ABSENT, so a save at
 * that length is not an error the host can see — it is their text silently deleted with the shipped default
 * riding in its place. Each card's textarea carries `maxLength`, so nothing typed here can trip this; what
 * trips it is a blob that predates the cap. Refusing (never truncating) keeps the author's bytes on screen
 * and makes trimming their decision.
 *
 * Errors are keyed by the FIELD NAME, so each over-cap card renders its own message through the bound
 * `<Field>` — this form's values are the flat dashed-name bag (see the header), which the preset editor's
 * dotted `prose` record cannot do.
 */
export function validateProseLengths(values: Record<string, string>): { fields: Record<string, string> } | undefined {
  const fields = Object.fromEntries(
    USER_PROSE_SLOT_IDS.flatMap((id) => {
      const name = proseFieldName(id);
      const over = proseOverBy(values[name] ?? "");
      return over === 0 ? [] : [[name, `${String(over)} characters over the limit — trim it to save`]];
    }),
  );
  return Object.keys(fields).length === 0 ? undefined : { fields };
}

// The per-card footer derivation (Default/Customized + the stale and required-macro warnings) MOVED to
// `@orb/contracts/prose` (`proseFooterState`) on 2026-08-07: the preset Templates drill-in renders the same
// footer for the preset-homed framing slots, and a client feature may not import another feature (D70's
// five-tier law). One derivation, two editors, no drift.
