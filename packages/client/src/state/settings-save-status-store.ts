// The settings save-status seam's transient store (SET-SEAMS §3, S3) — "status is REPORTED by the section
// and RENDERED once by the host; RETRY stays local".
//
// A decomposed pane stacks N self-owned sections; N stacked "Saved · Synced across your devices." footers
// is visual smear, and deleting them regresses the one honest sync affordance. So each section REPORTS its
// save lifecycle here (three enum values per section id — never a callback, never a session) and the shell
// renders ONE aggregate footer: error > saving > saved. The aggregate is READ-ONLY: retry belongs to the
// session that owns the edit (D41 — surface the failure where it happened; a broadcast retry would need
// callbacks in a store), so an errored section renders its own inline retry at its anchor and the footer
// only offers to JUMP there.
//
// Device-transient, never persisted: it describes an in-flight edit on THIS device. `aggregate`/`erroredIds`
// are derived at WRITE time and stored, so every read hook selects a stored ref (zustand v5 dropped implicit
// shallow equality — a selector deriving a fresh array loops useSyncExternalStore forever). The DEGRADE
// switch ("is an aggregate host above me?") is NOT here: it is a `#forms` CONTEXT, so a section sees the
// truth on its FIRST render (a store flag published by a host effect would flash the inline status for one
// paint before the host mounts).

import { createGatedStore } from "./create-gated-store";

/** The save lifecycle a section reports. The tuple homes HERE rather than in `#forms` because the store
 *  that carries it is state-tier and state cannot import forms (`client-state-below-data`, no type-only
 *  exemption); `#forms`' `AutosaveSaveState` DERIVES from it (derive, don't re-declare). */
export const SAVE_LIFECYCLE_STATES = ["saved", "saving", "error"] as const;
export type SaveLifecycleState = (typeof SAVE_LIFECYCLE_STATES)[number];

interface SettingsSaveStatusState {
  /** section id → its last reported lifecycle state. */
  readonly states: Readonly<Record<string, SaveLifecycleState>>;
  /** The precedence fold error \> saving \> saved, or `null` when nothing has reported. */
  readonly aggregate: SaveLifecycleState | null;
  /** The reporting sections currently in `error`, in report order — the nav markers + the footer's jump. */
  readonly erroredIds: readonly string[];
}

const EMPTY_IDS: readonly string[] = [];

function foldAggregate(states: Readonly<Record<string, SaveLifecycleState>>): Pick<SettingsSaveStatusState, "aggregate" | "erroredIds"> {
  const ids = Object.keys(states);
  if (ids.length === 0) {
    return { aggregate: null, erroredIds: EMPTY_IDS };
  }
  const erroredIds = ids.filter((id) => states[id] === "error");
  if (erroredIds.length > 0) {
    return { aggregate: "error", erroredIds };
  }
  return { aggregate: ids.some((id) => states[id] === "saving") ? "saving" : "saved", erroredIds: EMPTY_IDS };
}

const useSettingsSaveStatusStore = createGatedStore<SettingsSaveStatusState>("settings-save-status", () => ({
  states: {},
  aggregate: null,
  erroredIds: EMPTY_IDS,
}));

// ── The write API — intent-named module actions (the store handle never escapes this file). ──

/** Report one section's current save lifecycle. Idempotent: an unchanged state is a no-op, so a section
 *  re-reporting every render can't spin the store. */
export function reportSectionSaveStatus(id: string, state: SaveLifecycleState): void {
  const current = useSettingsSaveStatusStore.getState();
  if (current.states[id] === state) {
    return;
  }
  const states = { ...current.states, [id]: state };
  useSettingsSaveStatusStore.setState({ states, ...foldAggregate(states) }, false, "settingsSaveStatus/report");
}

/** Drop one section's report — called on unmount (a pane swap must not leave a ghost "saving"). */
export function clearSectionSaveStatus(id: string): void {
  const current = useSettingsSaveStatusStore.getState();
  if (current.states[id] === undefined) {
    return;
  }
  const { [id]: _dropped, ...states } = current.states;
  useSettingsSaveStatusStore.setState({ states, ...foldAggregate(states) }, false, "settingsSaveStatus/clear");
}

// ── The read API — narrow hooks over stored refs (never a derived literal). ──

/** The aggregate the shell's ONE footer renders; `null` = no section has reported (render nothing). */
export function useAggregateSaveStatus(): SaveLifecycleState | null {
  return useSettingsSaveStatusStore((s) => s.aggregate);
}

/** The sections currently in `error` — the footer's "jump to the section that failed" + the nav markers. */
export function useErroredSaveSections(): readonly string[] {
  return useSettingsSaveStatusStore((s) => s.erroredIds);
}
