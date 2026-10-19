// Which optional nominations each raw question kind may carry; a nomination on any other kind is foreign.
import type { TypeObservationQuestion } from "./type-observations-contract.ts";

// `value-profiles` must carry value facets; these kinds may; every other kind must not.
const FACETED_KINDS: ReadonlySet<TypeObservationQuestion["kind"]> = new Set<TypeObservationQuestion["kind"]>([
  "ct-contributions",
  "ct-mounting",
  "browser-contracts",
  "definition-closure",
  "declaration-closure",
  "const-initializers",
  "drizzle-predicate-inputs",
  "selected-property-graph",
  "callable-body-values",
  "symbol-closure",
]);

const CLOSURE_KINDS: ReadonlySet<TypeObservationQuestion["kind"]> = new Set<TypeObservationQuestion["kind"]>(["symbol-closure", "reference-closure"]);

export function assertQuestionNominations<Anchor>(questions: readonly TypeObservationQuestion<Anchor>[]): void {
  if (questions.some((q) => (q.kind === "value-profiles" ? q.valueFacets === undefined : !FACETED_KINDS.has(q.kind) && q.valueFacets !== undefined))) {
    throw new Error("native value facets have no closed nomination");
  }
  for (const q of questions) {
    const closure = CLOSURE_KINDS.has(q.kind);
    if (!closure && [q.callLiteralMembers, q.presenceMembers, q.closureHops, q.closureHandlerBodiesOnly].some((value) => value !== undefined)) {
      throw new Error("native closure member nomination is foreign");
    }
    if (closure && q.closureHops === undefined) {
      throw new Error("native symbol closure is unbounded");
    }
  }
}
