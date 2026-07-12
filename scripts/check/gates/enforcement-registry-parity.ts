// Gate: enforcement-registry-parity — docs/architecture/core/Core-Enforcement-Active-Gates.md must
// agree with reality on BOTH axes:
//   1. DOC ↔ ALL_CHECKS: the doc's declared registered-gate COUNT line and its Layer-3 ACTIVE table's
//      gate names must match `report.ts`'s `ALL_CHECKS` exactly (both directions RED — a registered
//      gate missing from the doc, or a doc row naming a gate not in `ALL_CHECKS`). DORMANT gates (built,
//      self-tested, deliberately unregistered) are a sanctioned exclusion — DORMANT_GATES below.
//   2. GATE FILES ↔ ALL_CHECKS: every `scripts/check/gates/*.ts` file must be either registered in
//      `ALL_CHECKS` or in DORMANT_GATES — promoted from `tests/tooling/check-gates.int.test.ts`'s
//      one-off assertion to every `pnpm check` run, so a gate file added without wiring it into
//      `report.ts` (silently doing nothing) fails immediately instead of waiting for the next `pnpm
//      vitest` pass.
//
// DORMANT_GATES is a DELIBERATE duplicate of the set in `tests/tooling/check-gates.int.test.ts` (not
// imported — a script importing a test file would be backwards). Keep the two lists in sync by hand;
// both carry this same comment pointing at the other.
//
// This gate can't `import { ALL_CHECKS } from "../report.ts"` directly — report.ts registers this gate
// IN ALL_CHECKS, so that would be an import cycle (biome's noImportCycles bans it, and it's a real
// footgun: this module's top-level would need report.ts's top-level to have already finished, which is
// exactly backwards while report.ts is still building ALL_CHECKS). Instead report.ts builds the gate
// list first, THEN constructs this check via `createEnforcementRegistryParity`, passing the final name
// list (its own name included) as a plain argument — no cycle, no ordering hazard.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Node, Project, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";
import type { Check, Violation } from "../harness.ts";

const DOC_REL = "docs/architecture/core/Core-Enforcement-Active-Gates.md";
const GATES_DIR_REL = "scripts/check/gates";
const TS_EXT_RE = /\.ts$/u;
const COUNT_RE = /\((?<count>\d+) registered gates\)/u;
const ACTIVE_TABLE_START_RE = /## Layer 3 — Structural gates/u;
const DORMANT_TABLE_START_RE = /### Layer 3 — DORMANT structural gates/u;
const TABLE_ROW_RE = /^\|\s*`(?<name>[a-zA-Z0-9-]+)`\s*\|/gmu;

// SYNC WITH tests/tooling/check-gates.int.test.ts's `DORMANT_GATES` — gates built + self-tested but
// deliberately held out of `ALL_CHECKS` (each has its own self-test outside report.ts).
//
// The 8 ledger-gate-wave gates (2026-07-09) were ACTIVATED once the doc freeze lifted (added to
// report.ts's BASE_CHECKS + their Layer-3 ACTIVE rows + the count bump in Core-Enforcement-Active-Gates
// .md) — they are no longer here.
const DORMANT_GATES = new Set(["monotonic-tests", "audit-client-tests", "component-size-ui"]);

const COUNT_MISMATCH_MESSAGE = (docCount: number, actual: number): string =>
  `${DOC_REL} declares "${docCount} registered gates" but report.ts's ALL_CHECKS has ${actual} — ` +
  "update the count line (docs/architecture/core/Core-Enforcement-Active-Gates.md)";

const DOC_MISSING_MESSAGE = (name: string): string =>
  `ALL_CHECKS gate "${name}" (scripts/check/report.ts) has no row in ${DOC_REL}'s Layer-3 ACTIVE ` +
  "table — add it (docs/architecture/core/Core-Enforcement-Active-Gates.md)";

const DOC_ORPHAN_MESSAGE = (name: string): string =>
  `${DOC_REL} Layer-3 ACTIVE table names "${name}" but it is not in report.ts's ALL_CHECKS and not in ` +
  "DORMANT_GATES — remove the row or register/dormant the gate " +
  "(docs/architecture/core/Core-Enforcement-Active-Gates.md)";

const UNREGISTERED_FILE_MESSAGE = (name: string): string =>
  `scripts/check/gates/${name}.ts exists but is neither registered in report.ts's ALL_CHECKS nor ` +
  "listed in DORMANT_GATES (scripts/check/gates/enforcement-registry-parity.ts) — a gate file that " +
  "isn't wired in silently does nothing";

/** The Layer-3 ACTIVE table's gate-name column, between its header and the DORMANT sub-table. */
function activeTableGateNames(doc: string): Set<string> {
  const start = doc.search(ACTIVE_TABLE_START_RE);
  const dormantStart = doc.search(DORMANT_TABLE_START_RE);
  const region = doc.slice(start, dormantStart === -1 ? undefined : dormantStart);
  return new Set([...region.matchAll(TABLE_ROW_RE)].map((m) => m.groups?.["name"] ?? ""));
}

function docCountViolations(doc: string, actual: number): Violation[] {
  const match = COUNT_RE.exec(doc);
  if (match === null) {
    return [
      {
        file: DOC_REL,
        line: 0,
        message: `${DOC_REL} has no "(N registered gates)" count line to check against report.ts`,
      },
    ];
  }
  const declared = Number(match.groups?.["count"]);
  if (declared === actual) {
    return [];
  }
  return [{ file: DOC_REL, line: 0, message: COUNT_MISMATCH_MESSAGE(declared, actual) }];
}

function docTableViolations(
  docNames: ReadonlySet<string>,
  allCheckNames: ReadonlySet<string>,
): Violation[] {
  const violations: Violation[] = [];
  for (const name of allCheckNames) {
    if (!docNames.has(name)) {
      violations.push({ file: DOC_REL, line: 0, message: DOC_MISSING_MESSAGE(name) });
    }
  }
  for (const name of docNames) {
    if (!(allCheckNames.has(name) || DORMANT_GATES.has(name))) {
      violations.push({ file: DOC_REL, line: 0, message: DOC_ORPHAN_MESSAGE(name) });
    }
  }
  return violations;
}

function gateFileViolations(root: string, allCheckNames: ReadonlySet<string>): Violation[] {
  const dir = join(root, GATES_DIR_REL);
  if (!existsSync(dir)) {
    return [];
  }
  const violations: Violation[] = [];
  for (const entry of readdirSync(dir)) {
    if (!TS_EXT_RE.test(entry)) {
      continue;
    }
    const name = entry.replace(TS_EXT_RE, "");
    if (!(allCheckNames.has(name) || DORMANT_GATES.has(name))) {
      violations.push({
        file: `${GATES_DIR_REL}/${entry}`,
        line: 0,
        message: UNREGISTERED_FILE_MESSAGE(name),
      });
    }
  }
  return violations;
}

/** `allCheckNames` is report.ts's FULL `ALL_CHECKS` name list (including this gate's own name) —
 *  passed in rather than imported to avoid the report.ts↔gate import cycle (see header). */
export function createEnforcementRegistryParity(allCheckNames: readonly string[]): Check {
  return {
    name: "enforcement-registry-parity",
    run: ({ root }): Violation[] => {
      const names = new Set(allCheckNames);
      const docPath = join(root, DOC_REL);
      if (!existsSync(docPath)) {
        return [
          {
            file: DOC_REL,
            line: 0,
            message: "docs/architecture/core/Core-Enforcement-Active-Gates.md is missing",
          },
        ];
      }
      const doc = readFileSync(docPath, "utf-8");
      const docNames = activeTableGateNames(doc);
      return [
        ...docCountViolations(doc, names.size),
        ...docTableViolations(docNames, names),
        ...gateFileViolations(root, names),
      ];
    },
  };
}

// ── SINGLE-PASS CONTRACT FORM (§7 — the SHAPE change: reconcile the DISCOVERED DESCRIPTOR SET, not
// ALL_CHECKS) ──────────────────────────────────────────────────────────────────────────────────────
// The transformed parity gate (TSMORPH-SINGLE-PASS-AUDIT.md §7): the loader IS the registry, so this gate
// no longer compares the doc to report.ts's hand-kept ALL_CHECKS name list. It compares the doc to the
// CONTRACT: every gate file exports a `gate` descriptor with a name + a status; the doc's ACTIVE table ==
// the set of `status:"active"` descriptors, the DORMANT table == the `status:"dormant"` descriptors, and
// the "(N registered gates)" count == the ACTIVE-descriptor count. Arm 2 (gate-file ↔ registry) is GONE —
// the loader's fail-closed assertDescriptor makes an unwired/invalid gate file a load-time RED, so it can't
// exist silently. This gate self-hosts: it reads each `scripts/check/gates/*.ts` descriptor's name+status
// straight from the source AST (its own Project — fsBacked), never importing report.ts (the cycle the
// createEnforcementRegistryParity injection existed to dodge is gone). Kept ALONGSIDE the legacy Check.
const STATUS_ACTIVE = "active";
const STATUS_DORMANT = "dormant";

type DescriptorMeta = { readonly name: string; readonly status: string };

const DOC_ACTIVE_MISSING = (name: string): string =>
  `active gate "${name}" (its descriptor is status:"active") has no row in ${DOC_REL}'s Layer-3 ACTIVE ` +
  "table — add it (docs/architecture/core/Core-Enforcement-Active-Gates.md).";
const DOC_ACTIVE_ORPHAN = (name: string): string =>
  `${DOC_REL} Layer-3 ACTIVE table names "${name}" but no active descriptor of that name exists ` +
  '(scripts/check/gates/) — remove the row, or set the gate\'s status to "active".';
const DOC_DORMANT_MISSING = (name: string): string =>
  `dormant gate "${name}" (its descriptor is status:"dormant") has no row in ${DOC_REL}'s Layer-3 ` +
  "DORMANT table — add it (docs/architecture/core/Core-Enforcement-Active-Gates.md).";
const DOC_DORMANT_ORPHAN = (name: string): string =>
  `${DOC_REL} Layer-3 DORMANT table names "${name}" but no dormant descriptor of that name exists ` +
  '(scripts/check/gates/) — remove the row, or set the gate\'s status to "dormant".';
const COUNT_CONTRACT_MISMATCH = (docCount: number, actual: number): string =>
  `${DOC_REL} declares "${docCount} registered gates" but there are ${actual} active gate descriptors ` +
  "(scripts/check/gates/) — update the count line (docs/architecture/core/Core-Enforcement-Active-Gates.md).";

/** The string value of an object literal's `status`/`name` property (inline literal only). */
function literalProp(obj: Node, key: string): string | undefined {
  if (!Node.isObjectLiteralExpression(obj)) {
    return;
  }
  const prop = obj.getProperty(key);
  if (prop === undefined || !Node.isPropertyAssignment(prop)) {
    return;
  }
  const init = prop.getInitializer();
  return init !== undefined && Node.isStringLiteral(init) ? init.getLiteralText() : undefined;
}

/** Every `export const gate: GateDescriptor = { name, status, … }` descriptor's name+status, read from
 *  the gate-file source AST (fsBacked — this gate's own Project over the gates dir). */
function discoverDescriptorMeta(gatesDir: string): DescriptorMeta[] {
  if (!existsSync(gatesDir)) {
    return [];
  }
  const project = new Project({ skipAddingFilesFromTsConfig: true });
  const out: DescriptorMeta[] = [];
  for (const entry of readdirSync(gatesDir).sort()) {
    if (!TS_EXT_RE.test(entry)) {
      continue;
    }
    const sf = project.addSourceFileAtPath(join(gatesDir, entry));
    const decl = sf.getVariableDeclaration("gate");
    const init = decl?.getInitializer();
    if (init === undefined) {
      continue; // not yet ported to the contract — the loader still tolerates the legacy-only file
    }
    const obj = init.asKind(SyntaxKind.ObjectLiteralExpression);
    const name = obj === undefined ? undefined : literalProp(obj, "name");
    const status = obj === undefined ? undefined : literalProp(obj, "status");
    if (name !== undefined && status !== undefined) {
      out.push({ name, status });
    }
  }
  return out;
}

/** The Layer-3 DORMANT table's gate-name column (after the DORMANT header to end-of-doc). */
function dormantTableGateNames(doc: string): Set<string> {
  const start = doc.search(DORMANT_TABLE_START_RE);
  if (start === -1) {
    return new Set();
  }
  return new Set([...doc.slice(start).matchAll(TABLE_ROW_RE)].map((m) => m.groups?.["name"] ?? ""));
}

function reconcileTable(
  descriptorNames: ReadonlySet<string>,
  docNames: ReadonlySet<string>,
  missing: (name: string) => string,
  orphan: (name: string) => string,
): Violation[] {
  const violations: Violation[] = [];
  for (const name of descriptorNames) {
    if (!docNames.has(name)) {
      violations.push({ file: DOC_REL, line: 0, message: missing(name) });
    }
  }
  for (const name of docNames) {
    if (!descriptorNames.has(name)) {
      violations.push({ file: DOC_REL, line: 0, message: orphan(name) });
    }
  }
  return violations;
}

function contractCountViolations(doc: string, activeCount: number): Violation[] {
  const match = COUNT_RE.exec(doc);
  if (match === null) {
    return [
      {
        file: DOC_REL,
        line: 0,
        message: `${DOC_REL} has no "(N registered gates)" count line to check against the active descriptor set (docs/architecture/core/Core-Enforcement-Active-Gates.md).`,
      },
    ];
  }
  const declared = Number(match.groups?.["count"]);
  return declared === activeCount
    ? []
    : [{ file: DOC_REL, line: 0, message: COUNT_CONTRACT_MISMATCH(declared, activeCount) }];
}

/** The contract-conformance reconciliation shared by the descriptor's `run` and its self-test. */
function reconcileContract(root: string): Violation[] {
  const docPath = join(root, DOC_REL);
  if (!existsSync(docPath)) {
    return [
      {
        file: DOC_REL,
        line: 0,
        message:
          "docs/architecture/core/Core-Enforcement-Active-Gates.md is missing (docs/architecture/core/Core-Enforcement-Active-Gates.md).",
      },
    ];
  }
  const doc = readFileSync(docPath, "utf-8");
  const descriptors = discoverDescriptorMeta(join(root, GATES_DIR_REL));
  const active = new Set(descriptors.filter((d) => d.status === STATUS_ACTIVE).map((d) => d.name));
  const dormant = new Set(
    descriptors.filter((d) => d.status === STATUS_DORMANT).map((d) => d.name),
  );
  return [
    ...contractCountViolations(doc, active.size),
    ...reconcileTable(active, activeTableGateNames(doc), DOC_ACTIVE_MISSING, DOC_ACTIVE_ORPHAN),
    ...reconcileTable(dormant, dormantTableGateNames(doc), DOC_DORMANT_MISSING, DOC_DORMANT_ORPHAN),
  ];
}

export const gate: GateDescriptor = {
  name: "enforcement-registry-parity",
  docRow: "Core-Enforcement-Active-Gates.md (Layer 3)",
  status: "active",
  scopeSafety: "whole-project",
  fsBacked: true,
  message:
    'Core-Enforcement-Active-Gates.md disagrees with the discovered gate-descriptor set — its ACTIVE table must list exactly the status:"active" gates, its DORMANT table exactly the status:"dormant" gates, and its "(N registered gates)" count must equal the active-descriptor count (Core-Enforcement-Active-Gates.md).',
  fix: 'add/remove the doc row for the gate (ACTIVE vs DORMANT tables match the descriptor\'s status), and update the "(N registered gates)" count to the active-descriptor total in docs/architecture/core/Core-Enforcement-Active-Gates.md.',
  run: (ctx) => {
    for (const v of reconcileContract(ctx.root)) {
      ctx.report({ file: v.file, line: v.line, column: 0, message: v.message });
    }
  },
  mustFlag: [
    {
      files: {
        "scripts/check/gates/x.ts": 'export const gate = { name: "x", status: "active" };\n',
        "docs/architecture/core/Core-Enforcement-Active-Gates.md":
          "## Layer 3 — Structural gates\n\n(0 registered gates)\n\n### Layer 3 — DORMANT structural gates\n",
      },
      expect: { messageIncludes: "ACTIVE table" },
      why: "an active descriptor `x` with no ACTIVE-table row (and a count that ignores it) — the doc lies about the registry",
    },
  ],
  mustPass: [
    {
      files: {
        "scripts/check/gates/x.ts": 'export const gate = { name: "x", status: "active" };\n',
        "docs/architecture/core/Core-Enforcement-Active-Gates.md":
          "## Layer 3 — Structural gates\n\n(1 registered gates)\n\n| `x` | enforces x |\n\n### Layer 3 — DORMANT structural gates\n",
      },
      why: "the ACTIVE table lists exactly the one active descriptor and the count matches — the doc agrees with the registry, passes",
    },
  ],
};
