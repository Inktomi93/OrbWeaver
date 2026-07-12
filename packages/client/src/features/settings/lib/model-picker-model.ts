// The ModelPicker's pure MODEL (Settings → Connections → Model roles — the source-driven picker;
// CONNECTIONS-BUILD-SPEC §3). Split from `model-picker.tsx` (UI-Arch §2.1 component-size gate) since the
// render-cap / price formatting / Recent-pool resolve are data + string-math, not JSX. The Recent MRU's
// device-local PERSISTENCE lives in state/recent-models-store.ts (the createPersistedStore door).
//
// The picker entry SHAPE is derived from the facade result by tRPC INFERENCE in the COMPONENT (a local,
// non-exported alias — the `credential-key-row.tsx` precedent; an exported inference `type` in a feature is
// a type-home leak, no-inline-types.grit §7.4). This lib takes only the STRUCTURAL fields it needs as a
// local `interface`, so it never imports the server shape (the cake) and exports no leaking `type`.

import { timeLib } from "#lib";

/** The minimal entry shape the pure helpers read (a structural subset of the facade's `SourceModelEntry`).
 *  Local — the component passes its inference-typed entries, which satisfy this by shape. */
interface PickerEntry {
  readonly id: string;
  readonly label: string;
  readonly contextLength?: number | undefined;
  readonly promptPrice?: number | undefined;
  readonly inputModalities?: readonly string[] | undefined;
  readonly supportedParameters?: readonly string[] | undefined;
}

/** The render cap for the "All models" group — a large catalog (OpenRouter ships 500+) is sliced so the
 *  popover never mounts hundreds of rows; the "+N more — keep typing" row teaches the user to narrow. */
export const MODEL_PICKER_RENDER_CAP = 50;

// Compact-number thresholds (extracted — no magic numbers).
const MILLION = 1_000_000;
const THOUSAND = 1000;
const PRICE_FRACTION_DIGITS = 2;

// The device-local Recent-models MRU (read + write + persistence) lives in state/recent-models-store.ts —
// it must go through the createPersistedStore door (persistence-boundary gate), never a bare localStorage
// read/write from this pure lib. This file keeps only the pure render helpers (string-math + the Recent
// pool→entry resolve below).

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

/** Format the per-token USD price as a $/M string. `promptPrice` is USD PER TOKEN (`ModelCatalogEntry`
 *  semantics — the facade carries the raw value), so $/M = price × 1e6 (1.5e-5 → "$15.00/M"). Absent/zero
 *  price ⇒ `null` (the meta cell omits it). */
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

/** Apply the Vision/Tools chip filter (AND across active chips) BEFORE the render cap. An empty chip set is
 *  a no-op pass-through. Generic so the caller keeps its inference-typed entries (never a widen/cast). */
export function filterByChips<T extends PickerEntry>(
  entries: readonly T[],
  chips: readonly string[],
): readonly T[] {
  if (chips.length === 0) {
    return entries;
  }
  const wantVision = chips.includes("vision");
  const wantTools = chips.includes("tools");
  return entries.filter(
    (entry) => (!wantVision || hasVision(entry)) && (!wantTools || hasTools(entry)),
  );
}

/** The footer's synced line — the snapshot `fetchedAt` as relative time when present, else the source's
 *  static provenance note (the facade returns `fetchedAt: null` for config/builtin/custom sources). */
export function footerSyncedLabel(fetchedAt: number | null, allowsFreeText: boolean): string {
  if (fetchedAt !== null) {
    return `synced ${timeLib.formatRelative(fetchedAt)}`;
  }
  return allowsFreeText ? "endpoint /models" : "from config";
}

/** Resolve the Recent-group entries: the device-local MRU ids mapped to their live pool entries, dropped
 *  when the id is no longer in the pool, and only when the query is empty (Recent is a rest-state group).
 *  Pure — the caller passes its inference-typed pool + a lookup so no widen/cast leaks. */
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
