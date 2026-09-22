// Policy: test-presence-inference (core/Spine-Testing.md §5) — the inference package's bounded test
// topology. Exact module tests answer isolated behavior; declared suite categories answer behavior that is
// intentionally cross-wire or composed. Any runtime source outside those categories falls back to an exact
// module mirror. Type-only contracts and barrels have no runtime behavior to assert. The inference-test mirror
// resource owns the complete source/test denominator and refuses missing, empty, or unreadable corpora.
import type { Node as MorphNode, SourceFile } from "ts-morph";
import { Node } from "ts-morph";
import { resolveExportedDeclarations } from "../../_shared/reference-fact.ts";
import { TEST_KIND_DEFINITIONS } from "../../_shared/test-kinds.ts";
import { defineGate } from "../contract/policy.ts";
import type { MirrorIndex } from "../contract/resource-mirror.ts";
import { readyResourceValue } from "../lib/resource-declaration.ts";

const SOURCE_ROOT = "packages/inference/src/";
const EXT_RE = /\.tsx?$/u;

/** Cross-cutting test homes whose subject is a semantic inference subsystem rather than one module. A
 *  category names its governed test subtree(s), but membership there is only the ROOT of proof: the test
 *  graph must still reach each runtime source before the category can cover it. */
const SUITE_TOPOLOGY = [
  { under: "backends/", testRoots: ["tests/inference/backends/", "tests/inference/conformance/"] },
  { under: "capability/", testRoots: ["tests/inference/capability/"] },
  { under: "catalog/", testRoots: ["tests/inference/catalog/"] },
  { under: "contract/", testRoots: ["tests/inference/index.test.ts"] },
  { under: "funnel/", testRoots: ["tests/inference/funnel/", "tests/inference/index.test.ts"] },
  { under: "registry/", testRoots: ["tests/inference/registry/", "tests/inference/index.test.ts"] },
  { under: "resolve/", testRoots: ["tests/inference/resolve/"] },
  { under: "roles/", testRoots: ["tests/inference/roles/"] },
] as const;

const ROOT_SUITE = "tests/inference/index.test.ts";
const MSG =
  "inference runtime source has no supported test topology — add an exact runtime test at tests/inference/<path> or place the source in a governed cross-cutting suite category (Spine-Testing.md §5).";

function isEmittedDeclaration(declaration: MorphNode, sourceFile: SourceFile): boolean {
  if (declaration.getSourceFile() !== sourceFile) {
    return false;
  }
  const variable = Node.isVariableDeclaration(declaration) ? declaration : declaration.getFirstAncestor(Node.isVariableDeclaration);
  if (variable !== undefined) {
    return variable.getVariableStatement()?.hasDeclareKeyword() === false;
  }
  if (
    Node.isFunctionDeclaration(declaration) ||
    Node.isClassDeclaration(declaration) ||
    Node.isEnumDeclaration(declaration) ||
    Node.isModuleDeclaration(declaration)
  ) {
    return !declaration.hasDeclareKeyword();
  }
  return false;
}

function hasRuntimeExport(sourceFile: SourceFile): boolean {
  if (sourceFile.getExportAssignments().length > 0) {
    return true;
  }
  return sourceFile.getExportSymbols().some((symbol) => {
    const exported = resolveExportedDeclarations(sourceFile, symbol.getName());
    return exported.kind === "resolved" && exported.value.some((declaration) => isEmittedDeclaration(declaration, sourceFile));
  });
}

function hasExactRuntimeTest(mirror: MirrorIndex, rel: string): boolean {
  const base = rel.replace(EXT_RE, "");
  return TEST_KIND_DEFINITIONS.some(
    ({ family, mirror: behavior, suffix }) => family !== "type" && behavior === "module" && mirror.testFiles.has(`tests/inference/${base}${suffix}`),
  );
}

type SuiteTopology = (typeof SUITE_TOPOLOGY)[number] | { readonly under: ""; readonly testRoots: readonly [typeof ROOT_SUITE] };

function suiteFor(rel: string): SuiteTopology | undefined {
  if (!rel.includes("/")) {
    return { under: "", testRoots: [ROOT_SUITE] };
  }
  return SUITE_TOPOLOGY.find(({ under }) => rel.startsWith(under));
}

function hasSuiteTest(rel: string, reachableBySuite: ReadonlyMap<string, ReadonlySet<string>>): boolean {
  const suite = suiteFor(rel);
  return suite !== undefined && reachableBySuite.get(suite.under)?.has(`${SOURCE_ROOT}${rel}`) === true;
}

/** Every in-population module reachable through static import/re-export edges from each declared suite.
 *  A suite filename alone is not evidence: the suite must actually enter the source module graph that
 *  contains the runtime file it claims to cover. This keeps a newly parked file under `backends/` from
 *  inheriting conformance coverage merely because an unrelated suite happens to exist. */
function suiteReachability(files: readonly SourceFile[], relativePath: (sourceFile: SourceFile) => string): ReadonlyMap<string, ReadonlySet<string>> {
  const pathByAbsolute = new Map(files.map((sourceFile) => [sourceFile.getFilePath(), relativePath(sourceFile)]));
  const fileByPath = new Map(files.map((sourceFile) => [relativePath(sourceFile), sourceFile]));
  const targetsOf = (sourceFile: SourceFile): readonly string[] => {
    const targets = [
      ...sourceFile.getImportDeclarations().map((declaration) => declaration.getModuleSpecifierSourceFile()),
      ...sourceFile.getExportDeclarations().map((declaration) => declaration.getModuleSpecifierSourceFile()),
    ];
    return targets.flatMap((target) => {
      if (target === undefined) {
        return [];
      }
      const path = pathByAbsolute.get(target.getFilePath());
      return path === undefined ? [] : [path];
    });
  };
  const out = new Map<string, ReadonlySet<string>>();
  const topologies: readonly SuiteTopology[] = [{ under: "", testRoots: [ROOT_SUITE] }, ...SUITE_TOPOLOGY];
  for (const topology of topologies) {
    const reached = new Set<string>();
    const pending = [...fileByPath.keys()].filter((path) => topology.testRoots.some((root) => (root.endsWith("/") ? path.startsWith(root) : path === root)));
    while (pending.length > 0) {
      const path = pending.pop();
      if (path === undefined || reached.has(path)) {
        continue;
      }
      reached.add(path);
      const sourceFile = fileByPath.get(path);
      if (sourceFile !== undefined) {
        pending.push(...targetsOf(sourceFile));
      }
    }
    out.set(topology.under, reached);
  }
  return out;
}

export const gate = defineGate({
  id: "test-presence-inference",
  family: "mirror-index",
  authority: "hard",
  severity: "error",
  population: { in: ["@inference", "@tests"], under: ["packages/inference/src/**", "tests/inference/**"] },
  analysis: "resource",
  execution: "entire-population",
  facts: [],
  resources: [{ kind: "mirror-index", id: "inference-test" }],
  message: MSG,
  fix: "add the required exact runtime test under tests/inference, or extend the governed suite topology when the behavior is genuinely cross-cutting.",
  create: (ctx) => ({
    evaluate: () => {
      const mirror = readyResourceValue(ctx.resources.mirrorIndex("inference-test"));
      const inferenceSources = ctx.files.filter((sourceFile) => ctx.relativePath(sourceFile).startsWith(SOURCE_ROOT));
      const dispatchedSources = new Set(inferenceSources.map((sourceFile) => ctx.relativePath(sourceFile)));
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
      const reachableBySuite = suiteReachability(ctx.files, ctx.relativePath);
      for (const sourceFile of inferenceSources) {
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
        if (hasSuiteTest(rel, reachableBySuite)) {
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
      expect: { count: 1 },
      why: "a runtime source outside a declared cross-cutting category has no exact central mirror",
    },
    {
      mode: "resource",
      files: {
        "packages/inference/src/backends/v4/stream.ts": "export function stream(): string {\n  return 'ok';\n}\n",
        "tests/inference/other.test.ts": "export {};\n",
      },
      expect: { count: 1 },
      why: "a cross-cutting category is coverage only while its governed suite anchor exists",
    },
    {
      mode: "resource",
      files: {
        "packages/inference/src/backends/v4/stream.ts": "export function stream(): string {\n  return 'ok';\n}\n",
        "tests/inference/conformance/applicability.suite.test.ts": "export {};\n",
      },
      expect: { count: 1 },
      why: "a suite path with no structural edge into the claimed runtime source is not coverage",
    },
    {
      mode: "resource",
      files: {
        "packages/inference/src/extensions/normalize.ts": "export const normalize = buildNormalizer();\n",
        "tests/inference/other.test.ts": "export {};\n",
      },
      expect: { count: 1 },
      why: "an exported call initializer is runtime behavior even though it is not function syntax",
    },
    {
      mode: "resource",
      files: {
        "packages/inference/src/extensions/normalize.ts": "export namespace Live { export const value = 1; }\n",
        "tests/inference/other.test.ts": "export {};\n",
      },
      expect: { count: 1 },
      why: "an exported namespace emits a runtime object and cannot enter the type-only bucket",
    },
    {
      mode: "resource",
      files: {
        "packages/inference/src/extensions/normalize.ts": "export let live: number;\n",
        "tests/inference/other.test.ts": "export {};\n",
      },
      expect: { count: 1 },
      why: "an exported non-ambient variable emits even when it has no initializer",
    },
    {
      mode: "resource",
      files: {
        "packages/inference/src/extensions/normalize.ts": "const live = buildNormalizer();\nexport { live };\n",
        "tests/inference/other.test.ts": "export {};\n",
      },
      expect: { count: 1 },
      why: "a local named export resolves back to its emitted value declaration instead of reading as a barrel",
    },
    {
      mode: "resource",
      files: {
        "packages/inference/src/extensions/normalize.ts": "const { live } = buildNormalizer();\nexport { live };\n",
        "tests/inference/other.test.ts": "export {};\n",
      },
      expect: { count: 1 },
      why: "a destructured local export resolves through its binding element to the emitted variable declaration",
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
        "packages/inference/src/backends/v4/index.ts": 'export { stream } from "./stream.ts";\n',
        "tests/inference/conformance/applicability.suite.test.ts":
          'import { stream } from "../../../packages/inference/src/backends/v4/index.ts";\nvoid stream;\n',
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
    {
      mode: "resource",
      files: {
        "packages/inference/src/contract/index.ts": 'export { live } from "../../../kit/src/live.ts";\n',
        "packages/kit/src/live.ts": "export const live = 1;\n",
        "tests/inference/other.test.ts": "export {};\n",
      },
      why: "a cross-file re-export is a barrel edge, not runtime behavior owned by the inference source file",
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
