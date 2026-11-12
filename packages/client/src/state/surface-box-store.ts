// SURFACE BOX MEMORY — the per-surface settled body height, remembered per device so a LOADING state
// reserves the same box its content will occupy on the next open. Keyed by an opaque surface id: home's
// tiles were its first consumers (and, until #258, its NAME), the rpg HUD's waystone band is the second
// (#149).
//
// THE PERSIST KEY RENAME DROPPED EVERY DEVICE'S STORED BOXES, DELIBERATELY (#258). `home-tile-box` →
// `surface-box` is a different localStorage key, so the old blob is simply not read. That costs each
// device exactly ONE boot of skeleton-sized reservations — the same cost as a first-ever boot, which this
// store is already designed to absorb (a missing entry reserves nothing and self-heals on that mount, and
// a stale entry only mis-reserves by the delta). Migrating instead would mean reading a FOREIGN key out of
// the per-user durable-local namespace before identity resolves (`durable-local.ts` owns that scheme and
// re-keys on the viewer) — real machinery, to save one boot of a measurement cache. The old key is left
// where it lies for the same reason: sweeping it needs the same namespace walk, and an orphan
// height-map is inert.
//
// WHY IT EXISTS (measured, 2026-08-02 F14): home's tiles each suspend behind their own QueryBoundary
// (home-tile.tsx §3.7) and fall back to a fixed 3-row skeleton. When the reads land, the full-span
// "Recent chats" tile grows out of that skeleton and pushes every tile below it DOWN the grid — measured
// +189px on the landing, boot CLS 0.0913 at 1440x900 on a 6-chat dev DB (the side-eye's fuller DB read
// 0.24). The shift is NOT the shell grid (its tracks resolve synchronously at first commit); it is the tile bodies changing size after first paint.
//
// The box a tile settles at is DATA-dependent (N recents, N quick-picks), so it cannot be spelled as a
// static reservation without either lying about the box or padding every short tile with dead space. The
// honest reservation is the one the tile itself measured LAST time: the frame writes each tile's settled
// body height here on mount, reads it synchronously at the next boot (localStorage is sync, so the very
// first commit already carries it) and reserves exactly that much for the skeleton. A stale entry (the
// user gained/lost rows, or resized) only mis-reserves by the delta and self-heals on the same mount.
//
// Device-local by construction: it is a measurement of THIS device's viewport, never a user preference —
// registered as such in packages/client/src/state/device-local-registry.ts.

import { isPlainObject } from "@orb/kit/guards";
import { createPersistedStore } from "./create-persisted-store.ts";

/** Heights above this are a bug (a mis-measured detached node), not a surface — never reserve them. */
const MAX_REMEMBERED_PX = 4000;
/** A skeleton count above this is a mis-measured pitch, not a surface. */
const MAX_REMEMBERED_ROWS = 200;
/** Sub-pixel churn is not a new box; ignore writes inside this band so a re-measure isn't a storage write. */
const WRITE_EPSILON_PX = 1;

interface SurfaceBoxState {
  /** surface id → the last settled body height in CSS px. */
  readonly boxes: Readonly<Record<string, number>>;
  /** surface id → the count of skeleton rows that filled that height when it was measured, so a boot refills the skeleton without reading the document. */
  readonly rows: Readonly<Record<string, number>>;
}

const DEFAULT_STATE: SurfaceBoxState = { boxes: {}, rows: {} };

const PERSIST_VERSION = 1;

function sanitizeBoxes(v: unknown): Record<string, number> {
  if (!isPlainObject(v)) {
    return {};
  }
  const out: Record<string, number> = {};
  for (const [id, height] of Object.entries(v)) {
    if (typeof height === "number" && Number.isFinite(height) && height > 0 && height <= MAX_REMEMBERED_PX) {
      out[id] = height;
    }
  }
  return out;
}

function sanitizeRows(v: unknown): Record<string, number> {
  if (!isPlainObject(v)) {
    return {};
  }
  const out: Record<string, number> = {};
  for (const [id, count] of Object.entries(v)) {
    if (typeof count === "number" && Number.isInteger(count) && count > 0 && count <= MAX_REMEMBERED_ROWS) {
      out[id] = count;
    }
  }
  return out;
}

// An entry written before rows were remembered has a box and no count; its skeleton stays as authored until the surface settles once more.
function migrate(persisted: unknown): SurfaceBoxState {
  if (!isPlainObject(persisted)) {
    return DEFAULT_STATE;
  }
  const { boxes, rows } = persisted as { boxes?: unknown; rows?: unknown };
  return { boxes: sanitizeBoxes(boxes), rows: sanitizeRows(rows) };
}

const useSurfaceBoxStore = createPersistedStore<SurfaceBoxState>("surface-box", (): SurfaceBoxState => DEFAULT_STATE, {
  version: PERSIST_VERSION,
  migrate,
  partialize: (s): SurfaceBoxState => ({ boxes: s.boxes, rows: s.rows }),
});

/** The height to reserve for `surfaceId`'s loading state, or `null` when this device has never seen it
 *  settle. */
export function useSurfaceBox(surfaceId: string): number | null {
  return useSurfaceBoxStore((s) => s.boxes[surfaceId] ?? null);
}

/** The skeleton row count that filled `surfaceId`'s remembered box, or `null` when this device never recorded one. */
export function useSurfaceRows(surfaceId: string): number | null {
  return useSurfaceBoxStore((s) => s.rows[surfaceId] ?? null);
}

/** Record a surface body's settled height and the skeleton rows that fill it. Out-of-range or unchanged measurements are dropped (no write). */
export function rememberSurfaceBox(surfaceId: string, height: number, rows: number): void {
  if (!(Number.isFinite(height) && height > 0 && height <= MAX_REMEMBERED_PX)) {
    return;
  }
  const { boxes, rows: counts } = useSurfaceBoxStore.getState();
  const current = boxes[surfaceId];
  if (current !== undefined && Math.abs(current - height) < WRITE_EPSILON_PX && counts[surfaceId] === rows) {
    return;
  }
  useSurfaceBoxStore.setState({ boxes: { ...boxes, [surfaceId]: height }, rows: { ...counts, [surfaceId]: rows } }, false, "surfaceBox/remember");
}

/** Drop a surface's remembered box — for a surface that settled to NOTHING (a tile whose `useVisible` resolved
 *  false). It never mounts, so it is never re-measured, and a stale box would reserve it on every boot. */
export function forgetSurfaceBox(surfaceId: string): void {
  const { boxes, rows } = useSurfaceBoxStore.getState();
  if (!(surfaceId in boxes)) {
    return;
  }
  const without = (map: Readonly<Record<string, number>>): Record<string, number> => Object.fromEntries(Object.entries(map).filter(([id]) => id !== surfaceId));
  useSurfaceBoxStore.setState({ boxes: without(boxes), rows: without(rows) }, false, "surfaceBox/forget");
}
