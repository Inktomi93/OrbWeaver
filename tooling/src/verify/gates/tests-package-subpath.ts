// Gate: tests-package-subpath — a test never climbs by relative path into a package's src or, from outside it, into
// the test kit (Core-0-Architecture-and-Structure.md §5): a package is entered through its declared entries, the kit
// through `@orb/testkit/<world>/<path>`. Arms: import · re-export · import() in a value or type position · vi.mock-family calls.
// DECLARED LIMITS: a path read as data (a CSS or JSON file) and a package-root file are not module imports into src.
// FAMILY: tests-package-subpath — the forbidden-door judgment `lib/test-import-door.ts#testImportDoor`, shared with `tests-raw-package-reach`.
import { SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { testImportDoor } from "../lib/test-import-door.ts";

const MESSAGE =
  "a test reaches by a relative path into a package's source or into the test kit. A test enters a package through its " +
  "public entry and the test kit through its world subpaths (docs/law/Core-0-Architecture-and-Structure.md §5).";
const FIX =
  "import the package through its public entry (`@orb/<package>` or an exported subpath) and the test kit through `@orb/testkit/<world>/<path>`; " +
  "a raw `#<package>/<path>` reach needs a reviewed grant (`tests-raw-package-reach`).";

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
        kinds: [SyntaxKind.ImportDeclaration, SyntaxKind.ExportDeclaration, SyntaxKind.CallExpression, SyntaxKind.ImportType],
        visit: (node, sourceFile) => {
          const climb = testImportDoor(node, ctx.relativePath(sourceFile));
          if (climb === undefined || climb.kind === "raw-package") {
            return;
          }
          const door = climb.kind === "relative-testkit" ? climb.door : `the public entry of @orb/${climb.pkg}`;
          ctx.report.node(climb.literal, { message: `${MESSAGE} Use ${door}.`, fix: FIX });
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
      expect: { count: 1, token: '"../../../../../packages/server/src/domain/chat/verbs/send.ts"', messageIncludes: "Use the public entry of @orb/server." },
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
    {
      mode: "source",
      files: {
        "tests/client/lib/z.test.ts": 'export type Z = import("../../../packages/client/src/lib/z.ts").Z;\nexport const z: Z | undefined = undefined;\n',
      },
      expect: { count: 1, token: '"../../../packages/client/src/lib/z.ts"', messageIncludes: "Use the public entry of @orb/client." },
      why: "a type-position `import()` climbs into the source as a declaration does; cut the ImportType arm and this row finds nothing",
    },
    {
      mode: "source",
      files: {
        "tests/server/domain/chat/verbs/send.test.ts": 'import { fx } from "../../../../support/node/fixtures.ts";\nexport const s = fx;\n',
      },
      expect: { count: 1, token: '"../../../../support/node/fixtures.ts"', messageIncludes: "Use @orb/testkit/node/fixtures.ts." },
      why: "the test kit is a package: a test outside it climbing into its files bypasses the world subpaths its exports map declares",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: {
        "tests/server/domain/chat/verbs/send.test.ts":
          'import { send } from "#server/domain/chat/verbs/send.ts";\nimport { kit } from "@orb/kit/ids";\nimport { fx } from "@orb/testkit/node/fixtures.ts";\nimport { h } from "./_support.ts";\nconst css = readFileSync(new URL("../../../../../packages/ui/src/styles/theme.css", import.meta.url));\nexport const s = [send, kit, fx, h, css];\n',
        "tests/support/node/db.ts": 'import { clock } from "../iso/clock.ts";\nimport { m } from "./matchers.ts";\nexport const d = [clock, m];\n',
      },
      why: "the legal shapes: a raw root subpath (the reviewed-grant sibling's subject), a package entry, a test kit world subpath, a same-tree helper, a CSS file read as data (not a module position), and the kit's own relative imports. Cutting the module-position test reds the CSS read; cutting the importer-inside-the-kit test reds the kit row",
    },
  ],
});
