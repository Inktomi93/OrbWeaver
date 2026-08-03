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

/** The sort-mode Select options, derived from the canonical tuple.
 *
 *  `handlesAvailable` is the library-SIZE verdict, not a preference: above `COLLECTION_LARGE_GROUP`
 *  the roster virtualizes and drag handles cannot exist (a windowed list has no stable drop target for an
 *  unrendered row), so "Manual order" up there is a mode with nothing behind it — measured at the owner's
 *  413-tag library as `{mode:"Manual order", handles:0}`, and because every `sortOrder` is null the
 *  comparator tiebreaks on name, making it pixel-identical to A–Z with nothing saying so (side-eye
 *  2026-08-03 P1). The option is DISABLED there rather than silently inert: an unselectable option with a
 *  stated reason is a fact about the library; a selectable one that does nothing is a control that lies.
 *  The picker still shows it as the current value for a device already persisted into it — which is what
 *  {@link tagOrderHint} explains. */
export function tagSortItems(handlesAvailable: boolean): readonly SelectOption<TagSortMode>[] {
  return TAG_SORT_MODES.map((value) => ({
    label: SORT_MODE_LABELS[value],
    value,
    disabled: value === "manual" && !handlesAvailable,
  }));
}

/** The one-line gloss beside the sort control — the roster's own statement about DRAG, which is otherwise
 *  a capability with no scent at all (side-eye 2026-08-03 P1: landing on Most-used, nothing says reordering
 *  lives behind a third option in a right-aligned Select that reads as a view preference; a user wanting to
 *  reorder has no reason to open a SORT control looking for a CAPABILITY). `null` = the roster is already
 *  showing handles, and a line saying "drag to reorder" over visible drag handles is noise.
 *
 *  It doubles as the sort control's row-mate: alone on its line the Select read as "a control that got left
 *  behind when something else was removed" (side-eye P2). */
export function tagOrderHint(handlesAvailable: boolean, mode: TagSortMode, cap: number): string | null {
  if (!handlesAvailable) {
    return `Drag to reorder is off above ${cap} tags.`;
  }
  return mode === "manual" ? null : "Manual order lets you drag rows.";
}

/** The prune confirm's ACTION label — it agrees in number with the title's count, because "Delete them"
 *  over "Delete 1 unused tag?" is the confirm disagreeing with the question (side-eye 2026-08-03 P3). */
export function pruneConfirmLabel(count: number): string {
  return count === 1 ? "Delete it" : "Delete them";
}

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
