// CONVERSION-TIME EVIDENCE for the `freeze-provenance` family of #1584 — the occurrence policy and its
// `-health` sibling — written to the `drizzle-registry-conversion.test.ts` recipe. NOT a standing
// regression gate: it freezes the legacy source at one commit and RETIRES once the differential is
// trusted (design guide §4.6). Delete it with the legacy loader.
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
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { Project } from "ts-morph";
import type { GateDescriptor, GateExample } from "../../../../tooling/src/verify/contract/gate.ts";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { gate as freezeProvenance } from "../../../../tooling/src/verify/gates/freeze-provenance-write-pairing.ts";
import { gate as freezeProvenanceHealth } from "../../../../tooling/src/verify/gates/freeze-provenance-write-pairing-health.ts";
import { runPass } from "../../../../tooling/src/verify/lib/pass.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ROOT = "/freeze-provenance-conversion";
/** The commit immediately before the conversion — the last one carrying the legacy descriptor. */
const BASE = "5639ba677";
const GATE_PATH = "tooling/src/verify/gates/freeze-provenance-write-pairing.ts";
/** Legacy's own real-tree anchor; an example planting it is arming a BLINDNESS arm. */
const ANCHOR = "packages/db/src/schema/index.ts";
const LEGACY_DEFAULT_AT = "packages/server/src/domain/chat/persistence/x.ts";
const DRIZZLE_IMPORT = 'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\n';
const SCHEMA_DIR = "packages/db/src/schema/";
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

function legacyFiles(example: GateExample): Readonly<Record<string, string>> {
  return typeof example.files === "string" ? { [example.at ?? LEGACY_DEFAULT_AT]: example.files } : example.files;
}

function inPopulation(path: string): boolean {
  return path.startsWith("packages/") && path.includes("/src/");
}

/** THE TWO ADAPTATIONS, and they are the only ones.
 *  · The health policy derives its columns from `drizzleSchemaFact`, which asks whether the call is the
 *    canonical `sqliteTable` export rather than whether the text starts with `sqliteTable(`. Every legacy
 *    blindness fixture spelled it with no import at all; adding the import is NEUTRAL to the legacy reader
 *    (it read one declaration's descendant property assignments), so both engines see the same corpus.
 *  · A legacy example that plants no in-population file gets one that writes nothing, and one that plants
 *    no schema file at all gets a neutral `chats` table — the health policy declares `drizzleSchemaFact`,
 *    whose own population must resolve to something or every dependent is withheld. Neither addition is
 *    visible to the legacy reader, which only ever looked for `messageVariants` in one hand-named path. */
function adapted(files: Readonly<Record<string, string>>): Readonly<Record<string, string>> {
  const withImports = Object.fromEntries(
    Object.entries(files).map(([path, source]) => [
      path,
      path.startsWith(SCHEMA_DIR) && source.includes("sqliteTable(") && !source.includes("drizzle-orm/sqlite-core") ? `${DRIZZLE_IMPORT}${source}` : source,
    ]),
  );
  const withPopulation = Object.keys(files).some(inPopulation) ? withImports : { ...withImports, [FILLER_PATH]: "export const filler = 1;\n" };
  return Object.keys(files).some((path) => path.startsWith(SCHEMA_DIR))
    ? withPopulation
    : { ...withPopulation, [`${SCHEMA_DIR}chat.ts`]: `${DRIZZLE_IMPORT}export const chats = sqliteTable("chats", { id: text("id") });\n` };
}

interface Hit {
  readonly file: string;
  readonly line: number;
}

function sortHits(hits: readonly Hit[]): readonly Hit[] {
  return [...hits].sort((left, right) => left.file.localeCompare(right.file) || left.line - right.line);
}

function legacyHits(gate: GateDescriptor, files: Readonly<Record<string, string>>): readonly Hit[] {
  const project = projectOf(files);
  const result = runPass([gate], { root: ROOT, project, scope: { kind: "project" }, files: project.getSourceFiles(), checker: () => project.getTypeChecker() });
  expect(result.toolErrors).toEqual([]);
  return sortHits((result.gates[0]?.findings ?? []).map((finding) => ({ file: finding.file, line: finding.line })));
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

function toolingHref(relFromGates: string): string {
  return JSON.stringify(pathToFileURL(join(process.cwd(), "tooling/src/verify/gates", relFromGates)).href);
}

/** The frozen legacy descriptor, imported from a scratch copy outside the repo. */
async function frozenLegacyGate(scratch: string): Promise<GateDescriptor> {
  const source = execFileSync("git", ["show", `${BASE}:${GATE_PATH}`], { encoding: "utf8" });
  const target = join(scratch, basename(GATE_PATH));
  const rewritten = source
    .replace('from "../contract/gate.ts"', `from ${toolingHref("../contract/gate.ts")}`)
    .replace('from "../lib/ast-read.ts"', `from ${toolingHref("../lib/ast-read.ts")}`)
    .replace('from "../lib/comment-spans.ts"', `from ${toolingHref("../lib/comment-spans.ts")}`)
    .replace('from "../lib/pass.ts"', `from ${toolingHref("../lib/pass.ts")}`);
  writeFileSync(target, rewritten);
  return ((await import(`${pathToFileURL(target).href}?frozen=freeze`)) as { readonly gate: GateDescriptor }).gate;
}

const FAMILY = [freezeProvenance, freezeProvenanceHealth];

const TABLELESS_REFUSAL = [
  "drizzle-schema:receipt",
  'evaluate: declared fact failed: drizzle-schema: receipt: fact receipt refused: population "drizzle-schema" resolved zero members',
];

/** One comparable verdict per engine. A TABLELESS corpus collapses both sides to the refusal (asserted
 *  exactly, just above); a BLINDNESS example compares cardinality plus the classified anchor move; every
 *  occurrence example compares the exact node sites. */
function shape(hits: readonly Hit[], mode: { readonly blindness: boolean; readonly tableless: boolean; readonly legacy: boolean }): unknown {
  if (mode.tableless) {
    return { verdict: "refused-by-fact" };
  }
  if (!mode.blindness) {
    return { verdict: "sites", sites: hits.map((hit) => `${hit.file}:${hit.line}`) };
  }
  // Legacy anchored every blindness verdict on line 1 of the GATE MODULE, which is not inside the policy's
  // own population and is therefore inexpressible under the final contract.
  return { verdict: "blindness", count: hits.length, anchors: hits.map((hit) => (mode.legacy ? hit.file === GATE_PATH : inPopulation(hit.file))) };
}

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

test("the final family names the same nodes as the frozen legacy gate on every legacy example", async ({ scratch }) => {
  const legacy = await frozenLegacyGate(scratch);
  expect(legacy.mustFlag.length + legacy.mustPass.length).toBe(26);
  for (const example of [...legacy.mustFlag, ...legacy.mustPass]) {
    const original = legacyFiles(example);
    const files = adapted(original);
    const before = legacyHits(legacy, files);
    const after = finalRun(FAMILY, files);
    const label = (example.why ?? "").slice(0, 90);
    const blindness = Object.hasOwn(original, ANCHOR);
    // CLASSIFIED DIFFERENCE 1 — A TABLELESS SCHEMA TREE IS A REFUSAL, NOT A FINDING. `drizzleSchemaFact`
    // publishes its own CENSUS as the receipt's `members` (`lib/schema-fact.ts:378` sums tables/columns/
    // FKs/indexes), so a schema tree that declares nothing refuses at receipt and withholds every
    // dependent — which is legacy BLINDNESS mode B, "the schema home is gone", arriving as exit-2 loudness
    // instead of as a finding. That is the same classification `drizzle-registry-conversion.test.ts` made,
    // and the same provider-receipt shape #1953/#1955 fixed elsewhere; the exact text is asserted so the
    // classification cannot absorb a second difference.
    const tableless = !Object.entries(files).some(([path, source]) => path.startsWith(SCHEMA_DIR) && source.includes("sqliteTable("));
    expect(after.refusals, label).toEqual(tableless ? TABLELESS_REFUSAL : []);
    // CLASSIFIED DIFFERENCE — THE BLINDNESS ANCHOR, asserted on BOTH engines so the classification cannot
    // quietly absorb a second difference. Legacy reported every blindness verdict on line 1 of the GATE
    // MODULE, which is not inside the policy's own population and is therefore inexpressible under the
    // final contract; the cardinality is identical and the anchor moves into the population.
    expect(before.filter((hit) => hit.file === GATE_PATH).length, label).toBe(blindness ? before.length : 0);
    // Every OCCURRENCE example: the same node, same file, same line. The UNREADABLE-OBJECT row is the one
    // whose REASON changed (legacy refused a cross-module const; the final reader reads it and finds
    // `content` without its pair) and it lands on the same node — which is why this compares nodes, not
    // messages.
    expect(shape(after.hits, { blindness, tableless, legacy: false }), label).toEqual(shape(before, { blindness, tableless, legacy: true }));
  }
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
