// CONVERSION-TIME EVIDENCE for the two `drizzle-schema`-family registry conversions of #1584 —
// `lifecycle-portability` and `domain-freshness-plane` — written to the
// `simple-visitors-wave-2.test.ts` recipe. It is NOT a standing regression gate: it freezes the legacy
// source at one commit and RETIRES once the differential is trusted (design guide §6.4 — "conversion
// evidence for the landing commit, not standing law"). Delete it with the legacy loader.
//
// What it proves, in three assertions:
//   1. the converted policy's own declared rows pass the production proof runtime;
//   2. on the ADAPTED legacy corpus (the original fixture bytes plus the `drizzle-orm/sqlite-core` import
//      the stronger reader requires), the final policy and the frozen legacy descriptor name the SAME
//      subjects — one classified difference, the ANCHOR, is asserted rather than waved at;
//   3. the STRENGTHENING is real: on the ORIGINAL bytes, where `sqliteTable` resolves to nothing, the
//      legacy regex still "reads" a schema and reports, while the final policy REFUSES on the shared fact's
//      `empty` status through its own fail-closed `recordReadySchemaFact` (the phase that owns this moved
//      from the provider receipt to the consumer in #1962). Identity, not spelling — and a refusal, never
//      a silent pass.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { Project } from "ts-morph";
import type { GateDescriptor, GateExample } from "../../../../tooling/src/verify/contract/gate.ts";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { gate as domainFreshnessPlane } from "../../../../tooling/src/verify/gates/domain-freshness-plane.ts";
import { gate as lifecyclePortability } from "../../../../tooling/src/verify/gates/lifecycle-portability.ts";
import { runPass } from "../../../../tooling/src/verify/lib/pass.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

/** #1985. Both replay arms shell out to `git show` per frozen module and then BUILD ts-morph projects for
 *  every legacy example — measured at 5022.9 ms in one population phase alone, against vitest's bare
 *  5000 ms default with no budget of any kind. A timeout is NOT a verdict (it is the exit-2 class), so an
 *  unbudgeted arm here reports a tool failure as a policy regression on a merely warm box. This is the
 *  house `scaledBudget`, which GROWS with measured contention; eleven specs in this directory already use
 *  it. Its sibling `grant-liveness-family.test.ts` carries the same defect and is NOT fixed here. */
const REPLAY_TIMEOUT_MS = scaledBudget(120_000);

const ROOT = "/drizzle-registry-conversion";
/** The commit immediately before the conversion — the last one where the gate carried the legacy shape. */
const BASE = "172485b3a";
const LIFECYCLE_PATH = "tooling/src/verify/gates/lifecycle-portability.ts";
const FRESHNESS_PATH = "tooling/src/verify/gates/domain-freshness-plane.ts";
/** The legacy `domain-freshness-plane` examples plant no schema at all; the SEATED axis now derives its
 *  FK graph from the shared Drizzle fact, whose population must resolve to something. A `chats` table is
 *  the minimum that keeps the provider ready, and it is neutral to the legacy regex, which only ever read
 *  a declaration's own text. */
const CHATS_SCHEMA_PATH = "packages/db/src/schema/chat.ts";
const DRIZZLE_IMPORT = 'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\n';
const CHATS_SCHEMA_SOURCE = `${DRIZZLE_IMPORT}export const chats = sqliteTable("chats", { id: text("id").primaryKey() });\n`;
const SUBJECT_RE = /`(?<subject>[^`]+)`/u;

function projectOf(files: Readonly<Record<string, string>>): Project {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, source);
  }
  return project;
}

function legacyFiles(example: GateExample): Readonly<Record<string, string>> {
  return typeof example.files === "string" ? { [example.at ?? "packages/db/src/schema/x.ts"]: example.files } : example.files;
}

/** THE ADAPTATION, and the only one: the final reader resolves the table through the shared Drizzle fact,
 *  which asks whether the call is the canonical `sqliteTable` export rather than whether the text starts
 *  with `sqliteTable(`. Every legacy fixture spelled the call with no import at all. Adding the import is
 *  NEUTRAL to the legacy regex (it keys on the initializer text and the resolved column text), so both
 *  engines see the same corpus and the comparison stays honest. */
function adapted(files: Readonly<Record<string, string>>): Readonly<Record<string, string>> {
  const schemaPaths = Object.keys(files).filter((path) => path.startsWith("packages/db/src/schema/"));
  const withImports = Object.fromEntries(
    Object.entries(files).map(([path, source]) => [
      path,
      schemaPaths.includes(path) && !source.includes("drizzle-orm/sqlite-core") ? `${DRIZZLE_IMPORT}${source}` : source,
    ]),
  );
  // A fixture with no schema file at all still has to feed the provider its own population.
  return schemaPaths.some((path) => files[path]?.includes("sqliteTable") === true) ? withImports : { ...withImports, [CHATS_SCHEMA_PATH]: CHATS_SCHEMA_SOURCE };
}

/** The SUBJECT a finding names — the first backticked token in its message. Both engines lead with it
 *  ("journalEntries is OWNER-STAMPED canon …", with the name backticked), which makes them comparable across the
 *  classified anchor change. */
function subjects(messages: readonly string[]): readonly string[] {
  return messages.map((message) => SUBJECT_RE.exec(message)?.groups?.["subject"] ?? message).toSorted((left, right) => left.localeCompare(right));
}

function legacyFindings(gate: GateDescriptor, files: Readonly<Record<string, string>>): readonly { readonly file: string; readonly message: string }[] {
  const project = projectOf(files);
  const result = runPass([gate], { root: ROOT, project, scope: { kind: "project" }, files: project.getSourceFiles(), checker: () => project.getTypeChecker() });
  expect(result.toolErrors).toEqual([]);
  expect(result.gates).toHaveLength(1);
  return (result.gates[0]?.findings ?? []).map((finding) => ({ file: finding.file, message: finding.message ?? gate.message }));
}

interface FinalRun {
  readonly findings: readonly { readonly file: string; readonly message: string }[];
  readonly refusals: readonly string[];
}

function finalRun(gate: GatePolicy, files: Readonly<Record<string, string>>): FinalRun {
  const project = projectOf(files);
  const result = runPolicyPass({ knownPolicies: [gate], policies: [gate], root: ROOT, project, reviewedGrants: [], failOnWarnings: false });
  return {
    findings: result.authority.effectiveFindings.map((finding) => ({ file: finding.file, message: finding.message ?? gate.message })),
    // BOTH lists, because either can carry the refusal: `factErrors` when a provider itself could not run
    // (its population admitted nothing), `toolErrors` when a CONSUMER refused the census it was handed —
    // which is where an empty or unreadable schema lands since #1962. Collected together so a proof cannot
    // read "zero findings" as a pass when the run never happened.
    refusals: [...result.factErrors.map(({ factId, phase }) => `${factId}:${phase}`), ...result.toolErrors.map(({ phase, message }) => `${phase}: ${message}`)],
  };
}

/** The refusal an unreadable schema produces, at its CONSUMER. It was a fact-receipt refusal until #1962:
 *  the provider receipted its own census, so an `unresolved` schema withheld every dependent before
 *  `evaluate`. A receipt states the denominator walked, never what was found (§12.3), so the fact is now
 *  delivered and `recordReadySchemaFact` — every consumer's fail-closed read — throws on any non-`ready`
 *  status. Same loudness, same silence, one phase later — and the text is now the fact's own REASON, which
 *  names the offending column, so the two unbound-FK fixtures no longer share one string. The shape and the
 *  refusal class stay pinned; the subject is what varies. */
const UNRESOLVED_FK_REFUSAL_RE = /^evaluate: drizzle schema fact unresolved: packages\/db\/src\/schema\/\S+ references target: no lexical symbol binds \w+$/u;
const FK_REFERENCE_RE = /\.references\(\s*\(\)\s*=>\s*(?<target>\w+)\./gu;

/** Does some schema fixture FK a table it neither imports nor declares? The legacy regex read that as a
 *  live edge; the shared fact refuses it. Detected from the corpus rather than from a hand-listed example
 *  index, so a third such fixture cannot silently join the classification. */
function hasUnboundForeignKey(files: Readonly<Record<string, string>>): boolean {
  return Object.entries(files).some(
    ([path, source]) =>
      path.startsWith("packages/db/src/schema/") &&
      [...source.matchAll(FK_REFERENCE_RE)].some((match) => {
        const target = match.groups?.["target"] ?? "";
        return !(source.includes(`import { ${target} }`) || source.includes(`export const ${target} `));
      }),
  );
}

/** One comparable verdict per engine run: a refusal and its text, or the finding subjects. */
function verdictOf(final: FinalRun): readonly [string, string] {
  return final.refusals.length > 0 ? ["REFUSED", final.refusals.join(" | ")] : ["FINDINGS", subjects(final.findings.map(({ message }) => message)).join(" | ")];
}

function toolingHref(relFromGates: string): string {
  return JSON.stringify(pathToFileURL(join(process.cwd(), "tooling/src/verify/gates", relFromGates)).href);
}

function packageHref(repoRelative: string): string {
  return JSON.stringify(pathToFileURL(join(process.cwd(), repoRelative)).href);
}

/** The frozen legacy descriptor, imported from a scratch copy. Its RELATIVE imports are rewritten to file
 *  URLs (the copy lives outside the repo), and so are its two BARE package specifiers — the modules they
 *  name live in the repo, so their own transitive imports resolve normally from there. */
async function frozenLegacyGate(path: string, scratch: string): Promise<GateDescriptor> {
  const source = execFileSync("git", ["show", `${BASE}:${path}`], { encoding: "utf8" });
  const target = join(scratch, basename(path));
  const rewritten = source
    .replace('from "../contract/gate.ts"', `from ${toolingHref("../contract/gate.ts")}`)
    .replace('from "../lib/comment-spans.ts"', `from ${toolingHref("../lib/comment-spans.ts")}`)
    .replace('from "../lib/pass.ts"', `from ${toolingHref("../lib/pass.ts")}`)
    .replace('from "@orb/tooling/_shared/schema-read"', `from ${packageHref("tooling/src/_shared/schema-read.ts")}`)
    .replaceAll('from "@orb/contracts/portability"', `from ${packageHref("packages/contracts/src/portability/index.ts")}`)
    .replaceAll('from "@orb/contracts/chat"', `from ${packageHref("packages/contracts/src/chat/index.ts")}`);
  writeFileSync(target, rewritten);
  return ((await import(`${pathToFileURL(target).href}?frozen=${basename(path)}`)) as { readonly gate: GateDescriptor }).gate;
}

test("the converted registry policies pass their production proof runtime", () => {
  expect(verifyPolicyProofs([lifecyclePortability, domainFreshnessPlane])).toEqual([]);
});

test("each final policy names the same subjects as its frozen legacy gate on every original example", { timeout: REPLAY_TIMEOUT_MS }, async ({ scratch }) => {
  for (const [path, policy, anchorPrefix] of [
    [LIFECYCLE_PATH, lifecyclePortability, "packages/db/src/schema/"],
    [FRESHNESS_PATH, domainFreshnessPlane, "packages/"],
  ] as const) {
    const legacy = await frozenLegacyGate(path, scratch);
    for (const example of [...legacy.mustFlag, ...legacy.mustPass]) {
      const files = adapted(legacyFiles(example));
      const legacyHits = legacyFindings(legacy, files);
      const final = finalRun(policy, files);
      const label = `${policy.id}: ${example.why}`;
      // CLASSIFIED DIFFERENCE 1 — UNBOUND FK TARGET, compared unconditionally so the classification cannot
      // quietly absorb a second, unintended difference. Two legacy `domain-freshness-plane` examples spell
      // `references(() => chats.id)` in a file that never imports `chats`: the legacy regex matched the TEXT
      // and needed no binding, and the shared Drizzle fact REFUSES an FK whose parent it cannot resolve.
      // That refusal is the strengthening, not a gap — its exact text is the expectation, and the converted
      // module carries the same arm as a proof row whose fixture binds the import (its SEATED row).
      expect(verdictOf(final), label).toEqual(
        hasUnboundForeignKey(files)
          ? ["REFUSED", expect.stringMatching(UNRESOLVED_FK_REFUSAL_RE)]
          : ["FINDINGS", subjects(legacyHits.map(({ message }) => message)).join(" | ")],
      );
      // THE ONE CLASSIFIED DIFFERENCE — the ANCHOR. Both legacy descriptors reported registry verdicts on
      // line 1 of the GATE MODULE itself, and `domain-freshness-plane` additionally reported per-domain
      // verdicts on a DIRECTORY path (`packages/server/src/domain/<name>/`), which is not a file at all.
      // Neither identity is inside the policy's own population, so neither is expressible under the final
      // contract; the final policies anchor on the offending NODE (the table declaration, the write call,
      // the emit call) and, where a verdict has no node, on a real population file.
      for (const finding of legacyHits) {
        expect(finding.file === path || finding.file.startsWith("packages/server/src/domain/"), label).toBe(true);
      }
      for (const finding of final.findings) {
        expect(finding.file.startsWith(anchorPrefix), label).toBe(true);
      }
    }
  }
});

test("the final reader REFUSES the unresolvable table the legacy regex read anyway", { timeout: REPLAY_TIMEOUT_MS }, async ({ scratch }) => {
  const legacy = await frozenLegacyGate(LIFECYCLE_PATH, scratch);
  const founding = legacy.mustFlag.at(-1) as GateExample;
  const original = legacyFiles(founding);
  expect(Object.values(original).some((source) => source.includes("drizzle-orm"))).toBe(false);
  // Legacy: `sqliteTable(` in the initializer TEXT is enough, so it reports the uncovered table.
  expect(legacyFindings(legacy, original)).toHaveLength(1);
  // Final: nothing in that fixture resolves to the canonical Drizzle door, so the shared fact publishes an
  // EMPTY schema and its consumer refuses on it — the identity-not-spelling strengthening, expressed as a
  // refusal rather than as a silent pass or an invented verdict. The refusal moved from the fact's receipt
  // to the consumer's fail-closed read in #1962 (see `UNRESOLVED_FK_REFUSAL` above); a policy whose JOB is
  // to report an empty schema can now do so, and this one — which has no such job — still refuses.
  const final = finalRun(lifecyclePortability, original);
  expect(final.findings).toEqual([]);
  expect(final.refusals).toEqual(["evaluate: drizzle schema fact empty: schema source population declares no Drizzle SQLite tables"]);
});
