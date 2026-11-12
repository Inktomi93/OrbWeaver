// custom-types — the db's own column codecs (reserved cross-cutting db artifact): the native vector column and the
// NUL-free text column.
//
// A NUL IS NOT TEXT IN THIS APP. It is removed from every value written to, or compared against, a `nulFreeText`
// column. The libSQL client stores a TEXT value whole and reads it back cut at its first NUL, so a NUL
// that reached the column would silently shorten what the app shows and re-saves. Drizzle maps a value through the
// column both when it is written and when it is compared in a WHERE, so the two sides get one normalization: a lookup
// finds what a write of the same value stored, and a UNIQUE column treats two values that differ only by a NUL as one.
// Every free-string TEXT column in `../schema` uses it. Drizzle's own `text` stays only where the value cannot carry a
// raw NUL: a `mode: "json"` column, whose JSON text spells a NUL as the escape `\u0000`, and an `enum` column, which
// holds only its tuple's literals. The schema files' `no-restricted-syntax` block in `eslint.config.ts` refuses any
// other drizzle `text` column (`tests/tooling/eslint-db-text-columns.test.ts`).
//
// `vector32` is libSQL's `F32_BLOB(dim)`: a raw little-endian Float32 blob, NOT a JSON array. It is a
// drizzle `customType` so the five vector tables (`schema/embeddings.ts`) read/write `Float32Array`
// directly while the SQL column is a blob.
//
// Two load-bearing facts (Tier-1-DB.md "Esoteric" #1/#2 — must survive):
//   1. The stored bytes ARE libSQL's on-wire `F32_BLOB`, so we sidestep the drizzle `sql`vector32()``
//      insert caveat: the query vector is wrapped `vector32(?)` in the search SQL, but stored
//      rows are the raw blob. There is no ANN/DiskANN shadow index — an exact `ORDER BY
//      vector_distance_cos(...) LIMIT k` is sub-millisecond + 100% recall at this corpus scale.
//   2. `fromDriver` MUST copy via `value.slice().buffer` BEFORE wrapping in a `Float32Array`. The driver
//      may hand back an unaligned subarray view whose `byteOffset` is not a multiple of 4; `Float32Array`
//      cannot wrap an unaligned buffer and reads corrupt. `slice()` produces a fresh, 4-byte-aligned
//      `ArrayBuffer` (offset 0, exact length). Removing the copy is a silent data-corruption bug.

import { withoutNul } from "@orb/kit/strings";
import { customType } from "drizzle-orm/sqlite-core";

/** A free-string TEXT column that removes every NUL from the value on its way to the driver, written or compared. The
 *  stored type is `text`, so the DDL and the inferred row and insert types are drizzle's `text` column's. */
export const nulFreeText = customType<{ data: string; driverData: string }>({
  dataType(): string {
    return "text";
  },
  toDriver(value: string): string {
    return withoutNul(value);
  },
});

/**
 * `F32_BLOB(dimensions)` ⇄ `Float32Array`. `dimensions` is only the declared DDL width: without a vector
 * index libSQL stores any width, and the row's `dim` column is the stored one. Consumed only by db schema files.
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
