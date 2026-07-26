// The Databank settings-section FORM projection (Phase B ④) — the flat form the autosave form edits, mapped
// to/from the stored `UserSettings.databank` shape (`{chunk, retrieval:{k,minScore,rerank}, slotTokenBudget}`).
// The surface edits the retrieval knobs + the slot budget; `chunk` (ingest-only params) round-trips untouched
// through the section-patch deep-merge. Bounds mirror `@orb/contracts/databank` so the NumberField clamps at
// the same edges the server re-validate does.

import type { UserSettings } from "@orb/contracts/settings";

type DatabankSection = UserSettings["databank"];

/** The flat form shape — one field per bound control. */
export interface DatabankSettingsForm {
  readonly k: number;
  readonly minScore: number;
  readonly rerank: boolean;
  readonly slotTokenBudget: number;
}

export const K_MIN = 1;
export const K_MAX = 50;
export const MIN_SCORE_MIN = 0;
export const MIN_SCORE_MAX = 1;
export const SLOT_BUDGET_MIN = 0;
export const SLOT_BUDGET_MAX = 65_536;

/** Stored databank section → the flat form value. */
export function projectDatabankForm(section: DatabankSection): DatabankSettingsForm {
  return {
    k: section.retrieval.k,
    minScore: section.retrieval.minScore,
    rerank: section.retrieval.rerank,
    slotTokenBudget: section.slotTokenBudget,
  };
}

/** The flat form value → the section-patch shape `updateUserSettingsSection("databank")` deep-merges (the
 *  retrieval leaf is re-nested; `chunk` is omitted so the deep-merge preserves the stored ingest params). */
export function toDatabankSectionPatch(form: DatabankSettingsForm): Record<string, unknown> {
  return {
    retrieval: { k: form.k, minScore: form.minScore, rerank: form.rerank },
    slotTokenBudget: form.slotTokenBudget,
  };
}
