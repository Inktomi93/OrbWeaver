// The standing family floor for the two marker-carrying splits converted in #1950 group 3:
//
//   `sub-floor-disclosure`        → `sub-floor-disclosure` (ordinary occurrence) + `sub-floor-disclosure-health`
//                                   (hard vocabulary tripwire) — family `sub-floor-disclosure`.
//   `query-boundary-reservation`  → `query-boundary-reservation` (ordinary occurrence) +
//                                   `query-boundary-reservation-health` (hard duplicate-key + seam tripwire) —
//                                   family `query-boundary-reservation`.
//
// Both legacy descriptors owned a PRIVATE two-sided marker grammar (`@sub-floor-ok`, `@first-boot-only`) with
// a malformed / stale / over-exempting sweep of their own. Those grammars retire into the central `@orb-waive`
// engine, so what lives here is everything a declared row cannot express:
//   §4.2 — the ordinary identity arm for BOTH occurrence policies, in the carrier shapes the LIVE sites use:
//          a `{/* … */}` JSX comment immediately before the element, and a `//` in the leading trivia of a
//          multi-line self-closing element whose `size` sits lines below the marker.
//   THE REAL-SITE BINDING PIN — the two translated product files are read OFF DISK and run through the final
//          occurrence policy: 0 effective, 2 waived, 0 alarms. A shape-alike cannot prove a real marker binds.
//   RETIRED-ARM SUCCESSORS — the legacy malformed and stale marker verdicts are central reconciliation now;
//          the pins drive a reason-less marker and an unbound marker through `runPolicyPass` and assert the
//          exact alarm the engine raises for THIS policy id (not a copy of the engine's negative arms: the
//          full family is `knownPolicies`, so no unknown-policy short-circuit is reachable).
//   §4.5 — every `entire-population` sibling DEFERS a narrowed request, and the sub-floor tripwire whose
//          population is exactly its home REFUSES at the population phase when the home is absent.
//   §4.6 — the two split differentials against the frozen legacy descriptors (`4e1bdb87e`, `370243fe7`):
//          every legacy example replayed through the frozen `runPass` and the UNION of the final pair,
//          differences CLASSIFIED: (1) the retired grammar is INERT text — a legacy-marked site is a finding
//          now, and legacy marker verdicts (malformed/stale) vanish, so the comparison runs the legacy over
//          the fixture with the retired markers BLANKED and the final over the fixture as written;
//          (2) POSITION — `text`→`"text"` (+1 column, quotes), the duplicate key reported on its literal
//          rather than the attribute start (+`reserveKey=`.length columns, quoted); (3) TRIPWIRE ANCHOR —
//          the gate module's own path → the vocabulary/boundary home. Legacy-side coverage of every arm
//          asserted per example.

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { Project } from "ts-morph";
import type { GateDescriptor, GateExample } from "../../../../tooling/src/verify/contract/gate.ts";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { gate as qbr } from "../../../../tooling/src/verify/gates/query-boundary-reservation.ts";
import { gate as qbrHealth } from "../../../../tooling/src/verify/gates/query-boundary-reservation-health.ts";
import { gate as subFloor } from "../../../../tooling/src/verify/gates/sub-floor-disclosure.ts";
import { gate as subFloorHealth } from "../../../../tooling/src/verify/gates/sub-floor-disclosure-health.ts";
import { runPass } from "../../../../tooling/src/verify/lib/pass.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

const ROOT = "/disclosure-reservation-family";
const SUB_FLOOR_FAMILY: readonly GatePolicy[] = [subFloor, subFloorHealth];
const QBR_FAMILY: readonly GatePolicy[] = [qbr, qbrHealth];
const ALL: readonly GatePolicy[] = [...SUB_FLOOR_FAMILY, ...QBR_FAMILY];
const VARIANTS_HOME = "packages/ui/src/primitives/collapsible/variants.ts";
const VARIANTS_SOURCE = 'export const collapsibleVariants = { size: { text: {}, control: { trigger: "min-h-control-sm" } } };\n';
const BOUNDARY_HOME = "packages/client/src/components/query-boundary.tsx";
const BOUNDARY_SOURCE = "export const QueryBoundary = (p: { reserveKey?: string }) => p.reserveKey;\n";
/** The two product files whose `@sub-floor-ok` markers were translated in place. */
const LIVE_SITES = [
  "packages/client/src/features/rpg/components/turn-tool-calls-disclosure.tsx",
  "packages/client/src/features/rpg/components/rpg-beat-row.tsx",
] as const;
const LEGACY_SUB_FLOOR = { sha: "4e1bdb87e", path: "tooling/src/verify/gates/sub-floor-disclosure.ts", opener: "@sub-floor-ok" } as const;
const LEGACY_QBR = { sha: "370243fe7", path: "tooling/src/verify/gates/query-boundary-reservation.ts", opener: "@first-boot-only" } as const;
const DIFFERENTIAL_BUDGET_MS = scaledBudget(120_000);

function projectOf(files: Readonly<Record<string, string>>): Project {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, source);
  }
  return project;
}

function passOf(
  policies: readonly GatePolicy[],
  files: Readonly<Record<string, string>>,
  requestedPaths?: readonly string[],
): ReturnType<typeof runPolicyPass> {
  return runPolicyPass({
    knownPolicies: ALL,
    policies,
    root: ROOT,
    project: projectOf(files),
    ...(requestedPaths === undefined ? {} : { requestedPaths }),
    reviewedGrants: [],
    failOnWarnings: false,
  });
}

test("all four disclosure/reservation policies preserve their founding fixtures", () => {
  expect(verifyPolicyProofs(ALL)).toEqual([]);
});

// ─── §4.2 ORDINARY IDENTITY — the live carrier shapes ───────────────────────────────────────────────────
test("a JSX block-comment carrier immediately before the trigger binds sub-floor-disclosure's quoted-literal position (the turn-tool-calls shape)", () => {
  const waived = passOf([subFloor], {
    "packages/client/src/features/a/jsx-carrier.tsx":
      "export const G = (\n  <Collapsible>\n    {/* explanatory prose before the marker is not a significant sibling */}\n" +
      '    {/* @orb-waive sub-floor-disclosure("text"): sits mid-paragraph in running prose. */}\n' +
      '    <CollapsibleTrigger className="w-full" size="text" data-target-floor="sub-floor-ok">\n      more\n    </CollapsibleTrigger>\n  </Collapsible>\n);\n',
  });
  expect(waived.authority.authorityAlarms).toEqual([]);
  expect(waived.authority.effectiveFindings).toEqual([]);
  expect(waived.authority.waivedFindings).toHaveLength(1);
});

test("a line comment on the enclosing return statement binds a trigger inside a sibling-flanked JSX expression (the rpg-beat-row shape)", () => {
  const files = {
    "packages/client/src/features/a/statement-carrier.tsx":
      "export function G(open: boolean) {\n" +
      '  // @orb-waive sub-floor-disclosure("text"): the box is the rendered Button\'s own.\n' +
      "  return (\n    <Line>\n      {lead}\n      {open ? null : (\n" +
      '        <CollapsibleTrigger\n          chevron={false}\n          size="text"\n          render={<button type="button" />}\n        />\n      )}\n      {trailing}\n    </Line>\n  );\n}\n',
  };
  const waived = passOf([subFloor], files);
  expect(waived.authority.authorityAlarms).toEqual([]);
  expect(waived.authority.effectiveFindings).toEqual([]);
  expect(waived.authority.waivedFindings).toHaveLength(1);

  // THE PLACEMENT THAT DOES NOT BIND, pinned so nobody moves the real marker back: the same marker in the
  // element's own leading trivia sits inside `{open ? null : (…)}` between two authored siblings, and the
  // central engine judges a comment inside such an expression AMBIGUOUS — it suppresses nothing, loudly.
  const inside = passOf([subFloor], {
    "packages/client/src/features/a/inside-expression.tsx":
      "export function G(open: boolean) {\n  return (\n    <Line>\n      {lead}\n      {open ? null : (\n" +
      '        // @orb-waive sub-floor-disclosure("text"): the box is the rendered Button\'s own.\n' +
      '        <CollapsibleTrigger\n          chevron={false}\n          size="text"\n          render={<button type="button" />}\n        />\n      )}\n      {trailing}\n    </Line>\n  );\n}\n',
  });
  expect(inside.authority.effectiveFindings).toHaveLength(1);
  expect(inside.authority.authorityAlarms).toMatchObject([{ kind: "ordinary-waiver", policyId: subFloor.id }]);
  expect(inside.authority.authorityAlarms[0]?.message).toContain("ambiguous comment trivia");
});

test("an ordinary waiver binds to the exact policy and the `fallback` position query-boundary-reservation reports", () => {
  const waived = passOf([qbr], {
    "packages/client/src/features/a/marked.tsx":
      "// @orb-waive query-boundary-reservation(fallback): mounts once at app boot and never again.\n" +
      'export const G = <QueryBoundary fallback={<SkeletonRows count={3} />}>{"b"}</QueryBoundary>;\n',
  });
  expect(waived.authority.authorityAlarms).toEqual([]);
  expect(waived.authority.effectiveFindings).toEqual([]);
  expect(waived.authority.waivedFindings).toHaveLength(1);
});

// ─── THE REAL-SITE BINDING PIN ──────────────────────────────────────────────────────────────────────────
test("both translated product markers bind on the real files: 0 effective, 2 waived, 0 alarms", ({ repoRoot }) => {
  const files = Object.fromEntries(LIVE_SITES.map((site) => [site, readFileSync(join(repoRoot, site), "utf8")]));
  const result = passOf([subFloor], files);
  expect(result.toolErrors).toEqual([]);
  expect(result.authority.authorityAlarms).toEqual([]);
  expect(result.authority.effectiveFindings).toEqual([]);
  expect(result.authority.waivedFindings.map(({ finding }) => finding.file).toSorted()).toEqual([...LIVE_SITES].toSorted());
});

// ─── RETIRED-ARM SUCCESSORS — the legacy marker sweeps are central reconciliation ───────────────────────
test("a reason-less marker is MALFORMED centrally and exempts nothing — the legacy arm-B row's successor, for both policies", () => {
  const subFloorRun = passOf([subFloor], {
    "packages/client/src/features/a/bare.tsx":
      '// @orb-waive sub-floor-disclosure("text")\nexport const G = <CollapsibleTrigger size="text">Advanced</CollapsibleTrigger>;\n',
  });
  expect(subFloorRun.authority.effectiveFindings).toHaveLength(1);
  expect(subFloorRun.authority.authorityAlarms).toMatchObject([{ kind: "ordinary-waiver", policyId: subFloor.id }]);
  expect(subFloorRun.authority.authorityAlarms[0]?.message).toContain("malformed");

  const qbrRun = passOf([qbr], {
    "packages/client/src/features/a/bare.tsx":
      '// @orb-waive query-boundary-reservation(fallback)\nexport const G = <QueryBoundary fallback={<SkeletonRows count={3} />}>{"b"}</QueryBoundary>;\n',
  });
  expect(qbrRun.authority.effectiveFindings).toHaveLength(1);
  expect(qbrRun.authority.authorityAlarms).toMatchObject([{ kind: "ordinary-waiver", policyId: qbr.id }]);
  expect(qbrRun.authority.authorityAlarms[0]?.message).toContain("malformed");
});

test("a marker absolving nothing is STALE centrally — the legacy arm-B/C stale row's successor, for both policies", () => {
  const subFloorRun = passOf([subFloor], {
    "packages/client/src/features/a/stale.tsx": '// @orb-waive sub-floor-disclosure("text"): this row took the control default in #884.\nexport const x = 1;\n',
  });
  expect(subFloorRun.authority.effectiveFindings).toEqual([]);
  expect(subFloorRun.authority.authorityAlarms).toMatchObject([{ kind: "ordinary-waiver", policyId: subFloor.id }]);
  expect(subFloorRun.authority.authorityAlarms[0]?.message).toContain("stale");

  const qbrRun = passOf([qbr], {
    "packages/client/src/features/a/stale.tsx": "// @orb-waive query-boundary-reservation(fallback): this component unmounted in #000.\nexport const x = 1;\n",
  });
  expect(qbrRun.authority.effectiveFindings).toEqual([]);
  expect(qbrRun.authority.authorityAlarms).toMatchObject([{ kind: "ordinary-waiver", policyId: qbr.id }]);
  expect(qbrRun.authority.authorityAlarms[0]?.message).toContain("stale");
});

// ─── §4.5 DEFERRAL AND REFUSAL ──────────────────────────────────────────────────────────────────────────
test("a narrowed request DEFERS both -health tripwires instead of adjudicating a home or a key census its scope cannot see", () => {
  const files = {
    [VARIANTS_HOME]: VARIANTS_SOURCE,
    [BOUNDARY_HOME]: BOUNDARY_SOURCE,
    "packages/client/src/features/a/one.tsx": 'export const G = <QueryBoundary fallback={null} reserveKey="chat.one">{"b"}</QueryBoundary>;\n',
    "packages/client/src/features/a/clean.tsx": "export const clean = true;\n",
  };
  for (const policy of [subFloorHealth, qbrHealth]) {
    const narrowed = passOf([policy], files, ["packages/client/src/features/a/clean.tsx"]);
    expect(narrowed.toolErrors, policy.id).toEqual([]);
    expect(narrowed.policies.find(({ id }) => id === policy.id)?.owner, policy.id).toMatchObject({ status: "not-applicable", population: "complete" });
    expect(narrowed.authority.effectiveFindings, policy.id).toEqual([]);
  }
});

test("the sub-floor tripwire REFUSES at the population phase when its home — its whole population — is absent", () => {
  const absent = passOf([subFloorHealth], { "packages/ui/src/primitives/collapsible/collapsible.tsx": "export const Collapsible = null;\n" });
  expect(absent.toolErrors).toMatchObject([{ policyId: subFloorHealth.id, phase: "population" }]);
  expect(absent.authority.withheldPolicyIds).toEqual([subFloorHealth.id]);
  expect(absent.authority.effectiveFindings).toEqual([]);
});

// ─── §4.6 SPLIT-ARM DIFFERENTIALS ───────────────────────────────────────────────────────────────────────
function toolingHref(relFromGates: string): string {
  return JSON.stringify(pathToFileURL(join(process.cwd(), "tooling/src/verify/gates", relFromGates)).href);
}

async function frozenLegacyGate(legacy: { readonly sha: string; readonly path: string }, scratch: string): Promise<GateDescriptor> {
  const source = execFileSync("git", ["show", `${legacy.sha}:${legacy.path}`], { encoding: "utf8" });
  const target = join(scratch, basename(legacy.path));
  // The copy lives outside the checkout, so its RELATIVE imports are rewritten to file URLs. Every named
  // module is still on the tree and untouched by this conversion.
  const rewritten = source
    .replace('from "../contract/gate.ts"', `from ${toolingHref("../contract/gate.ts")}`)
    .replace('from "../lib/pass.ts"', `from ${toolingHref("../lib/pass.ts")}`)
    .replace('from "../lib/ast-read.ts"', `from ${toolingHref("../lib/ast-read.ts")}`)
    .replace('from "../lib/comment-spans.ts"', `from ${toolingHref("../lib/comment-spans.ts")}`);
  expect(rewritten).not.toBe(source);
  writeFileSync(target, rewritten);
  return ((await import(`${pathToFileURL(target).href}?frozen=${basename(legacy.path)}`)) as { readonly gate: GateDescriptor }).gate;
}

function legacyFiles(example: GateExample, fallback: string): Readonly<Record<string, string>> {
  return typeof example.files === "string" ? { [example.at ?? fallback]: example.files } : example.files;
}

/** CLASSIFIED DIFFERENCE 1: the retired grammar is inert text. Blank its opener (same length, same lines)
 *  so the LEGACY run neither consumes nor judges the marker — that is the legacy verdict the final policies
 *  must reproduce, because to them the marker is a comment like any other. */
function withRetiredMarkersBlanked(files: Readonly<Record<string, string>>, opener: string): Readonly<Record<string, string>> {
  return Object.fromEntries(Object.entries(files).map(([path, source]) => [path, source.replaceAll(opener, " ".repeat(opener.length))]));
}

const sorted = (lines: readonly string[]): readonly string[] => lines.toSorted((left, right) => left.localeCompare(right));

interface LegacyFinding {
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly token?: string;
  readonly message?: string;
}

function legacyFindings(gateDescriptor: GateDescriptor, files: Readonly<Record<string, string>>): readonly LegacyFinding[] {
  const project = projectOf(files);
  const result = runPass([gateDescriptor], {
    root: ROOT,
    project,
    scope: { kind: "project" },
    files: project.getSourceFiles(),
    checker: () => project.getTypeChecker(),
  });
  expect(result.toolErrors).toEqual([]);
  return result.gates[0]?.findings ?? [];
}

function finalLines(
  policies: readonly GatePolicy[],
  files: Readonly<Record<string, string>>,
  line: (finding: {
    readonly file: string;
    readonly line: number;
    readonly column: number;
    readonly token?: string;
    readonly message?: string;
    readonly policyId: string;
  }) => string,
): readonly string[] {
  const result = passOf(policies, files);
  expect(result.toolErrors).toEqual([]);
  return sorted(result.authority.effectiveFindings.map(line));
}

const isMarkerVerdict = (finding: LegacyFinding): boolean => /^(?:malformed|stale|over-exempting) @/u.test(finding.message ?? "");

test(
  "sub-floor-disclosure + sub-floor-disclosure-health reproduce the frozen legacy gate on every original example",
  async ({ scratch }) => {
    const legacy = await frozenLegacyGate(LEGACY_SUB_FLOOR, scratch);
    const examples = [...legacy.mustFlag, ...legacy.mustPass];
    expect(examples).toHaveLength(9);
    const coverage = { occurrence: 0, markerVerdicts: 0, markerConsumed: 0, tripwire: 0 };
    for (const example of examples) {
      const files = legacyFiles(example, "packages/client/src/features/a/x.tsx");
      // Legacy-side coverage is read off the UNBLANKED run — the marker verdicts are the retired arm.
      const raw = legacyFindings(legacy, files);
      coverage.markerVerdicts += raw.filter(isMarkerVerdict).length;
      // The comparable legacy verdict: retired markers blanked, so consumed sites report and marker verdicts vanish.
      const before = legacyFindings(legacy, withRetiredMarkersBlanked(files, LEGACY_SUB_FLOOR.opener));
      expect(before.filter(isMarkerVerdict), example.why).toEqual([]);
      // A marker that CONSUMED a finding is the retired arm's third shape: blanking it makes the site report.
      coverage.markerConsumed += before.filter((finding) => !isMarkerVerdict(finding)).length - raw.filter((finding) => !isMarkerVerdict(finding)).length;
      const expected = sorted(
        before.map((finding) => {
          if (finding.file === LEGACY_SUB_FLOOR.path) {
            coverage.tripwire += 1;
            // DIFFERENCE 3: the tripwire anchors on the variants home, line 1 — and names the arm.
            const arm = /arm `(?<arm>\w+)`/u.exec(finding.message ?? "")?.groups?.["arm"] ?? "?";
            return `TRIPWIRE ${VARIANTS_HOME}:1 ${arm}`;
          }
          coverage.occurrence += 1;
          // DIFFERENCE 2: the position moves from the bare `text` to the quoted literal, one column left.
          return `OCC ${finding.file}:${finding.line}:${finding.column - 1} "text"`;
        }),
      );
      // EMPTY ADMISSION: the tripwire's population is exactly the variants home, so a legacy example without it
      // refuses at the population phase (pinned above) — the union is compared only where the home is present.
      const policies = Object.keys(files).includes(VARIANTS_HOME) ? SUB_FLOOR_FAMILY : [subFloor];
      const after = finalLines(policies, files, (finding) => {
        if (finding.policyId === subFloorHealth.id) {
          const arm = /arm `(?<arm>\w+)`/u.exec(finding.message ?? "")?.groups?.["arm"] ?? "?";
          return `TRIPWIRE ${finding.file}:${finding.line} ${arm}`;
        }
        return `OCC ${finding.file}:${finding.line}:${finding.column} ${finding.token ?? "<no token>"}`;
      });
      expect(after, example.why).toEqual(expected);
    }
    // Every arm the split touched was exercised by the legacy corpus.
    expect(coverage).toEqual({ occurrence: 3, markerVerdicts: 2, markerConsumed: 1, tripwire: 2 });
  },
  DIFFERENTIAL_BUDGET_MS,
);

test(
  "query-boundary-reservation + query-boundary-reservation-health reproduce the frozen legacy gate on every original example",
  async ({ scratch }) => {
    const legacy = await frozenLegacyGate(LEGACY_QBR, scratch);
    const examples = [...legacy.mustFlag, ...legacy.mustPass];
    expect(examples).toHaveLength(12);
    const coverage = { occurrence: 0, markerVerdicts: 0, markerConsumed: 0, duplicate: 0, seam: 0 };
    const reserveKeyAttrPrefix = "reserveKey=".length;
    for (const example of examples) {
      const files = legacyFiles(example, "packages/client/src/features/a/x.tsx");
      const raw = legacyFindings(legacy, files);
      coverage.markerVerdicts += raw.filter(isMarkerVerdict).length;
      const before = legacyFindings(legacy, withRetiredMarkersBlanked(files, LEGACY_QBR.opener));
      expect(before.filter(isMarkerVerdict), example.why).toEqual([]);
      coverage.markerConsumed += before.filter((finding) => !isMarkerVerdict(finding)).length - raw.filter((finding) => !isMarkerVerdict(finding)).length;
      const expected = sorted(
        before.map((finding) => {
          if (finding.file === LEGACY_QBR.path) {
            coverage.seam += 1;
            // DIFFERENCE 3: the seam tripwire anchors on the boundary home, line 1.
            return `SEAM ${BOUNDARY_HOME}:1`;
          }
          if ((finding.message ?? "").startsWith("duplicate reserveKey")) {
            coverage.duplicate += 1;
            // DIFFERENCE 2: the duplicate is reported on the key LITERAL (quoted), not the attribute start.
            return `DUP ${finding.file}:${finding.line}:${finding.column + reserveKeyAttrPrefix} "${finding.token ?? ""}"`;
          }
          coverage.occurrence += 1;
          return `OCC ${finding.file}:${finding.line}:${finding.column} ${finding.token ?? "<no token>"}`;
        }),
      );
      const after = finalLines(QBR_FAMILY, files, (finding) => {
        if (finding.policyId !== qbrHealth.id) {
          return `OCC ${finding.file}:${finding.line}:${finding.column} ${finding.token ?? "<no token>"}`;
        }
        return (finding.message ?? "").startsWith("duplicate reserveKey")
          ? `DUP ${finding.file}:${finding.line}:${finding.column} ${finding.token ?? ""}`
          : `SEAM ${finding.file}:${finding.line}`;
      });
      expect(after, example.why).toEqual(expected);
    }
    expect(coverage).toEqual({ occurrence: 4, markerVerdicts: 2, markerConsumed: 1, duplicate: 2, seam: 1 });
  },
  DIFFERENTIAL_BUDGET_MS,
);
