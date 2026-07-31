// The ONE key minter for host-authored defs (trackers, profile attributes). A def's `key` is its stable
// addressing identity — values, grants, locks and the model's write schema all key on it — so it is minted
// ONCE from the label the host typed and never re-derived on a later rename (a rename that re-slugged the key
// would orphan every stored value, which is exactly the name-addressing bug the unification killed).

/** Slug `label` into an addressable key, suffixed until unique among `taken`. Empty/symbol-only labels fall
 *  back to `fallback` (the caller's noun — "tracker"/"attribute"). */
export function mintDefKey(label: string, taken: Iterable<string>, fallback: string): string {
  const base =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || fallback;
  const keys = new Set(taken);
  if (!keys.has(base)) {
    return base;
  }
  let n = 2;
  while (keys.has(`${base}_${n}`)) {
    n += 1;
  }
  return `${base}_${n}`;
}
