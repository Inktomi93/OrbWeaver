// domain/chat/engine/rerank-pick — Smart's default speaker pick over the funder's bound RERANK role. The
// last line is the query and each eligible character's `Name: persona` is a document; a character named in
// that line wins outright, else the top-ranked one does, with the last speaker out when the round bans it.
// Picks by RANK ORDER within the one call: scores are family-specific (logits, [0,1], anything), so no
// threshold is ever compared. An unbound or failing role degrades to the `natural` pick with `degraded:true`,
// which the turn verb surfaces as a warning.

import type { SpeakerRef } from "@orb/contracts/chat";
import { speakerKey } from "@orb/contracts/chat";
import type { RerankHit } from "@orb/contracts/providers";
import type { RerankDocument } from "@orb/contracts/role-clients";
import type { CharacterId } from "@orb/kit/ids";
import { clampToTokenBudget, estimateTokens, safeTokenWindow } from "@orb/kit/tokens";
import type { ArbiterCandidate, SmartArbitrationResult, SpeakerCandidate, SpeakerReranker, TranscriptLine } from "../contract/arbitration.ts";
import { isArbiterEligible } from "../persistence/participant.ts";
import { resolveNameMentions, selectSpeakers } from "./select-speakers.ts";

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

// Being addressed is the strongest signal a line carries, so a named character wins outright, even the last
// speaker, whoever wrote the line. The line's own speaker naming itself is not an address.
function addressedIn(line: TranscriptLine, named: readonly NamedCandidate[]): SpeakerRef | null {
  const ownKey = line.characterId === null ? null : speakerKey({ kind: "character", characterId: line.characterId });
  for (const characterId of resolveNameMentions(line.text, named)) {
    const match = named.find((c) => c.ref.characterId === characterId);
    if (match !== undefined && speakerKey(match.ref) !== ownKey) {
      return match.ref;
    }
  }
  return null;
}

/** Smart's reranker pick. One element on success, `[]` with no eligible character, CANCELLED on an abort. */
export async function rerankPick(params: RerankPickParams): Promise<SmartArbitrationResult> {
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

  const addressed = addressedIn(line, named);
  if (addressed !== null) {
    return { speakers: [addressed], degraded: false, aborted: false };
  }

  const cancelled = (): boolean => params.signal?.aborted === true;
  if (cancelled()) {
    return CANCELLED;
  }
  const lastKey = params.lastSpeaker === null || params.banLast === false ? null : speakerKey(params.lastSpeaker);
  const unbanned = named.filter((c) => speakerKey(c.ref) !== lastKey);
  const allowed = unbanned.length > 0 ? unbanned : named;

  let picked: SpeakerRef | null;
  // @orb-waive caught-failure-ownership(catch): an unbound, refused or failing rerank role is the documented
  // degrade, consumed as the visible `natural` fallback; an abort is classified by the turn's signal instead.
  try {
    const reranker = await params.reranker();
    if (reranker === null) {
      return natural(true);
    }
    const query = line.speakerName === null ? line.text : `${line.speakerName}: ${line.text}`;
    const fitted = fitRerankPair(
      reranker.capability.maxInputTokens,
      query,
      named.map((c) => ({
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
