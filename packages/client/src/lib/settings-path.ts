// The settings-value path read + structural compare — the ONE derivation "modified" means anywhere in
// config: the `@modified` search axis (`use-modified-sections.ts`)
// and the per-leaf row chrome (`use-config-leaf.ts`) both read THESE, so a row's stripe and its section's
// `@modified` badge can never disagree about what counts as a difference. Hoisted from
// `use-modified-sections.ts` when the row-chrome leg landed (#866, the §3.4 rider) — pure, so `#lib`.

/** Loose read of a nested record path ("a" or "a.b") — the claim grammar's two depths. */
export function settingsValueAtPath(bag: unknown, path: string): unknown {
  let node: unknown = bag;
  for (const step of path.split(".")) {
    if (typeof node !== "object" || node === null) {
      return;
    }
    node = (node as Record<string, unknown>)[step];
  }
  return node;
}

/** Structural comparison over settings values — small JSON blobs, so the stringify form is exact enough
 *  (key order is stable: both sides come from the same schema's parse). */
export function settingsValueDiffers(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) !== JSON.stringify(b);
}
