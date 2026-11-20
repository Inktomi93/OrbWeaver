// primitives/volume-fold — the one name a Windows or macOS volume stores a file name under. The fold is the union of
// what NTFS and APFS treat as one name: the name in NFC (APFS ignores the normalization form), then each code point
// folded alone, upper then lower, kept as it is when that fold is not one code point. Both volumes fold one code point
// to one, so a final and a medial sigma meet and the Kelvin sign meets "k", while "ß" and "ss" stay two names.

/** The one name a Windows or macOS volume stores `name` under. */
export function volumeFold(name: string): string {
  let folded = "";
  for (const codePoint of name.normalize("NFC")) {
    const simple = codePoint.toUpperCase().toLowerCase();
    const first = simple.codePointAt(0);
    folded += first !== undefined && String.fromCodePoint(first) === simple ? simple : codePoint;
  }
  return folded;
}
