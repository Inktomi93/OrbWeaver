// The shared shapes of the caught-failure ownership reader: the native read services and the detector arms.

import type { Identifier, Node, SourceFile } from "ts-morph";
import type { TypeObservationReader } from "../../floor/code-facts/type-observations-contract.ts";
import type { NativeTypeContext } from "./project-context.ts";

export interface CaughtFailureReadServices {
  readonly types: TypeObservationReader;
  readonly references: (identifier: Identifier) => readonly Node[];
}

export interface CaughtFailureTraversal {
  readonly seen: ReadonlySet<Node>;
  readonly reads?: CaughtFailureReadServices | undefined;
}

export interface NativeFailureRead {
  readonly prepare: () => void;
  readonly at: (source: SourceFile) => CaughtFailureReadServices;
}

export interface NativeFailureContext {
  readonly files: readonly SourceFile[];
  readonly nativeTypes?: Pick<NativeTypeContext, "request" | "invocationEvidence" | "references"> | undefined;
}

/** The three detector arms. ONE tuple, so a fourth arm is a row here and `tsc` finds every reader
 *  (Spine-TypeScript-and-Patterns.md, string-union dispatch). Homed here rather than in `lib/caught-failure.ts`
 *  (#1988): the arm crosses the lib↔policy boundary — the detector raises it and
 *  `gates/caught-failure-ownership.ts` keys its per-arm message map on it. */
export const CAUGHT_FAILURE_ARMS = ["default", "empty", "promise"] as const;
export type CaughtFailureArm = (typeof CAUGHT_FAILURE_ARMS)[number];
