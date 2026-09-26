// String primitives shared across layers.
//
// `escapeRegExp` used to live here (neo triplicated it; this was the one copy). It was DELETED
// 2026-08-03 for the platform's `RegExp.escape` (Node-26 program §4.7) — browser-baseline, so kit
// stays isomorphic. Verified before the swap: `RegExp.escape` escapes a strict SUPERSET of our set
// (ours: `$()*+.?[\]^{|}`; the platform adds control/whitespace, `/`, the other punctuators, and a
// leading alnum as `\xHH`), so every consumer regex is byte-different and match-identical. Never
// re-mint one — the ESCAPE-MINT gate arm exists for exactly that.

// ── the Unicode word-character class (#1354 · #1530 · #1439 · #1543) ─────────────────────────────────
// THE ONE ANSWER TO "IS THIS CHARACTER PART OF A WORD". Homed here, not in any of its consumers, because
// it is a pure text primitive with three of them across two unrelated modules (`#speaker-label`'s label
// stripper and name matchers, `#world-info`'s literal key compile) — the same reason `escapeRegExp` lived
// here before the platform took it over. Every spelling it replaced was wrong in its own direction:
//   · `\b` is defined over ASCII `\w` REGARDLESS of the `u` flag, so a name ending in a CJK character, an
//     accented letter or an emoji has no boundary to assert at an ordinary name/space transition and the
//     match simply FAILS (`@Аня` resolved to nothing on every human turn);
//   · an ASCII-only test (`[a-z0-9]`) has the opposite failure — every non-ASCII neighbour reads as a
//     SEPARATOR, so a short Unicode name matches inside a longer Unicode word (`Аня` inside `Анятолия`);
//   · and omitting `\p{M}` makes a DECOMPOSED letter end a word: `café` written as `cafe`+U+0301 puts a
//     combining mark at the boundary, so `caféann` matched the key `ann` and `caféAnn:` had `Ann: ` cut
//     out of the middle of the word. In many scripts a mark IS part of the letter.
// CLASS BYTES, not a compiled RegExp: every consumer interpolates it into a per-name/per-key pattern, and
// the pattern must be compiled with `u` for the property escapes to mean anything. A consumer that needs
// MORE than a word character at its boundary (markdown emphasis, `_`) adds those bytes at its own site.
export const UNICODE_WORD_CHARS = "\\p{L}\\p{N}\\p{M}";

// ── byte sizes ───────────────────────────────────────────────────────────────────────────────────────
// The ONE human byte-size formatter. It had two byte-identical spellings (`@orb/ui/file-dropzone`'s cap
// hint and `features/databank`'s row subtitle) before the per-chat document rack needed a third; a pure,
// zero-I/O, zero-domain function with three consumers is a kit primitive by the placement rule, and one
// home is what keeps "24.5 KB" from becoming "24.5 KB" in one pane and "25.1 KB" in the next.

const BYTES_PER_UNIT = 1024;
const SIZE_UNITS = ["B", "KB", "MB", "GB"] as const;
const ONE_DECIMAL = 10;

// ── the numeric boundary both formatters share (#1359) ───────────────────────────────────────────────
// Every caller of both functions below hands over a SERVER-SUPPLIED count — a stored `byteSize`, a chunk
// or token tally. A non-finite value there is a bug upstream, and the un-guarded versions laundered it
// into a string that reads exactly like a real measurement ("NaN B", "Infinity GB", "-1024 B" for a
// negative that never entered the unit loop). REFUSAL, not laundering: the failure mode is `RangeError`,
// matching `@orb/kit/bounded-ring`'s existing capacity guard so the whole family fails one way.

function assertDisplayableCount(fn: string, value: number, allowNegative: boolean): void {
  if (!Number.isFinite(value) || (!allowNegative && value < 0)) {
    throw new RangeError(`${fn}: expected a finite ${allowNegative ? "" : "non-negative "}number, got ${value}`);
  }
}

/** Human byte size (binary-scale steps, one decimal, locale-agnostic): 0 B · 512 B · 24.5 KB · 3.1 MB.
 *  Sub-KB sizes stay whole (a "0.5 KB" reads worse than "512 B"); GB is the ceiling — nothing this app
 *  stores is measured in TB. Throws `RangeError` on a non-finite or negative size (no stored byte count
 *  can be either, so the value is a defect and belongs loud rather than rendered). */
export function formatBytes(bytes: number): string {
  assertDisplayableCount("formatBytes", bytes, false);
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
//
// THE REGEX GROUPS AN INTEGER RUN, NOT A NUMBER. `\B(?=(\d{3})+(?!\d))` is anchored on digit runs alone,
// so applied to the whole `String(value)` it grouped the FRACTIONAL digits too and `1234.5678` read
// `1,234.5,678` (#1359 — the one wrong-output defect in that row, and the function had no direct test at
// all). The fix is positional, not a new engine: split the sign and the fraction off, group only the
// integer run, reassemble. `.toLocaleString()`/`Intl.NumberFormat` stay banned repo-wide
// (`no-raw-intl-time` — un-memoized Intl by the back door), so the hand-rolled spelling stays.
const THOUSANDS_RE = /\B(?=(\d{3})+(?!\d))/gu;

/** Group a count for display, locale-agnostically: `1170` → `1,170`, `999` → `999`, `-1234` → `-1,234`,
 *  `1234.5678` → `1,234.5678` (the fraction is never grouped). The house separator is the comma — one
 *  convention, so a token count reads the same in the band, the save bar and the bank. Throws
 *  `RangeError` on a non-finite count, for the reason stated above {@link formatBytes}. */
export function groupThousands(value: number): string {
  assertDisplayableCount("groupThousands", value, true);
  const text = String(value);
  const negative = text.startsWith("-");
  const unsigned = negative ? text.slice(1) : text;
  const dot = unsigned.indexOf(".");
  const whole = dot === -1 ? unsigned : unsigned.slice(0, dot);
  const fraction = dot === -1 ? "" : unsigned.slice(dot);
  return `${negative ? "-" : ""}${whole.replace(THOUSANDS_RE, ",")}${fraction}`;
}

// ── dollar amounts ───────────────────────────────────────────────────────────────────────────────────
// The ONE USD formatter, lifted from the stats view-model when the connection editor's account balance
// became its second feature (AGENTS.md: a second copy of a helper is a defect). `null` is an amount nobody
// recorded, never zero, so it renders the em dash rather than `$0.00`.

const USD_PRECISION = 2;
/** Below this the two-decimal form is all zeros, so the sub-cent arm keeps four and real charges differ. */
const SUB_CENT = 0.01;
const SUB_CENT_PRECISION = 4;
const UNRECORDED_AMOUNT = "—";

/** A USD figure: `—` unrecorded · `$1.23` · `$0.0037` below a cent · `-$1.20` overspent. Throws
 *  `RangeError` on a non-finite amount, for the reason stated above {@link formatBytes}. */
export function formatUsd(amount: number | null): string {
  if (amount === null) {
    return UNRECORDED_AMOUNT;
  }
  assertDisplayableCount("formatUsd", amount, true);
  const sign = amount < 0 ? "-" : "";
  const size = Math.abs(amount);
  return `${sign}$${size > 0 && size < SUB_CENT ? size.toFixed(SUB_CENT_PRECISION) : size.toFixed(USD_PRECISION)}`;
}

// ── free labels ──────────────────────────────────────────────────────────────────────────────────────
// A user-visible name that must not collide with a sibling's: a connection label, a stored key's label.
// The suffix counts from 2 so the first copy reads as the second of its name.

/** `base` when it is free, else `base (2)`, `base (3)`… — the first spelling not in `taken`. */
export function nextFreeLabel(base: string, taken: readonly string[]): string {
  if (!taken.includes(base)) {
    return base;
  }
  let n = 2;
  while (taken.includes(`${base} (${String(n)})`)) {
    n += 1;
  }
  return `${base} (${String(n)})`;
}
