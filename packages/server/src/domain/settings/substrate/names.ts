// Mint-time name de-collision for the theme library — the `uniquePresetName` twin (preset/substrate/names).
// TWO doors mint a theme under a name the user never typed and must not be interrupted for: `duplicateTheme`
// ("<source> copy") and `promoteTheme` (the character's own name). Numbering happens at the WRITE, so the
// name a user sees is the name the row carries.
//
// The EXPLICIT-name door (`createTheme`, the editor's own name field) deliberately does NOT come through
// here: a name the user typed and a name we derived are different input modes, and the honest answer to a
// typed collision is the typed `DomainConflictError`, not a silent rename behind their back.
//
// The suffix is the file-manager convention: the first row keeps the bare name, every later collision gets
// " 2", " 3", … The scan is the caller's OWN names only — the unique index is `(ownerId, name)` and seeds
// hold a NULL owner, so a seed's name is never a collision target.

/** The first ordinal a colliding mint takes — the ORIGINAL row is the un-numbered one. */
const FIRST_ORDINAL = 2;

/** `base` when it is free, else the lowest `"<base> <n>"` (n ≥ 2) not already `taken` by this owner. */
export function freeThemeName(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) {
    return base;
  }
  let ordinal = FIRST_ORDINAL;
  while (taken.has(`${base} ${ordinal}`)) {
    ordinal += 1;
  }
  return `${base} ${ordinal}`;
}
