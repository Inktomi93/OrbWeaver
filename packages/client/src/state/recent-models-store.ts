// The device-local Recent-models MRU store — the model picker's "Recent" group. Device-local by design:
// a convenience affordance, never synced routing truth. One blob keyed by source, capped + de-duped;
// pushRecentModel unshifts (most-recent-first).

import { isPlainObject } from "@orb/kit/guards";
import { createPersistedStore } from "./create-persisted-store";

/** The MRU cap for the device-local Recent group (per source). */
export const RECENT_MODELS_CAP = 5;

/** The per-source MRU map — each source's picked-model ids, most-recent-first. */
type RecentBySource = Record<string, readonly string[]>;

interface RecentModelsState {
  readonly bySource: RecentBySource;
}

const DEFAULT_STATE: RecentModelsState = { bySource: {} };

const PERSIST_VERSION = 1;

/** Keep only `{ source: string[] of strings }` entries from an untrusted persisted blob. */
function sanitize(v: unknown): RecentBySource {
  if (!isPlainObject(v)) {
    return {};
  }
  const out: Record<string, readonly string[]> = {};
  for (const [source, ids] of Object.entries(v)) {
    if (!Array.isArray(ids)) {
      continue;
    }
    out[source] = ids
      .filter((id): id is string => typeof id === "string")
      .slice(0, RECENT_MODELS_CAP);
  }
  return out;
}

/** TOTAL, crash-proof migrate: any unknown/corrupt persisted blob degrades to an empty MRU — a bad blob
 *  must never brick the picker (the Recent group is a convenience cache, never load-bearing). */
function migrate(persisted: unknown): RecentModelsState {
  if (!isPlainObject(persisted)) {
    return DEFAULT_STATE;
  }
  const p = persisted as { bySource?: unknown };
  return { bySource: sanitize(p.bySource) };
}

const useRecentModelsStore = createPersistedStore<RecentModelsState>(
  "recent-models",
  (): RecentModelsState => DEFAULT_STATE,
  {
    version: PERSIST_VERSION,
    migrate,
    partialize: (s): RecentModelsState => s,
  },
);

/** Push a picked id to the front of a source's device-local MRU (de-duped, capped) and persist it. */
export function pushRecentModel(source: string, id: string): void {
  const { bySource } = useRecentModelsStore.getState();
  const next = [id, ...(bySource[source] ?? []).filter((existing) => existing !== id)].slice(
    0,
    RECENT_MODELS_CAP,
  );
  useRecentModelsStore.setState(
    { bySource: { ...bySource, [source]: next } },
    false,
    "recent-models/push",
  );
}

/** A stable empty tuple — keeps both the selector and the snapshot read zustand-selector-derived clean (no
 *  fresh array per render for the common empty case). */
const EMPTY: readonly string[] = [];

/** A source's device-local Recent-model ids (most-recent-first; `[]` when none). The reactive read. */
export function useRecentModels(source: string): readonly string[] {
  return useRecentModelsStore((s) => s.bySource[source] ?? EMPTY);
}

/** Non-hook snapshot of a source's MRU — for the store's own tests + any read outside a render (the
 *  `readSelectedMessageIds` precedent). */
export function readRecentModels(source: string): readonly string[] {
  return useRecentModelsStore.getState().bySource[source] ?? EMPTY;
}

/** Reset every source's MRU — test-only hygiene (a module singleton must not leak state across tests). */
export function clearAllRecentModels(): void {
  useRecentModelsStore.setState({ bySource: {} }, false, "recent-models/clearAll");
}
