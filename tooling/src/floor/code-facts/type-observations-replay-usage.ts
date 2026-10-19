// After a replay re-asks every nominated question, each captured row must have been asked; an unasked row is foreign.
import type { Node } from "ts-morph";
import { constInitializerNominations } from "./type-observation-questions.ts";
import type { NativeTypeObservations, TypeObservationReader } from "./type-observations-contract.ts";

export function assertCallableBodyUsage(facts: NativeTypeObservations, used: ReadonlySet<Node>): void {
  if ((facts.callableBodies ?? []).some((row) => !used.has(row.node))) {
    throw new Error("native callable body question is foreign");
  }
}

export function assertDetailCoverage(
  facts: NativeTypeObservations,
  displays: ReadonlySet<number>,
  literals: ReadonlySet<number>,
  argumentsUsed: ReadonlySet<number>,
): void {
  if (
    facts.types.some(
      (row, index) =>
        row !== null &&
        ((row.defaultDisplay !== undefined) !== displays.has(index) ||
          (row.literalValue !== undefined) !== literals.has(index) ||
          (row.typeArguments !== undefined) !== argumentsUsed.has(index) ||
          (row.typeArgumentCount !== undefined) !== argumentsUsed.has(index)),
    )
  ) {
    throw new Error("native Type detail coverage is missing or foreign");
  }
}

export function assertConstInitializerRelationships(facts: NativeTypeObservations, reader: TypeObservationReader): void {
  const initializerPaths = constInitializerNominations(
    (facts.demand.questions ?? []).filter((question) => question.kind === "const-initializers").flatMap((question) => question.nodes),
    reader,
  );
  const capturedPaths = facts.constInitializers ?? [];
  if (
    initializerPaths.length !== capturedPaths.length ||
    initializerPaths.some((path, index) => {
      const captured = capturedPaths[index];
      return (
        captured === undefined ||
        captured.node !== path.node ||
        captured.values.length !== path.values.length ||
        path.values.some((value, at) => captured.values[at] !== value)
      );
    })
  ) {
    throw new Error("native const initializer relationships are missing or foreign");
  }
}

export function assertGraphQuestionUsage(
  facts: NativeTypeObservations,
  intersections: ReadonlySet<number>,
  constraints: ReadonlySet<number>,
  declarations: ReadonlySet<string>,
): void {
  if (
    (facts.intersections ?? []).some((row) => !intersections.has(row.selector)) ||
    (facts.constraints ?? []).some((row) => !constraints.has(row.selector)) ||
    (facts.signatureDeclarations ?? []).some((row) => !declarations.has(JSON.stringify([row.selector, row.kind])))
  ) {
    throw new Error("native Type graph question coverage is foreign");
  }
}
