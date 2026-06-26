// The ONE home for "turn an unknown caught value into a human-readable message". This exact ternary
// was re-rolled ~50× across client + server before the lift (C3-1) — every catch block that wants
// `err.message` when the throw was an Error and a best-effort stringification otherwise should import
// this instead of re-typing the idiom.
//
// Deliberately tiny and dependency-free: kit is importable from every layer (client, server, scripts)
// and this must never grow logging / classification concerns — those live elsewhere.

/** `err.message` when `err` is an Error, `String(err)` otherwise. */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
