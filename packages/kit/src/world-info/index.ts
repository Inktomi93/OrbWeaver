// World-info kit primitives — the const tuples, pure metadata resolvers, and keyword-matching
// helpers. Pure/isomorphic: a future client-side entry editor previews matches without a server
// roundtrip, and the server reads the same values at context-build time.
// Only leaf primitives live here — the wire schemas built on these tuples live in
// @orb/contracts/world-info and import these tuples down.

import { z } from "zod";
import { isPlainObject } from "#guards";
import type { InjectionPlacement } from "#injection";
import { injectionDirectiveSchema } from "#injection";
import { escapeRegExp } from "#strings";

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

// Callers lowercase both keys and haystack via locale-INDEPENDENT `.toLowerCase()` (never
// `toLocaleLowerCase()`) so server and client fold identically across platforms.
const KEY_REGEX_CACHE_MAX = 1024;
const keyRegexCache = new Map<string, RegExp>();

// Scripts that write WITHOUT word separators (scriptio continua) fall back to substring matching —
// a whole-word boundary would make the key unmatchable in running text (`北京` must fire inside
// `我去北京了`). Latin/Cyrillic/Greek/etc. keep whole-word boundaries.
const BOUNDARYLESS_SCRIPT =
  /[\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}\p{sc=Hangul}\p{sc=Thai}\p{sc=Lao}\p{sc=Khmer}\p{sc=Myanmar}\p{sc=Tibetan}]/u;

/** Compile-or-return the cached RegExp for a lowercased key: Unicode whole-word for spaced scripts,
 *  substring for boundary-less scripts. Updates the LRU position on hit so the cap doesn't evict hot keys. */
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
