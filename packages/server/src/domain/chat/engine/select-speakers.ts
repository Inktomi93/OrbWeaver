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
//      sample order, Efraimidis-Spirakis), `pooled` (ROUND-ROBIN — least-recently-spoken first: the roster
//      rotated to start at the seat after the last speaker), `manual` (none — only forced drives it),
//      `smart` (the side-LLM path lives in `engine/smart-arbitrate`; this file sees `smart` only where the
//      turn verb did not route there — see `applyPolicy`).
//   5. Cap — `maxSpeakers` (optional) truncates the ordered result; default = all eligible.

import type { GroupConfig, SpeakerRef } from "@orb/contracts/chat";
import { speakerKey } from "@orb/contracts/chat";
import type { CharacterId } from "@orb/kit/ids";
import type { ArbiterCandidate, CastName } from "../contract/arbitration.ts";
import { isArbiterEligible } from "../persistence/participant.ts";

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

  const ordered = applyPolicy(pool, params.policy, params.rng, { eligible, lastSpeaker: params.lastSpeaker });
  return cap(
    ordered.map((c) => c.ref),
    params.maxSpeakers,
  );
}

/** What `pooled` needs beyond the (already ban-last-filtered) pool: the full eligible roster in join order
 *  and who spoke last, which together give the rotation origin. */
interface RotationState {
  readonly eligible: readonly ArbiterCandidate[];
  readonly lastSpeaker: SpeakerRef | null;
}

/**
 * `pooled` — round-robin by LEAST RECENTLY SPOKEN. The roster is a cycle; the last speaker's seat is the
 * origin, so the rotation starts at the seat AFTER it and wraps. That is the whole state the rotation needs:
 * "who spoke last" already rides every arbitration call, and one step of that cycle per round visits every
 * member before repeating any of them — including under the auto-chain's `maxSpeakers: 1`, which is exactly
 * where plain roster order degenerated into an A/B ping-pong that starved everyone after the second seat.
 * No last speaker (round 1 / after a human turn), or a last speaker who has since left/muted: nothing to
 * rotate around, so the pool keeps roster order.
 */
function pooledOrder(pool: readonly ArbiterCandidate[], state: RotationState): readonly ArbiterCandidate[] {
  if (state.lastSpeaker === null) {
    return pool;
  }
  const lastKey = speakerKey(state.lastSpeaker);
  const originIdx = state.eligible.findIndex((c) => speakerKey(c.ref) === lastKey);
  if (originIdx === -1) {
    return pool;
  }
  const poolKeys = new Set(pool.map((c) => speakerKey(c.ref)));
  const rotated = [...state.eligible.slice(originIdx + 1), ...state.eligible.slice(0, originIdx + 1)];
  return rotated.filter((c) => poolKeys.has(speakerKey(c.ref)));
}

function applyPolicy(
  pool: readonly ArbiterCandidate[],
  policy: GroupConfig["policy"],
  rng: () => number,
  rotation: RotationState,
): readonly ArbiterCandidate[] {
  switch (policy) {
    case "natural":
    // `smart` is the side-LLM path (`engine/smart-arbitrate`), which the turn verb routes a per-speaker
    // smart round to — so this arm is reached only where it did NOT: a `smart` room whose human `@mention`
    // resolved to nobody eligible (the named seat is muted/left), and a NARRATOR room, where the arbiter
    // call is short-circuited because its verdict governs nothing. No model was consulted in either case, so
    // this is a plain `natural` order, not the degrade path (the model FAILING is the degrade path, emitted
    // as `smart_arbitration_degraded` by the caller).
    case "smart":
      return weightedOrder(pool, rng);
    // `list` — roster order, all of them, every round (no rotation: that is `pooled`).
    case "list":
      return pool;
    case "pooled":
      return pooledOrder(pool, rotation);
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
  const byLongest = characters.toSorted((a, b) => b.name.length - a.name.length);
  // Longest-first with overlap masking: a longer name that matched CONSUMES its span, so a shorter name
  // nested inside it (`@Aria` within `@Aria Stormborn`) cannot fire off that span. Masking is per-SPAN, not
  // per-name: every occurrence is examined, so a later STANDALONE `@Aria` still forces her even though her
  // first occurrence was swallowed by `@Aria Stormborn`. (A single `.search()` per name dropped that
  // mention silently — the human typed it on purpose and the round fell back to policy order.)
  const found: { id: CharacterId; at: number }[] = [];
  const consumed: { at: number; end: number }[] = [];
  for (const member of byLongest) {
    if (member.name.length === 0) {
      continue;
    }
    const spans = [...triggerText.matchAll(new RegExp(`@${RegExp.escape(member.name)}\\b`, "giu"))].map((m) => ({
      at: m.index,
      end: m.index + member.name.length + 1, // include the leading `@`
    }));
    const free = spans.find((s) => !consumed.some((r) => s.at < r.end && s.end > r.at));
    if (free === undefined) {
      continue;
    }
    consumed.push(free);
    found.push({ id: member.characterId, at: free.at });
  }
  return dedupeIds(found.sort((a, b) => a.at - b.at).map((f) => f.id));
}
