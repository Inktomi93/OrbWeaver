// The §4.6 SPLIT-ARM DIFFERENTIAL for the two families converted together in `bd56189ba` (#2000,
// p-parity-tier1): `contract-derives-not-respells` + `contract-derives-not-respells-health`, and
// `serde-core-seal` + `serde-core-seal-health`. Their CONFORMANCE entry already exists and stays where it
// is — `contract-shape-wave-1.test.ts` runs `verifyPolicyProofs` for both families (and for the
// injected-op family, whose differential is `injected-op-caller-param-split.test.ts`). This file adds only
// what a proof row and a conformance run structurally cannot express: the §4.6 differential.
//
// Each `-health` policy exists BECAUSE one legacy descriptor carried two arms that now differ in AUTHORITY:
// the occurrence half is `ordinary` (a genuine re-spell / a new importer can take a reviewed exemption),
// while the two-sided staleness ratchet over the gate's OWN exemption table is `hard` and unsuppressible —
// the exemption audit must not be waivable through the very door it audits. One `authority` value cannot
// serve both, so the legacy gate's behaviour is now the behaviour of the two policies TOGETHER and nothing
// checked the union. Every original `mustFlag`/`mustPass` example from `534c1327f` (the commit immediately
// before the split) is replayed here through the frozen legacy dispatcher and, byte-identically, through
// both final policies at once.
//
// THE CLASSIFIED DIFFERENCES:
//   1. SPLIT — one legacy gate, two final policies; the UNION is compared, never one half.
//   2. STALE-ARM FINDING ANCHOR — both legacy `finalize`/`reportStaleAllowlist` arms reported on line 1 of
//      the GATE MODULE ITSELF. That path is in neither policy's declared population, so `ctx.report.file`
//      cannot express it; each health policy anchors on its own real-tree anchor instead
//      (`packages/server/src/domain/chat/contract/service.ts`, `packages/kit/src/index.ts`). The message
//      text is unchanged, including the "delete the row in tooling/src/verify/gates/…" pointer.
//   3. contract-derives' OCCURRENCE IDENTITY MOVED FROM THE TOKEN TO THE MESSAGE. The legacy reported a
//      SYNTHETIC token (`respells "RosterMemberSpec"` / `hand-row "WorkloadScheduleRow"`), which the final
//      contract forbids — `lib/ordinary-waiver.ts`'s `locateFinding` requires a position token that is an
//      exact slice of the authored source, and `respells "…"` appears nowhere in the file. The final policy
//      reports the real identifier and carries the same descriptor in its message. Identity is therefore
//      compared as "which shape did it name", read from token OR message, which is what the descriptor was
//      always for.
//
// THE ANCHOR-GUARD FACT that shapes the successor section: BOTH legacy stale arms self-guarded on a
// REAL-TREE ANCHOR, and neither family's legacy corpus loaded contract-derives' anchor — so that arm was
// covered by ZERO legacy rows and its successor proof below is CONSTRUCTED from the arm's own trigger
// conditions. serde-core-seal's legacy corpus DID exercise its stale arm (one mustFlag, one mustPass), so
// for that family the replay above is already the successor proof.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { Project } from "ts-morph";
import type { GateDescriptor, GateExample } from "../../../../tooling/src/verify/contract/gate.ts";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { gate as contractDerives } from "../../../../tooling/src/verify/gates/contract-derives-not-respells.ts";
import { gate as contractDerivesHealth } from "../../../../tooling/src/verify/gates/contract-derives-not-respells-health.ts";
import { gate as serdeCoreSeal } from "../../../../tooling/src/verify/gates/serde-core-seal.ts";
import { gate as serdeCoreSealHealth } from "../../../../tooling/src/verify/gates/serde-core-seal-health.ts";
import { runPass } from "../../../../tooling/src/verify/lib/pass.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ROOT = "/contract-and-serde-seal-split";
/** The commit immediately before `bd56189ba` split both gates — the last one carrying both arms in one. */
const BASE = "534c1327f682be2578e1dee7c7a2bfa488fb672a";
const CONTRACT_PATH = "tooling/src/verify/gates/contract-derives-not-respells.ts";
const SERDE_PATH = "tooling/src/verify/gates/serde-core-seal.ts";
const CONTRACT_ANCHOR = "packages/server/src/domain/chat/contract/service.ts";

function projectOf(files: Readonly<Record<string, string>>): Project {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, source);
  }
  return project;
}

function legacyFiles(example: GateExample): Readonly<Record<string, string>> {
  return typeof example.files === "string" ? { [example.at ?? "packages/server/src/domain/x/contract/x.ts"]: example.files } : example.files;
}

/** WHAT a finding named, independent of the classified anchor and token moves:
 *   - a stale ALLOWLIST row → its `<file>::<Shape>` key;
 *   - a stale serde home     → its domain name;
 *   - an occurrence          → the shape descriptor, read from the token (legacy) or the message (final),
 *                              falling back to position + token for families that never carried one. */
const STALE_ALLOW_RE = /ALLOWLIST entry `(?<key>[^`]+)`/u;
const STALE_SERDE_RE = /stale sanctioned serde home[^"]*"(?<domain>[^"]+)"/u;
const SHAPE_RE = /(?<kind>respells|hand-row) "(?<name>[^"]+)"/u;

function verdictOf(
  findings: readonly { readonly file: string; readonly line: number; readonly token?: string; readonly message: string }[],
): readonly string[] {
  return findings
    .map((finding) => {
      const staleAllow = STALE_ALLOW_RE.exec(finding.message)?.groups?.["key"];
      if (staleAllow !== undefined) {
        return `STALE-ALLOWLIST ${staleAllow}`;
      }
      const staleSerde = STALE_SERDE_RE.exec(finding.message)?.groups?.["domain"];
      if (staleSerde !== undefined) {
        return `STALE-SERDE ${staleSerde}`;
      }
      const shape = SHAPE_RE.exec(`${finding.token ?? ""} ${finding.message}`);
      return shape === null
        ? `OCCURRENCE ${finding.file}:${finding.line} ${finding.token ?? "<no token>"}`
        : `OCCURRENCE ${finding.file}:${finding.line} ${shape.groups?.["kind"] ?? ""} ${shape.groups?.["name"] ?? ""}`;
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

/** The UNION of the two final policies — running one half alone would "prove" the missing arm away. */
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

/** The frozen legacy descriptor, imported from a scratch copy outside the checkout. `lib/pass.ts` changed
 *  only additively since BASE and `fileLoaded`/`repoRel` are untouched, so the copy runs BASE's behaviour. */
async function frozenLegacyGate(path: string, scratch: string): Promise<GateDescriptor> {
  const source = execFileSync("git", ["show", `${BASE}:${path}`], { encoding: "utf8" });
  const target = join(scratch, basename(path));
  const rewritten = source
    .replace('from "../contract/gate.ts"', `from ${toolingHref("../contract/gate.ts")}`)
    .replace('from "../lib/pass.ts"', `from ${toolingHref("../lib/pass.ts")}`);
  writeFileSync(target, rewritten);
  return ((await import(`${pathToFileURL(target).href}?frozen=${basename(path)}`)) as { readonly gate: GateDescriptor }).gate;
}

test("each occurrence+health pair reproduces its frozen legacy gate on every original example", async ({ scratch }) => {
  for (const [path, policies] of [
    [CONTRACT_PATH, [contractDerives, contractDerivesHealth]],
    [SERDE_PATH, [serdeCoreSeal, serdeCoreSealHealth]],
  ] as const) {
    const legacy = await frozenLegacyGate(path, scratch);
    const examples = [...legacy.mustFlag, ...legacy.mustPass];
    expect(examples.length, path).toBeGreaterThan(0);
    let flagged = 0;
    for (const example of examples) {
      const files = legacyFiles(example);
      const label = `${policies[0].id} + ${policies[1].id}: ${example.why}`;
      const before = legacyVerdict(legacy, files);
      expect(finalVerdict(policies, files), label).toEqual(before);
      flagged += before.length;
    }
    // A differential over an inert corpus proves nothing.
    expect(flagged, path).toBeGreaterThan(0);
  }
});

test("serde-core-seal's legacy corpus DID exercise the moved stale arm, so the replay above is its successor proof", async ({ scratch }) => {
  const legacy = await frozenLegacyGate(SERDE_PATH, scratch);
  const staleRows = [...legacy.mustFlag, ...legacy.mustPass].filter((example) =>
    legacyVerdict(legacy, legacyFiles(example)).some((line) => line.startsWith("STALE-SERDE")),
  );
  expect(staleRows).toHaveLength(1);
  // And the union reproduces it — asserted here by identity rather than inferred from the loop above.
  expect(finalVerdict([serdeCoreSeal, serdeCoreSealHealth], legacyFiles(staleRows[0] as GateExample))).toEqual(["STALE-SERDE import"]);
});

// ─── SUCCESSOR PROOF for contract-derives' stale-ALLOWLIST arm ───────────────────────────────────────────
// CONSTRUCTED, not replayed: none of the legacy gate's 3 mustFlag / 4 mustPass examples loads the real-tree
// anchor or any ALLOWLIST row's file, so `reportStaleAllowlist` never fired for any of them — the arm the
// split carried out into its own policy had zero legacy coverage. These scenarios are the arm's own trigger
// conditions, built on the LIVE `ALLOWLIST` rows so a row added or removed there cannot leave the proof
// quietly describing a table nobody has.
const THEME_TABLE = 'export const themes = sqliteTable("themes", {});\n';
const STATS_TABLE = 'export const modelStats = sqliteTable("model_stats", {});\n';
const HEALTHY_ANCHOR = "export interface ChatService {\n  readonly noop: () => void;\n}\n";

const CONTRACT_SCENARIOS: readonly { readonly why: string; readonly files: Readonly<Record<string, string>>; readonly expected: readonly string[] }[] = [
  {
    why: "HEALTHY — both ALLOWLIST rows still name a live hand-spelled shape matching their table",
    files: {
      [CONTRACT_ANCHOR]: HEALTHY_ANCHOR,
      "packages/db/src/schema/discovery.ts": THEME_TABLE,
      "packages/server/src/domain/discovery/contract/results.ts": "export interface ThemeRow {\n  readonly id: string;\n}\n",
      "packages/db/src/schema/stats.ts": STATS_TABLE,
      "packages/server/src/domain/stats/contract/views.ts": "export interface ModelStatRow {\n  readonly model: string;\n}\n",
    },
    expected: [],
  },
  {
    why: "RENAMED — discovery's ThemeRow was renamed away, so its exemption row is a permission nobody uses",
    files: {
      [CONTRACT_ANCHOR]: HEALTHY_ANCHOR,
      "packages/db/src/schema/discovery.ts": THEME_TABLE,
      "packages/server/src/domain/discovery/contract/results.ts": "export interface RenamedThemeCluster {\n  readonly id: string;\n}\n",
      "packages/db/src/schema/stats.ts": STATS_TABLE,
      "packages/server/src/domain/stats/contract/views.ts": "export interface ModelStatRow {\n  readonly model: string;\n}\n",
    },
    expected: ["STALE-ALLOWLIST packages/server/src/domain/discovery/contract/results.ts::ThemeRow"],
  },
  {
    why: "TABLE VANISHED — the shape survives but the table it is a homonym OF is gone, so the homonym claim is dead",
    files: {
      [CONTRACT_ANCHOR]: HEALTHY_ANCHOR,
      "packages/server/src/domain/discovery/contract/results.ts": "export interface ThemeRow {\n  readonly id: string;\n}\n",
      "packages/db/src/schema/stats.ts": STATS_TABLE,
      "packages/server/src/domain/stats/contract/views.ts": "export interface ModelStatRow {\n  readonly model: string;\n}\n",
    },
    expected: ["STALE-ALLOWLIST packages/server/src/domain/discovery/contract/results.ts::ThemeRow"],
  },
];

test("the health half reproduces the legacy stale-ALLOWLIST arm the legacy corpus never reached", async ({ scratch }) => {
  const legacy = await frozenLegacyGate(CONTRACT_PATH, scratch);
  for (const scenario of CONTRACT_SCENARIOS) {
    expect(legacyVerdict(legacy, scenario.files), `legacy: ${scenario.why}`).toEqual(scenario.expected);
    expect(finalVerdict([contractDerives, contractDerivesHealth], scenario.files), `final: ${scenario.why}`).toEqual(scenario.expected);
  }
});
