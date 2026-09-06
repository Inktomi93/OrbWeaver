// The settings save-status seam's transient store (SET-SEAMS §3, S3) — "status is REPORTED by the section
// and RENDERED once by the host; RETRY stays local".
//
// A decomposed pane stacks N self-owned sections; N stacked "Saved" footers is visual smear, and deleting
// them outright leaves a write with no readout at all. So each section REPORTS its
// save lifecycle here (four enum values per section id — never a callback, never a session) and the shell
// renders ONE aggregate footer: error > blocked > saving > saved. The aggregate is READ-ONLY: retry belongs to the
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

import { createGatedStore } from "./create-gated-store.ts";

/** The save lifecycle a section reports. The tuple homes HERE rather than in `#forms` because the store
 *  that carries it is state-tier and state cannot import forms (`client-state-below-data`, no type-only
 *  exemption); `#forms`' `AutosaveSaveState` DERIVES from it (derive, don't re-declare). */
/** `blocked` = the form is INVALID, so the save driver is holding the write on purpose (never a failure —
 *  nothing was attempted). It exists because "Saved" over a withheld write is the one status that is
 *  actively false: the over-cap prose refusal held the write while both editors' `[role=status]` still read
 *  "Saved" (side-eye PROSE-LIMIT P2). The BADGE/field error is the reason; the
 *  status line is the STATE, and it is also the live-region announcement a screen-reader user gets. */
/** `unreadable` = the entity's STORED blob could not be read, so the server refuses every write derived
 *  from it (`stored_config_unreadable`, the #471/#1026 guard) and the driver never even attempts one. It is
 *  a fifth state and not an `error` because the two demand opposite affordances: `error` owns Retry, and a
 *  retry here CANNOT succeed — the bytes are what they are. Before #1716 this rendered as a defaults-looking
 *  form that said "Saved" until the user typed, then a generic failure with a Retry that failed forever. */
export const SAVE_LIFECYCLE_STATES = ["saved", "saving", "blocked", "error", "unreadable"] as const;
export type SaveLifecycleState = (typeof SAVE_LIFECYCLE_STATES)[number];

interface SettingsSaveStatusState {
  /** section id → its last reported lifecycle state. */
  readonly states: Readonly<Record<string, SaveLifecycleState>>;
  /** The precedence fold error \> blocked \> saving \> saved, or `null` when nothing has reported. */
  readonly aggregate: SaveLifecycleState | null;
  /** The reporting sections currently in `error`, in report order — the nav markers + the footer's jump. */
  readonly erroredIds: readonly string[];
  /** The reporting sections currently `blocked`, in report order — the footer's jump for a HELD write. Kept
   *  separate from `erroredIds` because the two are different facts and the copy differs: a failed write is
   *  urgent and retryable, a held one is waiting on the author. */
  readonly blockedIds: readonly string[];
}

const EMPTY_IDS: readonly string[] = [];

/** unreadable \> error \> blocked \> saving \> saved. `blocked` outranks `saving` because a save in flight
 *  settles by itself and a held one never does — the aggregate must name the state that needs a person.
 *  `unreadable` outranks even `error` because it EXPLAINS the errors underneath it: when the stored blob
 *  cannot be read every section refuses identically, and naming a retryable failure over a refusal that no
 *  retry can clear is the wrong verb on the loudest line (#1716). It carries no id list on purpose — the
 *  condition is the whole blob's, so every reporting section is in it and there is nothing to jump TO. */
function foldAggregate(states: Readonly<Record<string, SaveLifecycleState>>): Pick<SettingsSaveStatusState, "aggregate" | "erroredIds" | "blockedIds"> {
  const ids = Object.keys(states);
  if (ids.length === 0) {
    return { aggregate: null, erroredIds: EMPTY_IDS, blockedIds: EMPTY_IDS };
  }
  if (ids.some((id) => states[id] === "unreadable")) {
    return { aggregate: "unreadable", erroredIds: EMPTY_IDS, blockedIds: EMPTY_IDS };
  }
  const erroredIds = ids.filter((id) => states[id] === "error");
  const blockedIds = ids.filter((id) => states[id] === "blocked");
  if (erroredIds.length > 0) {
    return { aggregate: "error", erroredIds, blockedIds };
  }
  if (blockedIds.length > 0) {
    return { aggregate: "blocked", erroredIds: EMPTY_IDS, blockedIds };
  }
  return { aggregate: ids.some((id) => states[id] === "saving") ? "saving" : "saved", erroredIds: EMPTY_IDS, blockedIds: EMPTY_IDS };
}

const useSettingsSaveStatusStore = createGatedStore<SettingsSaveStatusState>("settings-save-status", () => ({
  states: {},
  aggregate: null,
  erroredIds: EMPTY_IDS,
  blockedIds: EMPTY_IDS,
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

/** The sections whose write is HELD by an invalid field — the footer's "jump to the section that can't
 *  save". Same locate-don't-retry posture as `erroredIds` (D41): only the section itself can fix it. */
export function useBlockedSaveSections(): readonly string[] {
  return useSettingsSaveStatusStore((s) => s.blockedIds);
}
