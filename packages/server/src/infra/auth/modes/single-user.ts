// `single-user` — the locked zero-infra contract: no SSO, no cookies, no headers. The request resolves
// to the owner via the UNCONDITIONAL owner-fallback in `dispatch.ts` (this mode never gates the
// fallback). So the resolver returns null — the fallback step takes over. The module exists to keep
// every mode the same shape (one module per mode) so the dispatcher needs no special-case.

/** Always null: `single-user` delegates entirely to the unconditional owner fallback. */
export function resolveSingleUser(): null {
  return null;
}
