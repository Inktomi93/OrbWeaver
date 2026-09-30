// HOME TILE MEMORY — how this device last saw Home's gated and moving tiles settle, so their first paint matches it.
// Device-local, beside `surface-box-store`'s heights: a gate that settled hidden reserves nothing, and a tile that
// changes columns paints in the column it last settled in.

import { isPlainObject } from "@orb/kit/guards";
import { createPersistedStore } from "./create-persisted-store.ts";
import type { HomeTileRegion } from "./home-tile-contracts.ts";
import { HOME_TILE_REGIONS } from "./home-tile-contracts.ts";
import { forgetSurfaceBox } from "./surface-box-store.ts";

interface HomeTileMemoryState {
  /** Tiles whose gate last settled hidden. */
  readonly hidden: readonly string[];
  /** tile id → the region a moving tile last settled in. */
  readonly regions: Readonly<Record<string, HomeTileRegion>>;
}

const DEFAULT_STATE: HomeTileMemoryState = { hidden: [], regions: {} };

const PERSIST_VERSION = 1;

function isRegion(v: unknown): v is HomeTileRegion {
  return HOME_TILE_REGIONS.some((region) => region === v);
}

function migrate(persisted: unknown): HomeTileMemoryState {
  if (!isPlainObject(persisted)) {
    return DEFAULT_STATE;
  }
  const blob = persisted as { hidden?: unknown; regions?: unknown };
  const hidden = Array.isArray(blob.hidden) ? blob.hidden.filter((id): id is string => typeof id === "string") : [];
  const regions = isPlainObject(blob.regions)
    ? Object.fromEntries(Object.entries(blob.regions).filter((entry): entry is [string, HomeTileRegion] => isRegion(entry[1])))
    : {};
  return { hidden, regions };
}

const useHomeTileMemoryStore = createPersistedStore<HomeTileMemoryState>("home-tile-memory", (): HomeTileMemoryState => DEFAULT_STATE, {
  version: PERSIST_VERSION,
  migrate,
  partialize: (s): HomeTileMemoryState => ({ hidden: s.hidden, regions: s.regions }),
});

/** Whether this device last saw `tileId`'s gate settle hidden. A device with no memory answers false, so a loading
 *  gate reserves the tile by default. */
export function useHomeTileSettledHidden(tileId: string): boolean {
  return useHomeTileMemoryStore((s) => s.hidden.includes(tileId));
}

/** Record how a gated tile settled. Settling hidden also drops its box: it never mounts, so it is never re-measured. */
export function rememberHomeTileSettledHidden(tileId: string, hidden: boolean): void {
  const state = useHomeTileMemoryStore.getState();
  if (state.hidden.includes(tileId) === hidden) {
    return;
  }
  const rest = state.hidden.filter((id) => id !== tileId);
  useHomeTileMemoryStore.setState({ hidden: hidden ? [...rest, tileId] : rest }, false, "homeTileMemory/settledHidden");
  if (hidden) {
    forgetSurfaceBox(tileId);
  }
}

/** The region a moving tile last settled in on this device, or `null` when it never has. */
export function useRememberedHomeRegion(tileId: string): HomeTileRegion | null {
  return useHomeTileMemoryStore((s) => s.regions[tileId] ?? null);
}

/** Record the region a moving tile settled in. An unchanged region is not a write. */
export function rememberHomeRegion(tileId: string, region: HomeTileRegion): void {
  const { regions } = useHomeTileMemoryStore.getState();
  if (regions[tileId] === region) {
    return;
  }
  useHomeTileMemoryStore.setState({ regions: { ...regions, [tileId]: region } }, false, "homeTileMemory/region");
}

/** Test seam: the whole memory WITHOUT a React render. */
export function __readHomeTileMemoryForTest(): HomeTileMemoryState {
  return useHomeTileMemoryStore.getState();
}
