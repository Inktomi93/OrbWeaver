// Mock only external edges; internal namespaces, authored prototypes and the shared logger are not injected collaborators.
// Canonical floor origins judge targets; genuine third-party objects and composition-owned objects remain legal.
// Singleton: Vitest module replacements and spies share the same test-tree doctrine and waiver authority.
// Population preserves every authored test tree, including nested tests; production sources are outside this policy.
import type { Node as MorphNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { isAuthoredModuleNamespace } from "../../floor/code-facts/module-namespace.ts";
import { readStaticString, resolveModuleMemberOrigin, resolveStableExpression } from "../../floor/code-facts/reference-fact.ts";
import { readCallableInvocation } from "../../floor/code-facts/reference-fact-invocation.ts";
import { defineGate } from "../contract/policy.ts";
import { readPackageExportOrigin } from "../lib/project-home-origin.ts";
import { readSealedOrigin } from "../lib/sealed-origin.ts";

const VITEST_MODULE = "vitest";
/** `mock` is hoisted, `doMock` is not; both replace an internal module with a fake and both are the ban's
 *  subject. The legacy text comparison saw only `vi.mock`, so every `vi.doMock` was a silent green. */
const MOCK_MEMBERS = new Set(["mock", "doMock"]);
/** A spy on a module namespace rewrites that module's export in place, so it is the same replacement by another verb. */
const SPY_MEMBER = "spyOn";
const INTERNAL_PREFIXES = [".", "packages/", "@orb/", "#"];

const MESSAGE = "vi.mock on an internal module — fake at the edges, inject at the composition root (docs/law/Spine-Testing.md §3).";
const SPY_MESSAGE =
  "vi.spyOn on an internal module namespace — the spy replaces that module's export for every importer, so the test asserts our own wiring instead of an outcome. Inject the collaborator at its port, or assert the observable result (docs/law/Spine-Testing.md §3).";

const FIX =
  "inject the fake at the composition root; vi.mock is legal only for an unavoidable third-party node edge, and vi.spyOn only on an object that is not an internal module namespace. " +
  "For a genuinely unmockable internal seam, attach `@orb-waive test-mock-doctrine(<position>): <why the " +
  "seam cannot be injected, and what would end it>` to that exact call. The position is the reported authored member or callee alias.";

const SPY_VITEST = "export const vi = { spyOn: (target: object, name: string): void => { void target; void name; } };\n";

/** Legacy `scanRoot` was `p.includes("tests/")` — every authored `tests/` tree, including the nested ones. */
const TEST_POPULATION = { in: ["@authored"], under: ["tests/**", "**/tests/**"] } as const;

function replacementInvocation(node: import("ts-morph").CallExpression): { readonly verb: string; readonly argument: MorphNode } | undefined {
  const invocation = readCallableInvocation(node);
  if (invocation.kind === "unresolved" && "capture" in invocation) {
    throw new Error(`test-mock-doctrine cannot prove native bound callable capture: ${invocation.detail}`);
  }
  if (invocation.kind !== "resolved" || invocation.value.invocation === "bind") {
    return;
  }
  const native = readPackageExportOrigin(invocation.value.callee, [VITEST_MODULE], new Set([...MOCK_MEMBERS, SPY_MEMBER]));
  if (native.verdict !== "home" || native.exportedName === null) {
    return;
  }
  const verb = native.exportedName;
  const arguments_ = invocation.value.arguments;
  if (arguments_.kind === "unresolved") {
    throw new Error(`test-mock-doctrine cannot prove replacement arguments: ${arguments_.detail}`);
  }
  const argument = arguments_.value[0];
  return argument === undefined ? undefined : { verb, argument };
}

function isInternalTarget(specifier: string): boolean {
  return INTERNAL_PREFIXES.some((prefix) => specifier.startsWith(prefix));
}

function isClassHome(declaration: MorphNode): boolean {
  if (Node.isClassDeclaration(declaration)) {
    return true;
  }
  if (!Node.isVariableDeclaration(declaration)) {
    return false;
  }
  const value = resolveStableExpression(declaration.getNameNode());
  return value.kind === "resolved" && Node.isClassExpression(value.value);
}

/** The finding message when this vitest call replaces internal code, else undefined. */
function replacementMessage(verb: string, target: MorphNode): string | undefined {
  if (verb === SPY_MEMBER) {
    if (isAuthoredModuleNamespace(target)) {
      return SPY_MESSAGE;
    }
    const prototype = resolveModuleMemberOrigin(target);
    if (
      prototype.kind === "resolved" &&
      prototype.value.memberPath.at(-1) === "prototype" &&
      prototype.value.canonical.kind === "project" &&
      isClassHome(prototype.value.canonical.declaration) &&
      !prototype.value.canonical.sourceFile.isInNodeModules()
    ) {
      return "vi.spyOn on an authored class prototype replaces behavior for every instance — inject the collaborator at its port (Spine-Testing.md §3).";
    }
    const logger = readSealedOrigin(target, { pathInfix: "/packages/server/src/foundation/observability/logger.ts", exportedNames: new Set(["logger"]) });
    return logger.kind === "sealed"
      ? "vi.spyOn on the production logger replaces the shared observability sink — inject an edge recorder (Spine-Testing.md §3)."
      : undefined;
  }
  const specifier = readStaticString(target);
  // FAIL-CLOSED: a target the static reader cannot resolve is exactly where an internal module
  // hides — a computed specifier is not evidence that the edge is third-party.
  return specifier.kind !== "resolved" || isInternalTarget(specifier.value) ? MESSAGE : undefined;
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
          const replacement = replacementInvocation(node);
          if (replacement === undefined) {
            return;
          }
          const { verb, argument } = replacement;
          const message = replacementMessage(verb, argument);
          if (message !== undefined) {
            const expression = node.getExpression();
            const offset = expression.getText().indexOf(verb);
            ctx.report.node(expression, { ...(offset < 0 ? {} : { token: verb, offset }), message });
          }
        },
      },
    ],
  }),
  mustFlag: [
    {
      mode: "types",
      files: {
        "node_modules/vitest/index.ts": SPY_VITEST,
        "packages/server/src/domain/thing.ts": "export const Thing = class { run(): number { return 1; } };",
        "tests/tooling/class-expression.test.ts":
          "import { vi } from 'vitest'; import { Thing } from '../../packages/server/src/domain/thing.ts'; vi.spyOn(Thing.prototype, 'run');",
      },
      expect: { count: 1, token: "spyOn", messageIncludes: "authored class prototype" },
      why: "an authored exported class expression has the same shared prototype as a class declaration",
    },
    {
      mode: "types",
      files: {
        "node_modules/vitest/index.ts": SPY_VITEST,
        "packages/server/src/domain/thing.ts": "export class Thing { run(): number { return 1; } }",
        "tests/tooling/prototype.test.ts":
          "import { vi } from 'vitest'; import { Thing as Subject } from '../../packages/server/src/domain/thing.ts'; const prototype = Subject['prototype']; vi.spyOn(prototype, 'run');",
      },
      expect: { count: 1, token: "spyOn", messageIncludes: "authored class prototype" },
      why: "an aliased authored prototype replaces every instance, not an injected collaborator",
    },
    {
      mode: "types",
      files: {
        "node_modules/vitest/index.ts": SPY_VITEST,
        "packages/server/src/foundation/observability/logger.ts": "export const logger = { info: (): void => {} };",
        "tests/tooling/logger.test.ts":
          "import { vi } from 'vitest'; import { logger as sink } from '../../packages/server/src/foundation/observability/logger.ts'; vi.spyOn(sink, 'info');",
      },
      expect: { count: 1, token: "spyOn", messageIncludes: "production logger" },
      why: "the shared production logger is not a composition-owned collaborator",
    },
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
    {
      mode: "types",
      files: {
        "node_modules/vitest/index.ts": SPY_VITEST,
        "tooling/src/floor/git/git.ts": "export const runGit = (args: readonly string[]): number => args.length;\n",
        "tests/tooling/floor/git/git.test.ts":
          'import { vi } from "vitest";\nimport * as git from "../../../../tooling/src/floor/git/git.ts";\nvi.spyOn(git, "runGit");\n',
      },
      expect: { count: 1, token: "spyOn", messageIncludes: "vi.spyOn on an internal module namespace" },
      why: "A SPY ON A NAMESPACE IMPORT rewrites that module's export for every importer, which is a `vi.mock` by another verb",
    },
    {
      mode: "types",
      files: {
        "node_modules/vitest/index.ts": SPY_VITEST,
        "tests/tooling/local-module.ts": "export const run = (): number => 1;\n",
        "tests/tooling/dynamic-spy.test.ts": 'import { vi } from "vitest";\nvi.spyOn(await import("./local-module.ts"), "run");\n',
      },
      expect: { count: 1, token: "spyOn", messageIncludes: "vi.spyOn on an internal module namespace" },
      why: "the dynamic-import spelling: `await import(…)` yields the same module namespace, read off the declaration its type names",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "node_modules/vitest/index.ts": SPY_VITEST,
        "node_modules/vendor/index.ts": "export const Thing = class { run(): number { return 1; } };",
        "tests/tooling/vendor-expression.test.ts": "import { vi } from 'vitest'; import { Thing } from 'vendor'; vi.spyOn(Thing.prototype, 'run');",
      },
      why: "a third-party class expression remains an external instrumentation edge",
    },
    {
      mode: "types",
      files: {
        "node_modules/vitest/index.ts": SPY_VITEST,
        "node_modules/vendor/index.ts": "export class Thing { run(): number { return 1; } }",
        "tests/tooling/vendor-prototype.test.ts": "import { vi } from 'vitest'; import { Thing } from 'vendor'; vi.spyOn(Thing.prototype, 'run');",
      },
      why: "a third-party class prototype remains an external instrumentation edge",
    },
    {
      mode: "types",
      files: {
        "node_modules/vitest/index.ts": SPY_VITEST,
        "node_modules/pkg/index.ts": "export const run = (): number => 1;\n",
        "tests/tooling/third-party-spy.test.ts":
          'import { vi } from "vitest";\nimport * as pkg from "pkg";\nvi.spyOn(pkg, "run");\nvi.spyOn(console, "warn");\n',
      },
      why: "a third-party module namespace and a global object are edges, not our own code",
    },
    {
      mode: "types",
      files: {
        "node_modules/vitest/index.ts": SPY_VITEST,
        "tests/tooling/services.ts": "export const services = { run: (): number => 1 };\n",
        "tests/tooling/object-spy.test.ts": 'import { vi } from "vitest";\nimport { services } from "./services.ts";\nvi.spyOn(services, "run");\n',
      },
      why: "DECLARED LIMIT: a spy on an exported OBJECT observes a value the composition root handed over (the node-tests rule spies on the shared services result); only a module namespace is a module replacement",
    },
    {
      mode: "types",
      files: {
        "node_modules/vitest/index.ts": SPY_VITEST,
        "tests/tooling/local-module.ts": "export const run = (): number => 1;\n",
        "tests/tooling/waived-spy.test.ts":
          'import { vi } from "vitest";\nimport * as local from "./local-module.ts";\n// @orb-waive test-mock-doctrine(spyOn): the dispatch proof wraps the real export; ends when the action takes an injected sink.\nvi.spyOn(local, "run");\n',
      },
      why: "the central positioned waiver names the reported `spyOn` verb",
    },
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
      why: 'THE RESOLUTION COUNTERFACTUAL — a LOCAL object named `vi` with a `mock` method, called on an internal target, with vitest present in the same project. The legacy `expr.getText() === "vi.mock"` comparison accused it. It falsifies the `origin.kind !== "resolved"` half ALONE: a local object resolves to no module member, so the MODULE comparison behind it never runs. That comparison is pinned by the RESOLVING row below (w9 D2/F1, #2046)',
    },
    {
      mode: "types",
      files: {
        "node_modules/vitest/index.ts": "export const vi = { mock: (target: string): void => { void target; } };\n",
        "tests/tooling/vendor-vi.ts": "export const vi = { mock: (target: string): void => { void target; } };\n",
        "tests/tooling/vendored-vi.test.ts": 'import { vi } from "./vendor-vi.ts";\nvi.mock("./local-module.ts");\n',
      },
      why: "THE MODULE COUNTERFACTUAL, AND IT RESOLVES (w9 F1, #2046) — a PROJECT module exporting its own `vi` with a `mock`, called on an internal target, with real vitest present. The origin resolves cleanly and the member name IS `mock`; only `originModuleSpecifier(…) !== VITEST_MODULE` rejects it. A LOCAL object never resolves, so the row above cannot reach this comparison — `bounded-list-limit` and `byte-check-cast` carry the same pair for the same reason",
    },
    {
      mode: "types",
      files: {
        "node_modules/vitest/index.ts": "export const vi = { mock: (target: string, fallback?: string): void => { void target; void fallback; } };\n",
        "tests/tooling/second-argument.test.ts": 'import { vi } from "vitest";\nvi.mock("node:fs", "./local-module.ts");\n',
      },
      why: "DECLARED LIMIT, and the receipt for the ARGUMENT POSITION — the mocked TARGET is argument ZERO and nothing else is. A later argument is the factory/options slot, so reading `.at(-1)` would judge whatever the author passed last; here the trailing string is an internal specifier and the real target is a legal node edge. Widening the position reds this row (w9 :262, #2046)",
    },
    {
      mode: "types",
      files: {
        "node_modules/vitest/index.ts": "export const vi = { mock: (target: string): void => { void target; } };\n",
        "tests/tooling/anchor.test.ts": 'import { vi } from "vitest";\nvi.mock("node:fs");\n',
        "packages/server/src/domain/x/harness.ts": 'import { vi } from "vitest";\nvi.mock("./local-module.ts");\n',
      },
      why: "THE POPULATION FENCE — the same internal `vi.mock` in PRODUCTION source rather than a test tree, beside an in-population anchor. §3 is a rule about how a TEST fakes its subject; a `vi.mock` outside the test trees is a different defect with a different owner (a product module importing a test runner at all), and this policy does not claim it. Dropping the `tests/**` restriction reds this row (w9 :262, #2046)",
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
