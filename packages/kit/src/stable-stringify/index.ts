// Deterministic JSON: object keys sorted recursively (arrays keep order), so two logically-identical
// values serialize identically regardless of key insertion order. Used by the card content hash
// (`cardContentHash` — key-order independence), the world-book dedup key (`bookContentKey`) and
// the forms layer's draft-baseline hash (`hashServerBaseline`) — all three needed the SAME primitive, so
// it lives here instead of three times.
//
// ── THE CANONICALISATION, and where it stops (#1360 item 1) ────────────────────────────────────────
// This function decides IDENTITY for two persisted hashes, so what it collapses is a correctness
// question, not a formatting one.
//
// `undefined` PROPERTIES ARE OMITTED, exactly as `JSON.stringify` omits them — they used to serialize as
// `null`, which made `{a: undefined}` and `{a: null}` one value. That is wrong twice over on this tree:
// card fields are widely zod-`.optional()` (a `Greeting`'s `groupOnly`), so ABSENT and EXPLICITLY-NULL are
// genuinely different states that different code paths produce, AND the pre-fix behaviour was already
// self-inconsistent — `{text}` and `{text, groupOnly: undefined}` are the same logical greeting and
// hashed DIFFERENTLY, because the second carries the key. Omitting restores "absent ≡ absent" and keeps
// an explicit `null` distinct from both. Array elements keep JSON's own rule (a hole/undefined element is
// positional and reads `null`), because dropping one would renumber the rest.
//
// STILL NOT MODELLED, deliberately, and no caller passes one: `Date` (serializes via `Object.keys` to
// `{}` rather than its ISO string), `Map`/`Set` (likewise `{}`), and CYCLES (infinite recursion, not a
// caught error). Every live input is a plain JSON tree built from zod-parsed values. Widening the
// contract to accept those shapes would be a new engine, not a guard — file it if a caller ever needs one.

/** Deterministic JSON: object keys sorted recursively (arrays keep order), so two logically-identical
 *  values serialize identically regardless of key insertion order. `undefined` properties are OMITTED
 *  (JSON's own rule), so an absent key and an explicit `null` are DIFFERENT identities — see the header
 *  for what this canonicalisation deliberately does not model. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    // lib.es5.d.ts types `JSON.stringify` as always returning `string`, but it really returns
    // `undefined` for `undefined`/function/symbol values (e.g. an explicit `{ a: undefined }`
    // field surviving from a partially-populated object) — a real runtime gap the TS lib
    // misses, not a redundant guard.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- see comment above; JSON.stringify(undefined) is `undefined` at runtime despite the `string` lib type
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    // JSON's own object rule: a key whose value is `undefined` is not part of the value. Filtering HERE
    // (rather than mapping it to `null`) is what keeps absent and explicitly-null apart — see the header.
    .filter((key) => obj[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`)
    .join(",")}}`;
}
