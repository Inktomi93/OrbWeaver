// domain/export/substrate/download-slug — filename-safe download slug for an export artifact. Pure, zero
// I/O. Distinct from @orb/kit/slug's slugifyHandle (the identity-handle policy) — this is the looser,
// human-readable download-filename policy.

const MAX_SLUG_LENGTH = 60;
const FALLBACK = "export";
// Any run of chars outside the filename-safe set collapses to a single underscore.
const UNSAFE_RUN = /[^a-z0-9._-]+/giu;
// Leading/trailing underscores trimmed (a name like " :Aria: " shouldn't slug to `_Aria_`).
const EDGE_UNDERSCORES = /^_+|_+$/gu;

/** A filename-safe download slug (≤60 chars; "export" when the input slugs to empty). */
export function slug(name: string): string {
  return (
    name.trim().replace(UNSAFE_RUN, "_").replace(EDGE_UNDERSCORES, "").slice(0, MAX_SLUG_LENGTH) ||
    FALLBACK
  );
}
