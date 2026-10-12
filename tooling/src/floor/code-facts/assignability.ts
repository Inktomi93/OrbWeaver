// The compiler checker's assignability primitive, shared by `pnpm ast respell` and the verify gates that judge a
// value against a type. Each caller refuses in its own voice when the primitive is absent; none may answer a
// silent zero, because a comparison that quietly stops running reads as a clean result.
import type { TypeChecker } from "ts-morph";

export interface AssignabilityChecker {
  isTypeAssignableTo: (source: unknown, target: unknown) => boolean;
}

/** The checker's `isTypeAssignableTo`, a TypeScript internal present on the TS 5.x and TS7 checker objects
 *  (re-verify on a TypeScript bump). Undefined when this build does not expose it. */
export function readAssignabilityChecker(checker: Pick<TypeChecker, "compilerObject">): AssignabilityChecker | undefined {
  const compiler = checker.compilerObject as unknown as Partial<AssignabilityChecker>;
  return typeof compiler.isTypeAssignableTo === "function" ? { isTypeAssignableTo: compiler.isTypeAssignableTo.bind(compiler) } : undefined;
}
