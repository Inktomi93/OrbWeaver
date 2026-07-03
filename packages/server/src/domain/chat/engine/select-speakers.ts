// domain/chat/engine/select-speakers — the 7a DETERMINISTIC "who speaks this round" arbitration. PURE: given
// the present+eligible character roster, the group config (policy + per-participant
// talkativeness), the last speaker, and any human-authored forced/@-mention target → the ORDERED character
// list for the round. The injected PRNG (D46 — never `Math.random`) drives every weighted/random pick; the
// same inputs + the same rng sequence ALWAYS yield the same order.
//
// THE ALGORITHM (read top to bottom in `selectSpeakers`):
//   1. @mention / forced HARD-OVERRIDE — runs BEFORE any policy (§6). Returns the forced ids (intersected
//      with the eligible set, in the given order); bypasses ban-last (an explicit @mention of the last
//      speaker is honored). ONLY human-authored trigger text feeds this (the caller passes the ids — an
//      AI-authored `@Name` must NEVER force a speaker, §12 inv 6; `resolveMentions` is the human-text seam).
//   2. ELIGIBLE SET — present AND not muted AND a character (`isArbiterEligible`; humans are NOT scheduled).
//   3. BAN-LAST-SPEAKER (soft) — drop the last speaker from the pool; if that EMPTIES it, restore (yield
//      rather than empty — §6). Solo (one eligible char == the last speaker) falls out here: the pool empties
//      → restores → the one character re-speaks. NO `if(isGroup)` (D16).
//   4. POLICY — order/subset the pool: `list` (roster order, all) · `natural` (talkativeness-weighted sample
//      order, all — Efraimidis-Spirakis via the rng; NOT ST's independent per-member coin-flip) · `pooled`
//      (roster order, round-robin — last already excluded) · `manual` (none — only forced drives it) ·
//      `smart` (the side-LLM 7b path; routed away by the driver — falls back to `natural` if reached here).
//   5. CAP — `maxSpeakers` (optional) truncates the ordered result (the per-round count is the caller's; the
//      GroupConfig carries NO max-speakers-per-round field — FLAGGED; default = all eligible).

import type { GroupConfig, SpeakerRef } from "@orb/contracts/chat";
import { speakerKey } from "@orb/contracts/chat";
import type { CharacterId } from "@orb/kit/ids";
import { escapeRegExp } from "@orb/kit/strings";
import type { ArbiterCandidate, CastName } from "../contract/arbitration";
import { isArbiterEligible } from "../persistence/participant";

/** The 7a inputs (file-local — callers pass a literal; the shared candidate/cast types live in contract/). */
interface SelectSpeakersParams {
  /** The full present roster's AI-driven candidates (character/agent), in roster (join) order. */
  readonly candidates: readonly ArbiterCandidate[];
  /** The room's arbitration policy (`GroupConfig.policy`). */
  readonly policy: GroupConfig["policy"];
  /** The previous speaker (ban-last-speaker, soft); null at round 1 / after a human turn. */
  readonly lastSpeaker: SpeakerRef | null;
  /** Human-authored forced/`@-mention` targets — the HARD override (§6); empty ⇒ run the policy. `@mention` is
   *  character-only (human text matches cast names to characters; an agent is not `@mention-forceable` in v1). */
  readonly forcedIds?: readonly CharacterId[] | undefined;
  /** The injected PRNG (D46) — `() => number` in [0,1). Drives `natural`'s weighted sample. */
  readonly rng: () => number;
  /** Optional per-round speaker cap (the count is the caller's — see header). Undefined ⇒ all eligible. */
  readonly maxSpeakers?: number | undefined;
}

/** The smallest positive weight a zero/negative talkativeness collapses to (so a 0-weight member sorts last
 *  but still participates in the sample rather than dividing by zero). */
const WEIGHT_FLOOR = 1e-9;

/** Talkativeness-weighted sample WITHOUT replacement (Efraimidis-Spirakis): key = u^(1/weight), sorted
 *  DESC — a higher weight pulls the key toward 1, so heavier talkers tend to speak earlier. Deterministic
 *  given `rng` (one draw per candidate, consumed in candidate order). The input order breaks ties. */
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
 * The 7a deterministic arbitration. Returns the ORDERED character ids that speak this
 * round (empty for `manual` with no forced target). PURE — the rng is the only entropy source (D46). Solo =
 * a roster-of-1: the soft ban-last yield makes the one eligible character re-speak with NO `if(isGroup)`.
 */
export function selectSpeakers(params: SelectSpeakersParams): SpeakerRef[] {
  const eligible = params.candidates.filter((c) =>
    isArbiterEligible({ leftSeq: c.leftSeq, disabled: c.disabled }),
  );
  const eligibleKeys = new Set(eligible.map((c) => speakerKey(c.ref)));

  // 1. @mention / forced HARD-OVERRIDE — before any policy; bypasses ban-last; eligible-intersected, ordered.
  // Forced targets are character ids (human @mention is character-only); wrap them as character refs.
  const forced = (params.forcedIds ?? [])
    .map((characterId): SpeakerRef => ({ kind: "character", characterId }))
    .filter((ref) => eligibleKeys.has(speakerKey(ref)));
  if (forced.length > 0) {
    return cap(dedupe(forced), params.maxSpeakers);
  }

  // 2/3. BAN-LAST-SPEAKER (soft): drop the last speaker; restore if that empties the pool (yield, never empty).
  let pool = eligible;
  if (params.lastSpeaker !== null) {
    const lastKey = speakerKey(params.lastSpeaker);
    const banned = eligible.filter((c) => speakerKey(c.ref) !== lastKey);
    if (banned.length > 0) {
      pool = banned;
    }
  }

  // 4. POLICY — order/subset the pool.
  const ordered = applyPolicy(pool, params.policy, params.rng);
  return cap(
    ordered.map((c) => c.ref),
    params.maxSpeakers,
  );
}

function applyPolicy(
  pool: readonly ArbiterCandidate[],
  policy: GroupConfig["policy"],
  rng: () => number,
): readonly ArbiterCandidate[] {
  switch (policy) {
    case "natural":
    // `smart` is the 7b side-LLM path — the round driver routes it to `smart-arbitrate`; if it reaches the
    // sync path it degrades to `natural` (the contract's documented fallback "until wired").
    case "smart":
      return weightedOrder(pool, rng);
    // `list` (roster order, all) + `pooled` (round-robin — the banned last speaker is already excluded, so
    // roster order IS the rotation). The full in-memory `pooled` round state is an auto-mode concern (§6 —
    // abandon-in-flight-on-boot); the stateless rotation here is ban-last + roster order. FLAGGED.
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
 * Extract `@mention` targets from HUMAN-AUTHORED trigger text (only human text drives the override; the caller
 * MUST pass a human post's body, NEVER an AI reply). Matches `@Name`
 * against the present cast's display names (longest-name-first so `@Aria Stormborn` wins over `@Aria`),
 * word-boundary-anchored, case-insensitive. Returns the matched character ids in first-appearance order.
 * PURE; uses the ONE `escapeRegExp` (`@orb/kit/strings` — the de-duplicated home, movement table).
 */
export function resolveMentions(triggerText: string, cast: readonly CastName[]): CharacterId[] {
  if (triggerText.length === 0 || cast.length === 0) {
    return [];
  }
  // @mention is character-only (§6): only character seats resolve to a forced characterId.
  const characters = cast.flatMap((c) =>
    c.ref.kind === "character" ? [{ characterId: c.ref.characterId, name: c.name }] : [],
  );
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
