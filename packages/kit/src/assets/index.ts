// Asset addressing primitive — the content-hash guard shared across the client/server boundary.
// An asset is identified by the sha-256 hex of its bytes (the CAS key). Pure string check — no I/O,
// no node deps. (The `/blob/<hash>` URL ladder + transform widths live in the assets domain, and
// `AssetKind` lives in contracts — only the hash guard is a leaf primitive.)

// A content hash is exactly the sha-256 hex digest: 64 lowercase hex chars. Hoisted to module scope
// (one compile, and `useTopLevelRegex` forbids in-function literals).
const SHA256_HEX = /^[0-9a-f]{64}$/;

/** True when `value` is a well-formed sha-256 hex digest (64 lowercase hex chars). This is the guard
 *  against path traversal (a hash can't contain `/` or `..`) and a cheap validity check at every
 *  boundary that accepts an external hash. */
export function isAssetHash(value: string): boolean {
  return SHA256_HEX.test(value);
}
