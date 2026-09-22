// Policy: test-presence-inference (core/Spine-Testing.md §5) — the inference package's bounded test
// topology. Exact module tests answer isolated behavior; declared suite categories answer behavior that is
// intentionally cross-wire or composed. Any runtime source outside those categories falls back to an exact
// module mirror. Pure contracts/data/barrels have no runtime behavior to assert. The inference-test mirror
// resource owns the complete source/test denominator and refuses missing, empty, or unreadable corpora.
import type { SourceFile } from "ts-morph";
import { Node } from "ts-morph";
import { TEST_KIND_DEFINITIONS } from "../../_shared/test-kinds.ts";
import { defineGate } from "../contract/policy.ts";
import type { MirrorIndex } from "../contract/resource-mirror.ts";
import { readyResourceValue } from "../lib/resource-declaration.ts";

const SOURCE_ROOT = "packages/inference/src/";
const EXT_RE = /\.tsx?$/u;

/** Cross-cutting test homes whose subject is a semantic inference subsystem rather than one module. */
const SUITE_TOPOLOGY = [
  { under: "backends/", test: "tests/inference/conformance/applicability.suite.test.ts" },
  { under: "capability/", test: "tests/inference/capability/synthesize.test.ts" },
  { under: "catalog/", test: "tests/inference/catalog/mirror.suite.test.ts" },
  { under: "contract/", test: "tests/inference/index.test.ts" },
  { under: "funnel/", test: "tests/inference/index.test.ts" },
  { under: "registry/", test: "tests/inference/index.test.ts" },
  { under: "resolve/", test: "tests/inference/resolve/resolve-task.suite.test.ts" },
  { under: "roles/", test: "tests/inference/roles/role-clients.suite.test.ts" },
] as const;

const ROOT_SUITE = "tests/inference/index.test.ts";
const MSG =
  "inference runtime source has no supported test topology — add an exact runtime test at tests/inference/<path> or place the source in a governed cross-cutting suite category (Spine-Testing.md §5).";

function hasRuntimeExport(sourceFile: SourceFile): boolean {
  if (sourceFile.getFunctions().some((fn) => fn.isExported()) || sourceFile.getClasses().some((cls) => cls.isExported())) {
    return true;
  }
  return sourceFile.getVariableStatements().some(
    (statement) =>
      statement.isExported() &&
      statement.getDeclarations().some((declaration) => {
        const initializer = declaration.getInitializer();
        return initializer !== undefined && (Node.isArrowFunction(initializer) || Node.isFunctionExpression(initializer));
      }),
  );
}

function hasExactRuntimeTest(mirror: MirrorIndex, rel: string): boolean {
  const base = rel.replace(EXT_RE, "");
  return TEST_KIND_DEFINITIONS.some(
    ({ family, mirror: behavior, suffix }) => family !== "type" && behavior === "module" && mirror.testFiles.has(`tests/inference/${base}${suffix}`),
  );
}

function suiteFor(rel: string): string | undefined {
  if (!rel.includes("/")) {
    return ROOT_SUITE;
  }
  return SUITE_TOPOLOGY.find(({ under }) => rel.startsWith(under))?.test;
}

function hasSuiteTest(mirror: MirrorIndex, rel: string): boolean {
  const suite = suiteFor(rel);
  return suite !== undefined && mirror.testFiles.has(suite);
}

export const gate = defineGate({
  id: "test-presence-inference",
  family: "mirror-index",
  authority: "hard",
  severity: "error",
  population: "@inference",
  analysis: "resource",
  execution: "entire-population",
  facts: [],
  resources: [{ kind: "mirror-index", id: "inference-test" }],
  message: MSG,
  fix: "add the required exact runtime test under tests/inference, or extend the governed suite topology when the behavior is genuinely cross-cutting.",
  create: (ctx) => ({
    evaluate: () => {
      const mirror = readyResourceValue(ctx.resources.mirrorIndex("inference-test"));
      const dispatchedSources = new Set(ctx.files.map((sourceFile) => ctx.relativePath(sourceFile)));
      const undispatched = [...mirror.sourceFiles].filter((path) => !dispatchedSources.has(path));
      if (undispatched.length > 0 || dispatchedSources.size !== mirror.sourceFiles.size) {
        throw new Error(
          `inference source denominator disagreement: mirror=${String(mirror.sourceFiles.size)}, dispatched=${String(dispatchedSources.size)}, undispatched=${undispatched.join(", ") || "none"}`,
        );
      }
      ctx.receipt({ kind: "population", source: "inference-source-files", members: mirror.sourceFiles.size, unresolved: 0 });
      ctx.receipt({ kind: "population", source: "inference-test-files", members: mirror.testFiles.size, unresolved: 0 });
      let exact = 0;
      let suiteCovered = 0;
      let nonRuntime = 0;
      let uncovered = 0;
      for (const sourceFile of ctx.files) {
        const path = ctx.relativePath(sourceFile);
        const rel = path.slice(SOURCE_ROOT.length);
        if (!hasRuntimeExport(sourceFile)) {
          nonRuntime += 1;
          continue;
        }
        if (hasExactRuntimeTest(mirror, rel)) {
          exact += 1;
          continue;
        }
        if (hasSuiteTest(mirror, rel)) {
          suiteCovered += 1;
          continue;
        }
        uncovered += 1;
        ctx.report.file(path, { line: 1, column: 1, message: MSG });
      }
      ctx.receipt({
        kind: "population",
        source: `inference-topology [exact=${String(exact)},suite=${String(suiteCovered)},non-runtime=${String(nonRuntime)},uncovered=${String(uncovered)}]`,
        members: mirror.sourceFiles.size,
        unresolved: 0,
      });
    },
  }),
  mustFlag: [
    {
      mode: "resource",
      files: {
        "packages/inference/src/extensions/normalize.ts": "export function normalize(value: string): string {\n  return value.trim();\n}\n",
        "tests/inference/other.test.ts": "export {};\n",
      },
      expect: { count: 1, messageIncludes: "no supported test topology" },
      why: "a runtime source outside a declared cross-cutting category has no exact central mirror",
    },
    {
      mode: "resource",
      files: {
        "packages/inference/src/backends/v4/stream.ts": "export function stream(): string {\n  return 'ok';\n}\n",
        "tests/inference/other.test.ts": "export {};\n",
      },
      expect: { count: 1, messageIncludes: "no supported test topology" },
      why: "a cross-cutting category is coverage only while its governed suite anchor exists",
    },
  ],
  mustPass: [
    {
      mode: "resource",
      files: {
        "packages/inference/src/extensions/normalize.ts": "export function normalize(value: string): string {\n  return value.trim();\n}\n",
        "tests/inference/extensions/normalize.test.ts": "export {};\n",
      },
      why: "a runtime source outside a suite category is healthy with its exact registered runtime mirror",
    },
    {
      mode: "resource",
      files: {
        "packages/inference/src/backends/v4/stream.ts": "export function stream(): string {\n  return 'ok';\n}\n",
        "tests/inference/conformance/applicability.suite.test.ts": "export {};\n",
      },
      why: "backend behavior may be proved through the governed cross-wire conformance suite",
    },
    {
      mode: "resource",
      files: {
        "packages/inference/src/contract/types.ts": "export interface Request { readonly text: string; }\n",
        "tests/inference/contract/chat.test-d.ts": "export {};\n",
      },
      why: "a pure contract has no runtime behavior and its type-only proof remains a valid separate kind",
    },
  ],
  mustRefuse: [
    {
      mode: "resource",
      files: {
        "packages/inference/src/extensions/normalize.ts": "export const normalize = 1;\n",
        "packages/inference/src/extensions/rows.json": "{}\n",
        "tests/inference/extensions/normalize.test.ts": "export {};\n",
      },
      expect: { messageIncludes: "inference source denominator disagreement" },
      why: "a source member the TypeScript dispatch did not admit makes the complete denominator unknowable and refuses rather than disappearing",
    },
  ],
});
