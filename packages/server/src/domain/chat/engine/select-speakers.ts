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
//      rather than empty). A solo roster falls out here: the pool empties → restores → re-speaks. SKIPPED
//      when `banLast:false` (the room's `allowSelfResponses`, or a `natural` round answering a live human —
//      the caller decides, `verbs/turn.ts::banLastFor`): it governs ELIGIBILITY only, and step 4 still reads
//      `lastSpeaker` as its rotation origin.
//   4. Policy — order/subset the pool: `list` (roster order, all), `natural` (ACTIVATION: the pool members
//      the human named as a plain word first, then every member whose talkativeness roll passes, in a
//      shuffled order; nobody activated ⇒ one random member — see `naturalOrder`), `pooled` (ROUND-ROBIN —
//      least-recently-spoken first: the roster rotated to start at the seat after the last speaker),
//      `manual` (none — only forced drives it), `smart` (the side-LLM path lives in `engine/smart-arbitrate`;
//      this file sees `smart` only where the turn verb did not route there — see `applyPolicy`).
//   5. Dedupe, then cap — `maxSpeakers` (optional) truncates the ordered result; default = all activated.

import type { GroupConfig, SpeakerRef } from "@orb/contracts/chat";
import { speakerKey } from "@orb/contracts/chat";
import type { CharacterId } from "@orb/kit/ids";
import { NAME_END_BOUNDARY } from "@orb/kit/speaker-label";
import { UNICODE_WORD_CHARS } from "@orb/kit/strings";
import type { ArbiterCandidate, SpeakerCandidate, TranscriptLine } from "../contract/arbitration.ts";
import { isArbiterEligible } from "../persistence/participant.ts";

/** The arbitration inputs (file-local — callers pass a literal). */
interface SelectSpeakersParams {
  /** The full present roster's AI-driven candidates (character/agent), in roster (join) order. */
  readonly candidates: readonly ArbiterCandidate[];
  readonly policy: GroupConfig["policy"];
  /** The previous AI speaker; null before any character has spoken. TWO independent jobs ride this one value —
   *  the soft ban-last-speaker (step 3) and the `pooled` ROTATION ORIGIN (step 4) — which is why the ban is
   *  lifted by {@link SelectSpeakersParams.banLast}, never by nulling this. */
  readonly lastSpeaker: SpeakerRef | null;
  /** Whether the last speaker is banned from the pool this round (soft — see step 3). Default TRUE; the
   *  caller passes `false` for a room that allows self-responses or a `natural` round answering a live human
   *  (`verbs/turn.ts::banLastFor`). It is an ELIGIBILITY question and nothing else: a
   *  room that lets a character reply to itself still rotates, so lifting the ban must not cost the
   *  rotation origin (nulling `lastSpeaker` to lift it made `pooled` re-pick the first roster seat every
   *  beat — a "Round-robin" room in which one character monologued). */
  readonly banLast?: boolean | undefined;
  /** Human-authored forced/`@-mention` targets — the hard override; empty ⇒ run the policy. `@mention`
   *  is character-only. */
  readonly forcedIds?: readonly CharacterId[] | undefined;
  /** Characters the human-authored trigger text names as a plain word ({@link resolveNameMentions}), in
   *  mention order. A SOFT activation read by `natural` only: unlike `forcedIds` it runs inside the policy, so
   *  ban-last and the eligible set still apply and the talkativeness rolls still add speakers after them. */
  readonly mentionedIds?: readonly CharacterId[] | undefined;
  /** The injected PRNG — `() => number` in [0,1). Drives `natural`'s shuffle, rolls and fallback pick. */
  readonly rng: () => number;
  /** Optional per-round speaker cap. Undefined ⇒ all activated. */
  readonly maxSpeakers?: number | undefined;
}

/** A uniform shuffle off the injected rng: one random sort key per item (index breaks a tie). */
function shuffled<T>(items: readonly T[], rng: () => number): T[] {
  return items
    .map((item, idx) => ({ item, idx, key: rng() }))
    .toSorted((a, b) => a.key - b.key || a.idx - b.idx)
    .map((k) => k.item);
}

/**
 * `natural` — who is ACTIVATED this round, not an order over everyone:
 *   a. the pool members the human named as a plain word, in mention order;
 *   b. then, walking the pool in a shuffled order, each member whose roll passes (`talkativeness >= rng()`),
 *      so talkativeness is each member's chance to speak up on their own;
 *   c. nobody activated ⇒ ONE random member, drawn from those with talkativeness above 0 when any exist.
 * A member both named and rolled appears twice here; the caller's dedupe keeps the first (the mention).
 */
function naturalOrder(pool: readonly ArbiterCandidate[], mentionedIds: readonly CharacterId[], rng: () => number): ArbiterCandidate[] {
  const byKey = new Map(pool.map((c) => [speakerKey(c.ref), c] as const));
  const mentioned = mentionedIds.flatMap((characterId) => {
    const c = byKey.get(speakerKey({ kind: "character", characterId }));
    return c === undefined ? [] : [c];
  });
  const rolled: ArbiterCandidate[] = [];
  for (const c of shuffled(pool, rng)) {
    if (c.talkativeness >= rng()) {
      rolled.push(c);
    }
  }
  const activated = [...mentioned, ...rolled];
  if (activated.length > 0) {
    return activated;
  }
  const chatty = pool.filter((c) => c.talkativeness > 0);
  const from = chatty.length > 0 ? chatty : pool;
  // An empty pool (everyone muted or gone) draws `undefined` here and schedules nobody.
  const pick = from[Math.floor(rng() * from.length)];
  return pick === undefined ? [] : [pick];
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

  // 2/3. Ban-last-speaker (soft): drop the last speaker; restore if that empties the pool. Skipped entirely
  // when the room allows self-responses — the ROTATION below still reads `lastSpeaker` as its origin.
  let pool = eligible;
  if (params.lastSpeaker !== null && params.banLast !== false) {
    const lastKey = speakerKey(params.lastSpeaker);
    const banned = eligible.filter((c) => speakerKey(c.ref) !== lastKey);
    if (banned.length > 0) {
      pool = banned;
    }
  }

  const ordered = applyPolicy(pool, params.policy, params.rng, {
    rotation: { eligible, lastSpeaker: params.lastSpeaker },
    mentionedIds: params.mentionedIds ?? [],
  });
  return cap(dedupe(ordered.map((c) => c.ref)), params.maxSpeakers);
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
  state: { readonly rotation: RotationState; readonly mentionedIds: readonly CharacterId[] },
): readonly ArbiterCandidate[] {
  switch (policy) {
    case "natural":
    // `smart` is the picker path (`engine/rerank-pick`, `engine/smart-arbitrate`), which the turn verb routes a
    // per-speaker smart round to, including one whose `@mention` named only a muted or departed seat. So this
    // arm is reached only in a NARRATOR room, where the pick is short-circuited because its verdict governs
    // nothing. No model was consulted, so this is a plain `natural` activation, not the degrade path.
    case "smart":
      return naturalOrder(pool, state.mentionedIds, rng);
    // `list` — roster order, all of them, every round (no rotation: that is `pooled`).
    case "list":
      return pool;
    case "pooled":
      return pooledOrder(pool, state.rotation);
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
 * never an AI reply). Matches `@Name` against the present characters' display names (longest-name-first so
 * `@Aria Stormborn` wins over `@Aria`), case-insensitive, and bounded by the shared UNICODE name class
 * (`@orb/kit/speaker-label::NAME_END_BOUNDARY`) rather than `\b` — see the call site.
 */
export function resolveMentions(triggerText: string, candidates: readonly SpeakerCandidate[]): CharacterId[] {
  if (triggerText.length === 0 || candidates.length === 0) {
    return [];
  }
  // @mention is character-only: only character seats resolve to a forced characterId.
  const characters = candidates.map((c) => ({ characterId: c.ref.characterId, name: c.name }));
  const byLongest = characters.toSorted((a, b) => b.name.length - a.name.length);
  // Longest-first with overlap masking: a longer name that matched CONSUMES its spans, so a shorter name
  // nested inside one (`@Aria` within `@Aria Stormborn`) cannot fire off it. EVERY free span of a matched
  // name is consumed, not just the first one it claimed — a human who emphasises a character by naming her
  // twice ("@Aria Stormborn … @Aria Stormborn again") otherwise left the second occurrence unmasked, and
  // the nested shorter name matched inside it: a second, never-named character forced into the round.
  // Masking is per-NAME; SELECTION is still per-occurrence, so a later STANDALONE `@Aria` (a span no longer
  // name covers) still forces her even though her first occurrence was swallowed by `@Aria Stormborn`. (A
  // single `.search()` per name dropped that mention silently — the human typed it on purpose and the round
  // fell back to policy order.)
  const found: { id: CharacterId; at: number }[] = [];
  const consumed: { at: number; end: number }[] = [];
  for (const member of byLongest) {
    if (member.name.length === 0) {
      continue;
    }
    // The right boundary is the SHARED Unicode name class (#1439), never `\b`: `\b` is defined over ASCII
    // `\w` even under `u`, so `@Аня ` (Cyrillic) or `@結衣 ` had no letter→non-letter transition to assert
    // and the mention silently did not resolve — on every human turn. The leading `@` is the left boundary.
    const spans = [...triggerText.matchAll(new RegExp(`@${RegExp.escape(member.name)}${NAME_END_BOUNDARY}`, "giu"))].map((m) => ({
      at: m.index,
      end: m.index + member.name.length + 1, // include the leading `@`
    }));
    const free = spans.filter((s) => !consumed.some((r) => s.at < r.end && s.end > r.at));
    const first = free[0];
    if (first === undefined) {
      continue;
    }
    consumed.push(...free);
    found.push({ id: member.characterId, at: first.at });
  }
  return dedupeIds(found.sort((a, b) => a.at - b.at).map((f) => f.id));
}

/** One word: a run of the shared Unicode word class, so `Аня` and `Chloé` split the way `Bran` does.
 *  Splitting needs a separator: in unspaced text (Japanese, Chinese) a name glued to the next word, as in
 *  `結衣さん`, is one longer word and does not name `結衣`. */
const WORD = new RegExp(`[${UNICODE_WORD_CHARS}]+`, "gu");

// NFC first, so a decomposed `Chloé` (e + combining accent) and a composed one are the same word.
function wordsOf(text: string): string[] {
  return text.normalize("NFC").toLowerCase().match(WORD) ?? [];
}

/** Name words that never name a character on their own. Nearly every message contains them, so a name like
 *  "The Knight" or "Lady of the Lake" would otherwise answer every message. Lowercase, compared per word. */
export const NAME_STOPWORDS = [
  "a",
  "an",
  "the",
  "and",
  "or",
  "but",
  "of",
  "to",
  "in",
  "on",
  "at",
  "for",
  "from",
  "with",
  "by",
  "as",
  "is",
  "it",
  "i",
  "me",
  "my",
  "you",
  "your",
  "we",
  "our",
  "he",
  "his",
  "she",
  "her",
  "they",
  "their",
  "its",
] as const;

// A one-letter name word never names on its own either: an apostrophe splits `T'Pol` into `t` + `pol` and
// `don't` into `don` + `t`, so `t` would make every "don't" name T'Pol.
function isNonNaming(word: string): boolean {
  return [...word].length === 1 || NAME_STOPWORDS.some((s) => s === word);
}

/** Where `seq` first occurs as consecutive words of `words`, or -1. */
function phraseAt(words: readonly string[], seq: readonly string[]): number {
  if (seq.length === 0) {
    return -1;
  }
  return words.findIndex((_, start) => seq.every((w, k) => words[start + k] === w));
}

/**
 * Characters a trigger text names. `natural`'s mention activation passes a human post's body only; Smart's
 * reranker pick (`rerank-pick.ts`) passes the last line whoever wrote it, since a character handing the floor
 * to another by name is exactly the address it reads. A character is named when any word of the text equals a non-stopword
 * word of their display name, case-insensitive, so "Aria" and "stormborn" both name `Aria Stormborn`, "knight"
 * names `The Knight` and "the" does not, and one word shared by two names names both. One-letter words never
 * name, so "I don't" does not name `T'Pol`. A name made only of {@link NAME_STOPWORDS} and one-letter words is
 * named by its whole name as a phrase. Ordered by where each is first named, then roster order.
 */
export function resolveNameMentions(triggerText: string, candidates: readonly SpeakerCandidate[]): CharacterId[] {
  return nameMentionHits(triggerText, candidates).map((f) => f.id);
}

/** Each named character with the word index where it is first named, in {@link resolveNameMentions} order. */
function nameMentionHits(triggerText: string, candidates: readonly SpeakerCandidate[]): { readonly id: CharacterId; readonly at: number }[] {
  const text = wordsOf(triggerText);
  const found = candidates.flatMap((c, rosterIdx) => {
    const nameWords = wordsOf(c.name);
    const keys = new Set(nameWords.filter((w) => !isNonNaming(w)));
    const at = keys.size > 0 ? text.findIndex((w) => keys.has(w)) : phraseAt(text, nameWords);
    return at === -1 ? [] : [{ id: c.ref.characterId, at, rosterIdx }];
  });
  return found.sort((a, b) => a.at - b.at || a.rosterIdx - b.rosterIdx);
}

/** The most responders a Smart pick schedules in one round, however many the line or the model named. */
export const MAX_SMART_RESPONDERS = 3;

/**
 * Who a canon line addresses by name, for both Smart pickers' mention short-circuit: the ELIGIBLE characters it
 * names, whoever wrote it, as ordered groups. A group is the characters one word named, so a word two names
 * share ("Knight" in "The Knight" and "The Black Knight") is ONE ambiguous group the caller resolves. A muted
 * or departed character is dropped rather than scheduled, and a line's speaker naming itself is no address.
 */
export function addressedGroups(
  line: TranscriptLine,
  candidates: readonly ArbiterCandidate[],
  speakerCandidates: readonly SpeakerCandidate[],
): CharacterId[][] {
  const eligible = new Set(candidates.filter((c) => isArbiterEligible({ leftSeq: c.leftSeq, disabled: c.disabled })).map((c) => speakerKey(c.ref)));
  const groups = new Map<number, CharacterId[]>();
  for (const hit of nameMentionHits(line.text, speakerCandidates)) {
    if (hit.id === line.characterId || !eligible.has(speakerKey({ kind: "character", characterId: hit.id }))) {
      continue;
    }
    const group = groups.get(hit.at);
    if (group === undefined) {
      groups.set(hit.at, [hit.id]);
    } else {
      group.push(hit.id);
    }
  }
  return [...groups.values()];
}
