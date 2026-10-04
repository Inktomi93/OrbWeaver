// Gate: structured-plan-one-home — how structured output and tool calls go out is the structured planner's alone
// (`packages/inference/src/structured/plan.ts`); a caller elsewhere that scrubs a schema, names a vehicle or spells a
// tool choice is a second speller the planner cannot see. ARMS: an import of a planner-internal name; a string literal
// in the engine's `STRUCTURED_VEHICLES`; a `toolChoice` property write. DECLARED LIMIT: a name re-exported under an
// alias by an inference module is judged at its import, by its exported name. FAMILY: singleton — the vehicle tuple is
// read off the wire-subset engine; no sibling policy judges this subject. POPULATION: new — server, client,
// contracts and kit source outside the inference contract folder and outside tests.
import type { Node as MorphNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { STRUCTURED_VEHICLES_NAME, structuredVehiclesFact } from "../lib/structured-vehicles-fact.ts";
import { WIRE_SCHEMA_ENGINE } from "../lib/wire-schema-vocabulary-fact.ts";

/** Names that spell a structured request: the scrub, its violation readers, and the forced-choice capability reads.
 *  `checkWireSchema` and `planStructuredFor` are the API every caller may use, and are deliberately absent. */
const PLANNER_INTERNALS: ReadonlySet<string> = new Set([
  "scrubWireSchema",
  "scrubViolations",
  "countWireSchemas",
  "acceptsNamedToolChoice",
  "acceptsRequiredToolChoice",
]);
const INFERENCE_SPECIFIER = /(?:^|[/#])inference(?:\/|$)/u;
const TOOL_CHOICE = "toolChoice";

const MESSAGE =
  "a structured-output or tool-call spelling outside the structured planner — how a schema or tool choice goes out is packages/inference/src/structured/plan.ts's alone.";
const FIX =
  "state the need and let the planner decide: pass the schema as a ResponseFormat, ask `planStructuredFor` / `carriesStructured` / `forcesToolRound` from `@orb/inference`, or build a forced round with `toForcedToolRoundRequest`. A reviewed exception waives the reported token with `@orb-waive structured-plan-one-home(<token>): <reason + end condition>`, where the token is the imported name, the vehicle string, or `toolChoice`.";

/** A literal's text and the offset of that text inside the node (the opening quote). */
function literalSlice(node: MorphNode): { readonly text: string; readonly offset: number } | undefined {
  return Node.isStringLiteral(node) || Node.isNoSubstitutionTemplateLiteral(node) ? { text: node.getLiteralText(), offset: 1 } : undefined;
}

/** The written property name of a `toolChoice` write: an object member or an assignment target. */
function toolChoiceName(node: MorphNode): MorphNode | undefined {
  if ((Node.isPropertyAssignment(node) || Node.isShorthandPropertyAssignment(node)) && node.getName() === TOOL_CHOICE) {
    return node.getNameNode();
  }
  const left = Node.isBinaryExpression(node) && node.getOperatorToken().getKind() === SyntaxKind.EqualsToken ? node.getLeft() : undefined;
  return left !== undefined && Node.isPropertyAccessExpression(left) && left.getName() === TOOL_CHOICE ? left.getNameNode() : undefined;
}

export const gate = defineGate({
  id: "structured-plan-one-home",
  family: "structured-plan-one-home",
  authority: "ordinary",
  severity: "error",
  population: {
    in: ["@server", "@client", "@contracts", "@kit"],
    notUnder: ["**/*.test.ts", "**/*.test.tsx", "packages/contracts/src/inference/**"],
  },
  analysis: "types",
  execution: "entire-population",
  facts: [structuredVehiclesFact],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const literals: MorphNode[] = [];
    return {
      visitors: [
        {
          kinds: [SyntaxKind.ImportSpecifier],
          visit: (node) => {
            if (!Node.isImportSpecifier(node)) {
              return;
            }
            const name = node.getName();
            const specifier = node.getImportDeclaration().getModuleSpecifierValue();
            if (PLANNER_INTERNALS.has(name) && INFERENCE_SPECIFIER.test(specifier)) {
              ctx.report.node(node, { token: name, offset: 0 });
            }
          },
        },
        {
          kinds: [SyntaxKind.StringLiteral, SyntaxKind.NoSubstitutionTemplateLiteral],
          visit: (node) => {
            literals.push(node);
          },
        },
        {
          kinds: [SyntaxKind.PropertyAssignment, SyntaxKind.ShorthandPropertyAssignment, SyntaxKind.BinaryExpression],
          visit: (node) => {
            const name = toolChoiceName(node);
            if (name !== undefined) {
              ctx.report.node(name, { token: TOOL_CHOICE, offset: 0 });
            }
          },
        },
      ],
      evaluate: () => {
        const vehicles = ctx.fact(structuredVehiclesFact).values;
        ctx.receipt({ kind: "population", source: "structured-vehicles", members: vehicles.size });
        for (const node of literals) {
          const slice = literalSlice(node);
          if (slice !== undefined && vehicles.has(slice.text)) {
            ctx.report.node(node, { token: slice.text, offset: slice.offset });
          }
        }
      },
    };
  },
  mustFlag: [
    {
      mode: "types",
      files: {
        [WIRE_SCHEMA_ENGINE]: `export const ${STRUCTURED_VEHICLES_NAME} = ["response-format", "forced-tool", "offered-tool"] as const;\nexport function scrubWireSchema(schema: object): object {\n  return schema;\n}\n`,
        "packages/contracts/src/inference/index.ts": 'export * from "./wire-subset.ts";\n',
        "packages/server/src/domain/x/scrub.ts": 'import { scrubWireSchema } from "@orb/contracts/inference";\nexport const s = scrubWireSchema;\n',
      },
      expect: { count: 1, token: "scrubWireSchema" },
      why: "a server module importing the scrub spells the wire subset itself instead of letting the planner choose the mode",
    },
    {
      mode: "types",
      files: {
        [WIRE_SCHEMA_ENGINE]: `export const ${STRUCTURED_VEHICLES_NAME} = ["response-format", "forced-tool", "offered-tool"] as const;\n`,
        "packages/server/src/domain/x/vehicle.ts": 'export const format = { name: "x", vehicle: "forced-tool" };\n',
      },
      expect: { count: 1, token: "forced-tool" },
      why: "a caller naming a vehicle chooses how its payload rides — the planner's decision, read from the engine's tuple",
    },
    {
      mode: "types",
      files: {
        [WIRE_SCHEMA_ENGINE]: `export const ${STRUCTURED_VEHICLES_NAME} = ["response-format", "forced-tool", "offered-tool"] as const;\n`,
        "packages/server/src/domain/x/choice.ts": 'export const request = { tools: [], toolChoice: { mode: "required" } };\n',
      },
      expect: { count: 1, token: "toolChoice" },
      why: "a caller writing a tool choice decides forced against auto, which only the plan may (it downgrades what the model refuses)",
    },
    {
      mode: "types",
      files: {
        [WIRE_SCHEMA_ENGINE]: `export const ${STRUCTURED_VEHICLES_NAME} = ["response-format", "forced-tool", "offered-tool"] as const;\n`,
        "packages/client/src/features/x/assign.ts": 'export function f(req: { toolChoice?: string }): void {\n  req.toolChoice = "auto";\n}\n',
      },
      expect: { count: 1, token: "toolChoice" },
      why: "the assignment spelling of a tool-choice write is the same decision as the object-literal one",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        [WIRE_SCHEMA_ENGINE]: `export const ${STRUCTURED_VEHICLES_NAME} = ["response-format", "forced-tool", "offered-tool"] as const;\nexport function scrubWireSchema(schema: object): object {\n  return schema;\n}\nexport const toolChoice = "forced-tool";\n`,
        "packages/server/src/domain/x/ok.ts":
          'import { checkWireSchema } from "@orb/contracts/inference";\nexport const c = checkWireSchema;\nexport const label = "response format";\n',
      },
      why: "the engine itself and the allowed check API pass; an English phrase near a vehicle word is not the vocabulary (the `notUnder` fence keeps the engine out, and the second file keeps the population admitted)",
    },
    {
      mode: "types",
      files: {
        [WIRE_SCHEMA_ENGINE]: `export const ${STRUCTURED_VEHICLES_NAME} = ["response-format", "forced-tool", "offered-tool"] as const;\n`,
        "packages/server/src/domain/x/x.test.ts": 'export const request = { toolChoice: "forced-tool" };\n',
        "packages/server/src/domain/x/y.ts": "export const y = 1;\n",
      },
      why: "a test may build a request by hand: the `**/*.test.ts` fence keeps tests out, and the admitted sibling keeps the pass from refusing as empty",
    },
    {
      mode: "types",
      files: {
        [WIRE_SCHEMA_ENGINE]: `export const ${STRUCTURED_VEHICLES_NAME} = ["response-format", "forced-tool", "offered-tool"] as const;\n`,
        "packages/server/src/domain/x/choice.ts":
          '// @orb-waive structured-plan-one-home(toolChoice): the proof stand-in reason; ends when this fixture stops flagging.\nexport const request = { tools: [], toolChoice: { mode: "required" } };\n',
      },
      why: "POSITIONAL IDENTITY: the report passes `toolChoice` at offset 0 of the property name, so the marker above the statement waives exactly mustFlag[2]'s one finding",
    },
  ],
  mustRefuse: [
    {
      mode: "types",
      files: { [WIRE_SCHEMA_ENGINE]: "export const nothing = 1;\n", "packages/server/src/domain/x/y.ts": 'export const y = "forced-tool";\n' },
      expect: { messageIncludes: `has no ${STRUCTURED_VEHICLES_NAME} initializer` },
      why: "without the engine's tuple the policy cannot know the vehicle vocabulary and refuses rather than passing blind",
    },
  ],
});
