// World-info kit primitives — the const tuples, pure metadata resolvers, and keyword-matching
// helpers. Pure/isomorphic: a future client-side entry editor previews matches without a server
// roundtrip, and the server reads the same values at context-build time.
// Only leaf primitives live here — the wire schemas built on these tuples live in
// @orb/contracts/world-info and import these tuples down.

import { z } from "zod";
import { isPlainObject } from "#guards";
import type { InjectionPlacement } from "#injection";
import { injectionDirectiveSchema } from "#injection";

// Per-entry knob the user can set to force a scope independent of keys: "auto" (default) derives
// from keys.length; "always"/"keyword" force it. It's the only scope knob — entry-level pins were
// dropped in migration 0003, so there is no higher-precedence per-attachment scope to beat it.
export const ENTRY_SCOPE_MODES = ["auto", "always", "keyword"] as const;
export type EntryScopeMode = (typeof ENTRY_SCOPE_MODES)[number];

// Depth-injection (WI-at-depth) is opt-in: instead of the system-prompt half, the entry splices into
// chat history at `depth` with `role` — the shared `@orb/kit/injection` primitive. Depth 0 = at the
// tail after the new user turn.

// For always-scope entries rendering into the system half, `position` selects which WI anchor
// bucket they join. Only takes effect when the active preset has the matching anchor marker.
export const ENTRY_POSITIONS = ["before", "after"] as const;
export type EntryPosition = (typeof ENTRY_POSITIONS)[number];

/** Field-isolated read of a metadata blob — a malformed sibling field never poisons this one
 *  (read-side leniency: one bad `scopeMode` must not also drop a valid `inject`). */
function metadataField(metadata: unknown, key: string): unknown {
  if (!isPlainObject(metadata)) {
    return;
  }
  return metadata[key];
}

/** Resolve the depth-injection directive from an entry's metadata, or null when the entry renders into
 *  the system half (the default — an absent/invalid `inject`, including a missing `depth`, means "no
 *  injection"). Role defaults to `user` (world-info's own initial value; other injectors pass their own).
 *  Parses `inject` in isolation — a malformed `scopeMode` riding alongside doesn't disable it. */
export function resolveEntryInjection(metadata: unknown): InjectionPlacement | null {
  const parsed = injectionDirectiveSchema.safeParse(metadataField(metadata, "inject"));
  if (!parsed.success) {
    return null;
  }
  return { depth: parsed.data.depth, role: parsed.data.role ?? "user" };
}

/** Derive the runtime scope for a book-expansion entry. Reads the explicit override from metadata when
 *  present, otherwise falls back to the keys-presence heuristic. Parses `scopeMode` in isolation — a
 *  malformed `inject` riding alongside doesn't knock the entry back to the heuristic. */
export function resolveEntryScope(metadata: unknown, hasKeys: boolean): "always" | "keyword" {
  const parsed = z.enum(ENTRY_SCOPE_MODES).safeParse(metadataField(metadata, "scopeMode"));
  const mode = parsed.success ? parsed.data : undefined;
  if (mode === "always" || mode === "keyword") {
    return mode;
  }
  return hasKeys ? "keyword" : "always";
}

/** Which WI anchor bucket an always-scope, system-half entry joins (ST worldInfoBefore/After). Reads
 *  `metadata.position` in isolation; defaults to `before` (ST default). Only consulted when the active
 *  preset has the matching anchor marker — otherwise the entry uses default placement. */
export function resolveEntryPosition(metadata: unknown): EntryPosition {
  const parsed = z.enum(ENTRY_POSITIONS).safeParse(metadataField(metadata, "position"));
  return parsed.success ? parsed.data : "before";
}

// How an entry's keys are COMPILED: `literal` (the default — every key is `RegExp.escape`d, so a `.` is a
// period) or `regex` (the keys ARE patterns). The orb spelling of Character-Card-V3's `use_regex`, which the
// card serde normalizes into `metadata.keyMode` the way it normalizes ST `constant` into `scopeMode`.
export const ENTRY_KEY_MODES = ["literal", "regex"] as const;
export type EntryKeyMode = (typeof ENTRY_KEY_MODES)[number];

/** Resolve how an entry's keys compile, from its metadata blob. Reads `metadata.keyMode` in isolation and
 *  defaults to `literal` — the safe arm: an unreadable/absent value can only ever under-match, never turn a
 *  user's literal key into an accidental pattern. */
export function resolveEntryKeyMode(metadata: unknown): EntryKeyMode {
  const parsed = z.enum(ENTRY_KEY_MODES).safeParse(metadataField(metadata, "keyMode"));
  return parsed.success ? parsed.data : "literal";
}

// Callers lowercase both keys and haystack via locale-INDEPENDENT `.toLowerCase()` (never
// `toLocaleLowerCase()`) so server and client fold identically across platforms. (A `regex`-mode key is the
// one exception — a pattern is never folded; see `matchEntryKeys`.) The cache is keyed by MODE + key.
const KEY_REGEX_CACHE_MAX = 1024;
const keyRegexCache = new Map<string, RegExp>();

// Scripts that write WITHOUT word separators (scriptio continua) fall back to substring matching —
// a whole-word boundary would make the key unmatchable in running text (`北京` must fire inside
// `我去北京了`). Latin/Cyrillic/Greek/etc. keep whole-word boundaries.
const BOUNDARYLESS_SCRIPT = /[\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}\p{sc=Hangul}\p{sc=Thai}\p{sc=Lao}\p{sc=Khmer}\p{sc=Myanmar}\p{sc=Tibetan}]/u;

// ReDoS pre-compile heuristic for a USER-AUTHORED key pattern — the same two caps the regex-script executor
// applies (`@orb/kit/regex` `tooComplex`), restated rather than imported: pulling `@orb/kit/regex` in here
// would drag the macro engine into every consumer of these leaf primitives (contracts/world-info imports
// this module). Counts quantifier-stack OCCURRENCES, not nesting depth — defense in depth, not a guarantee.
const MAX_KEY_PATTERN_LENGTH = 2048;
const MAX_STACKED_QUANTIFIERS = 3;
function keyPatternTooComplex(pattern: string): string | null {
  if (pattern.length > MAX_KEY_PATTERN_LENGTH) {
    return `pattern length ${pattern.length} exceeds cap ${MAX_KEY_PATTERN_LENGTH}`;
  }
  const stacks = pattern.match(/[*+?}][)\]]*[*+?]/g);
  if (stacks && stacks.length >= MAX_STACKED_QUANTIFIERS) {
    return `pattern stacks ${stacks.length} quantifiers (cap ${MAX_STACKED_QUANTIFIERS})`;
  }
  return null;
}

// A regex key may be written bare (`he(llo|y)`) or in ST's delimited form (`/he(llo|y)/i`). `g`/`y` are
// STRIPPED from the author's flags: compiled keys are cached and `.test()` on a sticky/global RegExp advances
// `lastIndex`, so keeping them would make a cached key match every OTHER turn. `i` is forced on because the
// haystack reaches us already case-folded — case sensitivity is not expressible on this seam.
function parseKeyPattern(raw: string): { pattern: string; flags: string } {
  const lastSlash = raw.lastIndexOf("/");
  const delimited = raw.startsWith("/") && lastSlash > 0;
  const pattern = delimited ? raw.slice(1, lastSlash) : raw;
  const authored = delimited ? raw.slice(lastSlash + 1) : "";
  const flags = new Set([...authored.replace(/[gy]/g, ""), "i"]);
  return { pattern, flags: [...flags].join("") };
}

/** Compile the LITERAL form of a key: Unicode whole-word for spaced scripts, substring for boundary-less ones. */
function literalKeyRegex(key: string): RegExp {
  return BOUNDARYLESS_SCRIPT.test(key) ? new RegExp(RegExp.escape(key), "u") : new RegExp(`(?<![\\p{L}\\p{N}_])${RegExp.escape(key)}(?![\\p{L}\\p{N}_])`, "u");
}

/** Compile-or-return the cached RegExp for a key. `literal` (the default) escapes the key — the whole-word /
 *  boundary-less compile above. `regex` compiles the key AS a pattern (a V3 `use_regex` entry): an invalid or
 *  over-complex pattern falls back to the LITERAL compile and reports through `onCompileFailure` — a bad key
 *  must never take a turn's context build down. A failed compile is NOT cached, so the report fires per call
 *  rather than once per process lifetime. Updates the LRU position on hit so the cap doesn't evict hot keys. */
export function keyRegex(key: string, mode: EntryKeyMode = "literal", onCompileFailure?: (key: string, reason: string) => void): RegExp {
  // Mode-prefixed so the two compiles of one key never collide (`dr.` is a period literally, a wildcard as a pattern).
  const cacheKey = `${mode}\u0000${key}`;
  const existing = keyRegexCache.get(cacheKey);
  if (existing !== undefined) {
    // Touch: bump to most-recent by re-inserting at the tail. Map iteration order is insertion order,
    // so this is the cheap re-MRU.
    keyRegexCache.delete(cacheKey);
    keyRegexCache.set(cacheKey, existing);
    return existing;
  }
  let re: RegExp;
  if (mode === "regex") {
    const compiled = compileKeyPattern(key, onCompileFailure);
    if (compiled === null) {
      return literalKeyRegex(key);
    }
    re = compiled;
  } else {
    re = literalKeyRegex(key);
  }
  keyRegexCache.set(cacheKey, re);
  if (keyRegexCache.size > KEY_REGEX_CACHE_MAX) {
    const oldest = keyRegexCache.keys().next().value;
    if (oldest !== undefined) {
      keyRegexCache.delete(oldest);
    }
  }
  return re;
}

/** The guarded pattern compile — null when the key is over-complex or syntactically invalid (reported, then
 *  the caller falls back to the literal compile). */
function compileKeyPattern(key: string, onCompileFailure?: (key: string, reason: string) => void): RegExp | null {
  const { pattern, flags } = parseKeyPattern(key);
  const complexity = keyPatternTooComplex(pattern);
  if (complexity !== null) {
    onCompileFailure?.(key, complexity);
    return null;
  }
  try {
    return new RegExp(pattern, flags);
  } catch (err) {
    onCompileFailure?.(key, err instanceof Error ? err.message : String(err));
    return null;
  }
}

/** How {@link matchEntryKeys} compiles an entry's keys. `keyMode` comes from {@link resolveEntryKeyMode} off
 *  the entry's metadata; `onKeyCompileFailure` is the host's warn seam for a bad user-authored pattern (kit is
 *  pure — the caller owns the logger, as it does for the regex executor's `onScriptFailure`). */
export interface MatchEntryKeysOptions {
  readonly keyMode?: EntryKeyMode | undefined;
  readonly onKeyCompileFailure?: ((key: string, reason: string) => void) | undefined;
}

/** The keys of `keys` that match the (already lowercased) haystack. Empty array = no fire. Shared by the
 *  server's keyword scan / WI-at-depth partition and (future) the client's live entry-key preview.
 *
 *  LITERAL mode (the default) folds + trims each key and returns the FOLDED spelling. REGEX mode
 *  (a V3 `use_regex` entry) uses the key VERBATIM and returns it verbatim — folding a pattern would rewrite
 *  its escapes (`\W` → `\w` inverts the class); case-insensitivity comes from the forced `i` flag instead. */
export function matchEntryKeys(keys: readonly string[], haystack: string, options?: MatchEntryKeysOptions): string[] {
  if (options?.keyMode === "regex") {
    return keys.filter((key) => key.trim().length > 0 && keyRegex(key, "regex", options.onKeyCompileFailure).test(haystack));
  }
  return keys.map((key) => key.trim().toLowerCase()).filter((key) => key.length > 0 && keyRegex(key).test(haystack));
}

/** Build the lowercased keyword-scan haystack: recent message text + the supplied names (char +
 *  personas). ST parity (`world_info_include_names`) — keyword entries should fire when the convo is
 *  ABOUT someone, not just when the name is typed. */
export function buildKeywordHaystack(recentMessages: readonly string[], names: readonly string[]): string {
  return [...recentMessages, ...names.filter((n) => n.length > 0)].join("\n").toLowerCase();
}
