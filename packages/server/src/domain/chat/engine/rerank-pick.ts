// domain/chat/engine/rerank-pick — Smart's default speaker pick over the funder's bound RERANK role. The
// last line is the query and each eligible character's `Name: persona` is a document; a character named in
// that line wins outright when only one answers to it; several that do, or none, are ranked instead, with the
// last speaker out when the round bans it.
// Picks by RANK ORDER within the one call: scores are family-specific (logits, [0,1], anything), so no
// threshold is ever compared. An unbound or failing role degrades to the `natural` pick with `degraded:true`,
// which the turn verb surfaces as a warning.

import type { SpeakerRef } from "@orb/contracts/chat";
import { speakerKey } from "@orb/contracts/chat";
import type { RerankHit } from "@orb/contracts/providers";
import type { RerankDocument } from "@orb/contracts/role-clients";
import type { CharacterId } from "@orb/kit/ids";
import { processMacros } from "@orb/kit/macro";
import { DEFAULT_PERSONA_NAME } from "@orb/kit/persona";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { clampToTokenBudget, estimateTokens, safeTokenWindow } from "@orb/kit/tokens";
import type { ArbiterCandidate, SmartArbitrationResult, SpeakerCandidate, SpeakerReranker, TranscriptLine } from "../contract/arbitration.ts";
import { isArbiterEligible } from "../persistence/participant.ts";
import { nameMentionsOf, selectSpeakers } from "./select-speakers.ts";

// A cross-encoder spends a few tokens of its window on the pair's own markers ([CLS] q [SEP] d [SEP]).
const PAIR_MARKER_TOKENS = 3;

/** Sent only to a reranker that declares itself instruction-aware; every other family scores without it. */
const PICK_INSTRUCTION = "Given the latest line of a roleplay, rank the characters by how likely each is to speak next.";

const CANCELLED: SmartArbitrationResult = Object.freeze({ speakers: [], degraded: false, aborted: true });

interface RerankPickParams {
  /** The funder's bound rerank role, or null when nothing is bound. A throw is a degrade, like a null. */
  readonly reranker: () => Promise<SpeakerReranker | null>;
  readonly candidates: readonly ArbiterCandidate[];
  readonly speakerCandidates: readonly SpeakerCandidate[];
  /** Each character's persona text, uncapped; the window cap is applied here, per the bound model. */
  readonly personas: ReadonlyMap<CharacterId, string>;
  /** The latest canon line, whoever wrote it. Null in an empty room. */
  readonly lastLine: TranscriptLine | null;
  readonly lastSpeaker: SpeakerRef | null;
  /** Whether the last speaker sits this round out (`verbs/turn.ts::banLastFor`). Default true. */
  readonly banLast?: boolean | undefined;
  /** Forwarded to the `natural` fallback only. */
  readonly mentionedIds?: readonly CharacterId[] | undefined;
  readonly rng: () => number;
  readonly signal?: AbortSignal | undefined;
}

interface NamedCandidate {
  readonly ref: SpeakerRef;
  readonly name: string;
}

/** The query and one `Name: persona` document per candidate, each cut to the bound model's window. The query
 *  takes at most half the pair budget; each document fills what the query left, its persona clipped and its
 *  name never. Mirrors the inference backend's own clamp, so the backend never re-cuts a different way. */
export function fitRerankPair(
  windowTokens: number,
  query: string,
  documents: readonly { readonly id: string; readonly name: string; readonly persona: string }[],
): { readonly query: string; readonly documents: RerankDocument[] } {
  const budget = Math.max(0, safeTokenWindow(windowTokens) - PAIR_MARKER_TOKENS);
  const fittedQuery = clampToTokenBudget(query, Math.floor(budget / 2));
  const docBudget = budget - estimateTokens(fittedQuery);
  return {
    query: fittedQuery,
    documents: documents.map((d) => {
      const head = `${d.name}: `;
      return { id: d.id, text: `${head}${clampToTokenBudget(d.persona, docBudget - estimateTokens(head))}` };
    }),
  };
}

/** The best-ranked hit that names an allowed candidate. Scores are compared only against each other within
 *  this one result, never against a constant, so any family's scale (logits, [0,1]) ranks the same way. */
function topRanked(hits: readonly RerankHit[], allowed: readonly NamedCandidate[]): SpeakerRef | null {
  for (const hit of hits.toSorted((a, b) => b.score - a.score)) {
    const match = allowed.find((c) => speakerKey(c.ref) === hit.id);
    if (match !== undefined) {
      return match.ref;
    }
  }
  return null;
}

/** A card's persona text for the reranker: its description, or its personality when the description is blank,
 *  with macros rendered against the card's own name so no `{{char}}` braces reach the model. Uncapped: the
 *  bound model's window clips it in {@link fitRerankPair}. */
export function personaSummaryOf(
  card: { readonly name: string; readonly description: string | null; readonly personality: string | null } | null,
  nowMs: number,
): string {
  if (card === null) {
    return "";
  }
  // `?? ""` as well as the null type: a minimal card double (or a sparse import) can omit the field entirely.
  const text = [card.description, card.personality].find((t): t is string => (t ?? "").trim().length > 0);
  if (text === undefined) {
    return "";
  }
  return processMacros(text, { char: card.name, user: DEFAULT_PERSONA_NAME, persona: "", scenario: "", timezone: UTC_TIME_ZONE, nowMs, env: {} });
}

// Being addressed is the strongest signal a line carries, so ONE character named as a name wins outright, even
// the last speaker, whoever wrote the line. The line's own speaker naming itself is not an address. A name that
// reads as an ordinary word ("we will find it") is no address, and a name several characters answer to
// ("Captain, ...") narrows the field rather than choosing: the most fully named characters are returned, and
// the caller reranks within them when there is more than one.
function addressedIn(line: TranscriptLine, named: readonly NamedCandidate[]): readonly NamedCandidate[] {
  const ownKey = line.characterId === null ? null : speakerKey({ kind: "character", characterId: line.characterId });
  const strong = nameMentionsOf(line.text, named).filter((m) => m.strong);
  const mentioned = strong.flatMap((m) => {
    const match = named.find((c) => c.ref.characterId === m.id);
    return match === undefined || speakerKey(match.ref) === ownKey ? [] : [{ match, hits: m.hits }];
  });
  const best = Math.max(0, ...mentioned.map((m) => m.hits));
  return mentioned.filter((m) => m.hits === best).map((m) => m.match);
}

/** Who competes for the turn once the line is read: one character named as a name wins outright; several that
 *  answer to the name are the field to rank; none leaves everyone in it. */
function fieldFor(line: TranscriptLine, named: readonly NamedCandidate[]): { readonly winner: SpeakerRef | null; readonly field: readonly NamedCandidate[] } {
  const addressed = addressedIn(line, named);
  const [only] = addressed;
  if (addressed.length === 1 && only !== undefined) {
    return { winner: only.ref, field: addressed };
  }
  return { winner: null, field: addressed.length > 1 ? addressed : named };
}

/** The field minus the last speaker when the round bans it, unless that would leave nobody. */
function allowedIn(field: readonly NamedCandidate[], lastSpeaker: SpeakerRef | null, banLast: boolean | undefined): readonly NamedCandidate[] {
  const lastKey = lastSpeaker === null || banLast === false ? null : speakerKey(lastSpeaker);
  const unbanned = field.filter((c) => speakerKey(c.ref) !== lastKey);
  return unbanned.length > 0 ? unbanned : field;
}

/** Smart's reranker pick. One element on success, `[]` with no eligible character, CANCELLED on an abort. */
export async function rerankPick(params: RerankPickParams): Promise<SmartArbitrationResult> {
  // Read through a call: the signal flips asynchronously, so a narrowed property read would go stale. A turn
  // already cancelled picks nobody, so no rule below (not even a name in the line) can schedule a speaker.
  const cancelled = (): boolean => params.signal?.aborted === true;
  if (cancelled()) {
    return CANCELLED;
  }
  const eligible = params.candidates.filter((c) => isArbiterEligible({ leftSeq: c.leftSeq, disabled: c.disabled }));
  const nameByKey = new Map(params.speakerCandidates.map((n) => [speakerKey(n.ref), n.name] as const));
  const named: NamedCandidate[] = eligible.map((c) => ({ ref: c.ref, name: nameByKey.get(speakerKey(c.ref)) ?? "" })).filter((c) => c.name.length > 0);
  if (named.length <= 1) {
    return { speakers: named.map((c) => c.ref), degraded: false, aborted: false };
  }
  const natural = (degraded: boolean): SmartArbitrationResult => ({
    speakers: selectSpeakers({
      candidates: params.candidates,
      policy: "natural",
      lastSpeaker: params.lastSpeaker,
      ...(params.banLast !== undefined ? { banLast: params.banLast } : {}),
      mentionedIds: params.mentionedIds,
      rng: params.rng,
      maxSpeakers: 1,
    }),
    degraded,
    aborted: false,
  });
  const line = params.lastLine;
  // An empty room has no line to rank against: natural opens it, and nothing degraded.
  if (line === null) {
    return natural(false);
  }

  const { winner, field } = fieldFor(line, named);
  if (winner !== null) {
    return { speakers: [winner], degraded: false, aborted: false };
  }

  const allowed = allowedIn(field, params.lastSpeaker, params.banLast);

  let picked: SpeakerRef | null;
  // @orb-waive caught-failure-ownership(catch): an unbound, refused or failing rerank role is the documented
  // degrade, consumed as the visible `natural` fallback; an abort is classified by the turn's signal instead.
  try {
    const reranker = await params.reranker();
    if (reranker === null) {
      return cancelled() ? CANCELLED : natural(true);
    }
    const query = line.speakerName === null ? line.text : `${line.speakerName}: ${line.text}`;
    const fitted = fitRerankPair(
      reranker.capability.maxInputTokens,
      query,
      field.map((c) => ({
        id: speakerKey(c.ref),
        name: c.name,
        persona: params.personas.get(c.ref.characterId) ?? "",
      })),
    );
    const result = await reranker.rerank(fitted.query, fitted.documents, reranker.capability.instructionAware ? { instruction: PICK_INSTRUCTION } : undefined);
    picked = topRanked(result.hits, allowed);
  } catch {
    return cancelled() ? CANCELLED : natural(true);
  }
  if (cancelled()) {
    return CANCELLED;
  }
  return picked === null ? natural(true) : { speakers: [picked], degraded: false, aborted: false };
}
