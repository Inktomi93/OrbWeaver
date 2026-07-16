// The ModelPicker's pure model — render-cap, price formatting, and Recent-pool resolve. The Recent MRU's
// device-local persistence lives in state/recent-models-store.ts.

import { timeLib } from "#lib";

/** The minimal entry shape the pure helpers read — a structural subset of the facade's SourceModelEntry. */
interface PickerEntry {
  readonly id: string;
  readonly label: string;
  readonly contextLength?: number | undefined;
  readonly promptPrice?: number | undefined;
  readonly inputModalities?: readonly string[] | undefined;
  readonly supportedParameters?: readonly string[] | undefined;
}

/** The render cap for the "All models" group — a large catalog is sliced so the popover never mounts hundreds of rows. */
export const MODEL_PICKER_RENDER_CAP = 50;

const MILLION = 1_000_000;
const THOUSAND = 1000;
const PRICE_FRACTION_DIGITS = 2;

/** Format a context length as a compact human string (200000 → "200K", 1_000_000 → "1M"). */
export function formatContextLength(contextLength: number | undefined): string | null {
  if (contextLength === undefined || contextLength <= 0) {
    return null;
  }
  if (contextLength >= MILLION) {
    return `${trimZeros(contextLength / MILLION)}M`;
  }
  if (contextLength >= THOUSAND) {
    return `${trimZeros(contextLength / THOUSAND)}K`;
  }
  return String(contextLength);
}

/** Format the per-token USD price as a $/M string ($/M = price × 1e6). Absent/zero price ⇒ `null`. */
export function formatPromptPrice(promptPrice: number | undefined): string | null {
  if (promptPrice === undefined || promptPrice <= 0) {
    return null;
  }
  return `$${trimZeros(promptPrice * MILLION, PRICE_FRACTION_DIGITS)}/M`;
}

/** Trim trailing zeros off a fixed-decimal number (15.00 → "15", 2.50 → "2.5"). */
function trimZeros(value: number, maxFractionDigits = 1): string {
  return String(Number(value.toFixed(maxFractionDigits)));
}

/** `true` when an entry advertises image input (the Vision chip / filter). */
export function hasVision(entry: PickerEntry): boolean {
  return (entry.inputModalities ?? []).includes("image");
}

/** `true` when an entry advertises tool use (the Tools chip / filter). */
export function hasTools(entry: PickerEntry): boolean {
  return (entry.supportedParameters ?? []).includes("tools");
}

/** Apply the Vision/Tools chip filter (AND across active chips) before the render cap. An empty chip set is a no-op pass-through. */
export function filterByChips<T extends PickerEntry>(entries: readonly T[], chips: readonly string[]): readonly T[] {
  if (chips.length === 0) {
    return entries;
  }
  const wantVision = chips.includes("vision");
  const wantTools = chips.includes("tools");
  return entries.filter((entry) => (!wantVision || hasVision(entry)) && (!wantTools || hasTools(entry)));
}

/** The footer's synced line — relative time when a snapshot `fetchedAt` is present, else the source's static provenance note. */
export function footerSyncedLabel(fetchedAt: number | null, allowsFreeText: boolean): string {
  if (fetchedAt !== null) {
    return `synced ${timeLib.formatRelative(fetchedAt)}`;
  }
  return allowsFreeText ? "endpoint /models" : "from config";
}

/** Resolve the Recent-group entries: MRU ids mapped to live pool entries, only when the query is empty. */
export function resolveRecentEntries<T extends PickerEntry>(
  recentIds: readonly string[],
  poolById: ReadonlyMap<string, T>,
  queryIsEmpty: boolean,
): readonly T[] {
  if (!queryIsEmpty) {
    return [];
  }
  return recentIds.map((id) => poolById.get(id)).filter((entry): entry is T => entry !== undefined);
}
