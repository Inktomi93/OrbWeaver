// String primitives shared across layers.
//
// `escapeRegExp` used to live here (neo triplicated it; this was the one copy). It was DELETED
// 2026-08-03 for the platform's `RegExp.escape` (Node-26 program §4.7) — browser-baseline, so kit
// stays isomorphic. Verified before the swap: `RegExp.escape` escapes a strict SUPERSET of our set
// (ours: `$()*+.?[\]^{|}`; the platform adds control/whitespace, `/`, the other punctuators, and a
// leading alnum as `\xHH`), so every consumer regex is byte-different and match-identical. Never
// re-mint one — the ESCAPE-MINT gate arm exists for exactly that.

// ── byte sizes ───────────────────────────────────────────────────────────────────────────────────────
// The ONE human byte-size formatter. It had two byte-identical spellings (`@orb/ui/file-dropzone`'s cap
// hint and `features/databank`'s row subtitle) before the per-chat document rack needed a third; a pure,
// zero-I/O, zero-domain function with three consumers is a kit primitive by the placement rule, and one
// home is what keeps "24.5 KB" from becoming "24.5 KB" in one pane and "25.1 KB" in the next.

const BYTES_PER_UNIT = 1024;
const SIZE_UNITS = ["B", "KB", "MB", "GB"] as const;
const ONE_DECIMAL = 10;

/** Human byte size (binary-scale steps, one decimal, locale-agnostic): 0 B · 512 B · 24.5 KB · 3.1 MB.
 *  Sub-KB sizes stay whole (a "0.5 KB" reads worse than "512 B"); GB is the ceiling — nothing this app
 *  stores is measured in TB. */
export function formatBytes(bytes: number): string {
  if (bytes < BYTES_PER_UNIT) {
    return `${bytes} B`;
  }
  let value = bytes;
  let unitIndex = 0;
  while (value >= BYTES_PER_UNIT && unitIndex < SIZE_UNITS.length - 1) {
    value /= BYTES_PER_UNIT;
    unitIndex += 1;
  }
  const rounded = Math.round(value * ONE_DECIMAL) / ONE_DECIMAL;
  return `${rounded} ${SIZE_UNITS[unitIndex] ?? "GB"}`;
}

// ── grouped digits ───────────────────────────────────────────────────────────────────────────────────
// THE ONE THOUSANDS GROUPER, by the same placement rule `formatBytes` above states, and lifted for the
// same reason on the same evidence (#878 F13, 2026-08-30).
//
// IT WAS DELIBERATELY NOT LIFTED, AND THAT RULING'S OWN CRITERION IS WHAT CHANGED. `databank-model.ts`
// recorded it verbatim — *"Same spelling as the assembly panel's own `formatCount`, deliberately not
// lifted into a shared home for two call sites in different features"* (side-eye 2026-08-19 N-3) — and
// `character-facet-list.tsx` tracked the count in prose: *"so the three hand-rolled thousands-groupers on
// the tree stay at three."* Both are COUNT arguments, and #878 F13 adds a fourth and a fifth in a THIRD
// feature (the character context band's token chip and the editor's save-bar census, which the review
// caught printing `1257 tokens` and `1257 total · 1017 permanent` — four-digit runs with no separator read
// as ids). Three call sites is `formatBytes`'s own stated threshold. The ruling survives; its input moved.
//
// `.toLocaleString()` stays banned repo-wide (`no-raw-intl-time` — un-memoized Intl by the back door), so
// this is the hand-rolled spelling all three sites already shared, verbatim.
const THOUSANDS_RE = /\B(?=(\d{3})+(?!\d))/gu;

/** Group a count for display, locale-agnostically: `1170` → `1,170`, `999` → `999`. The house separator is
 *  the comma — one convention, so a token count reads the same in the band, the save bar and the bank. */
export function groupThousands(value: number): string {
  return String(value).replace(THOUSANDS_RE, ",");
}
