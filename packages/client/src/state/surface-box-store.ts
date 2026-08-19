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
// 0.24). The shift is NOT the shell grid (its tracks resolve synchronously at first commit — see the
// app-shell CT pin); it is the tile bodies changing size after first paint.
//
// The box a tile settles at is DATA-dependent (N recents, N quick-picks), so it cannot be spelled as a
// static reservation without either lying about the box or padding every short tile with dead space. The
// honest reservation is the one the tile itself measured LAST time: the frame writes each tile's settled
// body height here on mount, reads it synchronously at the next boot (localStorage is sync, so the very
// first commit already carries it) and reserves exactly that much for the skeleton. A stale entry (the
// user gained/lost rows, or resized) only mis-reserves by the delta and self-heals on the same mount.
//
// Device-local by construction: it is a measurement of THIS device's viewport, never a user preference —
// registered as such in scripts/check/gates/persistence-boundary.ts.

import { isPlainObject } from "@orb/kit/guards";
import { createPersistedStore } from "./create-persisted-store.ts";

/** Heights above this are a bug (a mis-measured detached node), not a surface — never reserve them. */
const MAX_REMEMBERED_PX = 4000;
/** Sub-pixel churn is not a new box; ignore writes inside this band so a re-measure isn't a storage write. */
const WRITE_EPSILON_PX = 1;

interface SurfaceBoxState {
  /** surface id → the last settled body height in CSS px. */
  readonly boxes: Readonly<Record<string, number>>;
}

const DEFAULT_STATE: SurfaceBoxState = { boxes: {} };

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

function migrate(persisted: unknown): SurfaceBoxState {
  if (!isPlainObject(persisted)) {
    return DEFAULT_STATE;
  }
  return { boxes: sanitizeBoxes((persisted as { boxes?: unknown }).boxes) };
}

const useSurfaceBoxStore = createPersistedStore<SurfaceBoxState>("surface-box", (): SurfaceBoxState => DEFAULT_STATE, {
  version: PERSIST_VERSION,
  migrate,
  partialize: (s): SurfaceBoxState => ({ boxes: s.boxes }),
});

/** The height to reserve for `surfaceId`'s loading state, or `null` when this device has never seen it
 *  settle. */
export function useSurfaceBox(surfaceId: string): number | null {
  return useSurfaceBoxStore((s) => s.boxes[surfaceId] ?? null);
}

/** Record a surface body's settled height. Out-of-range or unchanged measurements are dropped (no write). */
export function rememberSurfaceBox(surfaceId: string, height: number): void {
  if (!(Number.isFinite(height) && height > 0 && height <= MAX_REMEMBERED_PX)) {
    return;
  }
  const { boxes } = useSurfaceBoxStore.getState();
  const current = boxes[surfaceId];
  if (current !== undefined && Math.abs(current - height) < WRITE_EPSILON_PX) {
    return;
  }
  useSurfaceBoxStore.setState({ boxes: { ...boxes, [surfaceId]: height } }, false, "surfaceBox/remember");
}

/** Test seam: the remembered box WITHOUT a React render (the `useSurfaceBox` hook needs one). */
export function __readSurfaceBoxForTest(surfaceId: string): number | null {
  return useSurfaceBoxStore.getState().boxes[surfaceId] ?? null;
}

/** Test seam: drop every remembered box (a CT/unit run must not inherit another test's measurements). */
export function __resetSurfaceBoxes(): void {
  useSurfaceBoxStore.setState({ boxes: {} }, false, "surfaceBox/__reset");
}
