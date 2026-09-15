// The PERMANENT PIN for `enforcement-registry-parity`'s DESCRIPTION-MIRROR arms (#910). The checker
// compared gate NAME SETS and the registered-gate COUNT and never the descriptions, so a doc row that
// COPIED a descriptor's runtime `message` could drift forever: `Core-Enforcement-Active-Gates.md`'s
// `no-if-is-group` row was a verbatim copy that had rotted into pre-#901 vocabulary — the string a
// violating agent actually READS taught retired words, and a doc-only repair would have created a
// divergence nothing catches (#909).
//
// Red-first receipt, 2026-09-01: with the widened checker run against the REAL tree BEFORE the doc was
// repaired, three live rows came back as undeclared mirrors (`no-if-is-group`, `no-context-returntype`,
// `no-decorators`) that the old name-set checker was structurally blind to.
//
// Conformance proves the arms in synthetic mini-projects; THIS drives the REAL descriptor over planted
// roots in both directions, and asserts the real tree's own mirror rows stay byte-equal.
//
// BOTH CONTRACTS (#1584, 2026-09-11): the gate reads a canonical `defineGate` module as a registered ACTIVE
// gate — by the callee's IMPORT ORIGIN (`lib/gate-contract-origin.ts`), never its spelling. Red-first receipt
// on the unmodified reader against the real tree: 155 findings (`declares "255 registered gates" but there are
// 108 active gate descriptors` + 154 live doc rows for converted policies read as orphans). The planted arms
// below take one legacy `x` and one canonical `y` through a planted `contract/policy.ts`, and the real-tree
// arm is the mixed roster's own receipt.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe } from "vitest";
import type { CoordinatedGateFinding } from "../../../../tooling/src/verify/contract/gate-authority.ts";
import { gate } from "../../../../tooling/src/verify/gates/enforcement-registry-parity.ts";
import { projectCtx } from "../../../../tooling/src/verify/index.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

const DOC_REL = "docs/architecture/core/Core-Enforcement-Active-Gates.md";
const CATALOG_REL = "docs/catalog/catalog.json";
const GATE_REL = "tooling/src/verify/gates/x.ts";
const MESSAGE = "the exact runtime text";
/** The message as it is SPELLED in a descriptor — a quoted literal, the default initializer under test. */
const MESSAGE_LITERAL = JSON.stringify(MESSAGE);
/** Restated, not imported: the test is the SECOND opinion on the marker vocabulary, not a re-import of
 *  the subject's own constant. */
const MARKER = "(@mirrors-message)";
/** The real-tree arm parses all ~270 gate modules with ts-morph, resolves every `defineGate` callee to its
 *  import origin, and evaluates each message — measured 19s alone on 2026-09-11 (8.4s before the origin
 *  reader); the parallel lane default of 5s is a contention flake, not a verdict. */
const REAL_TREE_TIMEOUT_MS = scaledBudget(60_000);

function runGate(root: string): readonly CoordinatedGateFinding[] {
  const result = runPolicyPass({
    knownPolicies: [gate],
    policies: [gate],
    root,
    project: projectCtx(root).project,
    reviewedGrants: [],
    failOnWarnings: false,
  });
  expect(result.toolErrors).toEqual([]);
  expect(result.factErrors).toEqual([]);
  return result.authority.effectiveFindings.filter((finding) => finding.policyId === gate.id);
}

function plant(root: string, rel: string, content: string): void {
  const abs = join(root, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}

/** A minimal real-shaped registry: ONE active descriptor `x`, and a doc whose count + ACTIVE row agree —
 *  so the only thing under test is the row's DESCRIPTION. */
function plantRegistry(root: string, description: string, message = MESSAGE_LITERAL): void {
  plant(root, GATE_REL, `export const gate = { name: "x", status: "active", message: ${message} };\n`);
  plant(root, CATALOG_REL, '{"documents":[]}\n');
  plant(root, DOC_REL, `## Layer 3 — Structural gates\n\n(1 registered gates)\n\n| \`x\` | ${description} |\n\n### Layer 3 — DORMANT structural gates\n`);
}

const messages = (findings: readonly CoordinatedGateFinding[]): string => findings.map((f) => f.message ?? "").join("\n");

/** The FINAL-contract fixtures: a `contract/policy.ts` whose `defineGate` the origin reader resolves on disk, and a
 *  module importing it — planted beside the legacy `x` so ONE registry carries both contracts. */
const POLICY_STUB_REL = "tooling/src/verify/contract/policy.ts";
const FINAL_GATE_REL = "tooling/src/verify/gates/y.ts";
const POLICY_STUB = "export function defineGate(policy: unknown): unknown {\n  return policy;\n}\n";
const CANONICAL_Y = 'import { defineGate } from "../contract/policy.ts";\nexport const gate = defineGate({ id: "y", message: "the y text" });\n';
/** The same spelling with a LOCAL `defineGate`: identity, not spelling, decides the contract. */
const LOOKALIKE_Y =
  'function defineGate(policy: unknown): unknown {\n  return policy;\n}\nexport const gate = defineGate({ id: "y", message: "the y text" });\n';

interface MixedRegistry {
  readonly yModule: string;
  readonly rows: readonly string[];
  readonly count: number;
}

function plantMixedRegistry(root: string, { yModule, rows, count }: MixedRegistry): void {
  plant(root, GATE_REL, 'export const gate = { name: "x", status: "active" };\n');
  plant(root, POLICY_STUB_REL, POLICY_STUB);
  plant(root, FINAL_GATE_REL, yModule);
  plant(root, CATALOG_REL, '{"documents":[]}\n');
  const table = rows.map((row) => `| \`${row}\` | enforces ${row} |`).join("\n");
  plant(root, DOC_REL, `## Layer 3 — Structural gates\n\n(${count} registered gates)\n\n${table}\n\n### Layer 3 — DORMANT structural gates\n`);
}

describe("enforcement-registry-parity — BOTH contracts on one roster (#1584)", () => {
  test("a legacy descriptor and a canonical defineGate policy, both rowed, count 2 — silent", ({ scratch }) => {
    plantMixedRegistry(scratch, { yModule: CANONICAL_Y, rows: ["x", "y"], count: 2 });
    expect(runGate(scratch)).toEqual([]);
  });

  test("the final policy's missing ACTIVE row is RED, and the finding names the contract to repair against", ({ scratch }) => {
    plantMixedRegistry(scratch, { yModule: CANONICAL_Y, rows: ["x"], count: 2 });
    const found = runGate(scratch);
    expect(found).toHaveLength(1);
    expect(messages(found)).toContain('active gate "y" (a final defineGate policy, which is always active) has no row');
  });

  test("a same-named LOCAL defineGate is not the contract: its module registers nothing, so its row is an ORPHAN", ({ scratch }) => {
    // The loud direction: a lookalike never reads as a registered gate, so the doc cannot be kept honest by spelling.
    plantMixedRegistry(scratch, { yModule: LOOKALIKE_Y, rows: ["x", "y"], count: 1 });
    const found = runGate(scratch);
    expect(found).toHaveLength(1);
    expect(messages(found)).toContain('names "y" but no active gate of that name exists');
  });

  test("the count line is the active-legacy + final total, and the finding shows both halves", ({ scratch }) => {
    plantMixedRegistry(scratch, { yModule: CANONICAL_Y, rows: ["x", "y"], count: 1 });
    const found = runGate(scratch);
    expect(found).toHaveLength(1);
    expect(messages(found)).toContain(
      'declares "1 registered gates" but there are 2 active gate modules (1 status:"active" legacy descriptors + 1 final defineGate policies',
    );
  });
});

describe("enforcement-registry-parity — the MIRROR arms, both directions", () => {
  test("a DECLARED mirror that drifted from its descriptor's message is RED", ({ scratch }) => {
    plantRegistry(scratch, `the DRIFTED text ${MARKER}`);
    expect(messages(runGate(scratch))).toContain("declares itself a MIRROR");
  });

  test("the SAME row matching byte-for-byte is silent — the control's other direction", ({ scratch }) => {
    plantRegistry(scratch, `${MESSAGE} ${MARKER}`);
    expect(runGate(scratch)).toEqual([]);
  });

  test("an UNDECLARED byte-equal copy is RED — the vocabulary cannot be optional", ({ scratch }) => {
    // Without this arm a lane could copy a message and simply not say so, and the pair would drift
    // exactly as #909's did: invisible because nothing knew it was coupled.
    plantRegistry(scratch, MESSAGE);
    expect(messages(runGate(scratch))).toContain("does not declare it");
  });

  test("independent PROSE is never compared — the declared limit, written down", ({ scratch }) => {
    plantRegistry(scratch, "a short human summary of what x enforces");
    expect(runGate(scratch)).toEqual([]);
  });

  test("a declared mirror whose message the evaluator CANNOT read refuses loudly", ({ scratch }) => {
    plantRegistry(scratch, `whatever it says ${MARKER}`, 'buildMessage("x")');
    expect(messages(runGate(scratch))).toContain("UNKEEPABLE");
  });

  test("a mirror assembled from `+`-concatenated fragments still matches — the real message shape", ({ scratch }) => {
    // Every message in the live corpus is built this way; a StringLiteral-only reader would call this
    // unreadable and the marker would be unusable on any real gate.
    plantRegistry(scratch, `the exact runtime text ${MARKER}`, '"the exact " + "runtime text"');
    expect(runGate(scratch)).toEqual([]);
  });
});

describe("enforcement-registry-parity — the REAL tree", () => {
  test(
    "the doc names exactly the MIXED roster (legacy active + every defineGate policy), the count matches, and every declared mirror is byte-equal",
    ({ repoRoot }) => {
      // This arm is the deliverable's receipt: it was RED with 155 findings while the reader knew only the legacy
      // shape, and it is the ONE place the real doc is held to the real corpus under both contracts.
      expect(runGate(repoRoot)).toEqual([]);
    },
    REAL_TREE_TIMEOUT_MS,
  );

  test("the marker vocabulary is OCCUPIED — an empty one would make the arms vacuous", ({ repoRoot }) => {
    // The denominator receipt: three rows carried a byte-exact copy at mint (2026-09-01). A doc with zero
    // markers would pass every arm above while proving nothing about the real table.
    const doc = readFileSync(join(repoRoot, DOC_REL), "utf8");
    expect(doc.split(MARKER).length - 1).toBeGreaterThanOrEqual(3);
  });
});
