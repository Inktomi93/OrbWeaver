// Gate: structured-plan-one-home — how structured output and tool calls go out is the structured planner's alone
// (`packages/inference/src/structured/plan.ts`); a caller elsewhere that scrubs a schema, names a vehicle or spells a
// tool choice is a second speller the planner cannot see. ARMS: a planner-internal name taken from an inference module
// by named import, re-export or a namespace import's member; a string literal in the engine's `STRUCTURED_VEHICLES`; a
// `toolChoice` property write. DECLARED LIMIT: a computed namespace member is not judged. FAMILY: singleton — the vehicle tuple is
// read off the wire-subset engine; no sibling policy judges this subject. POPULATION: new — server, client,
// contracts and kit source outside the inference contract folder and outside tests.
import type { Node as MorphNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { resolveModuleMemberOrigin } from "../../_shared/reference-fact.ts";
import { defineGate } from "../contract/policy.ts";
import { STRUCTURED_VEHICLES_NAME, structuredVehiclesFact } from "../lib/structured-vehicles-fact.ts";
import { readMemberAccess } from "../lib/symbol-reference.ts";
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
  "state the need and let the planner decide: pass the schema as a ResponseFormat, ask `planStructuredFor` / `carriesStructured` / `forcesToolRound` from `@orb/inference`, or build a forced round with `toForcedToolRoundRequest`. A reviewed exception waives the reported token with `@orb-waive structured-plan-one-home(<token>): <reason + end condition>`, where the token is the imported name, the vehicle string, or the authored tool-choice property key.";

/** A literal's text and the offset of that text inside the node (the opening quote). */
function literalSlice(node: MorphNode): { readonly text: string; readonly offset: number } | undefined {
  return Node.isStringLiteral(node) || Node.isNoSubstitutionTemplateLiteral(node) ? { text: node.getLiteralText(), offset: 1 } : undefined;
}

/** Where a member access's name sits: the property name, or the string argument of `ns["name"]`. */
function memberNameNode(node: MorphNode): MorphNode | undefined {
  if (Node.isPropertyAccessExpression(node)) {
    return node.getNameNode();
  }
  return Node.isElementAccessExpression(node) ? node.getArgumentExpression() : undefined;
}

/** The planner-internal member a namespace import of an inference module reads, through the shared origin reader. */
function namespaceMember(node: MorphNode): { readonly name: string; readonly at: MorphNode } | undefined {
  const at = memberNameNode(node);
  const origin = at === undefined ? undefined : resolveModuleMemberOrigin(node);
  if (at === undefined || origin?.kind !== "resolved" || !INFERENCE_SPECIFIER.test(origin.value.moduleSpecifier)) {
    return;
  }
  const [member] = origin.value.memberPath;
  // A namespace read names the internal in its member path; a named import's own member (`.call`) is not one.
  const name = origin.value.memberPath.length === 0 ? origin.value.exportedName : member;
  return name !== undefined && PLANNER_INTERNALS.has(name) ? { name, at } : undefined;
}

/** The module an import or re-export specifier names, and the name it takes from it. */
function specifierSource(node: MorphNode): { readonly name: string; readonly module: string | undefined } | undefined {
  if (Node.isImportSpecifier(node)) {
    return { name: node.getName(), module: node.getImportDeclaration().getModuleSpecifierValue() };
  }
  return Node.isExportSpecifier(node) ? { name: node.getName(), module: node.getExportDeclaration().getModuleSpecifierValue() } : undefined;
}

/** The written property name of a `toolChoice` write: an object member or an assignment target. */
function toolChoiceName(node: MorphNode): MorphNode | undefined {
  if ((Node.isPropertyAssignment(node) || Node.isShorthandPropertyAssignment(node)) && node.getName() === TOOL_CHOICE) {
    return node.getNameNode();
  }
  const left = Node.isBinaryExpression(node) && node.getOperatorToken().getKind() === SyntaxKind.EqualsToken ? node.getLeft() : undefined;
  const read = left === undefined ? undefined : readMemberAccess(left);
  return read?.name === TOOL_CHOICE ? read.nameNode : undefined;
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
          kinds: [SyntaxKind.ImportSpecifier, SyntaxKind.ExportSpecifier],
          visit: (node) => {
            const source = specifierSource(node);
            if (source?.module !== undefined && PLANNER_INTERNALS.has(source.name) && INFERENCE_SPECIFIER.test(source.module)) {
              ctx.report.node(node, { token: source.name, offset: 0 });
            }
          },
        },
        {
          kinds: [SyntaxKind.PropertyAccessExpression, SyntaxKind.ElementAccessExpression],
          visit: (node) => {
            const member = namespaceMember(node);
            if (member !== undefined) {
              ctx.report.node(member.at, { token: member.name, offset: Node.isStringLiteral(member.at) ? 1 : 0 });
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
              const slice = literalSlice(name);
              ctx.report.node(name, slice === undefined ? { token: name.getText(), offset: 0 } : { token: slice.text, offset: slice.offset });
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
        [WIRE_SCHEMA_ENGINE]: `export const ${STRUCTURED_VEHICLES_NAME} = ["response-format", "forced-tool", "offered-tool"] as const;\n`,
        "packages/client/src/features/x/bracket.ts": 'export function f(req: { toolChoice?: string }): void { req["toolChoice"] = "auto"; }\n',
      },
      expect: { count: 1, token: "toolChoice" },
      why: "a quoted static bracket assignment is the same tool-choice decision and anchors inside its quote",
    },
    {
      mode: "types",
      files: {
        [WIRE_SCHEMA_ENGINE]: `export const ${STRUCTURED_VEHICLES_NAME} = ["response-format", "forced-tool", "offered-tool"] as const;\n`,
        "packages/client/src/features/x/key.ts": 'const KEY = "toolChoice"; export function f(req: { toolChoice?: string }): void { req[KEY] = "auto"; }\n',
      },
      expect: { count: 1, token: "KEY" },
      why: "a static key binding names the same tool-choice write while its authored KEY remains the report position",
    },
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
        "packages/server/src/domain/x/ns.ts": 'import * as inf from "@orb/contracts/inference";\nexport const s = inf.scrubWireSchema;\n',
      },
      expect: { count: 1, token: "scrubWireSchema" },
      why: "a namespace import's member is the same scrub as a named import of it",
    },
    {
      mode: "types",
      files: {
        [WIRE_SCHEMA_ENGINE]: `export const ${STRUCTURED_VEHICLES_NAME} = ["response-format", "forced-tool", "offered-tool"] as const;\n`,
        "packages/server/src/domain/x/re.ts": 'export { scrubWireSchema as scrub } from "@orb/contracts/inference";\n',
      },
      expect: { count: 1, token: "scrubWireSchema" },
      why: "a re-export under an alias hands the scrub to every importer of the alias, which the import visitor alone never sees",
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
        [WIRE_SCHEMA_ENGINE]: `export const ${STRUCTURED_VEHICLES_NAME} = ["response-format", "forced-tool", "offered-tool"] as const;\n`,
        "packages/client/src/features/x/waived-bracket.ts":
          'export function f(req: { toolChoice?: string }): void {\n  // @orb-waive structured-plan-one-home(toolChoice): this exact bracket decision is reviewed; ends if the fixture stops writing it.\n  req["toolChoice"] = "auto";\n}\n',
      },
      why: "the quoted bracket position binds exactly one existing ordinary waiver",
    },
    {
      mode: "types",
      files: {
        [WIRE_SCHEMA_ENGINE]: `export const ${STRUCTURED_VEHICLES_NAME} = ["response-format", "forced-tool", "offered-tool"] as const;\n`,
        "packages/client/src/features/x/read.ts":
          'export function read(req: { toolChoice?: string; label?: string }, key: string): string | undefined { req["label"] = "auto"; req[key] = "auto"; return req["toolChoice"]; }\n',
      },
      why: "reading toolChoice, writing another member, and an unreadable dynamic key are not a proved tool-choice write",
    },
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
