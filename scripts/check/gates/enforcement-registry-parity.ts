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
const DORMANT_GATES = new Set([
  "monotonic-tests",
  "audit-client-tests",
  "component-size-ui",
  // D54 §13.3 form-factory gate (2026-07-09) — built + self-tested, held DORMANT because its ONE
  // real-tree hit (chat/components/group-config-form.tsx) is a deliberate cross-lane exception (a
  // discriminated-union immediate-commit form, per that file's header) this wave must not fix; activating
  // it would ship a knowingly-red gate. Tracked in Core-Enforcement-Deferred-Dropped.md with its trigger.
  "form-factory-for-multifield",
]);

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
