// Appearance graph evidence collected by the shared dispatcher. The source fence preserves the
// legacy client population plus its exact schema and tooling projection inputs.
import type { SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineFact } from "../contract/fact.ts";
import { belongsToObjectDeclaration } from "./appearance-carrier-contract-ast.ts";
import { MANIFEST_SYMBOL, readAppearanceCarrierGraph, SCHEMA_FILE, SNAP_APPEARANCE_FILE } from "./appearance-carrier-graph.ts";

const PLANTED_MANIFEST_BASENAME = "__g_appearance-carrier-manifest.ts";
export const APPEARANCE_POPULATION = {
  in: ["@client", "@contracts", "@tooling"],
  under: ["packages/client/src/**", SCHEMA_FILE, SNAP_APPEARANCE_FILE],
} as const;

export const appearanceCarrierFact = defineFact({
  id: "appearance-carrier",
  population: APPEARANCE_POPULATION,
  analysis: "syntax",
  resources: [],
  create: (ctx) => {
    const identifiersByFunction = new Map<string, Set<string>>();
    const declaredFunctions = new Set<string>();
    const collectedSchemaLeaves = new Set<string>();
    const plantedManifestSources = new Map<string, SourceFile>();
    return {
      visitors: [
        {
          kinds: [SyntaxKind.PropertyAssignment],
          visit: (node, sf) => {
            const file = ctx.relativePath(sf);
            if (file.endsWith(`/${PLANTED_MANIFEST_BASENAME}`) && belongsToObjectDeclaration(node, MANIFEST_SYMBOL)) {
              plantedManifestSources.set(file, sf);
            }
            if (!Node.isPropertyAssignment(node) || file !== SCHEMA_FILE) {
              return;
            }
            const object = node.getParent();
            const call = object.getParent();
            const expression = Node.isCallExpression(call) ? call.getExpression() : undefined;
            const declaration = node.getFirstAncestorByKind(SyntaxKind.VariableDeclaration);
            if (
              Node.isObjectLiteralExpression(object) &&
              Node.isPropertyAccessExpression(expression) &&
              expression.getName() === "object" &&
              declaration?.getName() === "appearanceSettingsSchema"
            ) {
              collectedSchemaLeaves.add(node.getNameNode().getText().replaceAll('"', "").replaceAll("'", ""));
            }
          },
        },
        {
          kinds: [SyntaxKind.FunctionDeclaration, SyntaxKind.Identifier],
          visit: (node, sf) => {
            const file = ctx.relativePath(sf);
            if (Node.isFunctionDeclaration(node)) {
              const name = node.getName();
              if (name !== undefined) {
                declaredFunctions.add(`${file}#${name}`);
              }
              return;
            }
            if (!Node.isIdentifier(node)) {
              return;
            }
            const fn = node.getFirstAncestorByKind(SyntaxKind.FunctionDeclaration);
            const name = fn?.getName();
            if (name === undefined) {
              return;
            }
            const key = `${file}#${name}`;
            const ids = identifiersByFunction.get(key) ?? new Set<string>();
            ids.add(node.getText());
            identifiersByFunction.set(key, ids);
          },
        },
      ],
      finish: () => {
        ctx.receipt({ kind: "population", source: "appearance-carrier-sources", members: ctx.files.length });
        return {
          sources: ctx.files.length,
          ...readAppearanceCarrierGraph(new Map(ctx.files.map((file) => [ctx.relativePath(file), file])), {
            identifiersByFunction,
            declaredFunctions,
            collectedSchemaLeaves,
            plantedManifestSources,
          }),
        };
      },
    };
  },
});
