// domain/assets/substrate/pose-normalize — the BYO pose name/category/tag normalization (comfyui-control
// §4.12.2, C6c): trim → NFKC → lowercase (the expressions custom-label rule). Free user text — the kit's 13
// categories seed the picker's suggestion list, they are NOT a whitelist. Pure; no db, no I/O.

/** trim → NFKC → lowercase; `fallback` when the result is empty (an all-whitespace name/category). */
export function normalizePoseText(raw: string, fallback: string): string {
  const normalized = raw.trim().normalize("NFKC").toLowerCase();
  return normalized.length > 0 ? normalized : fallback;
}

/** Normalize each tag (trim → NFKC → lowercase), drop empties, de-dupe (order-preserving). */
export function normalizePoseTags(tags: readonly string[] | undefined): readonly string[] {
  if (tags === undefined) {
    return [];
  }
  const seen = new Set<string>();
  for (const tag of tags) {
    const normalized = tag.trim().normalize("NFKC").toLowerCase();
    if (normalized.length > 0) {
      seen.add(normalized);
    }
  }
  return [...seen];
}
