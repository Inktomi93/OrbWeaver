// Dispatcher-owned syntax inventory for the gate-modernization meta-policy. The policy judges several
// module-wide shapes, but it does not own a second AST walk: string-like nodes and calls are collected once
// through the shared fact visitor, then consumed alongside the source file's declaration surface.
import type { Node as MorphNode, SourceFile } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import { defineFact } from "../contract/fact.ts";
import type { GatePolicyContext } from "../contract/policy.ts";

export const GATE_MODERNIZATION_POPULATION = {
  in: ["@tooling"],
  under: ["tooling/src/verify/gates/*.ts"],
  notNamed: ["*.d.ts", "__g_*", "__dc_*"],
} as const;

const STRING_KINDS = [
  SyntaxKind.StringLiteral,
  SyntaxKind.NoSubstitutionTemplateLiteral,
  SyntaxKind.TemplateHead,
  SyntaxKind.TemplateMiddle,
  SyntaxKind.TemplateTail,
] as const;

export interface GateModernizationModuleSyntax {
  readonly sourceFile: SourceFile;
  readonly strings: readonly MorphNode[];
  readonly calls: readonly MorphNode[];
}

export interface GateModernizationFacts {
  readonly modules: readonly GateModernizationModuleSyntax[];
  readonly receipt: { readonly source: string; readonly members: number };
}

interface MutableModuleSyntax {
  readonly sourceFile: SourceFile;
  readonly strings: MorphNode[];
  readonly calls: MorphNode[];
}

function mutableModule(modules: Map<SourceFile, MutableModuleSyntax>, sourceFile: SourceFile): MutableModuleSyntax {
  let module = modules.get(sourceFile);
  if (module === undefined) {
    module = { sourceFile, strings: [], calls: [] };
    modules.set(sourceFile, module);
  }
  return module;
}

/** Test/helper reader over one already-parsed module. Production policies consume the fact below. */
export function readGateModernizationModule(sourceFile: SourceFile): GateModernizationModuleSyntax {
  const module: MutableModuleSyntax = { sourceFile, strings: [], calls: [] };
  sourceFile.forEachDescendant((node) => {
    if ((STRING_KINDS as readonly SyntaxKind[]).includes(node.getKind())) {
      module.strings.push(node);
    }
    if (node.getKind() === SyntaxKind.CallExpression) {
      module.calls.push(node);
    }
  });
  return module;
}

export const gateModernizationFact = defineFact({
  id: "gate-modernization-syntax",
  population: GATE_MODERNIZATION_POPULATION,
  analysis: "syntax",
  resources: [],
  create: (ctx) => {
    const modules = new Map<SourceFile, MutableModuleSyntax>();
    return {
      visitFile: (sourceFile) => {
        mutableModule(modules, sourceFile);
      },
      visitors: [
        {
          kinds: STRING_KINDS,
          visit: (node, sourceFile) => {
            mutableModule(modules, sourceFile).strings.push(node);
          },
        },
        {
          kinds: [SyntaxKind.CallExpression],
          visit: (node, sourceFile) => {
            mutableModule(modules, sourceFile).calls.push(node);
          },
        },
      ],
      finish: () => {
        const receipt = { source: "gate-modernization-syntax", members: modules.size };
        ctx.receipt({ kind: "population", ...receipt });
        return { modules: [...modules.values()], receipt };
      },
    };
  },
});

export function readGateModernizationFacts(ctx: GatePolicyContext): GateModernizationFacts {
  const facts = ctx.fact(gateModernizationFact);
  ctx.receipt({ kind: "population", ...facts.receipt });
  return facts;
}
