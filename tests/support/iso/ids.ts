// Seeded, deterministic id generator (docs/law/Spine-Testing.md §3 — no unseeded ids under tests/). Mints
// a REAL `prefix_<base32>` TypeID shape via `typeid-js`'s own encoder, not a `prefix_000001` placeholder:
// a portable-file boundary (`@orb/server/primitives/serde/gallery`, `.../databank`) round-trips an id through
// `typeIdSchema`, which validates the full TypeID shape and SILENTLY DROPS a row that fails it
// (`rowPolicy: "drop"`, primitives/serde/lib.ts) — so the old placeholder shape made every such row vanish with
// no error, not a thrown mismatch. The counter goes into the low 4 bytes of an otherwise-zero 16-byte
// "uuid" (big-endian), so ordering across `next()` calls stays identical to the old zero-padded scheme.

import { fromUUIDBytes, toUUID } from "typeid-js";

const UUID_BYTE_LENGTH = 16;
const COUNTER_BYTE_LENGTH = 4;
const UUID_VERSION_INDEX = 6;
const UUID_VARIANT_INDEX = 8;
const UUID_VERSION_4 = 0x40;
const UUID_RFC_VARIANT = 0x80;
export const SEEDED_ID_MAX_CURSOR = 2 ** (COUNTER_BYTE_LENGTH * 8) - 1;
/** Start a fixture's named ids here when a story and a CT must agree on them in both worlds: builder sequences
 *  count up from zero, one id per mint, and no run mints 2^31 ids, so this band never meets a builder's id. */
export const FIXTURE_ID_CURSOR = 2 ** 31;

export interface SeededIds {
  readonly next: (prefix?: string) => string;
  /** Deterministic opaque business UUIDs, never security tokens or cryptographic nonces. */
  readonly uuid: () => string;
  readonly snapshot: () => number;
  readonly reset: () => void;
}

export function createSeededIds(cursor = 0): SeededIds {
  let n = cursor;
  const nextBytes = (): Uint8Array => {
    if (n >= SEEDED_ID_MAX_CURSOR) {
      throw new RangeError("Seeded business ID sequence is exhausted");
    }
    n += 1;
    const bytes = new Uint8Array(UUID_BYTE_LENGTH);
    new DataView(bytes.buffer).setUint32(UUID_BYTE_LENGTH - COUNTER_BYTE_LENGTH, n, false);
    return bytes;
  };
  return {
    next: (prefix = "id"): string => fromUUIDBytes(prefix, nextBytes()),
    uuid: (): string => {
      const bytes = nextBytes();
      bytes[UUID_VERSION_INDEX] = UUID_VERSION_4;
      bytes[UUID_VARIANT_INDEX] = UUID_RFC_VARIANT;
      return toUUID(fromUUIDBytes("", bytes));
    },
    snapshot: (): number => n,
    reset: (): void => {
      n = cursor;
    },
  };
}
