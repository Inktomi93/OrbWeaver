// domain/chat/engine/smart-arbitrate — the 7b SIDE-LLM arbitration (`smart` policy). A
// request-shaper over the INJECTED `summarize` role (the same summarize/translate pattern memory uses — the
// op is `ChatContext.summarize` = `RoleClients.summarize`, NOT a sideways call; the injection table homes the
// side-LLM there, so no FLAG[missing-op]). A low-temp classify call picks the ONE next speaker from the
// eligible set; the parse is ROSTER-VALIDATING (the pick must be an eligible name) with a deterministic
// `natural` round-robin FALLBACK (§6) — so a refusal / garbled / off-roster reply, an unwired-summarizer
// throw, or a dead local box never stalls the round. The fallback is LOUD, not silent: the result carries
// `degraded:true` and the turn verb emits the `smart_arbitration_degraded` warning (D41 — a model feature
// degrades visibly or not at all).
//
// A HANG is not a failure, so the fallback cannot catch it: the turn's `AbortSignal` rides INTO the summarize
// call (every summarize-serving backend honors it), and an abort returns `aborted:true` — NOT a degrade. The
// user/host cancelled, so the caller ends the turn instead of generating on a round nobody wants.
//
// Runs ONCE per round, lock-free, metered (the caller meters the summarizer spend — §6). Solo / single-
// eligible short-circuits WITHOUT an LLM call (byte-identical, no `if(isGroup)`).

import type { SpeakerRef } from "@orb/contracts/chat";
import { speakerKey } from "@orb/contracts/chat";
import type { ArbiterCandidate, CastName, SmartArbitrationResult } from "../contract/arbitration";
import type { SummarizeOp } from "../contract/context";
import { isArbiterEligible } from "../persistence/participant";
import { selectSpeakers } from "./select-speakers";

/** The 7b inputs (file-local — the driver passes a literal). */
interface SmartArbitrateParams {
  /** The injected side-LLM (`ChatContext.summarize`). */
  readonly summarize: SummarizeOp;
  /** The present roster's character candidates (the eligible set is derived here). */
  readonly candidates: readonly ArbiterCandidate[];
  /** Display names for the candidates (id → name) — the prompt vocabulary + the roster-validating parse. */
  readonly castNames: readonly CastName[];
  /** Recent transcript text the arbiter reads to decide who speaks next. */
  readonly recentHistory: string;
  /** The previous speaker (ban-last in the fallback; the prompt notes it). */
  readonly lastSpeaker: SpeakerRef | null;
  /** The injected PRNG (D46) — drives the `natural` fallback's weighted pick. */
  readonly rng: () => number;
  /** The TURN's abort signal (the active-turn handle the verb registered). Threaded into the side-LLM call so
   *  a box that accepts the socket and never answers can be CUT LOOSE — a hang is not a failure, and without
   *  this the whole turn waits forever. No deadline rides alongside it ON PURPOSE: a 7B director on slow local
   *  hardware can legitimately take tens of seconds, so any constant would break a working small-hardware
   *  setup. Cancellation is the user's (the Stop control / the room-gone sweep), never a guessed number. */
  readonly signal?: AbortSignal | undefined;
}

/** Low temperature for a deterministic-ish classify (the side-LLM still isn't byte-deterministic — hence the
 *  validating parse + fallback). A tiny output budget — we want a name, not prose. */
const ARBITER_TEMPERATURE = 0.2;
const ARBITER_MAX_TOKENS = 24;

/** The cancelled arbitration: no speaker, no degrade. Frozen + module-level — every abort arm returns the
 *  same value, and the invariant (`aborted ⇒ [] + degraded:false`) is stated once, here, not per return. */
const CANCELLED: SmartArbitrationResult = Object.freeze({ speakers: [], degraded: false, aborted: true });

const SYSTEM_PROMPT =
  "You are a turn director for a multi-character roleplay. Read the recent conversation and the list of " +
  "characters who may speak next, then choose the single character who should speak next. Respond with " +
  "ONLY that character's exact name from the list — no punctuation, no explanation.";

/**
 * The 7b smart arbitration. Returns the ONE chosen next speaker (a single-element array) with
 * `degraded:false`, or — when the side-LLM threw or its reply doesn't validate against the eligible roster —
 * the `natural` fallback's pick with `degraded:true` (the caller surfaces that as a `warning` bus event, so
 * the user learns the order came from the math, not the model — D41). Returns `[]` only when NO character is
 * eligible (the driver maps that to `no-eligible`). Single-eligible short-circuits (no call ⇒ no degrade).
 */
export async function smartArbitrate(params: SmartArbitrateParams): Promise<SmartArbitrationResult> {
  const eligible = params.candidates.filter((c) => isArbiterEligible({ leftSeq: c.leftSeq, disabled: c.disabled }));
  if (eligible.length === 0) {
    return { speakers: [], degraded: false, aborted: false };
  }
  const nameByKey = new Map(params.castNames.map((n) => [speakerKey(n.ref), n.name] as const));
  const eligibleNamed = eligible.map((c) => ({ ref: c.ref, name: nameByKey.get(speakerKey(c.ref)) ?? "" })).filter((c) => c.name.length > 0);
  // Single eligible (or none has a resolvable name) — no LLM call needed (solo byte-identical).
  if (eligibleNamed.length <= 1) {
    return { speakers: eligibleNamed.map((c) => c.ref), degraded: false, aborted: false };
  }

  const fallback = (): SmartArbitrationResult => ({
    speakers: selectSpeakers({
      candidates: params.candidates,
      policy: "natural",
      lastSpeaker: params.lastSpeaker,
      rng: params.rng,
      maxSpeakers: 1,
    }),
    degraded: true,
    aborted: false,
  });

  // Read the signal through a CALL, never a narrowed property: `signal.aborted` flips asynchronously, so
  // tsc's control-flow narrowing after the pre-call guard would (wrongly) prove the post-call checks dead.
  const cancelled = (): boolean => params.signal?.aborted === true;

  // The turn was already cancelled before we got here — spend nothing on a round nobody is waiting for.
  if (cancelled()) {
    return CANCELLED;
  }

  const userPrompt = buildUserPrompt(
    params.recentHistory,
    eligibleNamed.map((c) => c.name),
  );
  let reply: string;
  try {
    const result = await params.summarize([{ systemPrompt: SYSTEM_PROMPT, userPrompt }], {
      temperature: ARBITER_TEMPERATURE,
      maxTokens: ARBITER_MAX_TOKENS,
      ...(params.signal !== undefined ? { signal: params.signal } : {}),
    });
    reply = result.items[0]?.text ?? "";
  } catch {
    // Two very different reasons the call didn't produce a reply, told apart by the TURN's signal — the same
    // classify-by-signal seam the engine's `abortReasonFor` uses, since the provider only ever surfaces a bare
    // AbortError. A settled signal means the caller cancelled: the round is OVER, so we return CANCELLED and
    // the verb ends the turn WITHOUT the degrade warning (the model didn't fail — the user did stop it).
    // Anything else is the side-LLM being best-effort: degrade to the deterministic fallback, never throw.
    return cancelled() ? CANCELLED : fallback();
  }
  // The reply landed but the turn was cancelled while it was in flight — same ruling: end, don't generate.
  if (cancelled()) {
    return CANCELLED;
  }

  const picked = matchEligible(reply, eligibleNamed);
  return picked === null ? fallback() : { speakers: [picked], degraded: false, aborted: false };
}

function buildUserPrompt(recentHistory: string, names: readonly string[]): string {
  const history = recentHistory.length > 0 ? recentHistory : "(the conversation is just starting)";
  return `Recent conversation:\n${history}\n\nCharacters who may speak next: ${names.join(", ")}\n\nNext speaker:`;
}

// An ASCII word character (the reply + names are already lowercased). A name is a WHOLE word only when
// neither boundary neighbour is one — so "Ari" does NOT match inside "Arianna", while name-internal
// punctuation/spaces ("Dr. Vane") stay irrelevant to the boundary test. Top-level (per-call reuse).
const WORD_CHAR = /[a-z0-9]/;
function isWordChar(ch: string | undefined): boolean {
  return ch !== undefined && WORD_CHAR.test(ch);
}

/** True when `needle` occurs in `haystack` bounded by non-word chars / string edges (whole-word). */
function includesWholeWord(haystack: string, needle: string): boolean {
  let from = haystack.indexOf(needle);
  while (from !== -1) {
    if (!(isWordChar(haystack[from - 1]) || isWordChar(haystack[from + needle.length]))) {
      return true;
    }
    from = haystack.indexOf(needle, from + 1);
  }
  return false;
}

/** Roster-validating parse: return the eligible character whose name appears in the reply (whole-word,
 *  case-insensitive; longest name first so a substring name can't pre-empt a longer one). Whole-word so an
 *  eligible name embedded in a longer word ("Ari" inside "Arianna") never false-positives (F9 — the header
 *  claimed whole-word; the impl was a bare substring). Null ⇒ no eligible name matched (→ caller falls back). */
function matchEligible(reply: string, eligible: readonly { ref: SpeakerRef; name: string }[]): SpeakerRef | null {
  const haystack = reply.toLowerCase();
  const byLongest = [...eligible].sort((a, b) => b.name.length - a.name.length);
  for (const member of byLongest) {
    if (includesWholeWord(haystack, member.name.toLowerCase())) {
      return member.ref;
    }
  }
  return null;
}
