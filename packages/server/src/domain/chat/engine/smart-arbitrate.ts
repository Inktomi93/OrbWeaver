// domain/chat/engine/smart-arbitrate — Smart's opt-in Utility-model pick, structured output only: the reply is
// constrained to an enum of the round's candidate names, so a human, a muted character or a typo cannot be
// emitted. An unbound or unservable Utility row, a failed call or an invalid payload degrades LOUDLY to `natural`
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
import { clampToTokenBudget } from "@orb/kit/tokens";
import { z } from "zod";
import type { ArbiterCandidate, SmartArbitrationResult, SpeakerArbiter, SpeakerCandidate, TranscriptLine } from "../contract/arbitration.ts";
import { isArbiterEligible } from "../persistence/participant.ts";
import { addressedGroups, MAX_SMART_RESPONDERS, selectSpeakers } from "./select-speakers.ts";

/** Each candidate's "who is this" line in the prompt. */
const CANDIDATE_LINE_TOKENS = 40;
/** Each transcript line but the last (about 300 characters); the last line is the one being answered, so it
 *  rides whole. */
const OLDER_LINE_TOKENS = 75;
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

interface Named {
  readonly ref: SpeakerRef;
  readonly name: string;
  readonly talkativeness: number;
}

/** The cancelled arbitration: no speaker, no degrade (`aborted ⇒ [] + degraded:false`). */
const CANCELLED: SmartArbitrationResult = Object.freeze({ speakers: [], degraded: false, aborted: true });

const picked = (speakers: readonly SpeakerRef[]): SmartArbitrationResult => ({ speakers, degraded: false, aborted: false });

/**
 * Smart's Utility-model pick: the round's responders in order, at most {@link MAX_SMART_RESPONDERS}. Characters
 * the last line names answer without a call, as does a lone eligible character. `[]` only when NO character is
 * eligible.
 */
export async function smartArbitrate(params: SmartArbitrateParams): Promise<SmartArbitrationResult> {
  // Read the signal through a CALL: `signal.aborted` flips asynchronously, so a narrowed read would go stale.
  const cancelled = (): boolean => params.signal?.aborted === true;
  if (cancelled()) {
    return CANCELLED;
  }
  const nameByKey = new Map(params.speakerCandidates.map((n) => [speakerKey(n.ref), n.name] as const));
  const eligible: Named[] = params.candidates
    .filter((c) => isArbiterEligible({ leftSeq: c.leftSeq, disabled: c.disabled }))
    .map((c) => ({ ref: c.ref, name: nameByKey.get(speakerKey(c.ref)) ?? "", talkativeness: c.talkativeness }))
    .filter((c) => c.name.length > 0);
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

  const choices = modelChoices(params, eligible);
  const [first, ...rest] = [...new Set(choices.map((c) => c.name))];
  if (first === undefined) {
    return fallback();
  }
  let names: readonly string[];
  // @orb-waive caught-failure-ownership(catch): classified by signal state — a settled signal returns CANCELLED
  // (the user stopped it); an unservable row, a failed call or an invalid payload after the one bounded retry
  // degrades to the visible `fallback()`, the arbiter's documented best-effort contract.
  try {
    const arbiter = await params.arbiter();
    if (arbiter === null) {
      return cancelled() ? CANCELLED : fallback();
    }
    names = await askArbiter(params, arbiter, choices, [first, ...rest]);
  } catch {
    return cancelled() ? CANCELLED : fallback();
  }
  if (cancelled()) {
    return CANCELLED;
  }
  // A name two candidates share resolves to the first of them, in roster order.
  const refs = [...new Set(names)].flatMap((name) => choices.find((c) => c.name === name)?.ref ?? []);
  return picked(refs.slice(0, MAX_SMART_RESPONDERS));
}

/** One schema-constrained call (with the shared one bounded retry): the names the model chose. */
async function askArbiter(
  params: SmartArbitrateParams,
  arbiter: SpeakerArbiter,
  choices: readonly Named[],
  names: readonly [string, ...string[]],
): Promise<readonly string[]> {
  // One array of one enum of the candidates' names: no optionals and no unions, so it fits every wire's
  // structured-output limits, and nothing off the roster can be emitted.
  const schema = z.object({ responders: z.array(z.enum(names)).min(1).max(MAX_SMART_RESPONDERS) });
  const responseFormat: ResponseFormat = { name: RESPONSE_NAME, schema: projectJsonSchema(schema) };
  const systemPrompt = resolveProseText("chat.arbiter.system", params.prose);
  const userPrompt = buildArbiterPrompt(params, choices);
  const reply = await runStructuredTurn({
    payloadSchema: schema,
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

/** The eligible characters the last line names, in mention order; null when it names none, or when one word
 *  names several characters at once (the model reads the line and settles which one was meant). */
function addressedInLastLine(params: SmartArbitrateParams): SpeakerRef[] | null {
  const line = params.transcript.at(-1);
  if (line === undefined) {
    return null;
  }
  const groups = addressedGroups(line, params.candidates, params.speakerCandidates, params.humanNames);
  if (groups.length === 0 || groups.some((g) => g.length > 1)) {
    return null;
  }
  return groups
    .flat()
    .slice(0, MAX_SMART_RESPONDERS)
    .map((characterId) => ({ kind: "character", characterId }));
}

/** The arbiter's user prompt: the scene, the human players, each candidate with its line, how often it spoke and
 *  how talkative it is, the last speaker, then the conversation with every line but the last clipped. */
function buildArbiterPrompt(
  params: Pick<SmartArbitrateParams, "transcript" | "room" | "humanNames" | "characterLines" | "lastSpeaker" | "speakerCandidates">,
  choices: readonly Named[],
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
    return `- ${c.name}${who.length > 0 ? `: ${who}` : ""} (${facts})`;
  });
  const lastKey = params.lastSpeaker === null ? null : speakerKey(params.lastSpeaker);
  const last = params.speakerCandidates.find((s) => speakerKey(s.ref) === lastKey)?.name;
  const scene = arbiterScene(params.room);
  const history = transcript.map((line, i) => {
    const text = i === transcript.length - 1 ? line.text : clip(line.text, OLDER_LINE_TOKENS);
    return line.speakerName === null ? text : `${line.speakerName}: ${text}`;
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

/** Where the scene stands: a game's location and time off its scene line, else the room's scenario. */
function arbiterScene(room: ArbiterRoom): string | null {
  const gameScene = (room.rpgMacros?.["rpgSceneState"] ?? "")
    .split("\n")
    .find((l) => l.startsWith(RPG_SCENE_LINE_LABEL))
    ?.slice(RPG_SCENE_LINE_LABEL.length);
  const scene = (gameScene ?? room.roomOverrides?.scenario ?? "").trim();
  return scene.length > 0 ? clip(scene, SCENE_TOKENS) : null;
}
