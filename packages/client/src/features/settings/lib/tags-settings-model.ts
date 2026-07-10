// The Tags settings pane's pure view-model — the folder-type Select items + the usage-string derivations,
// split out of the surface (UI-Arch §2.1 component-size gate). Every label maps from the CANONICAL
// `@orb/contracts/tag` tuples via a `Record<Union, string>`, so a new folder-type/target member is a `tsc`
// error here (no re-spelled union, no magic string) — the same derive-don't-respell discipline the settings
// registry keeps.

import type { TagFolderType, TagUsage } from "@orb/contracts/tag";
import { TAG_FOLDER_TYPES } from "@orb/contracts/tag";
import type { SelectOption } from "@orb/ui/select";

// Human labels for the tags-as-folders states, keyed by the CANONICAL union members (uppercase — a Map,
// not an object literal, so the contract's `NONE`/`OPEN`/`CLOSED` keys don't trip the camelCase naming
// lint). `NONE` reads as "Plain tag" (the non-folder default).
const FOLDER_TYPE_LABELS = new Map<TagFolderType, string>([
  ["NONE", "Plain tag"],
  ["OPEN", "Open folder"],
  ["CLOSED", "Closed folder"],
]);

/** The folder-type Select options, derived from the canonical tuple (declared order preserved); an
 *  unlabeled member falls back to its raw value rather than dropping from the list. */
export const FOLDER_TYPE_ITEMS: readonly SelectOption<TagFolderType>[] = TAG_FOLDER_TYPES.map(
  (value) => ({ label: FOLDER_TYPE_LABELS.get(value) ?? value, value }),
);

/** The five per-target usage counts (singular labels — pluralized in {@link usageBreakdown}). A `Record`
 *  over the non-total `TagUsage` keys, so a new junction target is a `tsc` error until it gets a label. */
const USAGE_LABELS: Record<Exclude<keyof TagUsage, "total">, string> = {
  characters: "character",
  chats: "chat",
  worldBooks: "world book",
  personas: "persona",
  presets: "preset",
};

/** A human breakdown of a tag's non-zero attachments (e.g. `"3 characters, 1 chat"`) — the cascade-warning
 *  copy on the delete confirm. `"nothing"` when the tag is unused (a safe delete / prune candidate). */
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
