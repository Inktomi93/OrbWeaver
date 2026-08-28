// entry/http/frame-handle-store — the ONE per-user opaque-handle store behind every routed frame doorway (the
// card frame, `card-frame.ts`; the plugin frame, `plugin-frame.ts`). Extracted at U7 rather than copied,
// because what it implements is a SECURITY primitive and "a second spelling of a security policy is the defect
// this prevents" (`@orb/kit/card-frame`'s own header, about the CSP one layer down). A duplicated eviction loop
// or a duplicated owner check is two places for the no-existence-leak property to be true in only one of them.
//
// ── WHAT A HANDLE IS ─────────────────────────────────────────────────────────────────────────────────────────
// 128 bits of CSPRNG, bound to the minting `userId`, living in a capped in-process map. So a link an attacker
// crafts resolves in nobody's store but the victim's — and a foreign or unknown id is indistinguishable from an
// expired one (the `/api/blob` no-existence-leak precedent). Nothing persists: the document bytes never reach
// disk through either route.
//
// THE OWNER CHECK IS THE LAST WORD AND NEVER FALLS THROUGH TO A DIFFERENT ANSWER — `take` returns `undefined`
// for a foreign owner exactly as it does for a miss, so a caller cannot accidentally build two response arms.
//
// ── THE TWO CEILINGS, BOTH ENFORCED ──────────────────────────────────────────────────────────────────────────
// Count AND bytes, because a document's size varies by two orders of magnitude: a count-only cap would let 256
// max-size documents pin ~20 MiB, a byte-only cap would let a flood of tiny ones pin an unbounded map.
// Oldest-first eviction (Map iteration is insertion-ordered, so `keys().next()` IS the oldest handle); a victim
// of eviction re-mints.
//
// TTL SLIDES ON EACH SERVE — a transcript or a room left open re-frames on remount (lazy iframes refetch) and
// must not find a hole where its document was. The slide costs a timestamp write and bounds retention to "the
// tab that is looking at it".

import { Buffer } from "node:buffer";
import { randomBytes } from "node:crypto";
import type { UserId } from "@orb/kit/ids";

/** A handle lives 30 minutes, sliding on each serve. */
const MS_PER_MINUTE = 60_000;
const TTL_MINUTES = 30;
export const FRAME_HANDLE_TTL_MS = TTL_MINUTES * MS_PER_MINUTE;

/** Retention ceilings, shared by both doorways. */
const BYTES_PER_MIB = 1_048_576;
const MAX_TOTAL_MIB = 8;
const MAX_ENTRIES = 256;
const MAX_TOTAL_BYTES = MAX_TOTAL_MIB * BYTES_PER_MIB;
const ID_BYTES = 16;

/** The handle grammar. A path segment that does not match never reaches the store at all — checked by the
 *  caller BEFORE `take`, so a traversal attempt is refused by shape rather than by lookup. */
export const FRAME_HANDLE_SHAPE = /^[0-9a-f]{32}$/u;

/** One stored document. `csp` rides WITH the bytes rather than being recomputed at serve time: the policy a
 *  document is served under must be the one decided when it was minted, not one re-derived later from settings
 *  that may since have changed. Not exported: consumers hand `put` an object literal and read `take`'s result
 *  through {@link FrameHandleStore}, so this shape has no cross-module caller (knip). */
interface FrameHandleEntry {
  readonly userId: UserId;
  readonly doc: string;
  readonly csp: string;
  readonly bytes: number;
  expiresAt: number;
}

export interface FrameHandleStore {
  /** Store a document and return its opaque handle. */
  readonly put: (entry: Omit<FrameHandleEntry, "bytes">) => string;
  /** Resolve a handle FOR `userId`. `undefined` for unknown, expired, AND foreign — one answer, no oracle. */
  readonly take: (id: string, userId: UserId) => FrameHandleEntry | undefined;
}

/** Create a per-process handle store. Created per registrar call, so a test gets a clean one. */
export function createFrameHandleStore(now: () => number): FrameHandleStore {
  const entries = new Map<string, FrameHandleEntry>();
  let totalBytes = 0;

  const drop = (id: string): void => {
    const found = entries.get(id);
    if (found !== undefined) {
      totalBytes -= found.bytes;
      entries.delete(id);
    }
  };

  return {
    put: (entry): string => {
      const bytes = Buffer.byteLength(entry.doc, "utf8");
      const id = randomBytes(ID_BYTES).toString("hex");
      entries.set(id, { ...entry, bytes });
      totalBytes += bytes;
      while (entries.size > MAX_ENTRIES || totalBytes > MAX_TOTAL_BYTES) {
        const oldest = entries.keys().next().value;
        if (oldest === undefined || oldest === id) {
          break;
        }
        drop(oldest);
      }
      return id;
    },
    take: (id, userId): FrameHandleEntry | undefined => {
      const found = entries.get(id);
      if (found === undefined) {
        return;
      }
      if (found.expiresAt <= now()) {
        drop(id);
        return;
      }
      if (found.userId !== userId) {
        return;
      }
      found.expiresAt = now() + FRAME_HANDLE_TTL_MS;
      return found;
    },
  };
}
