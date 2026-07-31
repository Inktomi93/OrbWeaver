// The journal-entry LABEL vocabulary — the one home for "what word does this entry read as", shared by the
// chronicle ROW (`components/rpg-beat-row.tsx`) and the tab's type Select (`components/rpg-journal-tab.tsx`).
// It lives in lib/ because a component module may export components only (biome
// `useComponentExportOnlyModules`).

import type { RpgJournalType } from "@orb/contracts/rpg";

/** The journal-TYPE vocabulary — an exhaustive Record over the contracts tuple (§5.5: a new member fails tsc
 *  here, never renders as a raw slug). The composer Select derives its items from this; the row label reads
 *  through the widened lookup because the VIEW carries `type` as a free string (an older/renamed slug
 *  degrades to itself). */
export const JOURNAL_TYPE_LABELS: Readonly<Record<RpgJournalType, string>> = {
  location: "Location",
  npc: "Character",
  combat: "Combat",
  quest: "Quest",
  item: "Item",
  event: "Event",
  note: "Note",
  // R4c — the escape: a `custom` entry carries its own free `label`, so the row renders that label
  // when present and this generic word only when the model/host left it blank.
  custom: "Custom",
};

/** The display label for a stored entry — the R4c free `label` when the entry carries one (a `custom` entry's
 *  own kind: "prophecy", "faction"), else the type's word. Unknown/legacy slugs read as themselves, never
 *  blank. The label was stored, model-written and returned on the view while NO surface rendered it — a datum
 *  the host could author and never see. */
export function journalRowLabel(type: string, label: string): string {
  if (label !== "") {
    return label;
  }
  const labels: Readonly<Record<string, string | undefined>> = JOURNAL_TYPE_LABELS;
  return labels[type] ?? type;
}
