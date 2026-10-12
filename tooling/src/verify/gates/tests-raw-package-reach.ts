// Gate: tests-raw-package-reach — a raw `#<package>/<path>` reach from a test enters a package's internals past its
// declared entries, so a test follows a refactor only by edit; each one needs a reviewed grant (Core-0 §5).
// Arms: import · re-export · import() in a value or type position · vi.mock-family calls · DECLARED LIMITS: a raw
// spelling read as a plain string is no module edge; the test kit cannot resolve the root map, so tsc refuses it there.
// FAMILY: tests-package-subpath, tooling/src/verify/lib/test-import-door.ts#testModuleSpecifier.
// POPULATION: every test-tree file; one finding per (test file, raw specifier) is the grant identity.
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { rawPackageReach, testModuleSpecifier } from "../lib/test-import-door.ts";

const OPERATION = "raw-reach";

const MESSAGE =
  "a test reaches a package's internals through the root `#<package>/*` imports map. Tests and the test kit enter a " +
  "package through its public entry or its testing door; a raw reach needs a reviewed grant (docs/law/Core-0-Architecture-and-Structure.md §5).";
const FIX =
  "import the binding from the package's public entry (`@orb/<package>` or an exported subpath), exporting it there when the owning layer " +
  "should offer it; a raw reach that must stay takes a central reviewed grant naming the test file and the specifier.";

export const gate = defineGate({
  id: "tests-raw-package-reach",
  family: "tests-package-subpath",
  authority: "reviewed-grant",
  severity: "error",
  population: "@tests",
  analysis: "syntax",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    // One finding per (test file, specifier): a type import and a value import of one file are one reach.
    const reported = new Set<string>();
    return {
      visitors: [
        {
          kinds: [SyntaxKind.ImportDeclaration, SyntaxKind.ExportDeclaration, SyntaxKind.CallExpression, SyntaxKind.ImportType],
          visit: (node, sourceFile) => {
            const literal = testModuleSpecifier(node);
            if (literal === undefined || !Node.isStringLiteral(literal)) {
              return;
            }
            const spec = literal.getLiteralValue();
            const reach = rawPackageReach(spec);
            const path = ctx.relativePath(sourceFile);
            if (reach === undefined || reported.has(`${path}|${spec}`)) {
              return;
            }
            reported.add(`${path}|${spec}`);
            ctx.report.node(literal, {
              subject: path,
              operation: `${OPERATION}:${spec}`,
              message: `${MESSAGE} This reaches packages/${reach.pkg}/src/${reach.path}.`,
              fix: FIX,
            });
          },
        },
      ],
    };
  },
  mustFlag: [
    {
      mode: "source",
      grant: { subject: "tests/server/domain/chat/verbs/send.int.test.ts", operation: "raw-reach:#server/domain/chat/verbs/send.ts" },
      files: {
        "tests/server/domain/chat/verbs/send.int.test.ts":
          'import { createSend } from "#server/domain/chat/verbs/send.ts";\nimport type { SendDeps } from "#server/domain/chat/verbs/send.ts";\nexport const s: SendDeps | undefined = createSend === undefined ? undefined : undefined;\n',
      },
      expect: { count: 1, token: '"#server/domain/chat/verbs/send.ts"', messageIncludes: "This reaches packages/server/src/domain/chat/verbs/send.ts." },
      why: "the founding shape: a verb test importing the verb's file through the root map. A value and a type import of one specifier are ONE finding, so one grant licenses the pair; cut the dedupe and the count is 2 and the grant goes over-broad",
    },
    {
      mode: "source",
      files: {
        "tests/client/lib/x.dom.test.ts":
          'vi.mock("#client/lib/x.ts");\nexport { y } from "#ui/lib/y.ts";\nexport const load = () => import("#kit/ids/index.ts");\nexport const r = require("#contracts/chat/index.ts");\n',
      },
      expect: { count: 4, messageIncludes: "This reaches packages/kit/src/ids/index.ts." },
      why: "the vi.mock, re-export, import() and require arms reach a package's files the same way, and a raw spelling of a module's own index file is still a raw reach",
    },
    {
      mode: "source",
      files: {
        "tests/client/data/auth.test.ts": 'export type Me = import("#client/data/auth-bootstrap.ts").AuthMe;\nexport const m: Me | undefined = undefined;\n',
      },
      expect: { count: 1, token: '"#client/data/auth-bootstrap.ts"', messageIncludes: "This reaches packages/client/src/data/auth-bootstrap.ts." },
      why: "a type-position `import()` couples the test to the internal file exactly as a declaration does; cut the ImportType arm and this row finds nothing",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: {
        "tests/server/domain/chat/verbs/send.int.test.ts":
          'import { chat } from "@orb/server/domain/chat";\nimport { fx } from "@orb/testkit/node/fixtures.ts";\nimport { h } from "./_support.ts";\nimport { b } from "#broker/entry.ts";\nconst text = "#server/domain/chat/verbs/send.ts";\nexport const s = [chat, fx, h, b, text];\n',
      },
      why: "the legal shapes: a package entry, a test kit world subpath, a same-tree helper, a `#` specifier outside the package map, and the raw spelling as a plain string. Cutting the package-name check reds the `#broker` import; cutting the module-position test reds the string",
    },
  ],
});
