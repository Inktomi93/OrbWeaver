import type { Other } from "./other.ts";
import type { Present } from "./door/index.ts";

/** A port the owner restates whole. */
export interface WholePort {
  readonly create: (input: string) => Promise<number>;
  readonly revoke: (token: string) => Promise<void>;
}

export interface MixedPort {
  /** Keeps its doc and modifiers. */
  readonly create?: (input: string) => Promise<number>;
  lookup(id: string): Promise<string | null>;
  readonly kept: (id: string) => Other;
}

export interface ClockPort {
  readonly now: () => number;
  readonly random: () => number;
}

export interface ParamsPort {
  readonly lookup: (id: string) => Promise<string>;
}

export interface Deps {
  readonly sessions: { revoke(token: string): Promise<void> };
}

// The same shape with no flow: a review target, which the codemod never applies.
export interface Untouched {
  readonly create: (input: string) => Promise<number>;
  readonly present: Present;
}

// An alias that restates the owner's shape takes the owner's type.
export type LocalLookup = (id: string) => Promise<string | null>;
