// CONFIG GROUP DISCLOSURE — which groups are EXPANDED in the Configuration LIST, remembered per device
// (owner ruling, 2026-08-02; every kind since the config revamp, #866 S1 — config-rail-spec C-12).
//
// WHY GROUPS START CLOSED: the LIST stacks N groups in one 330px pane, and a real library is not a
// glance — the owner's own tag library is ~400 rows. Always-expanded (as the mocks drew it) buries every
// sibling group below one group's scroll, so the LIST stops being the map of what EXISTS, which is the
// whole thing the workspace teaches. Collapsed-by-default makes the band the map and the rows the
// drill-down; the welcome pane carries the orientation for a first-ever visit. ONE amendment for the
// unified surface: the ACTIVE group is always expanded — selection and disclosure are one act (the
// `selectCollectionMember` rule, now for every kind) — which the LIST derives, not this store.
//
// WHY PER DEVICE: "tags open, regex closed" is a working posture on THIS screen, not a preference that
// should follow a user to a phone — the `character-library` browse-prefs precedent (§12.1). Registered as
// device-local in tooling/src/verify/gates/persistence-boundary.ts.
//
// The stored shape is an id LIST, not a total Record: a persisted id that no longer registers (a retired
// group, an older spelling) costs one dead array member and is dropped on the next toggle — the sanitizer
// keeps only live `ConfigGroupId`s.

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
