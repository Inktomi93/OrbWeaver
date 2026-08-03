// The tag collection's pure view-model — the collection KIND, folder-type Select items, and the
// usage-string derivations. Every label maps from the canonical @orb/contracts/tag tuples via a Record, so
// a new member is a tsc error.

import type { TagFolderType, TagUsage } from "@orb/contracts/tag";
import { TAG_FOLDER_TYPES } from "@orb/contracts/tag";
import type { SelectOption } from "@orb/ui/select";
import type { TagSortMode } from "#lib";
import { TAG_SORT_MODES } from "#lib";

/** The collection KIND — the registry key, the React key, and the selection store's kind axis. ONE home,
 *  read by the definition and by the create verb that selects what it just made. */
export const TAG_COLLECTION_ID = "tags";

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

/** The sort-mode labels — a TOTAL Record over the `#lib` union (a new mode fails `tsc`; Spine §5.5).
 *  "Manual order" is named as an ORDER, not a verb: it is the authored `sortOrder`, and it is the only mode
 *  that offers drag handles (dragging a derived order would write an order nothing ever reads back). */
const SORT_MODE_LABELS: Record<TagSortMode, string> = {
  used: "Most used",
  alpha: "A–Z",
  manual: "Manual order",
};

/** The sort-mode Select options, derived from the canonical tuple. */
export const TAG_SORT_ITEMS: readonly SelectOption<TagSortMode>[] = TAG_SORT_MODES.map((value) => ({
  label: SORT_MODE_LABELS[value],
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

/** How many tags a prune would delete, as words — the noun BOTH halves of the prune confirm name (its title
 *  and its body), so the count a user reads and the count they agree to cannot drift. */
export function unusedTagsLabel(count: number): string {
  return `${count} unused tag${count === 1 ? "" : "s"}`;
}

/** The compact total-uses label for a tag row's usage chip (e.g. `"12 uses"` / `"1 use"` / `"unused"`). */
export function usageTotalLabel(total: number): string {
  if (total === 0) {
    return "unused";
  }
  return `${total} use${total === 1 ? "" : "s"}`;
}
