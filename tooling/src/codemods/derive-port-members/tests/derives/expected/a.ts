import type { Other } from "./other.ts";
import type { Present, SessionsService } from "./door/index.ts";
import type { Clock } from "@orb/kit/time";
import type { RandomSource } from "@orb/kit/macro";

/** A port the owner restates whole. */
export interface WholePort extends Readonly<Pick<SessionsService, "create" | "revoke">> {}

export interface MixedPort {
  /** Keeps its doc and modifiers. */
  readonly create?: SessionsService["create"];
  lookup: SessionsService["lookup"];
  readonly kept: (id: string) => Other;
}

export interface ClockPort {
  readonly now: Clock;
  readonly random: RandomSource;
}

export interface Deps {
  readonly sessions: { revoke: SessionsService["revoke"] };
}

// The same shape, not a target: it stays hand-typed.
export interface Untouched {
  readonly create: (input: string) => Promise<number>;
  readonly present: Present;
}
