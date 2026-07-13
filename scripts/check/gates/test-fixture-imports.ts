// Gate: test-fixture-imports (core/Spine-Testing.md §4)
// Fixture doctrine: A test imports { test, expect } from support/fixtures, never directly from vitest or @playwright/test.
// This ensures composed fixtures (db, frozen clock, etc.) are used.
// Exempt: e2e (own Playwright lane), support/ (the fixture itself), and .test-d.ts (a separate
// tsc-only typecheck project that never touches the runtime fixture — core/Spine-Testing.md §1).
import type { Node } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";

// A `test`/`it`/`expect` named import from `vitest`/`@playwright/test` in a scanned test file. The
// message names the symbol+module (varies).
const BANNED_MODULES = new Set(["vitest", "@playwright/test"]);
const FIXTURE_NAMES = new Set(["test", "it", "expect"]);
const FIXTURE_MESSAGE =
  "a test/it/expect imported directly from vitest/@playwright/test bypasses the composed fixture — import from 'support/fixtures' instead (core/Spine-Testing.md §4).";

/** The forbidden `{name, module}` of a direct vitest/playwright fixture import, or undefined. */
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
  return mod !== undefined && BANNED_MODULES.has(mod) ? { name, module: mod } : undefined;
}

export const gate: GateDescriptor = {
  name: "test-fixture-imports",
  docRow: "core/Spine-Testing.md §4",
  status: "active",
  scopeSafety: "incremental-safe",
  message: FIXTURE_MESSAGE,
  fix: "import { test, expect } from 'support/fixtures' — the composed fixture (db, frozen clock, …), never directly from vitest/@playwright/test.",
  scanRoot: (p) =>
    p.includes("tests/") &&
    !p.includes("tests/e2e/") &&
    !p.includes("tests/support/") &&
    !p.endsWith(".test-d.ts"),
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
  ],
  mustPass: [
    {
      files: 'import { test, expect } from "../support/fixtures.ts";\n',
      at: "tests/tooling/y.test.ts",
      why: "imported from support/fixtures — the sanctioned composed fixture, passes",
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
