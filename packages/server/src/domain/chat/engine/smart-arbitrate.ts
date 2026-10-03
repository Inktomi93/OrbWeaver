// domain/chat/engine/smart-arbitrate — Smart's opt-in Utility-model pick, structured output only: the reply is
// constrained to an enum of the round's candidate labels (each candidate's name, numbered when names repeat), so a
// human, a muted character or a typo cannot be emitted. An unbound or unservable Utility row, a failed call or an invalid payload degrades LOUDLY to `natural`
// (`degraded:true` → the turn verb's warning, D41). An abort is `aborted:true`, never a degrade.

import type { AssembleContext, SpeakerRef } from "@orb/contracts/chat";
import { speakerKey } from "@orb/contracts/chat";
import type { ProseOverrides } from "@orb/contracts/prose";
import { resolveProseText } from "@orb/contracts/prose";
import type { ResponseFormat, SummarizeOptions } from "@orb/contracts/role-clients";
import { RPG_SCENE_LINE_LABEL } from "@orb/contracts/rpg";
import { runStructuredTurn } from "@orb/inference";
import type { CharacterId } from "@orb/kit/ids";
import { projectJsonSchema } from "@orb/kit/json-schema";
import { clampToTokenBudget, safeTokenWindow } from "@orb/kit/tokens";
import { z } from "zod";
import type { ArbiterCandidate, SmartArbitrationResult, SpeakerArbiter, SpeakerCandidate, TranscriptLine } from "../contract/arbitration.ts";
import { isArbiterEligible } from "../persistence/participant.ts";
import { addressedGroups, MAX_SMART_RESPONDERS, selectSpeakers } from "./select-speakers.ts";

/** Each candidate's "who is this" line in the prompt. */
const CANDIDATE_LINE_TOKENS = 40;
/** Each transcript line but the last (about 300 characters). */
const OLDER_LINE_TOKENS = 75;
/** The share of the bound model's safe window the last line may take. It is the line being answered, so it rides
 *  whole until it would crowd out the roster and the instruction; past that its HEAD is cut, keeping the end. */
const LAST_LINE_WINDOW_SHARE = 0.5;
const SCENE_TOKENS = 60;
const CLIPPED = "…";
const PERCENT = 100;
const RESPONSE_NAME = "speaker_pick";

/** What the arbiter reads off the round's assembled context: the scene. */
type ArbiterRoom = Pick<AssembleContext, "rpgMacros" | "roomOverrides">;

interface SmartArbitrateParams {
  /** The funder's Utility role, or null when it is unbound or cannot serve structured output. A throw is a
   *  degrade, like a null. */
  readonly arbiter: () => Promise<SpeakerArbiter | null>;
  /** The present roster's character candidates (the eligible set is derived here). */
  readonly candidates: readonly ArbiterCandidate[];
  /** Display names for the candidates — the prompt vocabulary and the response enum. */
  readonly speakerCandidates: readonly SpeakerCandidate[];
  /** Each character's "who is this" line (`engine/character-line`), uncapped. */
  readonly characterLines: ReadonlyMap<CharacterId, string>;
  /** The trailing canon window, oldest first, each line under its speaker's name. */
  readonly transcript: readonly TranscriptLine[];
  /** The human players (`humanPlayerNames`): shown to the model, and never an address to a character. */
  readonly humanNames: readonly string[];
  readonly room: ArbiterRoom;
  /** The previous AI speaker: shown to the model, banned from its candidates on a self-response, and the
   *  fallback's ban-last and rotation origin. */
  readonly lastSpeaker: SpeakerRef | null;
  /** Whether the last speaker sits this round out (`verbs/turn.ts::banLastFor`). Default TRUE. */
  readonly banLast?: boolean | undefined;
  /** Characters the human trigger text named as a plain word — forwarded to the `natural` fallback. */
  readonly mentionedIds?: readonly CharacterId[] | undefined;
  /** The injected PRNG (D46) — drives the `natural` fallback's pick. */
  readonly rng: () => number;
  /** The ROOM HOST's prose overrides (`chat.arbiter.system`). Empty ⇒ the shipped arbiter prompt. */
  readonly prose: ProseOverrides;
  /** The resolved side-gen sampling options (the `arbiter` posture ← the host's preset params), as-is. */
  readonly sampling: SummarizeOptions;
  /** The TURN's abort signal, threaded into the call so a box that never answers can be cut loose. No deadline
   *  rides alongside it ON PURPOSE: a slow local arbiter can legitimately take tens of seconds. */
  readonly signal?: AbortSignal | undefined;
}

/** A candidate as the model sees it, under its round `label`. */
interface Named {
  readonly ref: SpeakerRef;
  readonly label: string;
  readonly talkativeness: number;
}

/**
 * Each roster seat's label for the round, keyed by `speakerKey`: its trimmed name, or, when an earlier seat already
 * holds that name (compared case-insensitively), the name numbered "(2)", "(3)" and on to the first label no seat's
 * name or label uses. Computed once over the whole roster in roster order, before mute and ban-last, so a character
 * keeps one label all round and the response enum maps each label back to exactly one ref. A seat with a blank name
 * gets no label: it cannot be described or addressed, so it is no candidate (it still speaks through `natural`).
 */
function rosterLabels(speakerCandidates: readonly SpeakerCandidate[]): ReadonlyMap<string, string> {
  // Labels are per round: a roster change can renumber a seat, which only this round's prompt ever sees.
  const sameAs = (label: string): string => label.toLowerCase();
  const named = speakerCandidates.map((c) => ({ ref: c.ref, name: c.name.trim() })).filter((c) => c.name.length > 0);
  const names = new Set(named.map((c) => sameAs(c.name)));
  const used = new Set<string>();
  const labels = new Map<string, string>();
  for (const c of named) {
    let label = c.name;
    // A numbered label another seat already carries as its own name is taken too.
    for (let n = 2; used.has(sameAs(label)) || (label !== c.name && names.has(sameAs(label))); n += 1) {
      label = `${c.name} (${n})`;
    }
    used.add(sameAs(label));
    labels.set(speakerKey(c.ref), label);
  }
  return labels;
}

/** The cancelled arbitration: no speaker, no degrade (`aborted ⇒ [] + degraded:false`). */
const CANCELLED: SmartArbitrationResult = Object.freeze({ speakers: [], degraded: false, aborted: true });

const picked = (speakers: readonly SpeakerRef[]): SmartArbitrationResult => ({ speakers, degraded: false, aborted: false });

/**
 * Smart's Utility-model pick: the round's responders in order, at most {@link MAX_SMART_RESPONDERS}. Characters
 * the last line names answer without a call only when every name in that line is unambiguous; a lone eligible
 * character answers without one too. `[]` only when NO character is eligible.
 */
export async function smartArbitrate(params: SmartArbitrateParams): Promise<SmartArbitrationResult> {
  // Read the signal through a CALL: `signal.aborted` flips asynchronously, so a narrowed read would go stale.
  const cancelled = (): boolean => params.signal?.aborted === true;
  if (cancelled()) {
    return CANCELLED;
  }
  const labels = rosterLabels(params.speakerCandidates);
  const eligible: Named[] = params.candidates
    .filter((c) => isArbiterEligible({ leftSeq: c.leftSeq, disabled: c.disabled }))
    .map((c) => ({ ref: c.ref, label: labels.get(speakerKey(c.ref)) ?? "", talkativeness: c.talkativeness }))
    .filter((c) => c.label.length > 0);
  if (eligible.length <= 1) {
    return picked(eligible.map((c) => c.ref));
  }
  const addressed = addressedInLastLine(params);
  if (addressed !== null) {
    return picked(addressed);
  }

  const fallback = (): SmartArbitrationResult => ({
    speakers: selectSpeakers({
      candidates: params.candidates,
      policy: "natural",
      lastSpeaker: params.lastSpeaker,
      ...(params.banLast !== undefined ? { banLast: params.banLast } : {}),
      mentionedIds: params.mentionedIds,
      rng: params.rng,
      maxSpeakers: 1,
    }),
    degraded: true,
    aborted: false,
  });

  const [first, ...rest] = modelChoices(params, eligible);
  if (first === undefined) {
    return fallback();
  }
  const choices: readonly [Named, ...Named[]] = [first, ...rest];
  let chosen: readonly string[];
  // @orb-waive caught-failure-ownership(catch): classified by signal state — a settled signal returns CANCELLED
  // (the user stopped it); an unservable row, a failed call or an invalid payload after the one bounded retry
  // degrades to the visible `fallback()`, the arbiter's documented best-effort contract.
  try {
    const arbiter = await params.arbiter();
    if (arbiter === null) {
      return cancelled() ? CANCELLED : fallback();
    }
    chosen = await askArbiter(params, arbiter, choices, labels);
  } catch {
    return cancelled() ? CANCELLED : fallback();
  }
  if (cancelled()) {
    return CANCELLED;
  }
  // Lenient on length: a wire that strips the array bounds may send more than the cap, which is trimmed rather
  // than spent on a retry. Only an empty answer degrades.
  const refs = [...new Set(chosen)].flatMap((label) => choices.find((c) => c.label === label)?.ref ?? []).slice(0, MAX_SMART_RESPONDERS);
  return refs.length === 0 ? fallback() : picked(refs);
}

/** One schema-constrained call (with the shared one bounded retry): the candidate labels the model chose. */
async function askArbiter(
  params: SmartArbitrateParams,
  arbiter: SpeakerArbiter,
  choices: readonly [Named, ...Named[]],
  roster: ReadonlyMap<string, string>,
): Promise<readonly string[]> {
  // The enum of the candidates' labels is what fits every wire and keeps anything off the roster from being
  // emitted. The array bounds ride for the wires that enforce them; others strip them, so the reply is read
  // without them and trimmed by the caller.
  const responders = z.array(z.enum([choices[0].label, ...choices.slice(1).map((c) => c.label)]));
  const responseFormat: ResponseFormat = {
    name: RESPONSE_NAME,
    schema: projectJsonSchema(z.object({ responders: responders.min(1).max(MAX_SMART_RESPONDERS) })),
  };
  const systemPrompt = resolveProseText("chat.arbiter.system", params.prose);
  const userPrompt = buildArbiterPrompt(params, choices, roster, arbiter.contextTokens);
  const reply = await runStructuredTurn({
    payloadSchema: z.object({ responders }),
    run: async (correction) => {
      const result = await arbiter.structured([{ systemPrompt, userPrompt: correction === undefined ? userPrompt : `${userPrompt}\n\n${correction}` }], {
        ...params.sampling,
        responseFormat,
        ...(params.signal !== undefined ? { signal: params.signal } : {}),
      });
      return result.items[0]?.text ?? "";
    },
  });
  return reply.responders;
}

/**
 * The candidates the model may name. The ban on the last speaker holds only when the last line is that
 * speaker's own, which is what a self-response is. Once a human or another character has spoken, the last
 * speaker is often exactly who was asked, and banning them there turned right answers into degrades
 * (scripts/probes/speaker-pick/RESULTS.md). The `natural` fallback keeps its own ban unchanged.
 */
function modelChoices(params: SmartArbitrateParams, eligible: readonly Named[]): readonly Named[] {
  const last = params.lastSpeaker;
  if (last === null || params.banLast === false || params.transcript.at(-1)?.characterId !== last.characterId) {
    return eligible;
  }
  const unbanned = eligible.filter((c) => speakerKey(c.ref) !== speakerKey(last));
  return unbanned.length > 0 ? unbanned : eligible;
}

/** The eligible characters the last line names, in mention order; null when it names none, or when any name in it
 *  is ambiguous (one word naming several characters, or a name a human player shares), so the model reads the line. */
function addressedInLastLine(params: SmartArbitrateParams): SpeakerRef[] | null {
  const line = params.transcript.at(-1);
  if (line === undefined) {
    return null;
  }
  const { groups, humanAmbiguous } = addressedGroups(line, params.candidates, params.speakerCandidates, params.humanNames);
  // Any ambiguous name sends the WHOLE line to the model, other names in it included.
  if (humanAmbiguous || groups.length === 0 || groups.some((g) => g.length > 1)) {
    return null;
  }
  return groups
    .flat()
    .slice(0, MAX_SMART_RESPONDERS)
    .map((characterId) => ({ kind: "character", characterId }));
}

/** The arbiter's user prompt: the scene, the human players, each candidate with its line, how often it spoke and
 *  how talkative it is, the last speaker, then the conversation: every line but the last clipped short, the last
 *  capped at its share of the bound model's window with its end kept. */
function buildArbiterPrompt(
  params: Pick<SmartArbitrateParams, "transcript" | "room" | "humanNames" | "characterLines" | "lastSpeaker" | "speakerCandidates">,
  choices: readonly Named[],
  roster: ReadonlyMap<string, string>,
  contextTokens: number,
): string {
  const { transcript } = params;
  const spoke = new Map<CharacterId, number>();
  for (const line of transcript) {
    if (line.characterId !== null) {
      spoke.set(line.characterId, (spoke.get(line.characterId) ?? 0) + 1);
    }
  }
  const candidateLines = choices.map((c) => {
    const who = clampToTokenBudget(params.characterLines.get(c.ref.characterId) ?? "", CANDIDATE_LINE_TOKENS).trim();
    const facts = `spoke ${spoke.get(c.ref.characterId) ?? 0} of the last ${transcript.length} lines, talkativeness ${Math.round(c.talkativeness * PERCENT)}%`;
    return `- ${c.label}${who.length > 0 ? `: ${who}` : ""} (${facts})`;
  });
  // The last speaker keeps its round label even when ban-last or a mute left it out of the candidates.
  const last = params.lastSpeaker === null ? undefined : roster.get(speakerKey(params.lastSpeaker));
  const scene = arbiterScene(params.room);
  const history = transcript.map((line, i) => {
    const text =
      i === transcript.length - 1
        ? clipHead(line.text, Math.floor(safeTokenWindow(contextTokens) * LAST_LINE_WINDOW_SHARE))
        : clip(line.text, OLDER_LINE_TOKENS);
    // A character's line rides under its round label, so two characters sharing a name stay attributable.
    const speaker =
      line.characterId === null ? line.speakerName : (roster.get(speakerKey({ kind: "character", characterId: line.characterId })) ?? line.speakerName);
    return speaker === null ? text : `${speaker}: ${text}`;
  });
  return [
    ...(scene === null ? [] : [`Scene: ${scene}`]),
    `Human players: ${params.humanNames.length > 0 ? params.humanNames.join(", ") : "none named"}`,
    `Candidates:\n${candidateLines.join("\n")}`,
    ...(last === undefined ? [] : [`Spoke last: ${last}`]),
    `Recent conversation:\n${history.length > 0 ? history.join("\n") : "(the conversation is just starting)"}`,
    "Who speaks next?",
  ].join("\n\n");
}

function clip(text: string, tokens: number): string {
  const cut = clampToTokenBudget(text, tokens);
  return cut.length < text.length ? `${cut.trimEnd()}${CLIPPED}` : text;
}

/** {@link clip} from the other end: the tail survives. The estimate counts characters, not their order, so
 *  clamping the reversed codepoints keeps exactly the longest tail that fits. */
function clipHead(text: string, tokens: number): string {
  const tail = [...clampToTokenBudget([...text].reverse().join(""), tokens)].reverse().join("");
  return tail.length < text.length ? `${CLIPPED}${tail.trimStart()}` : text;
}

/** Where the scene stands: a game's location and time off its scene line, else the room's scenario. */
function arbiterScene(room: ArbiterRoom): string | null {
  const gameScene = (room.rpgMacros?.["rpgSceneState"] ?? "")
    .split("\n")
    .find((l) => l.startsWith(RPG_SCENE_LINE_LABEL))
    ?.slice(RPG_SCENE_LINE_LABEL.length);
  const scene = (gameScene ?? room.roomOverrides?.scenario ?? "").trim();
  return scene.length > 0 ? clip(scene, SCENE_TOKENS) : null;
}
