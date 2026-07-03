// custom-types — the native vector column codec (reserved cross-cutting db artifact).
//
// `vector32` is libSQL's `F32_BLOB(dim)`: a raw little-endian Float32 blob, NOT a JSON array. It is a
// drizzle `customType` so the four vector tables (`schema/embeddings.ts`) and the k-means `centroid`
// rollup (`schema/discovery.ts`) read/write `Float32Array` directly while the SQL column is a blob.
//
// Two load-bearing facts (Tier-1-DB.md "Esoteric" #1/#2 — must survive):
//   1. The stored bytes ARE libSQL's on-wire `F32_BLOB`, so we sidestep the drizzle `sql`vector32()``
//      insert caveat (#3899): the query vector is wrapped `vector32(?)` in the search SQL, but stored
//      rows are the raw blob. There is no ANN/DiskANN shadow index — an exact `ORDER BY
//      vector_distance_cos(...) LIMIT k` is sub-millisecond + 100% recall at this corpus scale.
//   2. `fromDriver` MUST copy via `value.slice().buffer` BEFORE wrapping in a `Float32Array`. The driver
//      may hand back an unaligned subarray view whose `byteOffset` is not a multiple of 4; `Float32Array`
//      cannot wrap an unaligned buffer and reads corrupt. `slice()` produces a fresh, 4-byte-aligned
//      `ArrayBuffer` (offset 0, exact length). Removing the copy is a silent data-corruption bug.

import { customType } from "drizzle-orm/sqlite-core";

/**
 * `F32_BLOB(dimensions)` ⇄ `Float32Array`. `dimensions` is REQUIRED (the libSQL type carries the dim,
 * and the `(model, dim)` space tag on the row must match it). Consumed only by db schema files.
 *
 * Wave-1 verification point: `fromDriver`'s `driverData` is typed `Uint8Array` per the alignment idiom;
 * the embeddings `.int.test` confirms the libSQL driver's actual blob read-back type round-trips here.
 */
export const vector32 = customType<{
  data: Float32Array;
  driverData: Uint8Array;
  config: { dimensions: number };
  configRequired: true;
}>({
  dataType(config): string {
    return `F32_BLOB(${config.dimensions})`;
  },
  toDriver(value: Float32Array): Uint8Array {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  },
  fromDriver(value: Uint8Array): Float32Array {
    // slice() → a fresh aligned ArrayBuffer; see esoteric #2 above. Do NOT remove the copy.
    return new Float32Array(value.slice().buffer);
  },
});
