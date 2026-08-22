// Gate: test-fixture-imports (core/Spine-Testing.md §4; docs/design/tooling-package.md §4.8)
// Fixture doctrine: A test imports { test, expect } from support/fixtures, never directly from vitest or
// @playwright/test. Under tests/tooling/ the door is support/tool-fixtures (which EXTENDS the house test):
// entering through plain fixtures there skips the RESULT snapshot serializer, so inline snapshots bake
// unnormalized output — a drift bomb. Exempt: e2e (own Playwright lane), support/ (the fixtures
// themselves), and .test-d.ts (tsc-only, never touches the runtime fixture — core/Spine-Testing.md §1).
import type { Node } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract/gate.ts";

// A `test`/`it`/`expect` named import from `vitest`/`@playwright/test` in a scanned test file. The
// message names the symbol+module (varies).
const BANNED_MODULES = new Set(["vitest", "@playwright/test"]);
const FIXTURE_NAMES = new Set(["test", "it", "expect"]);
const FIXTURE_MESSAGE =
  "a test/it/expect import bypasses the composed fixture — import from 'support/fixtures' (or, under tests/tooling/, 'support/tool-fixtures' — the door that registers the RESULT serializer) (core/Spine-Testing.md §4; docs/design/tooling-package.md §4.8).";

// The plain-fixtures barrel, as a suffix of the (relative) module specifier.
const PLAIN_FIXTURES_RE = /support\/fixtures(?:\.ts)?$/u;

/** The forbidden `{name, module}` of a fixture import through the wrong door, or undefined. */
function directFixtureImport(node: Node): { name: string; module: string } | undefined {
  if (!node.isKind(SyntaxKind.ImportSpecifier)) {
    return;
  }
  const name = node.getName();
  if (!FIXTURE_NAMES.has(name)) {
    return;
  }
  const decl = node.getFirstAncestorByKind(SyntaxKind.ImportDeclaration);
  const mod = decl?.getModuleSpecifierValue();
  if (mod === undefined) {
    return;
  }
  if (BANNED_MODULES.has(mod)) {
    return { name, module: mod };
  }
  // The §4.8 tooling arm: plain fixtures inside the tooling mirror — the serializer never registers.
  const inTooling = node.getSourceFile().getFilePath().includes("tests/tooling/");
  return inTooling && PLAIN_FIXTURES_RE.test(mod) ? { name, module: mod } : undefined;
}

export const gate: GateDescriptor = {
  name: "test-fixture-imports",
  docRow: "core/Spine-Testing.md §4",
  status: "active",
  scopeSafety: "incremental-safe",
  message: FIXTURE_MESSAGE,
  fix: "import { test, expect } from 'support/fixtures' — the composed fixture (db, frozen clock, …), never directly from vitest/@playwright/test.",
  scanRoot: (p) => p.includes("tests/") && !p.includes("tests/e2e/") && !p.includes("tests/support/") && !p.endsWith(".test-d.ts"),
  kinds: [SyntaxKind.ImportSpecifier],
  visit: (node, _sf, ctx) => {
    const hit = directFixtureImport(node);
    if (hit !== undefined) {
      ctx.report(node, { token: `${hit.name} from ${hit.module}`, offset: 0 });
    }
  },
  mustFlag: [
    {
      files: 'import { test, expect } from "vitest";\n',
      at: "tests/tooling/x.test.ts",
      why: "test/expect imported directly from vitest — bypasses the composed fixture (§4)",
    },
    {
      files: 'import { test, expect } from "../../support/fixtures.ts";\n',
      at: "tests/tooling/snapx/y.test.ts",
      expect: { count: 2 },
      why: "plain fixtures inside the tooling mirror — the tool door (tool-fixtures) registers the RESULT serializer; this skips it (§4.8)",
    },
  ],
  mustPass: [
    {
      files: 'import { test, expect } from "../support/fixtures.ts";\n',
      at: "tests/server/y.test.ts",
      why: "imported from support/fixtures OUTSIDE tests/tooling — the sanctioned composed fixture, passes",
    },
    {
      files: 'import { test, expect } from "../../support/tool-fixtures.ts";\n',
      at: "tests/tooling/snapx/z.test.ts",
      why: "the tooling composed test (tool-fixtures) inside the tooling mirror — the §4.8 door, passes",
    },
    {
      files: 'import { test, expect } from "vitest";\n',
      at: "tests/tooling/types.test-d.ts",
      why: "a direct vitest import in a .test-d.ts — the tsc-only typecheck project is scanRoot-excluded, passes",
    },
    {
      files: 'import { test, expect } from "@playwright/test";\n',
      at: "tests/e2e/flow.test.ts",
      why: "a @playwright/test import in tests/e2e/ — its own Playwright lane is scanRoot-excluded, passes",
    },
  ],
};
