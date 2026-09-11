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
import type { ProseOverrides } from "@orb/contracts/prose";
import { resolveProseText } from "@orb/contracts/prose";
import type { SummarizeOptions } from "@orb/contracts/role-clients";
import { includesWholeName } from "@orb/kit/speaker-label";
import type { ArbiterCandidate, SmartArbitrationResult, SpeakerCandidate } from "../contract/arbitration.ts";
import type { SummarizeOp } from "../contract/context.ts";
import { isArbiterEligible } from "../persistence/participant.ts";
import { selectSpeakers } from "./select-speakers.ts";

/** The 7b inputs (file-local — the driver passes a literal). */
interface SmartArbitrateParams {
  /** The injected side-LLM (`ChatContext.summarize`). */
  readonly summarize: SummarizeOp;
  /** The present roster's character candidates (the eligible set is derived here). */
  readonly candidates: readonly ArbiterCandidate[];
  /** Display names for the candidates (id → name) — the prompt vocabulary + the roster-validating parse. */
  readonly speakerCandidates: readonly SpeakerCandidate[];
  /** Recent transcript text the arbiter reads to decide who speaks next. */
  readonly recentHistory: string;
  /** The previous speaker (the fallback's ban-last AND its rotation origin). */
  readonly lastSpeaker: SpeakerRef | null;
  /** Whether the fallback bans the last speaker (the room's `allowSelfResponses`, inverted). Default TRUE —
   *  forwarded verbatim to `selectSpeakers`, which keeps the ban and the rotation origin separate. */
  readonly banLast?: boolean | undefined;
  /** The injected PRNG (D46) — drives the `natural` fallback's weighted pick. */
  readonly rng: () => number;
  /** The ROOM HOST's prose overrides (PROSE-1 census row 75, `chat.arbiter.system`), resolved by the caller
   *  off `ctx.resolveChatProse`. Empty ⇒ the shipped arbiter prompt, byte-identical. */
  readonly prose: ProseOverrides;
  /** The resolved side-gen sampling options (the `arbiter` floor ← the chat host's preset params), mapped to
   *  the summarize seam's `{temperature, maxTokens}` at compose. A tiny output budget — we want a name, not
   *  prose — but a user's preset params can now widen it. Absent knobs fall to the runner default. */
  readonly sampling: SummarizeOptions;
  /** The TURN's abort signal (the active-turn handle the verb registered). Threaded into the side-LLM call so
   *  a box that accepts the socket and never answers can be CUT LOOSE — a hang is not a failure, and without
   *  this the whole turn waits forever. No deadline rides alongside it ON PURPOSE: a 7B arbiter on slow local
   *  hardware can legitimately take tens of seconds, so any constant would break a working small-hardware
   *  setup. Cancellation is the user's (the Stop control / the room-gone sweep), never a guessed number. */
  readonly signal?: AbortSignal | undefined;
}

/** The cancelled arbitration: no speaker, no degrade. Frozen + module-level — every abort arm returns the
 *  same value, and the invariant (`aborted ⇒ [] + degraded:false`) is stated once, here, not per return. */
const CANCELLED: SmartArbitrationResult = Object.freeze({ speakers: [], degraded: false, aborted: true });

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
  const nameByKey = new Map(params.speakerCandidates.map((n) => [speakerKey(n.ref), n.name] as const));
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
      ...(params.banLast !== undefined ? { banLast: params.banLast } : {}),
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
  // @orb-waive caught-failure-ownership(catch): classified below by signal state — a settled
  // signal returns CANCELLED (the user stopped it, not a failure); anything else degrades to the
  // deterministic `fallback()`, the consumed result the side-LLM's best-effort contract promises. Ends if
  // the arbiter becomes load-bearing (then a failure must surface, not fall back).
  try {
    const result = await params.summarize([{ systemPrompt: resolveProseText("chat.arbiter.system", params.prose), userPrompt }], {
      ...params.sampling,
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

/** Roster-validating parse: return the eligible character whose name appears in the reply (whole-word,
 *  case-insensitive; longest name first so a substring name can't pre-empt a longer one). Whole-word so an
 *  eligible name embedded in a longer word ("Ari" inside "Arianna") never false-positives (F9 — the header
 *  claimed whole-word; the impl was a bare substring). Null ⇒ no eligible name matched (→ caller falls back).
 *
 *  The boundary test is the SHARED kit one (#1439). The local copy it replaced tested `[a-z0-9]`, which
 *  read every non-ASCII character as a separator — so a short Cyrillic or CJK name embedded in a longer
 *  Cyrillic or CJK word reported a whole-word hit and the arbiter picked a speaker the model never named.
 *  Same root cause, opposite symptom, as the `\b` miss in `select-speakers::resolveMentions`. */
function matchEligible(reply: string, eligible: readonly { ref: SpeakerRef; name: string }[]): SpeakerRef | null {
  const haystack = reply.toLowerCase();
  const byLongest = eligible.toSorted((a, b) => b.name.length - a.name.length);
  for (const member of byLongest) {
    if (includesWholeName(haystack, member.name.toLowerCase())) {
      return member.ref;
    }
  }
  return null;
}
