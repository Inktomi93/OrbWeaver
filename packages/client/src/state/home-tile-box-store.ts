// HOME-TILE BOX MEMORY — the per-tile settled body height, remembered per device so a tile's LOADING
// state reserves the same box its content will occupy on the next boot.
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
import { createPersistedStore } from "./create-persisted-store";

/** Heights above this are a bug (a mis-measured detached node), not a tile — never reserve them. */
const MAX_REMEMBERED_PX = 4000;
/** Sub-pixel churn is not a new box; ignore writes inside this band so a re-measure isn't a storage write. */
const WRITE_EPSILON_PX = 1;

interface HomeTileBoxState {
  /** tile id → the last settled body height in CSS px. */
  readonly boxes: Readonly<Record<string, number>>;
}

const DEFAULT_STATE: HomeTileBoxState = { boxes: {} };

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

function migrate(persisted: unknown): HomeTileBoxState {
  if (!isPlainObject(persisted)) {
    return DEFAULT_STATE;
  }
  return { boxes: sanitizeBoxes((persisted as { boxes?: unknown }).boxes) };
}

const useHomeTileBoxStore = createPersistedStore<HomeTileBoxState>("home-tile-box", (): HomeTileBoxState => DEFAULT_STATE, {
  version: PERSIST_VERSION,
  migrate,
  partialize: (s): HomeTileBoxState => ({ boxes: s.boxes }),
});

/** The height to reserve for `tileId`'s loading state, or `null` when this device has never seen it settle. */
export function useHomeTileBox(tileId: string): number | null {
  return useHomeTileBoxStore((s) => s.boxes[tileId] ?? null);
}

/** Record a tile body's settled height. Out-of-range or unchanged measurements are dropped (no write). */
export function rememberHomeTileBox(tileId: string, height: number): void {
  if (!(Number.isFinite(height) && height > 0 && height <= MAX_REMEMBERED_PX)) {
    return;
  }
  const { boxes } = useHomeTileBoxStore.getState();
  const current = boxes[tileId];
  if (current !== undefined && Math.abs(current - height) < WRITE_EPSILON_PX) {
    return;
  }
  useHomeTileBoxStore.setState({ boxes: { ...boxes, [tileId]: height } }, false, "homeTileBox/remember");
}

/** Test seam: the remembered box WITHOUT a React render (the `useHomeTileBox` hook needs one). */
export function __readHomeTileBoxForTest(tileId: string): number | null {
  return useHomeTileBoxStore.getState().boxes[tileId] ?? null;
}

/** Test seam: drop every remembered box (a CT/unit run must not inherit another test's measurements). */
export function __resetHomeTileBoxes(): void {
  useHomeTileBoxStore.setState({ boxes: {} }, false, "homeTileBox/__reset");
}
