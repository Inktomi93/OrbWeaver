// Gate: enforcement-registry-parity — docs/architecture/core/Core-Enforcement-Active-Gates.md must agree
// with the DISCOVERED gate-descriptor set (the loader IS the registry):
//   • its Layer-3 ACTIVE table names exactly the `status:"active"` descriptors,
//   • its Layer-3 DORMANT table names exactly the `status:"dormant"` descriptors,
//   • its "(N registered gates)" count == the active-descriptor count.
// Both directions RED (a descriptor with no doc row, or a doc row naming no descriptor). A gate file that
// isn't a valid descriptor can't exist silently — the loader's fail-closed assertDescriptor makes it a
// load-time error — so there is no separate "gate-file ↔ registry" axis to police here.
//
// This gate self-hosts: it reads each `scripts/check/gates/*.ts` descriptor's name+status straight from the
// source AST via its own ts-morph Project (fsBacked), never importing report.ts — so there is no report.ts↔
// gate import cycle to dodge.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Node, Project, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";
import type { Violation } from "../harness.ts";

const DOC_REL = "docs/architecture/core/Core-Enforcement-Active-Gates.md";
const GATES_DIR_REL = "scripts/check/gates";
const TS_EXT_RE = /\.ts$/u;
const COUNT_RE = /\((?<count>\d+) registered gates\)/u;
const ACTIVE_TABLE_START_RE = /## Layer 3 — Structural gates/u;
const DORMANT_TABLE_START_RE = /### Layer 3 — DORMANT structural gates/u;
const TABLE_ROW_RE = /^\|\s*`(?<name>[a-zA-Z0-9-]+)`\s*\|/gmu;

/** The Layer-3 ACTIVE table's gate-name column, between its header and the DORMANT sub-table. */
function activeTableGateNames(doc: string): Set<string> {
  const start = doc.search(ACTIVE_TABLE_START_RE);
  const dormantStart = doc.search(DORMANT_TABLE_START_RE);
  const region = doc.slice(start, dormantStart === -1 ? undefined : dormantStart);
  return new Set([...region.matchAll(TABLE_ROW_RE)].map((m) => m.groups?.["name"] ?? ""));
}

// ── SINGLE-PASS CONTRACT FORM (§7 — reconcile the DISCOVERED DESCRIPTOR SET) ────────────────────────
// The loader IS the registry, so this gate compares the doc to the CONTRACT: every gate file exports a
// `gate` descriptor with a name + a status; the doc's ACTIVE table == the set of `status:"active"`
// descriptors, the DORMANT table == the `status:"dormant"` descriptors, and the "(N registered gates)"
// count == the ACTIVE-descriptor count. The loader's fail-closed assertDescriptor makes an unwired/invalid
// gate file a load-time RED, so a silent unregistered gate can't exist. This gate self-hosts: it reads each
// `scripts/check/gates/*.ts` descriptor's name+status straight from the source AST (its own Project —
// fsBacked), never importing report.ts.
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
    {
      files: {
        // No active descriptors, but the ACTIVE table names `ghost` — a doc row for a gate that doesn't exist.
        "scripts/check/gates/x.ts": 'export const gate = { name: "x", status: "dormant" };\n',
        "docs/architecture/core/Core-Enforcement-Active-Gates.md":
          "## Layer 3 — Structural gates\n\n(0 registered gates)\n\n| `ghost` | names no descriptor |\n\n### Layer 3 — DORMANT structural gates\n\n| `x` | dormant x |\n",
      },
      expect: { messageIncludes: "no active descriptor of that name exists" },
      why: "the ACTIVE table names `ghost` with no matching active descriptor — the DOC_ACTIVE_ORPHAN arm",
    },
    {
      files: {
        // A dormant descriptor `x` absent from the DORMANT table — DOC_DORMANT_MISSING.
        "scripts/check/gates/x.ts": 'export const gate = { name: "x", status: "dormant" };\n',
        "docs/architecture/core/Core-Enforcement-Active-Gates.md":
          "## Layer 3 — Structural gates\n\n(0 registered gates)\n\n### Layer 3 — DORMANT structural gates\n",
      },
      expect: { messageIncludes: "DORMANT table" },
      why: "a dormant descriptor `x` with no DORMANT-table row — the DOC_DORMANT_MISSING arm (distinct message)",
    },
    {
      files: {
        // The DORMANT table names `phantom` with no dormant descriptor — DOC_DORMANT_ORPHAN.
        "scripts/check/gates/x.ts": 'export const gate = { name: "x", status: "dormant" };\n',
        "docs/architecture/core/Core-Enforcement-Active-Gates.md":
          "## Layer 3 — Structural gates\n\n(0 registered gates)\n\n### Layer 3 — DORMANT structural gates\n\n| `x` | dormant x |\n| `phantom` | names no descriptor |\n",
      },
      expect: { messageIncludes: "no dormant descriptor of that name exists" },
      why: "the DORMANT table names `phantom` with no matching dormant descriptor — the DOC_DORMANT_ORPHAN arm",
    },
    {
      files: {
        // The ACTIVE table + descriptor agree, but the count line is wrong (says 0, one active) — COUNT mismatch.
        "scripts/check/gates/x.ts": 'export const gate = { name: "x", status: "active" };\n',
        "docs/architecture/core/Core-Enforcement-Active-Gates.md":
          "## Layer 3 — Structural gates\n\n(0 registered gates)\n\n| `x` | enforces x |\n\n### Layer 3 — DORMANT structural gates\n",
      },
      expect: { messageIncludes: "registered gates" },
      why: "the ACTIVE table matches but the count says 0 for one active descriptor — the COUNT_CONTRACT_MISMATCH arm",
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
