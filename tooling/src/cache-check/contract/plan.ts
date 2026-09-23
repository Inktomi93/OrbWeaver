// The probe plan's shapes: a character card, a room, and the steps one case runs. The data is lib/fixture.ts.
import type { GroupConfigInput, OpeningPolicy } from "@orb/contracts/chat";
import type { CacheCase } from "./types.ts";

/** One probe character. `key` names it inside a run; the stored handle adds the run tag. */
export interface CardSpec {
  readonly key: string;
  readonly name: string;
  readonly description: string;
  readonly greeting: string;
  readonly systemPrompt: string;
}

export const ROOM_KINDS = ["solo", "per-speaker", "narrator"] as const;
export type RoomKind = (typeof ROOM_KINDS)[number];

export interface RoomSpec {
  readonly cards: readonly CardSpec[];
  /** `generate` is not a creation-time opening; it is a turn run after the chat exists. */
  readonly opening: Exclude<OpeningPolicy, "generate">;
  /** Null for a one-character chat. */
  readonly group: GroupConfigInput | null;
  /** The steps that put the shared prefix into the room's history, run once before its cases. A call they
   *  measure opens the judged sequence of the room's first case. */
  readonly prefixSteps: readonly ProbeStep[];
}

/** Which of a step's provider calls join the case's judged sequence. */
export const MEASURES = ["none", "last", "all"] as const;
export type Measure = (typeof MEASURES)[number];

/** One step: a send (with the reply count a group round must produce), a continue, an in-chat note, a user row
 *  committed without a reply, or an unmeasured generate that answers it. */
export type ProbeStep =
  | { readonly kind: "send"; readonly content: string; readonly measure: Measure; readonly speakers?: number }
  | { readonly kind: "continue"; readonly measure: Measure }
  | { readonly kind: "note"; readonly depth: number; readonly content: string }
  | { readonly kind: "commit"; readonly content: string }
  | { readonly kind: "generate"; readonly measure: Extract<Measure, "none" | "last"> };

export interface CasePlan {
  readonly room: RoomKind;
  readonly steps: readonly ProbeStep[];
}

/** The cases one room runs, in order, in one shared chat. */
export interface RoomRun {
  readonly room: RoomKind;
  readonly cases: readonly CacheCase[];
}
