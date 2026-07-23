// domain/chat/engine/select-speakers — the deterministic "who speaks this round" arbitration. Pure: given
// the present+eligible character roster, the group config (policy + per-participant talkativeness), the
// last speaker, and any human-authored forced/@-mention target → the ordered character list for the
// round. The injected PRNG (never `Math.random`) drives every weighted/random pick; the same inputs + the
// same rng sequence always yield the same order.
//
// The algorithm (read top to bottom in `selectSpeakers`):
//   1. @mention/forced hard-override — runs before any policy. Only human-authored trigger text feeds
//      this (an AI-authored `@Name` must never force a speaker).
//   2. Eligible set — present and not muted and a character (humans are not scheduled).
//   3. Ban-last-speaker (soft) — drop the last speaker from the pool; if that empties it, restore (yield
//      rather than empty). A solo roster falls out here: the pool empties → restores → re-speaks.
//   4. Policy — order/subset the pool: `list` (roster order, all), `natural` (talkativeness-weighted
//      sample order, Efraimidis-Spirakis), `pooled` (roster order, round-robin), `manual` (none — only
//      forced drives it), `smart` (side-LLM path; falls back to `natural` if reached here).
//   5. Cap — `maxSpeakers` (optional) truncates the ordered result; default = all eligible.

import type { GroupConfig, SpeakerRef } from "@orb/contracts/chat";
import { speakerKey } from "@orb/contracts/chat";
import type { CharacterId } from "@orb/kit/ids";
import { escapeRegExp } from "@orb/kit/strings";
import type { ArbiterCandidate, CastName } from "../contract/arbitration";
import { isArbiterEligible } from "../persistence/participant";

/** The arbitration inputs (file-local — callers pass a literal). */
interface SelectSpeakersParams {
  /** The full present roster's AI-driven candidates (character/agent), in roster (join) order. */
  readonly candidates: readonly ArbiterCandidate[];
  readonly policy: GroupConfig["policy"];
  /** The previous speaker (ban-last-speaker, soft); null at round 1 / after a human turn. */
  readonly lastSpeaker: SpeakerRef | null;
  /** Human-authored forced/`@-mention` targets — the hard override; empty ⇒ run the policy. `@mention`
   *  is character-only. */
  readonly forcedIds?: readonly CharacterId[] | undefined;
  /** The injected PRNG — `() => number` in [0,1). Drives `natural`'s weighted sample. */
  readonly rng: () => number;
  /** Optional per-round speaker cap. Undefined ⇒ all eligible. */
  readonly maxSpeakers?: number | undefined;
}

/** The smallest positive weight a zero/negative talkativeness collapses to (so a 0-weight member sorts last
 *  but still participates in the sample rather than dividing by zero). */
const WEIGHT_FLOOR = 1e-9;

/** Talkativeness-weighted sample without replacement (Efraimidis-Spirakis): key = u^(1/weight), sorted
 *  desc — a higher weight pulls the key toward 1, so heavier talkers tend to speak earlier. */
function weightedOrder(pool: readonly ArbiterCandidate[], rng: () => number): ArbiterCandidate[] {
  const keyed = pool.map((c, idx) => {
    const u = Math.min(Math.max(rng(), WEIGHT_FLOOR), 1);
    const weight = Math.max(c.talkativeness, WEIGHT_FLOOR);
    return { c, idx, key: u ** (1 / weight) };
  });
  keyed.sort((a, b) => b.key - a.key || a.idx - b.idx);
  return keyed.map((k) => k.c);
}

/**
 * The deterministic arbitration. Returns the ordered character ids that speak this round (empty for
 * `manual` with no forced target). Pure — the rng is the only entropy source. A roster-of-1: the soft
 * ban-last yield makes the one eligible character re-speak.
 */
export function selectSpeakers(params: SelectSpeakersParams): SpeakerRef[] {
  const eligible = params.candidates.filter((c) => isArbiterEligible({ leftSeq: c.leftSeq, disabled: c.disabled }));
  const eligibleKeys = new Set(eligible.map((c) => speakerKey(c.ref)));

  // 1. @mention/forced hard-override — before any policy; bypasses ban-last; eligible-intersected, ordered.
  const forced = (params.forcedIds ?? [])
    .map((characterId): SpeakerRef => ({ kind: "character", characterId }))
    .filter((ref) => eligibleKeys.has(speakerKey(ref)));
  if (forced.length > 0) {
    return cap(dedupe(forced), params.maxSpeakers);
  }

  // 2/3. Ban-last-speaker (soft): drop the last speaker; restore if that empties the pool.
  let pool = eligible;
  if (params.lastSpeaker !== null) {
    const lastKey = speakerKey(params.lastSpeaker);
    const banned = eligible.filter((c) => speakerKey(c.ref) !== lastKey);
    if (banned.length > 0) {
      pool = banned;
    }
  }

  const ordered = applyPolicy(pool, params.policy, params.rng);
  return cap(
    ordered.map((c) => c.ref),
    params.maxSpeakers,
  );
}

function applyPolicy(pool: readonly ArbiterCandidate[], policy: GroupConfig["policy"], rng: () => number): readonly ArbiterCandidate[] {
  switch (policy) {
    case "natural":
    // `smart` is the side-LLM path — the round driver routes it elsewhere; if it reaches the sync path
    // it degrades to `natural`.
    case "smart":
      return weightedOrder(pool, rng);
    // `list` (roster order, all) + `pooled` (round-robin — the banned last speaker is already excluded, so
    // roster order is the rotation).
    case "list":
    case "pooled":
      return pool;
    // `manual` schedules no one automatically — only a forced/@mention target speaks (handled above).
    case "manual":
      return [];
    default: {
      const _exhaustive: never = policy;
      throw new Error(`unknown arbitration policy: ${String(_exhaustive)}`);
    }
  }
}

/** Dedupe character ids (first-appearance order) — `@mention` resolution stays character-keyed. */
function dedupeIds(ids: readonly CharacterId[]): CharacterId[] {
  return [...new Set(ids)];
}

/** Dedupe speaker refs by their stable key (first-appearance order). */
function dedupe(refs: readonly SpeakerRef[]): SpeakerRef[] {
  const seen = new Set<string>();
  const out: SpeakerRef[] = [];
  for (const ref of refs) {
    const k = speakerKey(ref);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(ref);
    }
  }
  return out;
}

function cap(refs: SpeakerRef[], maxSpeakers: number | undefined): SpeakerRef[] {
  return maxSpeakers === undefined ? refs : refs.slice(0, Math.max(maxSpeakers, 0));
}

/**
 * Extract `@mention` targets from human-authored trigger text (the caller must pass a human post's body,
 * never an AI reply). Matches `@Name` against the present cast's display names (longest-name-first so
 * `@Aria Stormborn` wins over `@Aria`), word-boundary-anchored, case-insensitive.
 */
export function resolveMentions(triggerText: string, cast: readonly CastName[]): CharacterId[] {
  if (triggerText.length === 0 || cast.length === 0) {
    return [];
  }
  // @mention is character-only: only character seats resolve to a forced characterId.
  const characters = cast.map((c) => ({ characterId: c.ref.characterId, name: c.name }));
  const byLongest = [...characters].sort((a, b) => b.name.length - a.name.length);
  // Longest-first with overlap masking: a longer name that matched first CONSUMES its span, so a shorter
  // name nested inside it (`@Aria` within `@Aria Stormborn`) cannot also fire.
  const found: { id: CharacterId; at: number }[] = [];
  const consumed: { at: number; end: number }[] = [];
  for (const member of byLongest) {
    if (member.name.length === 0) {
      continue;
    }
    const at = triggerText.search(new RegExp(`@${escapeRegExp(member.name)}\\b`, "iu"));
    if (at === -1) {
      continue;
    }
    const end = at + member.name.length + 1; // include the leading `@`
    if (consumed.some((r) => at < r.end && end > r.at)) {
      continue;
    }
    consumed.push({ at, end });
    found.push({ id: member.characterId, at });
  }
  return dedupeIds(found.sort((a, b) => a.at - b.at).map((f) => f.id));
}
