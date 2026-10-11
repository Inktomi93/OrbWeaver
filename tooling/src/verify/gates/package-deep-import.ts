// Gate: package-deep-import — a parent-relative import that climbs two or more directories inside a package is
// banned: a file in the same module spells `#src/<path>`, and another module is entered through its front door
// (Core-0-Architecture-and-Structure.md §1 principle 2). Arms: same-module · cross-module · re-export · dynamic import().
// DECLARED LIMITS: one-level `../` stays legal; a relative path that leaves `src/` is not this policy's subject.
// FAMILY: singleton — its only shared dependency is the floor module map (floor/code-facts/package-module.ts), which no other policy reads.
import { posix } from "node:path";
import type { Node as MorphNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { packageModuleOf, SOURCE_SUBPATH_PREFIX } from "../../floor/code-facts/package-module.ts";
import { defineGate } from "../contract/policy.ts";

const DEEP_PARENT = "../../";
const PACKAGE_SOURCE = /^(packages\/([^/]+)\/src)\/(.+)$/u;

const MESSAGE =
  "a parent-relative import climbs two or more directories inside a package. A file in the same module is " +
  "spelled `#src/<path>`; another module is entered through its front door `#<module>`, never its internals " +
  "(docs/law/Core-0-Architecture-and-Structure.md §1).";
const FIX = "replace the specifier with the spelling the finding names; `pnpm codemod deep-imports --apply` rewrites every site.";

/** The spelling a deep specifier owes, or undefined when it leaves the importer's `src/`. */
function nextSpelling(importer: string, spec: string): string | undefined {
  const from = PACKAGE_SOURCE.exec(importer);
  const target = posix.normalize(posix.join(posix.dirname(importer), spec));
  const to = PACKAGE_SOURCE.exec(target);
  if (from?.[1] === undefined || from[2] === undefined || from[3] === undefined || to?.[1] !== from[1] || to[3] === undefined) {
    return;
  }
  const fromModule = packageModuleOf(from[2], from[3]);
  const toModule = packageModuleOf(from[2], to[3]);
  const sameModule = fromModule.key === toModule.key || toModule.kind === "file";
  return sameModule ? `${SOURCE_SUBPATH_PREFIX}${to[3]}` : `${toModule.door} (the ${toModule.key} front door)`;
}

function deepSpecifier(node: MorphNode): MorphNode | undefined {
  if (Node.isImportDeclaration(node) || Node.isExportDeclaration(node)) {
    return node.getModuleSpecifier();
  }
  return Node.isCallExpression(node) && node.getExpression().getKind() === SyntaxKind.ImportKeyword ? node.getArguments()[0] : undefined;
}

export const gate = defineGate({
  id: "package-deep-import",
  family: "package-deep-import",
  authority: "hard",
  severity: "error",
  population: ["@client", "@ui", "@server", "@db", "@contracts", "@kit", "@inference"],
  analysis: "syntax",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => ({
    visitors: [
      {
        kinds: [SyntaxKind.ImportDeclaration, SyntaxKind.ExportDeclaration, SyntaxKind.CallExpression],
        visit: (node, sourceFile) => {
          const literal = deepSpecifier(node);
          if (literal === undefined || !Node.isStringLiteral(literal) || !literal.getLiteralValue().startsWith(DEEP_PARENT)) {
            return;
          }
          const next = nextSpelling(ctx.relativePath(sourceFile), literal.getLiteralValue());
          if (next !== undefined) {
            ctx.report.node(literal, { message: `${MESSAGE} Use ${next}.`, fix: FIX });
          }
        },
      },
    ],
  }),
  mustFlag: [
    {
      mode: "source",
      files: {
        "packages/server/src/domain/chat/verbs/send/run.ts": 'import { a } from "../../substrate/a.ts";\nexport const r = a;\n',
        "packages/server/src/domain/chat/substrate/a.ts": "export const a = 1;\n",
      },
      expect: { count: 1, token: '"../../substrate/a.ts"', messageIncludes: "Use #src/domain/chat/substrate/a.ts." },
      why: "the same-module arm: a deep climb inside one feature is spelled through the package's file subpath",
    },
    {
      mode: "source",
      files: {
        "packages/server/src/domain/chat/verbs/run.ts": 'import { b } from "../../tag/verbs/b.ts";\nexport const r = b;\n',
        "packages/server/src/domain/tag/verbs/b.ts": "export const b = 1;\n",
      },
      expect: { count: 1, messageIncludes: "Use #domain/tag (the domain/tag front door)." },
      why: "the cross-module arm: reaching another module's internals names that module's front door, never `#src/`",
    },
    {
      mode: "source",
      files: {
        "packages/inference/src/backends/google/wire.ts": 'export { type Err } from "../../contract/errors.ts";\n',
        "packages/inference/src/contract/errors.ts": "export type Err = string;\n",
      },
      expect: { count: 1, messageIncludes: "Use #contract (the contract front door)." },
      why: "a deep RE-EXPORT is the same climb as an import; the export-declaration arm",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/chat/lib/load.ts": 'export const load = () => import("../../chat/lib/x.ts");\n',
        "packages/client/src/features/chat/lib/x.ts": "export const x = 1;\n",
      },
      expect: { count: 1, messageIncludes: "Use #src/features/chat/lib/x.ts." },
      why: "a dynamic import() climbs the same way; the call arm",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: {
        "packages/server/src/domain/chat/verbs/run.ts":
          'import { a } from "../substrate.ts";\nimport { b } from "#src/domain/chat/substrate/b.ts";\nimport { t } from "#domain/tag";\nexport const r = [a, b, t];\n',
        "packages/server/src/domain/chat/substrate.ts": "export const a = 1;\n",
        "packages/server/src/domain/chat/substrate/b.ts": "export const b = 1;\n",
        "packages/server/src/domain/tag/index.ts": "export const t = 1;\n",
      },
      why: "the three legal shapes: a one-level parent import, a same-module `#src/` subpath and a front door. Cutting the depth test reds the first",
    },
    {
      mode: "source",
      files: {
        "packages/server/src/domain/chat/verbs/run.ts": "export const r = 1;\n",
        "tooling/src/aa/ops/x.ts": 'import { y } from "../../bb/ops/y.ts";\nexport const x = y;\n',
      },
      why: "THE POPULATION FENCE: the tooling tree has its own front-door law (`tooling-front-door`); a deep tooling import is not this policy's subject",
    },
  ],
});
