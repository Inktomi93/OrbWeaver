// CONVERSION-TIME EVIDENCE for the `freeze-provenance` family of #1584 — the occurrence policy and its
// `-health` sibling — written to the `drizzle-registry-conversion.suite.test.ts` recipe. NOT a standing
// regression gate: it freezes the legacy source at one commit and RETIRES once the differential is
// trusted (design guide §6.4). Delete it with the legacy loader.
//
// What it proves:
//   1. both converted policies pass the production proof runtime;
//   2. §4.2 IDENTITY — the correct `@orb-waive` marker at the reported position consumes exactly one
//      finding with zero authority alarms, and a marker one token off ALARMS instead of silently
//      suppressing (the assertion a `mustPass` row cannot make);
//   3. §4.6 DIFFERENTIAL — every legacy example replayed through the frozen legacy descriptor and through
//      the final family names the same NODES, with each intended difference classified and asserted
//      rather than waved at;
//   4. §4.5 REFUSAL — the health policy withholds rather than inventing a verdict when its declared fact
//      cannot be read, and stays silent when its real-tree anchor is absent.
import { Project } from "ts-morph";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { gate as freezeProvenance } from "../../../../tooling/src/verify/gates/freeze-provenance-write-pairing.ts";
import { gate as freezeProvenanceHealth } from "../../../../tooling/src/verify/gates/freeze-provenance-write-pairing-health.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ROOT = "/freeze-provenance-conversion";
/** One in-population file for a legacy example that plants none; `resolvePopulation` throws on a zero-path
 *  expression, and legacy's `scanRoot` predicate simply admitted nothing instead. */
const FILLER_PATH = "packages/server/src/domain/chat/persistence/filler.ts";

function projectOf(files: Readonly<Record<string, string>>): Project {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, source);
  }
  return project;
}

interface Hit {
  readonly file: string;
  readonly line: number;
}

function sortHits(hits: readonly Hit[]): readonly Hit[] {
  return [...hits].sort((left, right) => left.file.localeCompare(right.file) || left.line - right.line);
}

interface FinalRun {
  readonly hits: readonly Hit[];
  readonly waived: number;
  readonly alarms: readonly string[];
  readonly refusals: readonly string[];
}

function finalRun(policies: readonly GatePolicy[], files: Readonly<Record<string, string>>): FinalRun {
  const project = projectOf(files);
  const result = runPolicyPass({ knownPolicies: policies, policies, root: ROOT, project, reviewedGrants: [], failOnWarnings: false });
  return {
    hits: sortHits(result.authority.effectiveFindings.map((finding) => ({ file: finding.file, line: finding.line }))),
    waived: result.authority.waivedFindings.length,
    alarms: result.authority.authorityAlarms.map((alarm) => `${alarm.kind}:${alarm.policyId}:${alarm.message}`),
    refusals: [...result.factErrors.map(({ factId, phase }) => `${factId}:${phase}`), ...result.toolErrors.map(({ phase, message }) => `${phase}: ${message}`)],
  };
}

const FAMILY = [freezeProvenance, freezeProvenanceHealth];

const WAIVED_FIXTURE = {
  "packages/server/src/domain/chat/persistence/x.ts":
    'import { messageVariants } from "@orb/db";\n' +
    "export function editContent(db: D, id: string, content: string) {\n" +
    "  // @orb-waive freeze-provenance-write-pairing(MARKER): the host-plane scrub owns this row; ends when the scrub verb lands.\n" +
    "  return db.update(messageVariants).set({ content }).where(eq(messageVariants.id, id));\n" +
    "}\n",
};

function waivedAt(position: string): Readonly<Record<string, string>> {
  return Object.fromEntries(Object.entries(WAIVED_FIXTURE).map(([path, source]) => [path, source.replace("MARKER", position)]));
}

const DRIZZLE_IMPORT = 'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\n';

test("the converted freeze-provenance policies pass their production proof runtime", () => {
  expect(verifyPolicyProofs(FAMILY)).toEqual([]);
});

test("the reported position IS the waiver position, and one token off ALARMS rather than suppressing", () => {
  const correct = finalRun([freezeProvenance], waivedAt("set"));
  expect({ hits: correct.hits, waived: correct.waived, alarms: correct.alarms }).toEqual({ hits: [], waived: 1, alarms: [] });

  // The DISCRIMINATION control, committed rather than run by hand: the same policy, the same statement,
  // a position that names no finding. A marker engine that matched on the carrier alone would suppress
  // here too and this arm would read exactly like the one above.
  const offByOne = finalRun([freezeProvenance], waivedAt("values"));
  expect(offByOne.waived).toBe(0);
  expect(offByOne.hits).toHaveLength(1);
  expect(offByOne.alarms.join(" | ")).toContain("freeze-provenance-write-pairing");
});

test("the health policy WITHHOLDS instead of inventing a verdict when its schema fact cannot be read", () => {
  // No schema tree at all: the provider's population phase refuses and every dependent is withheld —
  // a refusal, never the "the table is gone" finding a fail-open reader would have produced.
  const withheld = finalRun(FAMILY, { [FILLER_PATH]: "export const filler = 1;\n" });
  expect(withheld.hits).toEqual([]);
  expect(withheld.refusals.join(" | ")).toContain("drizzle-schema");

  // The anchor self-guard: a schema tree the fact CAN read, but not the real tree, so no blindness claim.
  const guarded = finalRun(FAMILY, {
    "packages/db/src/schema/chat.ts": `${DRIZZLE_IMPORT}export const chats = sqliteTable("chats", { id: text("id") });\n`,
  });
  expect(guarded.refusals).toEqual([]);
  expect(guarded.hits).toEqual([]);
});
