// Gate: package-subpath-crossing — a `#src/<path>` specifier is for a file in the importer's own module; reaching
// another module's internals through it bypasses that module's front door (Core-0-Architecture-and-Structure.md §1).
// Arms: import · re-export · dynamic import(). A grant licenses only a narrow leaf a dep-cruiser graph rule demands.
// DECLARED LIMITS: a single-file module and a module's own index.ts are entered by their path, so neither is a crossing.
// FAMILY: singleton — its only shared dependency is the floor module map (floor/code-facts/package-module.ts), which no other policy reads.
import type { Node as MorphNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { packageModuleOf, SOURCE_SUBPATH_PREFIX } from "../../floor/code-facts/package-module.ts";
import { defineGate } from "../contract/policy.ts";

const PACKAGE_SOURCE = /^packages\/([^/]+)\/src\/(.+)$/u;
const OPERATION = "cross-module-subpath";

const MESSAGE =
  "a `#src/` subpath reaches into another module's internals. `#src/<path>` names a file in the importer's own " +
  "module; another module is entered through its front door `#<module>` (docs/law/Core-0-Architecture-and-Structure.md §1).";
const FIX =
  "import through the named front door, exporting the binding there (`export type` for a type). A leaf a " +
  "dep-cruiser graph rule requires (a plugin worker's) takes a central reviewed grant naming that rule.";

function subpathSpecifier(node: MorphNode): MorphNode | undefined {
  if (Node.isImportDeclaration(node) || Node.isExportDeclaration(node)) {
    return node.getModuleSpecifier();
  }
  return Node.isCallExpression(node) && node.getExpression().getKind() === SyntaxKind.ImportKeyword ? node.getArguments()[0] : undefined;
}

/** The module a crossing enters, or undefined for a same-module subpath, a single-file module or a door. */
function crossedModule(importer: string, spec: string): { readonly key: string; readonly door: string } | undefined {
  const from = PACKAGE_SOURCE.exec(importer);
  if (from?.[1] === undefined || from[2] === undefined) {
    return;
  }
  const target = spec.slice(SOURCE_SUBPATH_PREFIX.length);
  const fromModule = packageModuleOf(from[1], from[2]);
  const toModule = packageModuleOf(from[1], target);
  const crossing = toModule.kind === "dir" && toModule.key !== fromModule.key && target !== `${toModule.key}/index.ts`;
  return crossing ? { key: toModule.key, door: toModule.door } : undefined;
}

export const gate = defineGate({
  id: "package-subpath-crossing",
  family: "package-subpath-crossing",
  authority: "reviewed-grant",
  severity: "error",
  population: ["@client", "@ui", "@server", "@db", "@contracts", "@kit", "@inference"],
  analysis: "syntax",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    // One finding per (importer, crossed module): the grant identity, however many specifiers spell the crossing.
    const reported = new Set<string>();
    return {
      visitors: [
        {
          kinds: [SyntaxKind.ImportDeclaration, SyntaxKind.ExportDeclaration, SyntaxKind.CallExpression],
          visit: (node, sourceFile) => {
            const literal = subpathSpecifier(node);
            if (literal === undefined || !Node.isStringLiteral(literal) || !literal.getLiteralValue().startsWith(SOURCE_SUBPATH_PREFIX)) {
              return;
            }
            const path = ctx.relativePath(sourceFile);
            const crossed = crossedModule(path, literal.getLiteralValue());
            if (crossed !== undefined && !reported.has(`${path}|${crossed.key}`)) {
              reported.add(`${path}|${crossed.key}`);
              ctx.report.node(literal, {
                subject: path,
                operation: `${OPERATION}:${crossed.key}`,
                message: `${MESSAGE} Use ${crossed.door}.`,
                fix: FIX,
              });
            }
          },
        },
      ],
    };
  },
  mustFlag: [
    {
      mode: "source",
      grant: { subject: "packages/server/src/domain/chat/run.ts", operation: "cross-module-subpath:domain/tag" },
      files: {
        "packages/server/src/domain/chat/run.ts":
          'import { b } from "#src/domain/tag/verbs/b.ts";\nimport type { C } from "#src/domain/tag/contract/c.ts";\nexport const r: C = b;\n',
      },
      expect: { count: 1, token: '"#src/domain/tag/verbs/b.ts"', messageIncludes: "Use #domain/tag." },
      why: "the founding shape: the file subpath used to step past another feature's front door. Two specifiers into one module are ONE finding, so one grant licenses the (importer, module) pair; cut the dedupe and the count is 2 and the grant goes over-broad",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/plugin/worker.ts":
          'export type { P } from "#src/lib/protocol.ts";\nexport const load = () => import("#src/state/store.ts");\n',
      },
      expect: { count: 2, messageIncludes: "Use #" },
      why: "the re-export and dynamic import() arms cross the same way an import does",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: {
        "packages/server/src/domain/chat/verbs/run.ts":
          'import { a } from "#src/domain/chat/substrate/a.ts";\nimport { l } from "#src/transport/rate-limit.ts";\nimport { e } from "#src/primitives/node-environment/index.ts";\nexport const r = [a, l, e];\n',
      },
      why: "the legal subpaths: the importer's own module, a single-file module and a module's own front door. Cutting the same-module test reds the first",
    },
  ],
});
