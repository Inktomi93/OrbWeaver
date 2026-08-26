// Gate: untrusted-regex-safe-exec — the server world-info regex-key execution seam must be composed with
// the node:vm watchdog. This judges the canonical `testRegexKey` property only; dynamic RegExp construction
// elsewhere is not evidence that user-authored input runs without a deadline.
import type { SourceFile } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract/gate.ts";
import { fileLoaded } from "../lib/pass.ts";

const COMPOSE_DIR = "packages/server/src/entry/compose/";
const COMPOSE_ANCHOR = `${COMPOSE_DIR}chat.ts`;
const GATE_SELF = "tooling/src/verify/gates/untrusted-regex-safe-exec.ts";
const PROPERTY = "testRegexKey";
const FACTORY = "createRegexTest";
let seen = 0;

function importsFactory(sf: SourceFile): boolean {
  return sf
    .getImportDeclarations()
    .some(
      (declaration) =>
        declaration.getModuleSpecifierValue() === "#kit/regex" && declaration.getNamedImports().some((specifier) => specifier.getName() === FACTORY),
    );
}

export const gate: GateDescriptor = {
  name: "untrusted-regex-safe-exec",
  docRow: "Core-Enforcement-Active-Gates.md (Layer 3) — Core-Path-Registry.md D53; world-info regex-key watchdog",
  status: "active",
  scopeSafety: "whole-project",
  message:
    "the canonical world-info regex-key execution seam is not composed with `createRegexTest()` from `#kit/regex` — a user-authored key can execute on the server event loop without the node:vm deadline. See docs/design/issue-712-gate-family.md",
  fix: "import `createRegexTest` from `#kit/regex` and compose `testRegexKey: createRegexTest()`; do not hand-roll native `.test` at this boundary. See docs/design/issue-712-gate-family.md",
  scanRoot: (path) => path.includes(COMPOSE_DIR),
  kinds: [SyntaxKind.PropertyAssignment],
  begin: () => {
    seen = 0;
  },
  visit: (node, sf, ctx) => {
    if (!node.isKind(SyntaxKind.PropertyAssignment) || node.getName() !== PROPERTY) {
      return;
    }
    seen += 1;
    const initializer = node.getInitializer();
    const safe =
      initializer?.isKind(SyntaxKind.CallExpression) === true &&
      initializer.getExpression().isKind(SyntaxKind.Identifier) &&
      initializer.getExpression().getText() === FACTORY &&
      importsFactory(sf);
    if (!safe) {
      ctx.report(node, { token: PROPERTY, offset: 0 });
    }
  },
  finalize: (ctx) => {
    if (ctx.scope.kind === "project" && fileLoaded(ctx, COMPOSE_ANCHOR) && seen === 0) {
      ctx.report({
        file: GATE_SELF,
        line: 1,
        column: 0,
        message: `the canonical ${PROPERTY} composition property was not found — the gate has no execution boundary to judge. See docs/design/issue-712-gate-family.md`,
      });
    }
  },
  mustFlag: [
    {
      files: "const ctx = { testRegexKey: (regex: RegExp, haystack: string): boolean => regex.test(haystack) };\n",
      at: "packages/server/src/entry/compose/__g_chat.ts",
      expect: { count: 1, token: PROPERTY },
      why: "the founding regression: the live composition seam falls back to native `.test` with no deadline",
    },
    {
      files: "export const unrelated = 1;\n",
      at: COMPOSE_ANCHOR,
      expect: { count: 1, messageIncludes: "no execution boundary" },
      why: "fail loud when the canonical property disappears; zero measured seams is not a clean result",
    },
  ],
  mustPass: [
    {
      files: 'import { createRegexTest } from "#kit/regex";\nexport const ctx = { testRegexKey: createRegexTest() };\n',
      at: "packages/server/src/entry/compose/__g_chat.ts",
      why: "the canonical watchdog factory at the canonical property is the safe execution boundary",
    },
    {
      files: 'export const matcher = (pattern: string): RegExp => new RegExp(pattern, "u");\n',
      at: "packages/server/src/domain/example.ts",
      why: "dynamic RegExp construction outside the canonical world-info execution seam is deliberately out of scope",
    },
  ],
};
