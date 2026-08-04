// The ONE home for "turn an unknown caught value into a human-readable message". This exact ternary
// was re-rolled ~50× across client + server before the lift (C3-1) — every catch block that wants
// `err.message` when the throw was an Error and a best-effort stringification otherwise should import
// this instead of re-typing the idiom.
//
// Deliberately tiny and dependency-free: kit is importable from every layer (client, server, scripts)
// and this must never grow logging / classification concerns — those live elsewhere.

// `Error.isError` over `instanceof Error` (Node-26 program §4.8): this is the repo's ONE unknown->message
// narrowing boundary, and it is exactly where a CROSS-REALM error arrives (a vm/worker/iframe Error fails
// `instanceof` against the host realm's prototype and would silently stringify to "[object Error]"). The
// brand check is realm-agnostic. NOTE the deliberate non-swap: the plugin-host membrane's guest->host path
// (`infra/plugin-host/sandbox.ts` readError) duck-types a `ctx.dump()`ed QuickJS value, which is not an
// Error of ANY realm — `Error.isError` is WRONG there and stays unswapped.
export function errorMessage(err: unknown): string {
  return Error.isError(err) ? err.message : String(err);
}
