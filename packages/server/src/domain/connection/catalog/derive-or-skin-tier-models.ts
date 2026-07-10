// domain/connection/catalog/derive-or-skin-tier-models — the KILL for the hardcoded OR-skin tier map that
// used to live in the agent-sdk env firewall (`env.ts`). The firewall needs the three
// `ANTHROPIC_DEFAULT_{OPUS,SONNET,HAIKU}_MODEL` envs (LOAD-BEARING: the bundled CLI can't take a
// slash-containing id as `options.model`, so a mode-2 turn maps the tier ALIASES to OR slugs via these
// envs). We DERIVE those three slugs from the two live catalogs the connection domain already holds — the
// agent-sdk daemon catalog (its `alias → resolvedModel` map) + the OpenRouter catalog id list — instead of
// pinning them (a pin goes stale the moment the daemon rolls a family forward, e.g. `sonnet` →
// `claude-sonnet-5` superseding the old `claude-sonnet-4-6`).
//
// PURE + never-throws: both catalogs are passed IN (the caller read them off the injected-clock caches), so
// this is deterministic + unit-testable, and a cold/empty catalog degrades through the fallback chain — a
// mode-2 turn must NOT die because a catalog snapshot is stale (the whole point of moving the map here).
//
// The FALLBACK CHAIN, per tier, in order:
//   (a) the daemon's `resolvedModel` for the alias, transformed to an OR slug + PRESENT in the OR id list;
//   (b) the newest same-family `anthropic/claude-<family>-*` id present in the OR list (numeric-aware
//       version compare on the version tail; the `-fast` variants are excluded);
//   (c) the curated shortlist's family pick (the sanctioned hardcode home — `chat-models.ts`), transformed;
//   (d) never absent — (c) always yields a value, so every tier resolves.

import type { AgentSdkModel } from "@orb/contracts/connection";
import type { OrSkinTierModels } from "../contract/results";
import { CHAT_MODELS } from "./chat-models";

/** A tier family key — derived from the output shape's keys (NOT a re-spelled member union): the three
 *  families the firewall envs map. `OrSkinTierModels` is the one home for this axis. */
type Tier = keyof OrSkinTierModels;

const ANTHROPIC_PREFIX = "anthropic/";
/** An 8-digit date suffix the daemon/curated ids sometimes carry (`claude-haiku-4-5-20251001`). */
const DATE_SUFFIX_RE = /-\d{8}$/u;
/** A trailing two-segment numeric version (`…-4-8`) — joined with a dot to form the OR slug (`…-4.8`). */
const TWO_SEGMENT_TAIL_RE = /-(?<major>\d+)-(?<minor>\d+)$/u;
/** Split a version tail on either separator (`4.8` / `4-5`) into its integer segments. */
const VERSION_SEP_RE = /[.-]/u;
/** OpenRouter serves throughput-optimized `-fast` variants alongside the base id — never a tier default. */
const FAST_SUFFIX = "-fast";

/**
 * Transform a daemon/curated Anthropic version id into its OpenRouter slug (verified against the live OR
 * list 2026-07-10). Rules, in order:
 *   1. strip an 8-digit date suffix   (`claude-haiku-4-5-20251001` → `claude-haiku-4-5`);
 *   2. if the id ends in two numeric segments `-N-M`, join them with a dot (`claude-opus-4-8` →
 *      `claude-opus-4.8`); a single trailing number stays as-is (`claude-sonnet-5`);
 *   3. prefix `anthropic/`.
 * An id that already carries the prefix is normalized (the prefix is stripped first, re-added last) so the
 * transform is idempotent.
 */
export function toOpenRouterSlug(id: string): string {
  const bare = id.startsWith(ANTHROPIC_PREFIX) ? id.slice(ANTHROPIC_PREFIX.length) : id;
  const dateStripped = bare.replace(DATE_SUFFIX_RE, "");
  const dotted = dateStripped.replace(TWO_SEGMENT_TAIL_RE, "-$<major>.$<minor>");
  return `${ANTHROPIC_PREFIX}${dotted}`;
}

/** The `claude-<family>-` stem an OR id must start with to be a same-family candidate for tier `t`. */
function familyStem(t: Tier): string {
  return `${ANTHROPIC_PREFIX}claude-${t}-`;
}

/** The daemon's current `resolvedModel` for a tier alias (`sonnet` → `claude-sonnet-5`), or null when no
 *  daemon row covers the alias / the row omits its resolved id (cold catalog / partial daemon report). */
function daemonResolved(tier: Tier, agentSdk: readonly AgentSdkModel[]): string | null {
  const row = agentSdk.find((m) => m.alias === tier);
  return row?.resolvedModel ?? null;
}

/** The dot-and-dash version tail of a same-family OR id (`anthropic/claude-opus-4.8` → `4.8`); the family
 *  stem is already known present by the caller. */
function versionTail(id: string, stem: string): string {
  return id.slice(stem.length);
}

/** Numeric-aware version compare on a dot/dash-separated tail — `4.10` sorts ABOVE `4.9` (segment-wise
 *  integer compare, NOT lexicographic). Returns positive when `a` is the newer version. */
function compareVersion(a: string, b: string): number {
  const as = a.split(VERSION_SEP_RE).map((s) => Number.parseInt(s, 10));
  const bs = b.split(VERSION_SEP_RE).map((s) => Number.parseInt(s, 10));
  const len = Math.max(as.length, bs.length);
  for (let i = 0; i < len; i++) {
    const av = as[i] ?? 0;
    const bv = bs[i] ?? 0;
    // NaN (a non-numeric tail segment) sorts LOW so a malformed id never wins the newest pick.
    const an = Number.isNaN(av) ? -1 : av;
    const bn = Number.isNaN(bv) ? -1 : bv;
    if (an !== bn) {
      return an - bn;
    }
  }
  return 0;
}

/** The newest same-family OR id present in the list for tier `t` (excluding `-fast` variants), or null when
 *  the OR list carries no `anthropic/claude-<t>-*` id. */
function newestFamilyInOr(tier: Tier, orIds: ReadonlySet<string>): string | null {
  const stem = familyStem(tier);
  let best: string | null = null;
  for (const id of orIds) {
    if (!id.startsWith(stem) || id.endsWith(FAST_SUFFIX)) {
      continue;
    }
    if (best === null || compareVersion(versionTail(id, stem), versionTail(best, stem)) > 0) {
      best = id;
    }
  }
  return best;
}

/** The curated shortlist's slug for a tier (fallback (c) — the sanctioned hardcode home). Every tier has
 *  exactly one curated entry (`chat-models.ts`), so this always yields a value. */
function curatedSlug(tier: Tier): string {
  const entry = CHAT_MODELS.find((m) => m.tier === tier);
  // The shortlist is a fixed 3-entry `as const`; a missing tier would be a build-time regression in
  // chat-models.ts, not a runtime case — fall through to the raw tier alias so we still emit SOMETHING.
  return entry === undefined ? `${ANTHROPIC_PREFIX}claude-${tier}` : toOpenRouterSlug(entry.id);
}

/** Resolve ONE tier's OR slug through the fallback chain (a→b→c). */
function resolveTier(
  tier: Tier,
  agentSdk: readonly AgentSdkModel[],
  orIds: ReadonlySet<string>,
): string {
  // (a) the daemon's resolved id, transformed + present in the OR list.
  const resolved = daemonResolved(tier, agentSdk);
  if (resolved !== null) {
    const slug = toOpenRouterSlug(resolved);
    if (orIds.has(slug)) {
      return slug;
    }
    // (b) the daemon named a version the OR list doesn't (yet) carry — take the newest same-family OR id.
    const newest = newestFamilyInOr(tier, orIds);
    if (newest !== null) {
      return newest;
    }
    // The OR list is cold/empty (no same-family id): fall through to the curated pick (c).
  } else {
    // No daemon row — still prefer a LIVE OR id over the curated pin when the OR list is warm.
    const newest = newestFamilyInOr(tier, orIds);
    if (newest !== null) {
      return newest;
    }
  }
  // (c) both catalogs cold for this family — the curated shortlist pick (the sanctioned hardcode home).
  return curatedSlug(tier);
}

/**
 * Derive the OR-skin tier→slug map for a mode-2 spawn from the two live catalogs. NEVER throws: an empty
 * agent-sdk catalog and/or an empty OR list degrade to the curated shortlist pick, so a mode-2 turn always
 * gets a coherent `{opus, sonnet, haiku}` (the firewall's three `ANTHROPIC_DEFAULT_*_MODEL` envs).
 */
export function deriveOrSkinTierModels(
  agentSdk: readonly AgentSdkModel[],
  orIds: readonly string[],
): OrSkinTierModels {
  const orSet = new Set(orIds);
  return {
    opus: resolveTier("opus", agentSdk, orSet),
    sonnet: resolveTier("sonnet", agentSdk, orSet),
    haiku: resolveTier("haiku", agentSdk, orSet),
  };
}
