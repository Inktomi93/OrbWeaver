// core/Spine-Testing.md §3 — `vi.mock` is banned for INTERNAL modules; it is legitimate only for an
// unavoidable third-party node edge, and fakes belong at the composition root. Two identities, both
// canonical: the mocker is Vitest's `vi` resolved through the shared module-origin reader (a local object
// named `vi` is not it, and `vi["mock"]` is the same call), and the TARGET is read through the shared
// static-string resolver, so a specifier held in a const no longer hides. A target the reader cannot
// resolve is fail-closed. DECLARED LIMITS live in the mustPass rows.
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { readMemberReference, readStaticString, resolveModuleMemberOrigin } from "../lib/reference-fact.ts";
import { originModuleSpecifier } from "../lib/sealed-origin.ts";

const VITEST_MODULE = "vitest";
/** `mock` is hoisted, `doMock` is not; both replace an internal module with a fake and both are the ban's
 *  subject. The legacy text comparison saw only `vi.mock`, so every `vi.doMock` was a silent green. */
const MOCK_MEMBERS = new Set(["mock", "doMock"]);
const INTERNAL_PREFIXES = [".", "packages/", "@orb/", "#"];

const MESSAGE = "vi.mock on an internal module — fake at the edges, inject at the composition root (core/Spine-Testing.md §3).";

const FIX =
  "inject the fake at the composition root; vi.mock is legal only for an unavoidable third-party node edge. " +
  "For a genuinely unmockable internal seam, attach `@orb-waive test-mock-doctrine(<mock|doMock>): <why the " +
  "seam cannot be injected, and what would end it>` to that exact call.";

/** Legacy `scanRoot` was `p.includes("tests/")` — every authored `tests/` tree, including the nested ones. */
const TEST_POPULATION = { in: ["@authored"], under: ["tests/**", "**/tests/**"] } as const;

function isInternalTarget(specifier: string): boolean {
  return INTERNAL_PREFIXES.some((prefix) => specifier.startsWith(prefix));
}

export const gate = defineGate({
  id: "test-mock-doctrine",
  family: "test-mock-doctrine",
  authority: "ordinary",
  severity: "error",
  population: TEST_POPULATION,
  analysis: "types",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => ({
    visitors: [
      {
        kinds: [SyntaxKind.CallExpression],
        visit: (node) => {
          if (!Node.isCallExpression(node)) {
            return;
          }
          const member = readMemberReference(node.getExpression());
          // The MEMBER NAME is the candidate gate; the receiver's canonical origin is the verdict.
          if (member.kind !== "resolved" || !MOCK_MEMBERS.has(member.value.name)) {
            return;
          }
          const origin = resolveModuleMemberOrigin(member.value.receiver);
          if (origin.kind !== "resolved" || originModuleSpecifier(origin.value) !== VITEST_MODULE) {
            return;
          }
          const argument = node.getArguments()[0];
          if (argument === undefined) {
            return;
          }
          const target = readStaticString(argument);
          // FAIL-CLOSED: a target the static reader cannot resolve is exactly where an internal module
          // hides — a computed specifier is not evidence that the edge is third-party.
          if (target.kind !== "resolved" || isInternalTarget(target.value)) {
            ctx.report.node(member.value.nameNode, { token: member.value.name, offset: member.value.nameNode.getText().indexOf(member.value.name) });
          }
        },
      },
    ],
  }),
  mustFlag: [
    {
      mode: "types",
      files: {
        "node_modules/vitest/index.ts":
          "export const vi = { mock: (target: string, factory?: unknown): void => { void target; void factory; }, doMock: (target: string): void => { void target; } };\n",
        "tests/tooling/x.test.ts": 'import { vi } from "vitest";\nvi.mock("../../packages/server/x.ts");\n',
      },
      expect: { count: 1, token: "mock" },
      why: "the founding shape — `vi.mock` on an internal relative module, the ban §3 exists for",
    },
    {
      mode: "types",
      files: {
        "node_modules/vitest/index.ts": "export const vi = { mock: (target: string): void => { void target; } };\n",
        "tests/tooling/alias.test.ts": 'import { vi } from "vitest";\nvi.mock("@orb/server/domain/chat");\n',
      },
      expect: { count: 1, token: "mock" },
      why: "the `@orb/` workspace alias — the closed blind spot, since every internal import in this repo uses it",
    },
    {
      mode: "types",
      files: {
        "node_modules/vitest/index.ts": "export const vi = { mock: (target: string): void => { void target; } };\n",
        "tests/tooling/subpath.test.ts": 'import { vi } from "vitest";\nvi.mock("#domain/chat");\n',
      },
      expect: { count: 1, token: "mock" },
      why: "the `#` SUBPATH IMPORT is internal too — the legacy prefix list named only `.`/`packages/`/`@orb/`, so the repo's own subpath doors were an open lane",
    },
    {
      mode: "types",
      files: {
        "node_modules/vitest/index.ts": "export const vi = { mock: (target: string): void => { void target; } };\n",
        "tests/tooling/indirect.test.ts": 'import { vi } from "vitest";\nconst TARGET = "packages/server/src/foo";\nvi.mock(TARGET);\n',
      },
      expect: { count: 1, token: "mock" },
      why: "the SPECIFIER HELD IN A CONST — the legacy reader required a StringLiteral argument node and answered 'not my subject' to a binding, which is one rename away from every internal target",
    },
    {
      mode: "types",
      files: {
        "node_modules/vitest/index.ts": "export const vi = { doMock: (target: string): void => { void target; } };\n",
        "tests/tooling/domock.test.ts": 'import { vi } from "vitest";\nvi.doMock("./local-module.ts");\n',
      },
      expect: { count: 1, token: "doMock" },
      why: '`vi.doMock` is the non-hoisted spelling of the same replacement — the legacy `expr.getText() === "vi.mock"` comparison never saw it',
    },
    {
      mode: "types",
      files: {
        "node_modules/vitest/index.ts": "export const vi = { mock: (target: string): void => { void target; } };\n",
        "tests/tooling/bracket.test.ts": 'import { vi } from "vitest";\nvi["mock"]("./local-module.ts");\n',
      },
      expect: { count: 1, token: "mock" },
      why: "the BRACKET spelling of the same call — an ElementAccessExpression is not a PropertyAccessExpression (#1506)",
    },
    {
      mode: "types",
      files: {
        "node_modules/vitest/index.ts": "export const vi = { mock: (target: string): void => { void target; } };\n",
        "tests/tooling/dynamic.test.ts": 'import { vi } from "vitest";\ndeclare const pick: () => string;\nvi.mock(pick());\n',
      },
      expect: { count: 1, token: "mock" },
      why: "FAIL-CLOSED — a computed target cannot be shown to be a third-party edge, and 'unreadable' is not 'external'",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "node_modules/vitest/index.ts": "export const vi = { mock: (target: string, factory?: unknown): void => { void target; void factory; } };\n",
        "tests/tooling/y.test.ts": 'import { vi } from "vitest";\nvi.mock("node:fs");\n',
      },
      why: "the ONE legitimate use — a third-party node edge. Every live `vi.mock` on this tree is exactly this shape",
    },
    {
      mode: "types",
      files: {
        "node_modules/vitest/index.ts": "export const vi = { mock: (target: string): void => { void target; } };\n",
        "tests/tooling/bare.test.ts": 'import { vi } from "vitest";\nvi.mock("better-sqlite3");\n',
      },
      why: "a bare-name third-party package is a legal node edge too — the ban is about INTERNAL modules",
    },
    {
      mode: "types",
      files: {
        "node_modules/vitest/index.ts": "export const vi = { mock: (target: string): void => { void target; } };\n",
        "tests/tooling/local-vi.test.ts": 'const vi = { mock: (target: string): void => { void target; } };\nvi.mock("./local-module.ts");\n',
      },
      why: 'THE IDENTITY COUNTERFACTUAL — a LOCAL object named `vi` with a `mock` method, called on an internal target, with vitest present in the same project. The legacy `expr.getText() === "vi.mock"` comparison accused it; deleting the origin check turns this row red',
    },
    {
      mode: "types",
      files: {
        "node_modules/vitest/index.ts": "export const vi = { mocked: (value: unknown): unknown => value };\n",
        "tests/tooling/mocked.test.ts": 'import { vi } from "vitest";\ndeclare const dep: () => void;\nexport const spy = vi.mocked(dep);\n',
      },
      why: "`vi.mocked` is a TYPE-level accessor over an already-faked value, not a module replacement — the member vocabulary is closed to the two replacement verbs on purpose",
    },
    {
      mode: "types",
      files: {
        "node_modules/vitest/index.ts": "export const vi = { mock: (target: string): void => { void target; } };\n",
        "tests/tooling/waived.test.ts":
          'import { vi } from "vitest";\n// @orb-waive test-mock-doctrine(mock): the module under test IS the loader, so its own import graph cannot be injected; ends when the loader takes a resolver port.\nvi.mock("./local-module.ts");\n',
      },
      why: "the ONE central positioned waiver naming the exact reported verb — malformed, stale and over-broad markers are proven CENTRALLY, never re-proved per policy",
    },
  ],
});
