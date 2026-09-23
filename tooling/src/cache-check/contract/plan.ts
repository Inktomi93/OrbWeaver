// The probe plan's shapes: a character card, a room, and the steps one case runs. The data is lib/fixture.ts.
import type { GroupConfigInput, OpeningPolicy } from "@orb/contracts/chat";

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
}

/** Which of a step's provider calls join the case's judged sequence. */
export const MEASURES = ["none", "last", "all"] as const;
export type Measure = (typeof MEASURES)[number];

/** One step of a case: a send (with the reply count a group round must produce), a continue, or an in-chat note. */
export type ProbeStep =
  | { readonly kind: "send"; readonly content: string; readonly measure: Measure; readonly speakers?: number }
  | { readonly kind: "continue"; readonly measure: Measure }
  | { readonly kind: "note"; readonly depth: number; readonly content: string };

export interface CasePlan {
  readonly room: RoomKind;
  readonly steps: readonly ProbeStep[];
}
