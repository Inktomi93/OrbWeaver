// Mint-time name de-collision for the preset library. Both name-DERIVING mints — the copy-on-write fork of
// the system default ("Default (edited)") and the client's Duplicate ("Copy of X") — used to stack N rows
// under one identical name, which the library list cannot tell apart (visual-blech audit F5). Numbering
// happens at the WRITE, not at display time, so the name a user sees is the name the row carries.
//
// The suffix is the file-manager convention: the first row keeps the bare name, every later collision gets
// " 2", " 3", … The scan is over the caller's OWN names only (presets are owner-scoped; the shared system
// default is not a collision target because its name is never re-minted).

/** The first ordinal a colliding mint takes — the ORIGINAL row is the un-numbered one. */
const FIRST_ORDINAL = 2;

/** `desired` when it is free, else the lowest `"<desired> <n>"` (n ≥ 2) that is not in `taken`. */
export function uniquePresetName(desired: string, taken: readonly string[]): string {
  const used = new Set(taken);
  if (!used.has(desired)) {
    return desired;
  }
  let ordinal = FIRST_ORDINAL;
  while (used.has(`${desired} ${ordinal}`)) {
    ordinal += 1;
  }
  return `${desired} ${ordinal}`;
}
