// The structured planner's vehicle vocabulary, read off the wire-subset engine's authored tuple.
import type { VariableDeclaration } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineFact } from "../contract/fact.ts";
import { readStaticAuthoredValue } from "./static-authored-value.ts";
import { WIRE_SCHEMA_ENGINE } from "./wire-schema-vocabulary-fact.ts";

export const STRUCTURED_VEHICLES_NAME = "STRUCTURED_VEHICLES";

export interface StructuredVehicleVocabulary {
  readonly values: ReadonlySet<string>;
}

function vehiclesOf(declaration: VariableDeclaration | undefined): readonly string[] {
  const initializer = declaration?.getInitializer();
  if (initializer === undefined) {
    throw new Error(`structured-vehicles: ${WIRE_SCHEMA_ENGINE} has no ${STRUCTURED_VEHICLES_NAME} initializer`);
  }
  const authored = readStaticAuthoredValue(initializer);
  if (authored.kind === "unresolved" || authored.value.kind !== "tuple") {
    throw new Error(`structured-vehicles: ${STRUCTURED_VEHICLES_NAME} is not a readable authored tuple`);
  }
  return authored.value.elements.map((entry) => {
    if (entry.kind !== "scalar" || typeof entry.value !== "string") {
      throw new Error(`structured-vehicles: ${STRUCTURED_VEHICLES_NAME} contains a non-string member`);
    }
    return entry.value;
  });
}

export const structuredVehiclesFact = defineFact({
  id: "structured-vehicles",
  population: { in: ["@contracts"] },
  analysis: "types",
  resources: [],
  create: (ctx) => {
    let declaration: VariableDeclaration | undefined;
    return {
      visitors: [
        {
          kinds: [SyntaxKind.VariableDeclaration],
          visit: (node, sourceFile) => {
            if (Node.isVariableDeclaration(node) && ctx.relativePath(sourceFile) === WIRE_SCHEMA_ENGINE && node.getName() === STRUCTURED_VEHICLES_NAME) {
              declaration = node;
            }
          },
        },
      ],
      finish: (): StructuredVehicleVocabulary => {
        const values = new Set(vehiclesOf(declaration));
        if (values.size === 0) {
          throw new Error("structured-vehicles: the vehicle vocabulary is empty");
        }
        ctx.receipt({ kind: "population", source: "structured-vehicles", members: values.size });
        return Object.freeze({ values });
      },
    };
  },
});
