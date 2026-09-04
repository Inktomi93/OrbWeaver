// slugifyHandle — stable character handle from a display name. Lowercase + NFKD-fold + every run of
// non-alphanumeric → a hyphen separator. Shared because both sides derive handles from names: the server's
// import pipeline collapses ST's case-variant chat dirs ("Block of Cheese" / "Block Of Cheese") onto
// one character, and the client's create flow asks for a NAME (the user's language) and derives the
// handle instead of asking for "a short slug".
//
// "ALPHANUMERIC" IS UNICODE-WIDE, and that is the security-relevant half. The classes used to be the ASCII
// ranges, so a name written wholly in Japanese, Arabic, Cyrillic or Han folded to NOTHING and every such
// character landed on the `FALLBACK_HANDLE` — which the per-owner `characters_owner_handle_unique` index
// refuses on the SECOND one, so a user importing a pack of Japanese-named cards failed at card two. A handle
// is an identity VALUE, so the fold must be total: distinct names get distinct, stable handles.
//
// SAFE FOR THE SEAMS IT REACHES because the output alphabet is exactly `\p{L}\p{N}\p{M}` plus the `-` separator:
// no `/`, `\`, `.`, quote, control or bidi-format character can survive the fold (they are not letters or
// digits), so a handle can never traverse a path, break out of the `Content-Disposition` filename it is
// never used in (that is `domain/export`'s own ASCII `slug()`), or occupy the reserved `__group__*`
// namespace (`_` is not in the alphabet either).

/** Runs of anything that is not a Unicode letter, digit or combining mark (post-fold) → a single hyphen
 *  separator. Marks are IN the alphabet because outside Latin they are letters' vowels (see below); a
 *  Latin accent has already been folded away by then, so none reaches here on an ASCII base. */
const NON_SLUG_RUN = /[^\p{L}\p{N}\p{M}]+/gu;
/** Combining marks the NFKD decomposition left ON AN ASCII BASE — dropped, so "Café" still folds onto
 *  "cafe" and a Latin name's accented and unaccented spellings stay ONE handle (the case-variant collapse
 *  this engine exists for). The lookbehind is what keeps that fold from becoming script-wide damage: in
 *  Devanagari, Thai, Hebrew and vocalised Arabic the marks ARE the vowels, so dropping them merges names
 *  that are not the same name — exactly the population this fold is supposed to serve. Their marks sit on a
 *  non-ASCII base and survive. */
const LATIN_COMBINING_MARKS = /(?<=[a-z0-9])\p{M}+/gu;
/** Leading / trailing hyphens left after the collapse — trimmed off the edges, along with a LEADING
 *  combining mark (a mark with no base character in front of it is orphaned punctuation; a trailing one is
 *  a legitimate final vowel sign and stays). */
const EDGE_HYPHENS = /^[-\p{M}]+|-+$/gu;
/** Answer for a name with nothing to fold — an EMPTY input only (`import-chat` routes on this exact value
 *  meaning "anonymous", so it stays a bare constant). A non-empty name that folds to nothing gets this plus
 *  the disambiguator below. */
const FALLBACK_HANDLE = "unnamed";
/** Length ceiling for the folded part. Well under the wire `handle` cap (200, `@orb/contracts/character` —
 *  which kit sits below and cannot import), with room for the disambiguator: NFKD can EXPAND a name several
 *  times over (one Arabic ligature decomposes into a dozen letters), so an in-bounds name can otherwise fold
 *  to an out-of-bounds handle and be refused at the create boundary. */
const MAX_FOLDED_LENGTH = 96;
// FNV-1a's constants, driving an FNV-SHAPED multiplicative hash: the disambiguator is an identity tag, never
// a security digest (nothing authenticates on it), so it only has to be pure, stable and cheap — kit is
// isomorphic and has no hash primitive below it. A genuine collision is still caught loudly by the DB's
// per-owner unique index, which is where handle uniqueness is actually decided.
const FNV_OFFSET_BASIS = 2_166_136_261;
const FNV_PRIME = 16_777_619;
const U32 = 4_294_967_296;
const U16 = 65_536;
const BASE36 = 36;

/** `(value * factor) mod 2^32`, computed on 16-bit halves. A direct `value * factor` overflows the 2^53
 *  float-exact range and loses precisely the LOW bits the modulo keeps — the hash would silently degenerate
 *  toward zero. (The repo bans bitwise operators, so this is arithmetic rather than `Math.imul`-shaped
 *  shifting.) */
function mulMod32(value: number, factor: number): number {
  const high = Math.floor(value / U16);
  const low = value % U16;
  return (((high * factor) % U16) * U16 + low * factor) % U32;
}

/** A short, stable tag derived from the WHOLE original name — what makes two names that fold to the same
 *  thing (two emoji-only names; two long names sharing a prefix) distinct handles instead of one DB
 *  constraint violation. Addition stands in for FNV's xor (no bitwise operators). */
function nameTag(name: string): string {
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < name.length; i += 1) {
    hash = mulMod32((hash + name.charCodeAt(i)) % U32, FNV_PRIME);
  }
  return hash.toString(BASE36);
}

/** A display name → its stable handle. TOTAL: every non-empty name yields a non-empty handle, and two
 *  distinct names never share one unless their letters and digits genuinely match (the case/accent-variant
 *  collapse that is this engine's job). A name whose letters and digits fold to nothing, or whose fold has to
 *  be truncated, carries a `-<tag>` disambiguator derived from the original. */
export function slugifyHandle(name: string): string {
  const folded = name.toLowerCase().normalize("NFKD").replace(LATIN_COMBINING_MARKS, "").replace(NON_SLUG_RUN, "-").replace(EDGE_HYPHENS, "");
  if (folded.length === 0) {
    // An empty name has nothing to disambiguate; anything else (emoji, punctuation, symbols) does.
    return name.length === 0 ? FALLBACK_HANDLE : `${FALLBACK_HANDLE}-${nameTag(name)}`;
  }
  if (folded.length > MAX_FOLDED_LENGTH) {
    return `${folded.slice(0, MAX_FOLDED_LENGTH).replace(EDGE_HYPHENS, "")}-${nameTag(name)}`;
  }
  return folded;
}
