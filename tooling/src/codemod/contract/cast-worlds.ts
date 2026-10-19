// The typed id-cast arms' world reader: the native workspace one scan asks, and what it could not answer.
import type { SemanticWorkspace } from "../../floor/compiler/ts-workspace.ts";

/** A typed cast arm the worlds could not answer: a whole file (`line` undefined) or one site. */
export interface CastSkip {
  readonly arm: string;
  readonly path: string;
  readonly line: number | undefined;
  readonly reason: string;
}

/** The typed question one scan asks, and every site or file the worlds could not answer. */
export interface WorldReader {
  readonly semantic: SemanticWorkspace;
  readonly repoRoot: string;
  readonly skips: CastSkip[];
}
