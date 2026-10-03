// domain/chat/engine/smart-arbitrate — Smart's opt-in Utility-model pick. A request-shaper over the INJECTED
// `summarize` role (`ChatContext.summarize`, never a sideways call): a low-temp classify call names the round's
// responders from the eligible roster, told who the human players are and who each candidate is. The parse is
// ROSTER-VALIDATING with a `natural` FALLBACK that is LOUD (`degraded:true` → the turn verb's warning, D41).
//
// A HANG is not a failure, so the fallback cannot catch it: the turn's `AbortSignal` rides INTO the summarize
// call, and an abort returns `aborted:true`, NOT a degrade. Single-eligible and named-in-the-last-line rounds
// short-circuit WITHOUT a model call.

import type { AssembleContext, SpeakerRef } from "@orb/contracts/chat";
import { speakerKey } from "@orb/contracts/chat";
import type { ProseOverrides } from "@orb/contracts/prose";
import { resolveProseText } from "@orb/contracts/prose";
import type { SummarizeOptions } from "@orb/contracts/role-clients";
import { RPG_SCENE_LINE_LABEL } from "@orb/contracts/rpg";
import type { RoleClientsWithSignal } from "@orb/inference";
import type { CharacterId } from "@orb/kit/ids";
import { includesWholeName } from "@orb/kit/speaker-label";
import { clampToTokenBudget } from "@orb/kit/tokens";
import type { ArbiterCandidate, SmartArbitrationResult, SpeakerCandidate, TranscriptLine } from "../contract/arbitration.ts";
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

/** What the arbiter reads off the round's assembled context: the human players and the scene. */
type ArbiterRoom = Pick<AssembleContext, "activePersona" | "people" | "rpgMacros" | "roomOverrides">;

interface SmartArbitrateParams {
  /** The injected side-LLM (`ChatContext.summarize`). */
  readonly summarize: RoleClientsWithSignal["summarize"];
  /** The present roster's character candidates (the eligible set is derived here). */
  readonly candidates: readonly ArbiterCandidate[];
  /** Display names for the candidates — the prompt vocabulary + the roster-validating parse. */
  readonly speakerCandidates: readonly SpeakerCandidate[];
  /** Each character's "who is this" line (`engine/character-line`), uncapped. */
  readonly characterLines: ReadonlyMap<CharacterId, string>;
  /** The trailing canon window, oldest first, each line under its speaker's name. */
  readonly transcript: readonly TranscriptLine[];
  readonly room: ArbiterRoom;
  /** The previous AI speaker: shown to the model, banned from its candidates when `banLast`, and the fallback's
   *  ban-last and rotation origin. */
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
  /** The TURN's abort signal, threaded into the side-LLM call so a box that never answers can be cut loose. No
   *  deadline rides alongside it ON PURPOSE: a slow local arbiter can legitimately take tens of seconds. */
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
 * the last line names answer without a call, as does a lone eligible character. When the reply names nobody on
 * the roster (or the call throws) the `natural` pick stands with `degraded:true`. `[]` only when NO character is
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
  const userPrompt = buildArbiterPrompt(params, choices);
  let reply: string;
  // @orb-waive caught-failure-ownership(catch): classified below by signal state — a settled signal returns
  // CANCELLED (the user stopped it, not a failure); anything else degrades to the deterministic `fallback()`,
  // the consumed result the side-LLM's best-effort contract promises.
  try {
    const result = await params.summarize([{ systemPrompt: resolveProseText("chat.arbiter.system", params.prose), userPrompt }], {
      ...params.sampling,
      ...(params.signal !== undefined ? { signal: params.signal } : {}),
    });
    reply = result.items[0]?.text ?? "";
  } catch {
    return cancelled() ? CANCELLED : fallback();
  }
  if (cancelled()) {
    return CANCELLED;
  }
  const responders = parseResponders(reply, choices);
  return responders.length === 0 ? fallback() : picked(responders);
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
  const groups = addressedGroups(line, params.candidates, params.speakerCandidates);
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
  params: Pick<SmartArbitrateParams, "transcript" | "room" | "characterLines" | "lastSpeaker" | "speakerCandidates">,
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
  const humans = humanNames(params.room, transcript);
  const history = transcript.map((line, i) => {
    const text = i === transcript.length - 1 ? line.text : clip(line.text, OLDER_LINE_TOKENS);
    return line.speakerName === null ? text : `${line.speakerName}: ${text}`;
  });
  return [
    ...(scene === null ? [] : [`Scene: ${scene}`]),
    `Human players (never choose them): ${humans.length > 0 ? humans.join(", ") : "none named"}`,
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
function arbiterScene(room: Pick<AssembleContext, "rpgMacros" | "roomOverrides">): string | null {
  const gameScene = (room.rpgMacros?.["rpgSceneState"] ?? "")
    .split("\n")
    .find((l) => l.startsWith(RPG_SCENE_LINE_LABEL))
    ?.slice(RPG_SCENE_LINE_LABEL.length);
  const scene = (gameScene ?? room.roomOverrides?.scenario ?? "").trim();
  return scene.length > 0 ? clip(scene, SCENE_TOKENS) : null;
}

/** The human players' names: the room's personas plus every named human line in the window, deduped. */
function humanNames(room: Pick<AssembleContext, "activePersona" | "people">, transcript: readonly TranscriptLine[]): string[] {
  const names = [
    room.activePersona?.name,
    ...(room.people ?? []).map((p) => p.name),
    // A line with no character and a speaker name is a human's (an unnamed system or assistant row stays bare).
    ...transcript.filter((l) => l.characterId === null).map((l) => l.speakerName),
  ];
  const seen = new Map<string, string>();
  for (const name of names) {
    const trimmed = name?.trim() ?? "";
    if (trimmed.length > 0 && !seen.has(trimmed.toLowerCase())) {
      seen.set(trimmed.toLowerCase(), trimmed);
    }
  }
  return [...seen.values()];
}

/** The reply's items: a JSON array of names when it holds one, else its comma- or line-separated parts. */
function replyItems(reply: string): string[] {
  const open = reply.indexOf("[");
  const close = reply.lastIndexOf("]");
  if (open !== -1 && close > open) {
    // @orb-waive caught-failure-ownership(catch): a malformed array is model output, not a fault; the reply is
    // then read as a plain list, the same contract the parse gives any other free-form answer.
    try {
      const parsed: unknown = JSON.parse(reply.slice(open, close + 1));
      if (Array.isArray(parsed)) {
        return parsed.filter((v): v is string => typeof v === "string");
      }
    } catch {
      // Fall through to the plain-list read.
    }
  }
  return reply.split(/[,\n]/u);
}

/**
 * Roster-validating parse: each item resolves to a candidate by exact name or id (case-insensitive), else by
 * the one candidate name it contains as a whole word (longest first, so "Ari" never pre-empts "Arianna" and a
 * name buried in a longer word never matches). Unknown items are ignored, repeats dropped, the cap enforced.
 * The boundary test is the shared Unicode-aware `includesWholeName`, so a short CJK or Cyrillic name inside a
 * longer word is never a hit.
 */
function parseResponders(reply: string, choices: readonly Named[]): SpeakerRef[] {
  const byLongest = choices.toSorted((a, b) => b.name.length - a.name.length);
  const out: SpeakerRef[] = [];
  for (const raw of replyItems(reply)) {
    const item = raw
      .trim()
      .replace(/^["'@\s]+|["'.!\s]+$/gu, "")
      .toLowerCase();
    const match =
      choices.find((c) => c.name.toLowerCase() === item || c.ref.characterId.toLowerCase() === item) ??
      byLongest.find((c) => includesWholeName(item, c.name.toLowerCase()));
    if (match !== undefined && !out.some((r) => speakerKey(r) === speakerKey(match.ref))) {
      out.push(match.ref);
    }
  }
  return out.slice(0, MAX_SMART_RESPONDERS);
}
