// domain/chat/engine/rerank-pick — Smart's default speaker pick over the funder's bound RERANK role. The
// last line is the query and each eligible character's `Name: line` is a document. Every character the line
// addresses by name answers, ordered by rank; else the top-ranked one does, with the last speaker out when the
// round bans it. Picks by RANK ORDER within the one call: scores are family-specific (logits, [0,1], anything),
// so no threshold is ever compared. An unbound or failing role degrades with `degraded:true`, which the turn
// verb surfaces as a warning.

import type { SpeakerRef } from "@orb/contracts/chat";
import { speakerKey } from "@orb/contracts/chat";
import type { RerankDocument } from "@orb/contracts/role-clients";
import type { CharacterId } from "@orb/kit/ids";
import { clampToTokenBudget, estimateTokens, safeTokenWindow } from "@orb/kit/tokens";
import type { ArbiterCandidate, SmartArbitrationResult, SpeakerCandidate, SpeakerReranker, TranscriptLine } from "../contract/arbitration.ts";
import { isArbiterEligible } from "../persistence/participant.ts";
import { addressedGroups, MAX_SMART_RESPONDERS, selectSpeakers } from "./select-speakers.ts";

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
  /** Each character's "who is this" line (`engine/character-line`), uncapped; the window cap is applied here. */
  readonly characterLines: ReadonlyMap<CharacterId, string>;
  /** The latest canon line, whoever wrote it. Null in an empty room. */
  readonly lastLine: TranscriptLine | null;
  /** The human players (`humanPlayerNames`): a name they share is an address to them, never to a character. */
  readonly humanNames: readonly string[];
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

/** The query and one `Name: line` document per candidate, each cut to the bound model's window. The query
 *  takes at most half the pair budget; each document fills what the query left, its line clipped and its
 *  name never. Mirrors the inference backend's own clamp, so the backend never re-cuts a different way. */
export function fitRerankPair(
  windowTokens: number,
  query: string,
  documents: readonly { readonly id: string; readonly name: string; readonly line: string }[],
): { readonly query: string; readonly documents: RerankDocument[] } {
  const budget = Math.max(0, safeTokenWindow(windowTokens) - PAIR_MARKER_TOKENS);
  const fittedQuery = clampToTokenBudget(query, Math.floor(budget / 2));
  const docBudget = budget - estimateTokens(fittedQuery);
  return {
    query: fittedQuery,
    documents: documents.map((d) => {
      const head = `${d.name}: `;
      return { id: d.id, text: `${head}${clampToTokenBudget(d.line, docBudget - estimateTokens(head))}` };
    }),
  };
}

/** The `speakerKey`s of `named`, best-ranked first. Scores are compared only against each other within this
 *  one result, never against a constant, so any family's scale (logits, [0,1]) ranks the same way. Null when
 *  no role is bound; a failing role throws to the caller. */
async function rankKeys(params: RerankPickParams, line: TranscriptLine, named: readonly NamedCandidate[]): Promise<readonly string[] | null> {
  const reranker = await params.reranker();
  if (reranker === null) {
    return null;
  }
  const query = line.speakerName === null ? line.text : `${line.speakerName}: ${line.text}`;
  const fitted = fitRerankPair(
    reranker.capability.maxInputTokens,
    query,
    named.map((c) => ({ id: speakerKey(c.ref), name: c.name, line: params.characterLines.get(c.ref.characterId) ?? "" })),
  );
  const result = await reranker.rerank(fitted.query, fitted.documents, reranker.capability.instructionAware ? { instruction: PICK_INSTRUCTION } : undefined);
  return result.hits.toSorted((a, b) => b.score - a.score).map((h) => h.id);
}

const refOf = (characterId: CharacterId): SpeakerRef => ({ kind: "character", characterId });

/** The addressed responders: one per name group (the best-ranked of an ambiguous group), ordered by rank. With
 *  no ranking (`null`) they keep mention order and an ambiguous group takes its first member. */
function orderAddressed(groups: readonly (readonly CharacterId[])[], ranked: readonly string[] | null): SpeakerRef[] {
  const rankOf = (id: CharacterId): number => {
    const at = ranked?.indexOf(speakerKey(refOf(id))) ?? -1;
    return at === -1 ? Number.POSITIVE_INFINITY : at;
  };
  const chosen = groups.flatMap((group) => {
    const best = group.toSorted((a, b) => rankOf(a) - rankOf(b))[0];
    return best === undefined ? [] : [best];
  });
  // `toSorted` is stable, so unranked ids (and a null ranking) keep mention order.
  return chosen
    .toSorted((a, b) => rankOf(a) - rankOf(b))
    .slice(0, MAX_SMART_RESPONDERS)
    .map(refOf);
}

/** Smart's reranker pick. The addressed characters, else one top-ranked character; `[]` with no eligible
 *  character; CANCELLED on an abort. */
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

  // Being addressed is the strongest signal a line carries, so the named characters answer, even the last
  // speaker. One unambiguous name needs no ranking at all.
  const groups = addressedGroups(line, params.candidates, params.speakerCandidates, params.humanNames);
  const addressedIds = new Set(groups.flat());
  if (groups.length === 1 && addressedIds.size === 1) {
    return { speakers: orderAddressed(groups, null), degraded: false, aborted: false };
  }
  const pool = addressedIds.size > 0 ? named.filter((c) => addressedIds.has(c.ref.characterId)) : named;

  let ranked: readonly string[] | null;
  // @orb-waive caught-failure-ownership(catch): an unbound, refused or failing rerank role is the documented
  // degrade, consumed as the visible fallback; an abort is classified by the turn's signal instead.
  try {
    ranked = await rankKeys(params, line, pool);
  } catch {
    if (cancelled()) {
      return CANCELLED;
    }
    ranked = null;
  }
  if (cancelled()) {
    return CANCELLED;
  }
  if (addressedIds.size > 0) {
    // A failed ranking still answers the addressed characters, in mention order; the warning says why the
    // order (or an ambiguous name's pick) came from the line rather than the model.
    return { speakers: orderAddressed(groups, ranked), degraded: ranked === null, aborted: false };
  }
  const pick = ranked === null ? undefined : topAllowed(params, named, ranked);
  return pick === undefined ? natural(true) : { speakers: [pick], degraded: false, aborted: false };
}

/** The best-ranked character, the last speaker out when the round bans it (restored if that empties it). */
function topAllowed(params: RerankPickParams, named: readonly NamedCandidate[], ranked: readonly string[]): SpeakerRef | undefined {
  const lastKey = params.lastSpeaker === null || params.banLast === false ? null : speakerKey(params.lastSpeaker);
  const unbanned = named.filter((c) => speakerKey(c.ref) !== lastKey);
  const allowed = new Set((unbanned.length > 0 ? unbanned : named).map((c) => speakerKey(c.ref)));
  const top = ranked.find((key) => allowed.has(key));
  return named.find((c) => speakerKey(c.ref) === top)?.ref;
}
