// The tag library's pure view-model — folder-type Select items, sort items, and the usage-string
// derivations. Every label maps from the canonical @orb/contracts/tag tuples via a Record, so
// a new member is a tsc error.

import type { TagFolderType, TagTargetType, TagUsage, TagWithUsage } from "@orb/contracts/tag";
import { TAG_FOLDER_TYPES } from "@orb/contracts/tag";
import type { SelectOption } from "@orb/ui/select/items";
import type { TagSortMode } from "./tag-sort.ts";
import { TAG_SORT_MODES } from "./tag-sort.ts";

// A Map, not an object literal, so the contract's uppercase keys don't trip the camelCase naming lint.
const FOLDER_TYPE_LABELS = new Map<TagFolderType, string>([
  ["NONE", "Plain label"],
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

/** Manual order needs mounted rows; a windowed library disables drag and explains its cap. */
export function tagSortItems(handlesAvailable: boolean, cap: number): readonly SelectOption<TagSortMode>[] {
  return TAG_SORT_MODES.map((value) => ({
    label: SORT_MODE_LABELS[value],
    value,
    disabled: value === "manual" && !handlesAvailable,
    ...(value === "manual"
      ? { description: handlesAvailable ? "Manual order lets you drag rows." : `Drag to reorder is off above ${String(cap)} labels.` }
      : {}),
  }));
}

/** The prune confirm's ACTION label — it agrees in number with the title's count, because "Delete them"
 *  over "Delete 1 unused tag?" is the confirm disagreeing with the question (side-eye 2026-08-03 P3). */
export function pruneConfirmLabel(count: number): string {
  return count === 1 ? "Delete it" : "Delete them";
}

/** The create action and placeholder name share one vocabulary. */
export const NEW_LABEL_NAME = "New label";

/** What the Labels library is for — the landing's lead line. */
export const LABELS_BLURB =
  "Your own labels for characters, chats, books, personas and presets. Generated genres, themes and archetypes are analysis facets, not labels.";

/** The empty library landing names its create door; the finder states only its census. */
export const LABELS_EMPTY = `Create a label with ${NEW_LABEL_NAME}. Labels you adopt from character cards land here too.`;

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

/** The five target kinds as plural titles — the Labels landing and the open tag's reach both read these. */
export const USAGE_KIND_TITLES: Record<Exclude<keyof TagUsage, "total">, string> = {
  characters: "Characters",
  chats: "Chats",
  worldBooks: "World books",
  personas: "Personas",
  presets: "Presets",
};

/** How many tags a prune would delete, as words — the noun BOTH halves of the prune confirm name (its title
 *  and its body), so the count a user reads and the count they agree to cannot drift. */
export function unusedTagsLabel(count: number): string {
  return `${count} unused label${count === 1 ? "" : "s"}`;
}

/** The "no colour at all" state, in words — ONE sentence, spent two ways below. `null` is a real state, not
 *  a blank: a tag with no colour paints the theme default, and "unset" and "set to something this theme
 *  swallows" were the same silence (side-eye 2026-08-06 P3). */
const COLOR_UNSET_LABEL = "Not set — uses the theme default";

/** What a colour slot HOLDS, in words — the EDITOR's readout, wired as each picker's `Field description` so
 *  the 32×32 swatch button (which has no text of its own) carries it as an accessible DESCRIPTION rather
 *  than as prose sitting next to it (side-eye 2026-08-08 P2).
 *
 *  UNKEYED on purpose (its P3): the Field label sits 20px above and already says "Background" / "Text", so a
 *  `Background: ` prefix here spends the readout's one line repeating the label it hangs under, and at the
 *  editor's real 430px width it is what pushed the sentence onto a second line. */
export function tagColorValueLabel(value: string | null): string {
  return value ?? COLOR_UNSET_LABEL;
}

/** The same fact KEYED — the list swatch's hover tooltip, which is the one place with no label to lean on:
 *  a row is a bare chip, so the tooltip must name the slot itself. Lower-cased because here the sentence runs
 *  mid-phrase after the key, and there is exactly one home for its words.
 *
 *  IT IS NOT A ROW DATUM. The 2026-08-06 re-verify caught the first pass routing this through
 *  `ListRow.markers` — the row's `aria-describedby` channel — which made a screen reader recite the whole
 *  disclaimer once per row across a 400-tag library. A list row is a scan line; this is an editing fact. */
export function tagColorLabel(kind: "Background" | "Text", value: string | null): string {
  return value === null ? `${kind}: ${COLOR_UNSET_LABEL.toLowerCase()}` : `${kind}: ${value}`;
}

/** The compact total-uses label for a tag row's usage chip (e.g. `"12 uses"` / `"1 use"` / `"unused"`). */
export function usageTotalLabel(total: number): string {
  if (total === 0) {
    return "unused";
  }
  return `${total} use${total === 1 ? "" : "s"}`;
}

const TARGET_USAGE_KEYS: Record<TagTargetType, Exclude<keyof TagUsage, "total">> = {
  character: "characters",
  chat: "chats",
  worldBook: "worldBooks",
  persona: "personas",
  preset: "presets",
};

export function tagTargetTitle(targetType: TagTargetType): string {
  return USAGE_KIND_TITLES[TARGET_USAGE_KEYS[targetType]];
}

/** Suggestions never read as adopted uses or unattached prune candidates. */
export function tagUsageLabel(tag: Pick<TagWithUsage, "usage" | "pendingSuggestions">): string {
  if (tag.pendingSuggestions === 0) {
    return usageTotalLabel(tag.usage.total);
  }
  const suggested = `Suggested for ${String(tag.pendingSuggestions)} character${tag.pendingSuggestions === 1 ? "" : "s"}`;
  return tag.usage.total === 0 ? suggested : `${usageTotalLabel(tag.usage.total)} · ${suggested}`;
}
