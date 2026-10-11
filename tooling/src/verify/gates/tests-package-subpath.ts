// Gate: tests-package-subpath — a test reaches a package's source through the root `#<package>/*` imports map, never a
// relative climb into packages/<pkg>/src (Core-0-Architecture-and-Structure.md §5); product code cannot resolve that map.
// Arms: import · re-export · import() · vi.mock-family calls.
// DECLARED LIMITS: a path read as data (a CSS or JSON file) and a package-root file are not module imports into src.
// FAMILY: singleton — it reads module specifiers only; no shared lib/ reader covers the tests tree's package map.
import { posix } from "node:path";
import type { Node as MorphNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";

const PACKAGE_SOURCE = /^packages\/([^/]+)\/src\/(.+)$/u;
const MODULE_CALLEES: ReadonlySet<string> = new Set(["vi.mock", "vi.doMock", "vi.unmock", "vi.doUnmock", "vi.importActual", "vi.importMock", "require"]);

const MESSAGE =
  "a test reaches into a package's source by a relative path. Tests import package internals through the root " +
  "`#<package>/*` map (`#server/domain/chat/verbs/send.ts`), which product code cannot resolve " +
  "(docs/law/Core-0-Architecture-and-Structure.md §5).";
const FIX = "replace the specifier with the subpath the finding names; `pnpm codemod test-subpaths --apply` rewrites every site.";

function moduleSpecifier(node: MorphNode): MorphNode | undefined {
  if (Node.isImportDeclaration(node) || Node.isExportDeclaration(node)) {
    return node.getModuleSpecifier();
  }
  if (!Node.isCallExpression(node)) {
    return;
  }
  const callee = node.getExpression();
  const isModuleCall = callee.getKind() === SyntaxKind.ImportKeyword || MODULE_CALLEES.has(callee.getText());
  return isModuleCall ? node.getArguments()[0] : undefined;
}

export const gate = defineGate({
  id: "tests-package-subpath",
  family: "tests-package-subpath",
  authority: "hard",
  severity: "error",
  population: "@tests",
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
          const literal = moduleSpecifier(node);
          if (literal === undefined || !Node.isStringLiteral(literal) || !literal.getLiteralValue().startsWith(".")) {
            return;
          }
          const path = ctx.relativePath(sourceFile);
          const target = PACKAGE_SOURCE.exec(posix.normalize(posix.join(posix.dirname(path), literal.getLiteralValue())));
          if (target?.[1] !== undefined && target[2] !== undefined) {
            ctx.report.node(literal, { message: `${MESSAGE} Use #${target[1]}/${target[2]}.`, fix: FIX });
          }
        },
      },
    ],
  }),
  mustFlag: [
    {
      mode: "source",
      files: {
        "tests/server/domain/chat/verbs/send.test.ts":
          'import { send } from "../../../../../packages/server/src/domain/chat/verbs/send.ts";\nexport const s = send;\n',
      },
      expect: { count: 1, token: '"../../../../../packages/server/src/domain/chat/verbs/send.ts"', messageIncludes: "Use #server/domain/chat/verbs/send.ts." },
      why: "the founding shape: a test climbing out of tests/ into a package's source",
    },
    {
      mode: "source",
      files: {
        "tests/client/lib/x.test.ts":
          'vi.mock("../../../packages/client/src/lib/x.ts");\nexport { y } from "../../../packages/client/src/lib/y.ts";\nexport const load = () => import("../../../packages/ui/src/primitives/button/index.ts");\n',
      },
      expect: { count: 3 },
      why: "the vi.mock, re-export and import() arms: each spelling reaches the same internals",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: {
        "tests/server/domain/chat/verbs/send.test.ts":
          'import { send } from "#server/domain/chat/verbs/send.ts";\nimport { kit } from "@orb/kit/ids";\nimport { fx } from "../../../../support/fixtures.ts";\nconst css = readFileSync(new URL("../../../../../packages/ui/src/styles/theme.css", import.meta.url));\nexport const s = [send, kit, fx, css];\n',
      },
      why: "the legal shapes: the root subpath, a package front door, test support, and a CSS file read as data (not a module position). Cutting the module-position test reds the last",
    },
  ],
});
