// The Tags settings pane's pure view-model — folder-type Select items + usage-string derivations. Every
// label maps from the canonical @orb/contracts/tag tuples via a Record, so a new member is a tsc error.

import type { TagFolderType, TagUsage } from "@orb/contracts/tag";
import { TAG_FOLDER_TYPES } from "@orb/contracts/tag";
import type { SelectOption } from "@orb/ui/select";

// A Map, not an object literal, so the contract's uppercase keys don't trip the camelCase naming lint.
const FOLDER_TYPE_LABELS = new Map<TagFolderType, string>([
  ["NONE", "Plain tag"],
  ["OPEN", "Open folder"],
  ["CLOSED", "Closed folder"],
]);

/** The folder-type Select options, derived from the canonical tuple. */
export const FOLDER_TYPE_ITEMS: readonly SelectOption<TagFolderType>[] = TAG_FOLDER_TYPES.map((value) => ({
  label: FOLDER_TYPE_LABELS.get(value) ?? value,
  value,
}));

/** The five per-target usage counts (singular labels, pluralized in {@link usageBreakdown}). */
const USAGE_LABELS: Record<Exclude<keyof TagUsage, "total">, string> = {
  characters: "character",
  chats: "chat",
  worldBooks: "world book",
  personas: "persona",
  presets: "preset",
};

/** A human breakdown of a tag's non-zero attachments (e.g. `"3 characters, 1 chat"`), or `"nothing"` when unused. */
export function usageBreakdown(usage: TagUsage): string {
  const parts = (Object.keys(USAGE_LABELS) as (keyof typeof USAGE_LABELS)[])
    .filter((key) => usage[key] > 0)
    .map((key) => `${usage[key]} ${USAGE_LABELS[key]}${usage[key] === 1 ? "" : "s"}`);
  return parts.length === 0 ? "nothing" : parts.join(", ");
}

/** The compact total-uses label for a tag row's usage chip (e.g. `"12 uses"` / `"1 use"` / `"unused"`). */
export function usageTotalLabel(total: number): string {
  if (total === 0) {
    return "unused";
  }
  return `${total} use${total === 1 ? "" : "s"}`;
}
