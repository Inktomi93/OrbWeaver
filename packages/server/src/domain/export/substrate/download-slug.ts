// domain/export/substrate/download-slug — filename-safe download slug for an export artifact. Pure, zero
// I/O. Distinct from @orb/kit/slug's slugifyHandle (the identity-handle policy) — this is the looser,
// human-readable download-filename policy.

import { trimEdgesWhile } from "@orb/kit/strings";

const MAX_SLUG_LENGTH = 60;
const FALLBACK = "export";
// Any run of chars outside the filename-safe set collapses to a single underscore.
const UNSAFE_RUN = /[^a-z0-9._-]+/giu;

/** A filename-safe download slug (≤60 chars; "export" when the input slugs to empty). */
export function slug(name: string): string {
  // Edge underscores trimmed (a name like " :Aria: " shouldn't slug to `_Aria_`).
  return trimEdgesWhile(name.trim().replace(UNSAFE_RUN, "_"), "_").slice(0, MAX_SLUG_LENGTH) || FALLBACK;
}
