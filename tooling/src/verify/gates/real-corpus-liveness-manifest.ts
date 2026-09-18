// Policy: real-corpus-liveness-manifest — the two-sided §6.3 liveness-pin enforcement manifest (#2149).
// Every final policy owes one real-corpus liveness pin (standing law §6.3): a virtual overlay on the loaded
// Project driven through `runPolicyPass` and asserting a report, declared as `RealCorpusLivenessArm` data
// in a family test. Until this policy, the obligation was review-only. Now it is mechanically censused:
//
//   SIDE A — a final policy in the roster has NO liveness pin anywhere in the test corpus.
//   SIDE B — a liveness pin references a policy ID that does NOT exist in the roster.
//
// Side A is the coverage arm: a policy with zero pins could be dead code that silently passes everything,
// and nothing distinguished "silent because the tree is clean" from "silent because the policy is dead."
// Side B is the soundness arm: a dangling pin is a broken assertion that proves nothing.
//
// HOW IT READS THE DATA. Gate modules under `tooling/src/verify/gates/` are recognized by an `import` of
// `defineGate` from a specifier containing `contract/policy` followed by a `defineGate(...)` call — the same
// identity test the family uses at syntax tier. The policy ID equals the filename by loader contract.
// Liveness pins live in test files under `tests/tooling/verify/gates/` that import BOTH a gate module's
// `gate` export AND `RealCorpusLivenessArm` or one of its assertion helpers from
// `tests/support/real-corpus-liveness`. In such a file, every `PropertyAssignment` named `policy` whose
// initializer is one of the tracked gate imports counts as a pin for that policy ID.
//
// FAMILY `real-corpus-liveness-manifest` — a declared SINGLETON. Its subject is the cross-reference between
// the gate roster and the liveness-arm vocabulary in family tests, which no existing shared reader serves.
// The reading concern — import-specifier matching between gate modules and test files — is unique to this
// census.
//
// POPULATION PORT: NONE — born final, no legacy predecessor.
//
// HARD + WARNING: the obligation is being ESTABLISHED (~220+ of ~335 policies lack pins), so this gate
// starts as a non-blocking debt tracker. Hard authority because the fix is to ADD the pin, not to waive
// the requirement — an individual waiver would paper over a dead-code risk that only a real-corpus
// control can close.
import type { ImportDeclaration, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { GatePolicyContext } from "../contract/policy.ts";
import { defineGate } from "../contract/policy.ts";

const GATES_DIR = "tooling/src/verify/gates/";
const PROOF_DIR = "tooling/src/verify/gates/_proof/";
const TESTS_DIR = "tests/";
const LIVENESS_SPECIFIER = "real-corpus-liveness";
const TS_SUFFIX_LEN = 3; // ".ts".length
const DEFINE_GATE = "defineGate";
const POLICY_PROP = "policy";
const GATE_EXPORT = "gate";

// ── Path helpers ──────────────────────────────────────────────────────────────────────────────────────────

/** Extract a policy ID from a gate module's repo-relative path. */
function policyIdFromPath(path: string): string | null {
  if (!path.startsWith(GATES_DIR) || path.startsWith(PROOF_DIR) || !path.endsWith(".ts")) {
    return null;
  }
  return path.slice(GATES_DIR.length, -TS_SUFFIX_LEN);
}

/** Extract a policy ID from an import specifier pointing into the gates directory. */
function policyIdFromSpecifier(specifier: string): string | null {
  const idx = specifier.indexOf(GATES_DIR);
  if (idx === -1 || !specifier.endsWith(".ts")) {
    return null;
  }
  return specifier.slice(idx + GATES_DIR.length, -TS_SUFFIX_LEN);
}

// ── Gate-module recognition ───────────────────────────────────────────────────────────────────────────────

/** Whether an import declaration brings in `defineGate` from the policy contract. */
function importsDefineGate(stmt: ImportDeclaration): boolean {
  const specifier = stmt.getModuleSpecifierValue();
  if (!specifier.includes("contract/policy")) {
    return false;
  }
  return stmt.getNamedImports().some((ni) => ni.getName() === DEFINE_GATE);
}

// ── Test-file import analysis ─────────────────────────────────────────────────────────────────────────────

interface TestFileAnalysis {
  readonly isLivenessFile: boolean;
  /** local binding name → policy ID from the gate module specifier */
  readonly gateImports: ReadonlyMap<string, string>;
}

/** Analyze a test file's imports for liveness-mechanism and gate-module references. */
function analyzeTestImports(sourceFile: SourceFile): TestFileAnalysis {
  const gateImports = new Map<string, string>();
  let isLivenessFile = false;

  for (const stmt of sourceFile.getStatements()) {
    if (!Node.isImportDeclaration(stmt)) {
      continue;
    }
    const specifier = stmt.getModuleSpecifierValue();
    if (specifier.includes(LIVENESS_SPECIFIER)) {
      isLivenessFile = true;
    }
    const gatePolicyId = policyIdFromSpecifier(specifier);
    if (gatePolicyId !== null) {
      for (const namedImport of stmt.getNamedImports()) {
        if (namedImport.getName() === GATE_EXPORT) {
          const alias = namedImport.getAliasNode()?.getText() ?? namedImport.getName();
          gateImports.set(alias, gatePolicyId);
        }
      }
    }
  }
  return { isLivenessFile, gateImports };
}

/** Report Side A: roster policies that have no pin. */
function reportMissingPins(ctx: GatePolicyContext, roster: ReadonlyMap<string, { readonly path: string }>, pinned: ReadonlySet<string>): void {
  for (const [id, { path }] of roster) {
    if (!pinned.has(id)) {
      ctx.report.file(path, {
        line: 1,
        message: `Policy "${id}" has no real-corpus liveness pin — add a RealCorpusLivenessArm in a family test.`,
      });
    }
  }
}

/** Report Side B: liveness pins whose policy ID is not in the roster. */
function reportDanglingPins(
  ctx: GatePolicyContext,
  roster: ReadonlyMap<string, { readonly path: string }>,
  testPins: ReadonlyMap<string, readonly string[]>,
): void {
  for (const [testPath, policyIds] of testPins) {
    for (const policyId of policyIds) {
      if (!roster.has(policyId)) {
        ctx.report.file(testPath, {
          message: `Liveness pin references policy "${policyId}" which does not exist in the roster — remove the stale arm or add the missing policy.`,
        });
      }
    }
  }
}

// ── Policy definition ─────────────────────────────────────────────────────────────────────────────────────

const MESSAGE =
  "Every final policy owes a real-corpus liveness pin: a RealCorpusLivenessArm declaration in a family " +
  "test that runs the policy against the repository's own source via runPolicyPass with a virtual overlay " +
  "and asserts a report (standing law §6.3).";

const FIX =
  "Add a RealCorpusLivenessArm for this policy in the appropriate family test (either " +
  "real-corpus-liveness-family.suite.repo.int.test.ts or the policy's own family test), then run the test to " +
  "prove the arm fires.";

const POLICY_CONTRACT_STUB = `export function ${DEFINE_GATE}<const Policy>(policy: Policy): Policy {\n  return policy;\n}\n`;

const PROBE_GATE_SOURCE =
  `import { ${DEFINE_GATE} } from "../contract/policy.ts";\n` +
  `export const ${GATE_EXPORT} = ${DEFINE_GATE}({\n` +
  '  id: "PROBE_ID",\n  family: "PROBE_ID",\n  authority: "hard",\n  severity: "error",\n' +
  '  population: "@client",\n  analysis: "syntax",\n  execution: "selected-files",\n  facts: [],\n  resources: [],\n' +
  '  message: "m",\n  create: () => ({}),\n' +
  '  mustFlag: [{ mode: "source", files: { "packages/client/src/a.ts": "x" }, expect: { count: 1 }, why: "w" }],\n' +
  "  mustPass: [],\n});\n";

function probeGate(id: string): string {
  return PROBE_GATE_SOURCE.replaceAll("PROBE_ID", id);
}

function probeTestFile(localName: string, gateSpecifier: string): string {
  return (
    `import { ${GATE_EXPORT} as ${localName} } from "${gateSpecifier}";\n` +
    `import type { RealCorpusLivenessArm } from "../../../support/real-corpus-liveness.ts";\n` +
    `const ARMS: readonly RealCorpusLivenessArm[] = [{ ${POLICY_PROP}: ${localName}, globs: [], overlays: [{ kind: "add" as const, path: "x", source: "x" }], messageIncludes: "m" }];\n` +
    "export { ARMS };\n"
  );
}

export const gate = defineGate({
  id: "real-corpus-liveness-manifest",
  family: "real-corpus-liveness-manifest",
  authority: "hard",
  severity: "warning",
  workItem: 2149,
  population: {
    in: ["@tooling", "@tests"],
    under: ["tooling/src/verify/gates/**", "tests/tooling/verify/gates/**"],
    notUnder: ["tooling/src/verify/gates/_proof/**"],
  },
  analysis: "syntax",
  execution: "entire-population",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx: GatePolicyContext) => {
    /** Policy IDs found in the roster (gate modules with `defineGate`). */
    const roster = new Map<string, { readonly path: string }>();
    /** Policy IDs that have at least one liveness pin. */
    const pinned = new Set<string>();
    /** Per-test-file: the policy IDs its liveness arms reference (for Side B in evaluate). */
    const testPins = new Map<string, string[]>();

    /** Files that have a `defineGate` import from `contract/policy`. */
    const filesWithDefineGateImport = new Set<SourceFile>();
    /** Files with a `defineGate(...)` call (tracked during the visitor walk). */
    const filesWithDefineGateCall = new Set<SourceFile>();
    /** Per-test-file analysis from visitFile (import scanning happens there, not in visitors). */
    const testAnalyses = new Map<SourceFile, TestFileAnalysis>();

    return {
      visitors: [
        {
          kinds: [SyntaxKind.CallExpression],
          visit: (node, sourceFile): void => {
            // Track defineGate(...) calls in gate modules for roster recognition
            if (Node.isCallExpression(node) && Node.isIdentifier(node.getExpression()) && node.getExpression().getText() === DEFINE_GATE) {
              filesWithDefineGateCall.add(sourceFile);
            }
          },
        },
        {
          kinds: [SyntaxKind.PropertyAssignment],
          visit: (node, sourceFile): void => {
            // Track `policy:` property assignments in test files for liveness pin extraction
            if (!Node.isPropertyAssignment(node) || node.getName() !== POLICY_PROP) {
              return;
            }
            const init = node.getInitializerIfKind(SyntaxKind.Identifier);
            if (init === undefined) {
              return;
            }
            const analysis = testAnalyses.get(sourceFile);
            if (analysis === undefined || !analysis.isLivenessFile) {
              return;
            }
            const policyId = analysis.gateImports.get(init.getText());
            if (policyId !== undefined) {
              pinned.add(policyId);
              const path = ctx.relativePath(sourceFile);
              const existing = testPins.get(path);
              if (existing !== undefined) {
                existing.push(policyId);
              } else {
                testPins.set(path, [policyId]);
              }
            }
          },
        },
      ],

      visitFile: (sourceFile): void => {
        const path = ctx.relativePath(sourceFile);

        // Gate module: check for defineGate import
        if (path.startsWith(GATES_DIR) && !path.startsWith(PROOF_DIR)) {
          const id = policyIdFromPath(path);
          if (id === null) {
            return;
          }
          const hasImport = sourceFile.getStatements().some((stmt) => Node.isImportDeclaration(stmt) && importsDefineGate(stmt));
          if (hasImport) {
            filesWithDefineGateImport.add(sourceFile);
            // The roster entry is TENTATIVE: it will be confirmed in evaluate after the
            // visitor walk has seen whether a defineGate call exists.
          }
          return;
        }

        // Test file: scan imports (visitors handle property assignments)
        if (path.startsWith(TESTS_DIR)) {
          const analysis = analyzeTestImports(sourceFile);
          if (analysis.isLivenessFile && analysis.gateImports.size > 0) {
            testAnalyses.set(sourceFile, analysis);
          }
        }
      },

      evaluate: (): void => {
        // Build the roster from files that have BOTH a defineGate import AND a defineGate call
        for (const sourceFile of filesWithDefineGateImport) {
          if (!filesWithDefineGateCall.has(sourceFile)) {
            continue;
          }
          const path = ctx.relativePath(sourceFile);
          const id = policyIdFromPath(path);
          if (id !== null) {
            roster.set(id, { path });
          }
        }

        reportMissingPins(ctx, roster, pinned);
        reportDanglingPins(ctx, roster, testPins);
        ctx.receipt({ kind: "population", source: "real-corpus-liveness-manifest", members: roster.size });
      },
    };
  },
  mustFlag: [
    {
      mode: "source",
      files: {
        "tooling/src/verify/contract/policy.ts": POLICY_CONTRACT_STUB,
        "tooling/src/verify/gates/probe-no-pin.ts": probeGate("probe-no-pin"),
      },
      expect: { count: 1, messageIncludes: "no real-corpus liveness pin" },
      why: "Side A: a policy with no liveness pin in the test corpus must be reported",
    },
    {
      mode: "source",
      files: {
        "tooling/src/verify/contract/policy.ts": POLICY_CONTRACT_STUB,
        // A valid gate module so the roster is non-empty (zero-member receipt is refused as a tool error)
        "tooling/src/verify/gates/probe-roster-anchor.ts": probeGate("probe-roster-anchor"),
        "tests/tooling/verify/gates/probe-dangling.test.ts": probeTestFile("dangling", "../../../../tooling/src/verify/gates/nonexistent-policy.ts"),
      },
      // count: 2 — one for the dangling pin (Side B) and one for the anchor with no pin (Side A)
      expect: { count: 2, messageIncludes: "does not exist in the roster" },
      why: "Side B: a liveness pin referencing a non-existent policy must be reported",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: {
        "tooling/src/verify/contract/policy.ts": POLICY_CONTRACT_STUB,
        "tooling/src/verify/gates/probe-matched.ts": probeGate("probe-matched"),
        "tests/tooling/verify/gates/probe-matched-liveness.test.ts": probeTestFile("matched", "../../../../tooling/src/verify/gates/probe-matched.ts"),
      },
      why: "A policy with a matching liveness pin must pass cleanly",
    },
  ],
});
