// Seeded, deterministic id generator (core/Spine-Testing.md §3 — no unseeded ids under tests/). Mints
// a REAL `prefix_<base32>` TypeID shape via `typeid-js`'s own encoder, not a `prefix_000001` placeholder:
// a portable-file boundary (`@orb/server/kit/serde/gallery`, `.../databank`) round-trips an id through
// `typeIdSchema`, which validates the full TypeID shape and SILENTLY DROPS a row that fails it
// (`rowPolicy: "drop"`, kit/serde/lib.ts) — so the old placeholder shape made every such row vanish with
// no error, not a thrown mismatch. The counter goes into the low 4 bytes of an otherwise-zero 16-byte
// "uuid" (big-endian), so ordering across `next()` calls stays identical to the old zero-padded scheme.

import { fromUUIDBytes } from "typeid-js";

const UUID_BYTE_LENGTH = 16;
const COUNTER_BYTE_LENGTH = 4;

export interface SeededIds {
  readonly next: (prefix?: string) => string;
  readonly reset: () => void;
}

export function createSeededIds(): SeededIds {
  let n = 0;
  return {
    next: (prefix = "id"): string => {
      n += 1;
      const bytes = new Uint8Array(UUID_BYTE_LENGTH);
      new DataView(bytes.buffer).setUint32(UUID_BYTE_LENGTH - COUNTER_BYTE_LENGTH, n, false);
      return fromUUIDBytes(prefix, bytes);
    },
    reset: (): void => {
      n = 0;
    },
  };
}
