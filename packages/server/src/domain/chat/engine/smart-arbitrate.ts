// domain/chat/engine/smart-arbitrate — the 7b SIDE-LLM arbitration (chat.md Part III §6 `smart` policy). A
// request-shaper over the INJECTED `summarize` role (the same summarize/translate pattern memory uses — the
// op is `ChatContext.summarize` = `RoleClients.summarize`, NOT a sideways call; the injection table homes the
// side-LLM there, so no FLAG[missing-op]). A low-temp classify call picks the ONE next speaker from the
// eligible set; the parse is ROSTER-VALIDATING (the pick must be an eligible name) with a deterministic
// `natural` round-robin FALLBACK (§6) — so a refusal / garbled / off-roster reply never stalls the round.
//
// Runs ONCE per round, lock-free, metered (the caller meters the summarizer spend — §6). Solo / single-
// eligible short-circuits WITHOUT an LLM call (byte-identical, no `if(isGroup)`).

import type { CharacterId } from "@orb/kit/ids";
import type { ArbiterCandidate, CastName } from "../contract/arbitration";
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
  readonly lastSpeakerId: CharacterId | null;
  /** The injected PRNG (D46) — drives the `natural` fallback's weighted pick. */
  readonly rng: () => number;
}

/** Low temperature for a deterministic-ish classify (the side-LLM still isn't byte-deterministic — hence the
 *  validating parse + fallback). A tiny output budget — we want a name, not prose. */
const ARBITER_TEMPERATURE = 0.2;
const ARBITER_MAX_TOKENS = 24;

const SYSTEM_PROMPT =
  "You are a turn director for a multi-character roleplay. Read the recent conversation and the list of " +
  "characters who may speak next, then choose the single character who should speak next. Respond with " +
  "ONLY that character's exact name from the list — no punctuation, no explanation.";

/**
 * The 7b smart arbitration. Returns the ONE chosen next speaker (a single-element array), or the `natural`
 * fallback's pick when the side-LLM reply doesn't validate against the eligible roster. Returns `[]` only
 * when NO character is eligible (the driver maps that to `no-eligible`). Single-eligible short-circuits.
 */
export async function smartArbitrate(params: SmartArbitrateParams): Promise<CharacterId[]> {
  const eligible = params.candidates.filter((c) =>
    isArbiterEligible({ leftSeq: c.leftSeq, disabled: c.disabled }),
  );
  if (eligible.length === 0) {
    return [];
  }
  const nameById = new Map(params.castNames.map((n) => [n.characterId, n.name] as const));
  const eligibleNamed = eligible
    .map((c) => ({ id: c.characterId, name: nameById.get(c.characterId) ?? "" }))
    .filter((c) => c.name.length > 0);
  // Single eligible (or none has a resolvable name) — no LLM call needed (solo byte-identical).
  if (eligibleNamed.length <= 1) {
    return eligibleNamed.map((c) => c.id);
  }

  const fallback = (): CharacterId[] =>
    selectSpeakers({
      candidates: params.candidates,
      policy: "natural",
      lastSpeakerId: params.lastSpeakerId,
      rng: params.rng,
      maxSpeakers: 1,
    });

  const userPrompt = buildUserPrompt(
    params.recentHistory,
    eligibleNamed.map((c) => c.name),
  );
  let reply: string;
  try {
    const result = await params.summarize([{ systemPrompt: SYSTEM_PROMPT, userPrompt }], {
      temperature: ARBITER_TEMPERATURE,
      maxTokens: ARBITER_MAX_TOKENS,
    });
    reply = result.items[0]?.text ?? "";
  } catch {
    // The side-LLM is best-effort — any failure degrades to the deterministic fallback, never throws.
    return fallback();
  }

  const picked = matchEligible(reply, eligibleNamed);
  return picked === null ? fallback() : [picked];
}

function buildUserPrompt(recentHistory: string, names: readonly string[]): string {
  const history = recentHistory.length > 0 ? recentHistory : "(the conversation is just starting)";
  return `Recent conversation:\n${history}\n\nCharacters who may speak next: ${names.join(", ")}\n\nNext speaker:`;
}

/** Roster-validating parse: return the eligible character whose name appears in the reply (whole-word,
 *  case-insensitive; longest name first so a substring name can't pre-empt a longer one). Null ⇒ no eligible
 *  name matched (→ the caller falls back). */
function matchEligible(
  reply: string,
  eligible: readonly { id: CharacterId; name: string }[],
): CharacterId | null {
  const haystack = reply.toLowerCase();
  const byLongest = [...eligible].sort((a, b) => b.name.length - a.name.length);
  for (const member of byLongest) {
    if (haystack.includes(member.name.toLowerCase())) {
      return member.id;
    }
  }
  return null;
}
