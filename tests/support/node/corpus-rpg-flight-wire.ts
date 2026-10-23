// Finite physical replies and delegated I/O holds only; native registry, recursion and flush policy stay real.
import { CHAT_REACT_TOOL_NAME } from "@orb/contracts/chat";
import { RPG_NO_CHANGES_TOOL } from "@orb/contracts/rpg";
import type { ControlledTimers } from "../iso/timers.ts";
import { createCorpusChatWire } from "./corpus-chat-wire.ts";
import type { CorpusProviderCompletion } from "./corpus-provider.ts";
import { CORPUS_RPG_JOURNAL_TOOL, CORPUS_RPG_SCENE_TOOL } from "./corpus-rpg-wire.ts";

export const RPG_RECURSION_MODEL = "corpus-rpg-recursion-v1";
export const RPG_ROUND_MODEL = "corpus-rpg-round-v1";
export const RPG_RECURSION_CARD = "Corpus recursive keeper";
export const RPG_RECURSION_CUE = "Follow the recursive ledger through both observatories.";
const RPG_DEPTH_ZERO_LOCATION = "Outer observatory";
export const RPG_DEPTH_ONE_LOCATION = "Inner observatory";
export const RPG_DEPTH_TEXT = ["The keeper pauses beside the ledger. ", "The keeper answers from the inner observatory."] as const;
export const RPG_CANCEL_CUE = "Begin the cancelled observatory round.";
export const RPG_AFTER_CANCEL_CUE = "Continue after the cancelled observatory round.";
export const RPG_FOREIGN_STOP_CUE = "Preserve the owner's observatory round.";
export const RPG_ROUND_LOCATION = "Settled observatory";
const RPG_ROUND_TEXT = "The keeper records the observatory witness.";
export const RPG_JOURNAL_TITLES = ["Outer ledger", "Inner ledger", "Settled ledger"] as const;

interface FlightTimers {
  readonly timers: ControlledTimers;
  readonly nextTimeout: () => Promise<number>;
}

/** Observe an actual root timeout arm while delegating every scheduling/lifetime operation to its owner. */
export function createRpgFlightTimers(actual: ControlledTimers): FlightTimers {
  let next: PromiseWithResolvers<number> | undefined;
  return {
    timers: {
      ...actual,
      [Symbol.dispose]: (): void => actual[Symbol.dispose](),
      timeout: (callback, ms): (() => void) => {
        const cancel = actual.timeout(callback, ms);
        const observer = next;
        next = undefined;
        observer?.resolve(ms);
        return cancel;
      },
    },
    nextTimeout: (): Promise<number> => {
      if (next !== undefined) {
        throw new Error("an RPG native timeout observation is already armed");
      }
      next = Promise.withResolvers<number>();
      return next.promise;
    },
  };
}

interface RpgFlightWire {
  readonly completion: (body: string) => CorpusProviderCompletion | undefined;
  readonly wrap: (execute: typeof fetch) => typeof fetch;
  readonly hold: ReturnType<typeof createCorpusChatWire>["hold"];
  readonly nextRequest: (cue: string) => Promise<string>;
  readonly attempts: readonly string[];
  readonly recursionRequests: readonly string[];
  readonly roundRequests: readonly string[];
  readonly remaining: () => { readonly recursion: number; readonly rounds: number };
}

const recursionReplies: readonly CorpusProviderCompletion[] = [
  {
    text: RPG_DEPTH_TEXT[0],
    toolCalls: [
      { name: CHAT_REACT_TOOL_NAME, argumentsJson: JSON.stringify({ character: RPG_RECURSION_CARD, emoji: "👍" }) },
      {
        name: CORPUS_RPG_SCENE_TOOL,
        argumentsJson: JSON.stringify({ location: RPG_DEPTH_ZERO_LOCATION, recentEvent: "The keeper entered the outer observatory." }),
      },
      {
        name: CORPUS_RPG_JOURNAL_TOOL,
        argumentsJson: JSON.stringify({ type: "custom", label: "First depth", title: RPG_JOURNAL_TITLES[0], content: "The outer ledger was opened." }),
      },
    ],
    usage: { promptTokens: 40, completionTokens: 15 },
  },
  {
    text: RPG_DEPTH_TEXT[1],
    toolCalls: [
      {
        name: CORPUS_RPG_SCENE_TOOL,
        argumentsJson: JSON.stringify({ location: RPG_DEPTH_ONE_LOCATION, recentEvent: "The keeper entered the inner observatory." }),
      },
      {
        name: CORPUS_RPG_JOURNAL_TOOL,
        argumentsJson: JSON.stringify({ type: "custom", label: "Second depth", title: RPG_JOURNAL_TITLES[1], content: "The inner ledger was opened." }),
      },
    ],
    usage: { promptTokens: 60, completionTokens: 20 },
  },
];
const roundCues = [RPG_CANCEL_CUE, RPG_AFTER_CANCEL_CUE, RPG_AFTER_CANCEL_CUE, RPG_FOREIGN_STOP_CUE, RPG_FOREIGN_STOP_CUE] as const;
const roundReplies: readonly CorpusProviderCompletion[] = [
  { text: RPG_ROUND_TEXT, toolCalls: [] },
  { text: RPG_ROUND_TEXT, toolCalls: [] },
  { text: "", toolCalls: [{ name: RPG_NO_CHANGES_TOOL, argumentsJson: "{}" }] },
  { text: RPG_ROUND_TEXT, toolCalls: [] },
  {
    text: "",
    toolCalls: [
      { name: CORPUS_RPG_SCENE_TOOL, argumentsJson: JSON.stringify({ location: RPG_ROUND_LOCATION, recentEvent: "The observatory round settled." }) },
      {
        name: CORPUS_RPG_JOURNAL_TOOL,
        argumentsJson: JSON.stringify({ type: "custom", label: "Settled", title: RPG_JOURNAL_TITLES[2], content: "The owner's round preserved the ledger." }),
      },
    ],
  },
];

function hasModel(body: string, model: string): boolean {
  return body.includes(`"model":${JSON.stringify(model)}`);
}

function announceRequest(observers: Map<string, PromiseWithResolvers<string>>, body: string): void {
  for (const [cue, observer] of observers) {
    if (body.includes(cue)) {
      observers.delete(cue);
      observer.resolve(body);
    }
  }
}

/** Each admitted depth/request spends its own bytes; the cancelled physical round spends no completed reply. */
export function createRpgFlightWire(): RpgFlightWire {
  const physical = createCorpusChatWire();
  const attempts: string[] = [];
  const recursionRequests: string[] = [];
  const roundRequests: string[] = [];
  const observers = new Map<string, PromiseWithResolvers<string>>();
  let recursion = 0;
  let rounds = 0;
  const recursiveCompletion = (body: string): CorpusProviderCompletion => {
    const reply = recursionReplies[recursion];
    const continued = body.includes('"role":"tool"') && body.includes("alreadyReacted");
    if (reply === undefined || !body.includes(RPG_RECURSION_CUE) || (recursion === 0 ? continued : !continued)) {
      throw new Error(`unscripted RPG recursion request at depth ${recursion}`);
    }
    recursion += 1;
    recursionRequests.push(body);
    return reply;
  };
  return {
    attempts,
    recursionRequests,
    roundRequests,
    hold: physical.hold,
    remaining: () => ({ recursion: recursionReplies.length - recursion, rounds: roundReplies.length - rounds }),
    nextRequest: (cue): Promise<string> => {
      if (observers.has(cue)) {
        throw new Error("an RPG physical request observation is already armed");
      }
      const observer = Promise.withResolvers<string>();
      observers.set(cue, observer);
      return observer.promise;
    },
    wrap: (execute): typeof fetch => {
      const held = physical.wrap(execute);
      return async (input, init): Promise<Response> => {
        const request = new Request(input, init);
        if (request.method !== "POST" || !new URL(request.url).pathname.endsWith("/chat/completions")) {
          return await held(request);
        }
        const body = await request.clone().text();
        if (hasModel(body, RPG_RECURSION_MODEL) || hasModel(body, RPG_ROUND_MODEL)) {
          attempts.push(body);
          announceRequest(observers, body);
        }
        return await held(request);
      };
    },
    completion: (body): CorpusProviderCompletion | undefined => {
      if (hasModel(body, RPG_RECURSION_MODEL)) {
        return recursiveCompletion(body);
      }
      if (!hasModel(body, RPG_ROUND_MODEL)) {
        return undefined;
      }
      const reply = roundReplies[rounds];
      const cue = roundCues[rounds];
      const required = body.includes('"tool_choice":"required"');
      if (reply === undefined || cue === undefined || !body.includes(cue) || required !== (rounds === 2 || rounds === 4)) {
        throw new Error(`unscripted RPG round request at physical step ${rounds}`);
      }
      rounds += 1;
      roundRequests.push(body);
      return reply;
    },
  };
}
