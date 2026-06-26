// World-info kit primitives — the const tuples, the pure metadata resolvers, the ST role bimap, and
// the keyword-matching helpers. Pure / isomorphic: a future client-side entry editor previews matches
// and resolves scope/injection/position live without a server roundtrip, and the server reads the same
// values at context-build time. No DB, no domain types, no node:* — kit-purity.
//
// What lives here vs. @orb/contracts: ONLY the leaf primitives. The wire schemas built ON these tuples
// (`z.enum(...)`, book/entry create+update, the metadata write guard) live in @orb/contracts/world-info
// and import these tuples DOWN — contracts depends on kit, never the reverse (shared-dissolution §1/§5).
//
// World info is BOOKS-ONLY: books contain entries; books attach at one of four scopes and the per-turn
// pool unions all four. Per-entry behavior (always-vs-keyword via `scopeMode`, depth-injection via
// `inject`, system-half bucket via `position`) lives ON the entry in `metadata` and applies uniformly
// however the entry's book got into the pool.

import { z } from "zod";
import { isPlainObject } from "#guards";
import type { InjectionPlacement } from "#injection";
import { injectionDirectiveSchema } from "#injection";
import { escapeRegExp } from "#strings";

// ── Entry scope-mode override ──────────────────────────────────────────────
// Per-entry knob the user can set to FORCE a scope independent of keys:
//   • "auto"    (default) — derive from keys.length: 0 → always, ≥1 → keyword
//   • "always"  → force always-scope, ignore keys entirely (no scan, always renders)
//   • "keyword" → force keyword-scope (won't fire unless at least one key matches)
// It's the ONLY scope knob: entry-level pins were dropped in migration 0003, so there is no
// higher-precedence per-attachment scope to beat it.
export const ENTRY_SCOPE_MODES = ["auto", "always", "keyword"] as const;
export type EntryScopeMode = (typeof ENTRY_SCOPE_MODES)[number];

// ── Entry depth-injection (WI-at-depth) ────────────────────────────────────
// Opt-in: instead of rendering into the system-prompt half, the entry splices into the chat HISTORY at
// `depth` with `role` — the SHARED injection primitive (`@orb/kit/injection`), the same one author's
// note / persona / the card depth-prompt / memory / guided use (ledger D32). The role axis is
// `MessageRole` (`@orb/kit/message-role`); the ST numeric role bimap lives there too. World-info no
// longer owns either — it just consumes the shared shape with its own default role (`user`).
// Depth 0 = at the tail, AFTER the new user turn; N = N positions back. role:assistant + depth 0 is a
// response prefill (rejected at the contracts write schema); the read path stays lenient.

// ── Entry system-half position (ST worldInfoBefore/After) ──────────────────
// For ALWAYS-scope entries that render into the system half (i.e. NOT depth-injected), `position`
// selects which WI anchor bucket they join: `before` → the `world_info_before` marker, `after` →
// the `world_info_after` marker. Only takes effect when the active preset HAS the matching anchor
// marker; otherwise the entry falls back to the default in_static placement. Default `before`.
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

// ── World-info keyword matching ────────────────────────────────────────────
// Pure bytes-in/bytes-out. The matching shape:
//   1. Caller lowercases both the keys and the haystack via locale-INDEPENDENT `.toLowerCase()` (the
//      Unicode default case fold) — NOT `toLocaleLowerCase()`. orbweaver folds on BOTH server and
//      client ("live once, identical server+client"), so the fold must be deterministic across
//      platforms; host-locale-dependent folding (Turkish dotless-i, German ß) would let the two sides
//      produce different keys/haystacks for the same input and silently diverge on matches. We accept
//      marginally weaker per-locale fold correctness in exchange for that cross-platform determinism.
//   2. `keyRegex(key)` returns an LRU-cached RegExp using Unicode whole-word boundaries (`\p{L}` +
//      `\p{N}` + `_`). Word boundaries are case-sensitive because the caller already folded. Keys
//      containing characters from scriptio-continua scripts (Han, kana, Hangul, Thai, …) fall back to
//      SUBSTRING matching — those scripts write without spaces, so a "whole word" boundary would make
//      the key unmatchable in running text (`北京` must fire inside `我去北京了`). Mirrors ST. [V2-11/H3-7]
//   3. `matchEntryKeys(keys, haystack)` returns the matched keys (or [] if none fired).
//
// The cache is process-lifetime; the LRU cap is far above any realistic per-chat WI vocabulary but
// bounds the worst case in a long-running server cycling through many chats with distinct keys.

const KEY_REGEX_CACHE_MAX = 1024;
const keyRegexCache = new Map<string, RegExp>();

// Scripts that write WITHOUT word separators (scriptio continua). A key containing any of these can
// never whole-word match running text in its own script — the neighboring characters are always
// letters — so such keys match as substrings instead. Latin/Cyrillic/Greek/etc. keep the whole-word
// boundaries (substring matching there causes the classic "cat fires on 'category'").
const BOUNDARYLESS_SCRIPT =
  /[\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}\p{sc=Hangul}\p{sc=Thai}\p{sc=Lao}\p{sc=Khmer}\p{sc=Myanmar}\p{sc=Tibetan}]/u;

/** Compile-or-return the cached RegExp for a lowercased key: Unicode whole-word for spaced scripts,
 *  substring for boundary-less scripts (see header §2). Updates the LRU position on hit so the cap
 *  doesn't evict hot keys. */
export function keyRegex(key: string): RegExp {
  const existing = keyRegexCache.get(key);
  if (existing !== undefined) {
    // Touch: bump to most-recent by re-inserting at the tail. Map iteration order is insertion order,
    // so this is the cheap re-MRU.
    keyRegexCache.delete(key);
    keyRegexCache.set(key, existing);
    return existing;
  }
  const re = BOUNDARYLESS_SCRIPT.test(key)
    ? new RegExp(escapeRegExp(key), "u")
    : new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRegExp(key)}(?![\\p{L}\\p{N}_])`, "u");
  keyRegexCache.set(key, re);
  if (keyRegexCache.size > KEY_REGEX_CACHE_MAX) {
    const oldest = keyRegexCache.keys().next().value;
    if (oldest !== undefined) {
      keyRegexCache.delete(oldest);
    }
  }
  return re;
}

/** The keys (lowercased + trimmed) of `keys` that whole-word match the (already lowercased) haystack.
 *  Empty array = no fire. Shared by the server's keyword scan / WI-at-depth partition and (future) the
 *  client's live entry-key preview. */
export function matchEntryKeys(keys: readonly string[], haystack: string): string[] {
  return keys
    .map((key) => key.trim().toLowerCase())
    .filter((key) => key.length > 0 && keyRegex(key).test(haystack));
}

/** Build the lowercased keyword-scan haystack: recent message text + the supplied names (char +
 *  personas). ST parity (`world_info_include_names`) — keyword entries should fire when the convo is
 *  ABOUT someone, not just when the name is typed. */
export function buildKeywordHaystack(
  recentMessages: readonly string[],
  names: readonly string[],
): string {
  return [...recentMessages, ...names.filter((n) => n.length > 0)].join("\n").toLowerCase();
}
