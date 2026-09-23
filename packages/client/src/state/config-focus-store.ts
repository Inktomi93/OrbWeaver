// The Settings workspace's FOCUSED-SETTING seam (#866 S3) — which knob
// the reader is LOOKING AT, so the context pane can teach it. Written by the `SettingRow` frame
// (`#components/setting-teach-row.tsx`) on focus-within, on click, and — fine pointers only, after a
// delay — on hover (owner fork F-8: a pull revelation the reader asked for by looking; never hover-only,
// never on coarse pointers). Read by the config context definition's `useContextState`.
//
// KEEP-LAST semantics on purpose: blur never clears (the reader who glances at the pane keeps the lesson
// they asked for); a new focus replaces; leaving the group or the section clears through the nav store's
// own clear. NOT vocabulary (an open shape ONE host interprets — lockdown §5 rule 5's `contextTab` test)
// and not persisted — a focus is a moment, not a preference.

import type { ConfigGroupId } from "./config-group-ids.ts";
import { createGatedStore } from "./create-gated-store.ts";

/** The focused setting's address. `setting: null` = the section itself has the reader's attention (a
 *  heading focus, a section with no leaf rows). */
export interface ConfigFocus {
  readonly group: ConfigGroupId;
  readonly sub: string;
  readonly setting: string | null;
}

interface ConfigFocusState {
  readonly focus: ConfigFocus | null;
}

const EMPTY: ConfigFocusState = { focus: null };

const useConfigFocusStore = createGatedStore<ConfigFocusState>("config-focus", (): ConfigFocusState => EMPTY);

/** The row frame's write — the row that has the reader's attention. */
export function setConfigFocus(focus: ConfigFocus): void {
  useConfigFocusStore.setState({ focus }, false, "configFocus/set");
}

/** Back to the group lesson (fired when the active group changes — a lesson about a row that is no longer
 *  on screen would be a lie). */
export function clearConfigFocus(): void {
  useConfigFocusStore.setState(EMPTY, false, "configFocus/clear");
}

/** Test seam: a CT must not inherit another test's focused setting. */
export function __resetConfigFocus(): void {
  useConfigFocusStore.setState(EMPTY, false, "configFocus/__reset");
}

export function useConfigFocus(): ConfigFocus | null {
  return useConfigFocusStore((s) => s.focus);
}
