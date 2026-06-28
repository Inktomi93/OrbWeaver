// domain/assets/contract/errors — DOCUMENTED-EMPTY (deliberate, per assets.md §"8-slot layout" + esoterica
// #10). Assets is NOT a tenant CRUD surface with discriminated NOT_FOUND/FORBIDDEN errors:
//   • Coherence failures (claimed-mime ↔ magic-byte mismatch, an unrecognized signature, a row missing
//     after upsert) are plain `Error` — they are infra/operator faults, not a caller-facing taxonomy.
//   • Ownership/existence denial is NOT an error at all: `getMetadata` / `resolveVariant` return
//     `undefined` (the route maps it to 404), so "not yours" and "doesn't exist" collapse with no
//     foreign-existence leak (D21) — there is nothing to discriminate.
// The slot exists (8-slot template) but exports nothing; a typed error is added only if a future surface
// needs the transport to discriminate one (none does in this slice).

export {};
