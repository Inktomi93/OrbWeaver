// Deterministic JSON: object keys sorted recursively (arrays keep order), so two logically-identical
// values serialize identically regardless of key insertion order. Used by the card content hash
// (`cardContentHash`, PD-33 — key-order independence) and the forms layer's draft-baseline hash
// (`hashServerBaseline`) — both needed the SAME primitive, so it lives here instead of twice.

/** Deterministic JSON: object keys sorted recursively (arrays keep order), so two logically-identical
 *  values serialize identically regardless of key insertion order. */
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
    .map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`)
    .join(",")}}`;
}
