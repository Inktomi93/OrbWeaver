// Visitor-fed JSON-Schema vocabulary owned by the canonical wire-subset engine.
import type { VariableDeclaration } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineFact } from "../contract/fact.ts";
import { readStaticAuthoredValue } from "./static-authored-value.ts";

export const WIRE_SCHEMA_ENGINE = "packages/contracts/src/inference/wire-subset.ts";
export const WIRE_SCHEMA_VOCABULARY_NAMES = ["BOUND_KEYWORDS", "META_KEYWORDS", "ANNOTATION_KEYWORDS"] as const;

export interface WireSchemaVocabulary {
  readonly values: ReadonlySet<string>;
}

function tupleValues(name: string, declaration: VariableDeclaration | undefined): readonly string[] {
  const initializer = declaration?.getInitializer();
  if (initializer === undefined) {
    throw new Error(`wire-schema-vocabulary: ${WIRE_SCHEMA_ENGINE} has no ${name} initializer`);
  }
  const authored = readStaticAuthoredValue(initializer);
  if (authored.kind === "unresolved" || authored.value.kind !== "tuple") {
    throw new Error(`wire-schema-vocabulary: ${name} is not a readable authored tuple`);
  }
  return authored.value.elements.map((entry) => {
    if (entry.kind !== "scalar" || typeof entry.value !== "string") {
      throw new Error(`wire-schema-vocabulary: ${name} contains a non-string member`);
    }
    return entry.value;
  });
}

export const wireSchemaVocabularyFact = defineFact({
  id: "wire-schema-vocabulary",
  population: { in: ["@contracts"] },
  analysis: "types",
  resources: [],
  create: (ctx) => {
    const declarations = new Map<string, VariableDeclaration>();
    return {
      visitors: [
        {
          kinds: [SyntaxKind.VariableDeclaration],
          visit: (node, sourceFile) => {
            if (!(Node.isVariableDeclaration(node) && ctx.relativePath(sourceFile) === WIRE_SCHEMA_ENGINE)) {
              return;
            }
            if ((WIRE_SCHEMA_VOCABULARY_NAMES as readonly string[]).includes(node.getName())) {
              declarations.set(node.getName(), node);
            }
          },
        },
      ],
      finish: (): WireSchemaVocabulary => {
        const values = new Set<string>();
        for (const name of WIRE_SCHEMA_VOCABULARY_NAMES) {
          for (const value of tupleValues(name, declarations.get(name))) {
            values.add(value);
          }
        }
        if (values.size === 0) {
          throw new Error("wire-schema-vocabulary: the engine vocabulary is empty");
        }
        ctx.receipt({ kind: "population", source: "wire-schema-vocabulary", members: values.size });
        return Object.freeze({ values });
      },
    };
  },
});
