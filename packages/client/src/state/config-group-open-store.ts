// CONFIG GROUP DISCLOSURE — which collection groups are EXPANDED in the Configuration roster, remembered
// per device (owner ruling, 2026-08-02).
//
// WHY GROUPS START CLOSED: the roster stacks N libraries in one 330px pane, and a real library is not a
// glance — the owner's own tag library is ~400 rows. Always-expanded (as the mocks drew it) buries every
// sibling collection below one collection's scroll, so the roster stops being the map of what EXISTS,
// which is the whole thing the workspace teaches. Collapsed-by-default makes the band the map and the
// rows the drill-down; the welcome pane carries the orientation for a first-ever visit.
//
// WHY PER DEVICE: "tags open, regex closed" is a working posture on THIS screen, not a preference that
// should follow a user to a phone — the `character-library` browse-prefs precedent (§12.1). Registered as
// device-local in scripts/check/gates/persistence-boundary.ts.
//
// The stored shape is a kind LIST, not a total Record: collection kinds are host-opaque strings with no
// vocabulary tuple to be total over, so an unknown persisted kind is simply a kind that no longer
// registers — it costs one dead array member and is dropped on the next toggle.

import { createPersistedStore } from "./create-persisted-store";

interface ConfigGroupOpenState {
  /** The EXPANDED collection kinds. Absent from the list = collapsed (the default for every kind). */
  readonly openKinds: readonly string[];
}

const DEFAULT_STATE: ConfigGroupOpenState = { openKinds: [] };

const PERSIST_VERSION = 1;

function sanitizeKinds(v: unknown): readonly string[] {
  return Array.isArray(v) ? v.filter((kind): kind is string => typeof kind === "string") : [];
}

function migrate(persisted: unknown): ConfigGroupOpenState {
  return { openKinds: sanitizeKinds((persisted as { openKinds?: unknown } | null)?.openKinds) };
}

const useConfigGroupOpenStore = createPersistedStore<ConfigGroupOpenState>("config-group-open", (): ConfigGroupOpenState => DEFAULT_STATE, {
  version: PERSIST_VERSION,
  migrate,
  partialize: (s): ConfigGroupOpenState => ({ openKinds: s.openKinds }),
});

/** Reactive: is this collection's group expanded? A boolean selector (no fresh object per render). */
export function useCollectionGroupOpen(kind: string): boolean {
  return useConfigGroupOpenStore((s) => s.openKinds.includes(kind));
}

/** Expand ⇄ collapse one group (the band's disclosure button). */
export function toggleCollectionGroup(kind: string): void {
  const { openKinds } = useConfigGroupOpenStore.getState();
  const next = openKinds.includes(kind) ? openKinds.filter((k) => k !== kind) : [...openKinds, kind];
  useConfigGroupOpenStore.setState({ openKinds: next }, false, "configGroupOpen/toggle");
}

/** Expand one group without collapsing anything — the deep-link arm (`goToCollection`) lands a caller ON
 *  the library it asked for, never on a closed door. */
export function openCollectionGroup(kind: string): void {
  const { openKinds } = useConfigGroupOpenStore.getState();
  if (openKinds.includes(kind)) {
    return;
  }
  useConfigGroupOpenStore.setState({ openKinds: [...openKinds, kind] }, false, "configGroupOpen/open");
}

/** Test seam: drop every remembered disclosure (a CT must not inherit another test's expanded set). */
export function __resetCollectionGroupOpen(): void {
  useConfigGroupOpenStore.setState({ openKinds: [] }, false, "configGroupOpen/__reset");
}
