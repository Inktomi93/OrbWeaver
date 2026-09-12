// The family net for the U1 externalId bind-once chokepoint AND its §4.6 SPLIT-ARM DIFFERENTIAL (#2000,
// p-parity-tier1).
//
// `external-id-single-writer-health` exists BECAUSE one legacy descriptor carried two arms with different
// execution needs: a per-node `visit` (a third writer / a third claim caller is RED) and a whole-project
// `finalize` (each sanctioned file must STILL write, and link-external-id.ts must STILL call the atomic
// claim writer). The split gave the occurrence half `execution: "selected-files"` and the carve-out half
// `execution: "entire-population"`, so the legacy gate's behaviour is now the behaviour of the two policies
// TOGETHER and nothing checked the union. This file checks it, against the frozen legacy descriptor at
// `9377887c0` — the commit immediately before `35bf7d328` split them.
//
// THE CLASSIFIED DIFFERENCES:
//   1. SPLIT — one legacy gate, two final policies; the union is what is compared.
//   2. THE BLINDNESS GUARD CHANGED MECHANISM, and it is why the two halves are compared SEPARATELY rather
//      than as one union over the legacy corpus. The legacy `finalize` self-guarded on
//      `scope.kind === "project" && fileLoaded(packages/db/src/schema/users.ts)` — a REAL-TREE ANCHOR, so a
//      conformance mini-project that holds neither sanctioned file could not "prove" the carve-out dead.
//      The final health policy has no anchor: it declares `execution: "entire-population"` and the PLANNER
//      defers it on any narrowed request (pinned in `runPolicyPass`'s own contract). Under a whole-project
//      run over a two-file fixture the two therefore disagree BY DESIGN — legacy stays silent, final
//      reports — so the occurrence corpus is replayed against the occurrence policy, and the moved arm gets
//      its own successor proof below with the anchor present on the legacy side.
//   3. HEALTH FINDING ANCHOR — the legacy finalize reported on line 1 of the GATE MODULE ITSELF, a path
//      outside the policy's own `@server` population and therefore inexpressible under the final contract.
//      The final health policy anchors on `ctx.files[0]`, and drops the trailing " — <gate module>" the
//      legacy message repeated. Subject identity (WHICH sanctioned row is dead) is compared instead.
//   4. POSITION TOKEN CORRECTED — see `TOKEN_CORRECTIONS` below; found by running this differential.
//
// THE FINDING THIS DIFFERENTIAL PRODUCED (reported to #2000/#2005): the legacy corpus NEVER EXERCISED the
// arm that moved. Not one of the legacy gate's 4 mustFlag / 7 mustPass examples loads the real-tree anchor,
// so `finalize` returned at its first line in every one of them — the health arm the split carried over was
// covered by zero legacy rows. The first test asserts that fact per example rather than leaving it as
// prose, because it is the reason the successor proof below had to be CONSTRUCTED from the legacy arm's own
// trigger conditions instead of replayed from its corpus.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { Project } from "ts-morph";
import type { GateDescriptor, GateExample } from "../../../../tooling/src/verify/contract/gate.ts";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { gate as externalIdSingleWriter } from "../../../../tooling/src/verify/gates/external-id-single-writer.ts";
import { gate as externalIdSingleWriterHealth } from "../../../../tooling/src/verify/gates/external-id-single-writer-health.ts";
import { runPass } from "../../../../tooling/src/verify/lib/pass.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

test("the U1 externalId bind-once chokepoint and its carve-out health tripwire both self-prove", () => {
  expect(verifyPolicyProofs([externalIdSingleWriter, externalIdSingleWriterHealth])).toEqual([]);
});

const ROOT = "/external-id-single-writer";
/** The commit immediately before `35bf7d328` split the gate — the last one carrying both arms. */
const BASE = "9377887c0edb28a63931b57f697b0c1596d5aa72";
const LEGACY_PATH = "tooling/src/verify/gates/external-id-single-writer.ts";
/** The legacy finalize's real-tree anchor. Present on the legacy side of the successor proof ONLY. */
const LEGACY_HEALTH_ANCHOR = "packages/db/src/schema/users.ts";
const SESSIONS = "packages/server/src/domain/sessions/";
const LINK_CAPABILITY = `${SESSIONS}verbs/link-external-id.ts`;
const PROVISION_CAPABILITY = `${SESSIONS}verbs/provision-identity.ts`;
const USERS_PERSISTENCE = `${SESSIONS}persistence/users.ts`;

function projectOf(files: Readonly<Record<string, string>>): Project {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, source);
  }
  return project;
}

function legacyFiles(example: GateExample): Readonly<Record<string, string>> {
  return typeof example.files === "string" ? { [example.at ?? "packages/server/src/x.ts"]: example.files } : example.files;
}

/** ONE comparable line per finding, with the two arms told apart by message shape so the classified anchor
 *  change cannot hide a site going quiet. The link arm is tested FIRST: the legacy link message carries the
 *  stale-writer PREFIX as well, and the final one does not. */
function verdictOf(
  findings: readonly { readonly file: string; readonly line: number; readonly token?: string; readonly message: string }[],
): readonly string[] {
  return findings
    .map((finding) => {
      if (finding.message.includes("no longer calls")) {
        return "HEALTH link-lost-atomic-writer";
      }
      const stale = /stale sanctioned-writer[^"]*"(?<rel>[^"]+)"/u.exec(finding.message)?.groups?.["rel"];
      return stale === undefined ? `OCCURRENCE ${finding.file}:${finding.line} ${finding.token ?? "<no token>"}` : `HEALTH stale-writer ${stale}`;
    })
    .toSorted((left, right) => left.localeCompare(right));
}

function legacyVerdict(gate: GateDescriptor, files: Readonly<Record<string, string>>): readonly string[] {
  const project = projectOf(files);
  const result = runPass([gate], { root: ROOT, project, scope: { kind: "project" }, files: project.getSourceFiles(), checker: () => project.getTypeChecker() });
  expect(result.toolErrors).toEqual([]);
  expect(result.gates).toHaveLength(1);
  return verdictOf((result.gates[0]?.findings ?? []).map((finding) => ({ ...finding, message: finding.message ?? gate.message })));
}

function finalVerdict(policies: readonly GatePolicy[], files: Readonly<Record<string, string>>): readonly string[] {
  const project = projectOf(files);
  const result = runPolicyPass({ knownPolicies: policies, policies: [...policies], root: ROOT, project, reviewedGrants: [], failOnWarnings: false });
  expect(result.toolErrors).toEqual([]);
  expect(result.factErrors).toEqual([]);
  for (const policy of result.policies) {
    expect(policy.owner.status, policy.id).toBe("success");
  }
  const messageOf = new Map(policies.map((policy) => [policy.id, policy.message]));
  return verdictOf(result.authority.effectiveFindings.map((finding) => ({ ...finding, message: finding.message ?? messageOf.get(finding.policyId) ?? "" })));
}

function toolingHref(relFromGates: string): string {
  return JSON.stringify(pathToFileURL(join(process.cwd(), "tooling/src/verify/gates", relFromGates)).href);
}

/** The frozen legacy descriptor. Its three relative imports are rewritten to file URLs (the copy lives
 *  outside the checkout); `lib/ast-read.ts` is byte-identical to BASE and `lib/pass.ts` changed only
 *  additively (`stripProbePolicyFindings` was appended; `repoRel`/`fileLoaded` are untouched), so the
 *  frozen descriptor runs the code it ran at BASE. */
async function frozenLegacyGate(scratch: string): Promise<GateDescriptor> {
  const source = execFileSync("git", ["show", `${BASE}:${LEGACY_PATH}`], { encoding: "utf8" });
  const target = join(scratch, basename(LEGACY_PATH));
  const rewritten = source
    .replace('from "../contract/gate.ts"', `from ${toolingHref("../contract/gate.ts")}`)
    .replace('from "../lib/ast-read.ts"', `from ${toolingHref("../lib/ast-read.ts")}`)
    .replace('from "../lib/pass.ts"', `from ${toolingHref("../lib/pass.ts")}`);
  writeFileSync(target, rewritten);
  return ((await import(`${pathToFileURL(target).href}?frozen=${basename(LEGACY_PATH)}`)) as { readonly gate: GateDescriptor }).gate;
}

// CLASSIFIED DIFFERENCE 4 — THE POSITION TOKEN WAS CORRECTED, found by running this differential. The
// legacy `visit` reported every column write with the HARDCODED token `"externalId"`, including the raw
// drizzle `.set({ external_id: sub })` row whose authored text is `external_id`. The final policy derives
// the token from the reported node (`externalIdWriteAnchor`, `lib/external-id-writer.ts:103-114`), which
// the final contract REQUIRES: `lib/ordinary-waiver.ts`'s `locateFinding` demands a position token that is
// an exact slice of the source at the reported line/column, and `"externalId"` is not present on that line
// at all. Same file, same line, same count — a corrected lexeme, not a moved or lost finding. The map is
// keyed on the whole comparable line so it cannot silently absorb a second difference, and the
// `corrections` counter below reds if the final policy ever reverts to the legacy spelling.
const TOKEN_CORRECTIONS: ReadonlyMap<string, string> = new Map([
  [
    "OCCURRENCE packages/server/src/domain/sessions/verbs/raw-set.ts:2 externalId",
    "OCCURRENCE packages/server/src/domain/sessions/verbs/raw-set.ts:2 external_id",
  ],
]);

test("the occurrence half reproduces the frozen legacy gate on every original example", async ({ scratch }) => {
  const legacy = await frozenLegacyGate(scratch);
  const examples = [...legacy.mustFlag, ...legacy.mustPass];
  expect(examples.length).toBeGreaterThan(0);
  let flagged = 0;
  let corrections = 0;
  for (const example of examples) {
    const files = legacyFiles(example);
    const label = `${externalIdSingleWriter.id}: ${example.why}`;
    // The legacy finalize self-guarded OFF here (classified difference 2), which is what makes the legacy
    // verdict on this corpus a pure occurrence verdict and the comparison honest.
    expect(Object.keys(files), label).not.toContain(LEGACY_HEALTH_ANCHOR);
    const before = legacyVerdict(legacy, files);
    expect(
      before.filter((line) => line.startsWith("HEALTH")),
      `${label}: the legacy corpus must not reach the moved arm`,
    ).toEqual([]);
    const expected: string[] = [];
    for (const line of before) {
      const corrected = TOKEN_CORRECTIONS.get(line);
      corrections += corrected === undefined ? 0 : 1;
      expected.push(corrected ?? line);
    }
    expect(finalVerdict([externalIdSingleWriter], files), label).toEqual(expected);
    flagged += before.length;
  }
  // The corpus bites at all — a differential over an inert corpus proves nothing — and the one classified
  // token correction really happened.
  expect(flagged).toBeGreaterThan(0);
  expect(corrections).toBe(TOKEN_CORRECTIONS.size);
});

// ─── SUCCESSOR PROOF for the arm that MOVED (§4.6) ──────────────────────────────────────────────────────
// Constructed, not replayed: the legacy corpus never armed `finalize` (asserted above). Each scenario is
// built from the legacy arm's OWN trigger conditions, given the anchor on the legacy side so the legacy
// guard opens, and run through both engines.
const HEALTHY_PROVISION =
  'import { claimExternalIdIfUnbound } from "../persistence/users.ts";\n' +
  "export async function bindOwnerSubject(db: D, ownerId: U, externalId: E): Promise<boolean> {\n" +
  "  const changes: { externalId?: E } = {};\n" +
  "  changes.externalId = externalId;\n" +
  "  return await claimExternalIdIfUnbound(db, ownerId, externalId, 0);\n" +
  "}\n";
const HEALTHY_USERS =
  'import { users } from "@orb/db";\nexport const claimExternalIdIfUnbound = (db: DB, id: string, sub: string) => db.update(users).set({ externalId: sub });\n';
const HEALTHY_LINK =
  'import { claimExternalIdIfUnbound } from "../persistence/users.ts";\n' +
  "export async function linkExternalId(db: D, userId: U, externalId: E): Promise<void> {\n" +
  "  await claimExternalIdIfUnbound(db, userId, externalId, 0);\n" +
  "}\n";

const SUCCESSOR_SCENARIOS: readonly { readonly why: string; readonly files: Readonly<Record<string, string>>; readonly expected: readonly string[] }[] = [
  {
    why: "HEALTHY — both sanctioned files still write and link still calls the atomic writer",
    files: { [PROVISION_CAPABILITY]: HEALTHY_PROVISION, [USERS_PERSISTENCE]: HEALTHY_USERS, [LINK_CAPABILITY]: HEALTHY_LINK },
    expected: [],
  },
  {
    why: "MODE A — provision-identity.ts stopped writing externalId, so its carve-out is dead",
    files: {
      [PROVISION_CAPABILITY]: "export async function bindOwnerSubject(): Promise<void> {\n  // the writer moved away\n}\n",
      [USERS_PERSISTENCE]: HEALTHY_USERS,
      [LINK_CAPABILITY]: HEALTHY_LINK,
    },
    expected: [`HEALTH stale-writer ${PROVISION_CAPABILITY}`],
  },
  {
    why: "MODE A, caller half — link-external-id.ts stopped calling the atomic claim writer",
    files: {
      [PROVISION_CAPABILITY]: HEALTHY_PROVISION,
      [USERS_PERSISTENCE]: HEALTHY_USERS,
      [LINK_CAPABILITY]: "export async function linkExternalId(): Promise<void> {\n  // no longer calls the atomic writer\n}\n",
    },
    expected: ["HEALTH link-lost-atomic-writer"],
  },
  {
    why: "ABSENT SUBJECT — link-external-id.ts is entirely deleted from the population, the scenario the health check exists for",
    files: { [PROVISION_CAPABILITY]: HEALTHY_PROVISION, [USERS_PERSISTENCE]: HEALTHY_USERS },
    expected: ["HEALTH link-lost-atomic-writer"],
  },
  {
    why: "ABSENT SUBJECT, sanctioned half — the persistence writer itself is deleted",
    files: { [PROVISION_CAPABILITY]: HEALTHY_PROVISION, [LINK_CAPABILITY]: HEALTHY_LINK },
    expected: [`HEALTH stale-writer ${USERS_PERSISTENCE}`],
  },
];

test("the health half reproduces the legacy finalize arm on every scenario the legacy corpus never reached", async ({ scratch }) => {
  const legacy = await frozenLegacyGate(scratch);
  for (const scenario of SUCCESSOR_SCENARIOS) {
    // The legacy side needs its real-tree anchor to open the guard at all; the final side needs no anchor
    // and the extra `packages/db` file is outside its `@server` population, so both engines see the same
    // bytes and only the legacy guard reads the difference.
    const withAnchor = { ...scenario.files, [LEGACY_HEALTH_ANCHOR]: "export const users = {};\n" };
    expect(legacyVerdict(legacy, withAnchor), `legacy: ${scenario.why}`).toEqual(scenario.expected);
    expect(finalVerdict([externalIdSingleWriter, externalIdSingleWriterHealth], withAnchor), `final: ${scenario.why}`).toEqual(scenario.expected);
  }
});
