// Config disclosure is device-local working posture, not a preference carried to another screen
// (#866/persistence-boundary). Groups start closed so one long library does not bury its siblings; the
// band is the map. The active group is always expanded, derived by the list rather than held independently
// here.
//
// The stored shape is an id list, not a total Record. The sanitizer keeps live ConfigGroupIds;
// retired/older ids are harmless dead entries dropped on the next toggle.

import type { ConfigGroupId } from "./config-group-ids.ts";
import { isConfigGroupId } from "./config-group-ids.ts";
import { createPersistedStore } from "./create-persisted-store.ts";

interface ConfigGroupOpenState {
  /** The EXPANDED groups. Absent from the list = collapsed (the default for every group). */
  readonly openIds: readonly ConfigGroupId[];
}

const DEFAULT_STATE: ConfigGroupOpenState = { openIds: [] };

const PERSIST_VERSION = 1;

function sanitizeIds(v: unknown): readonly ConfigGroupId[] {
  return Array.isArray(v) ? v.filter(isConfigGroupId) : [];
}

function migrate(persisted: unknown): ConfigGroupOpenState {
  // v1 stored the list as `openKinds` (collection kinds only); the same ids are live group ids today.
  const raw = persisted as { openIds?: unknown; openKinds?: unknown } | null;
  return { openIds: sanitizeIds(raw?.openIds ?? raw?.openKinds) };
}

const useConfigGroupOpenStore = createPersistedStore<ConfigGroupOpenState>("config-group-open", (): ConfigGroupOpenState => DEFAULT_STATE, {
  version: PERSIST_VERSION,
  migrate,
  partialize: (s): ConfigGroupOpenState => ({ openIds: s.openIds }),
});

/** Reactive: is this group expanded? A boolean selector (no fresh object per render). */
export function useConfigGroupOpen(id: ConfigGroupId): boolean {
  return useConfigGroupOpenStore((s) => s.openIds.includes(id));
}

/** Expand one group without collapsing anything — the deep-link arm (`openConfigTo`, a member selection)
 *  lands a caller ON the group it asked for, never on a closed door. Idempotent. */
export function openConfigGroup(id: ConfigGroupId): void {
  const { openIds } = useConfigGroupOpenStore.getState();
  if (openIds.includes(id)) {
    return;
  }
  useConfigGroupOpenStore.setState({ openIds: [...openIds, id] }, false, "configGroupOpen/open");
}

/** Collapse one group, if it is open — the AUTO-OPEN's undo (#1217).
 *
 *  IT EXISTS BECAUSE AUTO-OPEN IS NOT USER INTENT. `openConfigGroup` remembers a disclosure per device, and
 *  that memory is the reader's: a group they opened stays open across switches (C-12). The arrival default
 *  opens a group NOBODY asked for, so leaving that one expanded behind the reader is the memory telling a
 *  lie about what they did — measured as nine Appearance rows pinned above the library the reader actually
 *  entered. Only the arrival module calls this, and only for the group it opened itself. */
export function closeConfigGroup(id: ConfigGroupId): void {
  const { openIds } = useConfigGroupOpenStore.getState();
  if (!openIds.includes(id)) {
    return;
  }
  useConfigGroupOpenStore.setState({ openIds: openIds.filter((k) => k !== id) }, false, "configGroupOpen/close");
}

/** Test seam: drop every remembered disclosure (a CT must not inherit another test's expanded set). */
export function __resetConfigGroupOpen(): void {
  useConfigGroupOpenStore.setState({ openIds: [] }, false, "configGroupOpen/__reset");
}
