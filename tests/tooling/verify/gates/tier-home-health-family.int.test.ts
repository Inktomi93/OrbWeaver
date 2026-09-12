// §4.5 refusal pin AND the §4.6 SPLIT-ARM DIFFERENTIAL for the two `-health` tripwires
// (`spacing-tier-home-health`, `typography-tier-home-health`).
//
// §4.5 (v-audit-wave4-2026-09-12.md, D8): both declare `execution: "entire-population"` because "does this
// row resolve to a file" is a whole-tree question the per-file occurrence policy cannot answer, but nothing
// proved a NARROWED request defers instead of silently declaring both sanctioned homes dead. The generic
// deferral mechanics are the planner's own contract (`tests/tooling/verify/lib/policy-plan.test.ts`); this
// pins it for these two real policies, the same shape as `no-tailwind-dark-variant.int.test.ts`'s test.
//
// §4.6 (#2000, p-parity-tier1): each `-health` policy exists BECAUSE one legacy gate was SPLIT into two
// policies with different `execution` values — the legacy `no-raw-spacing-in-features` /
// `no-raw-typography-in-features` descriptors carried the occurrence `visit` AND the rename tripwire in
// `finalize`. So the legacy gate's behaviour must now be reproduced by the UNION of the two final
// policies, and §4.6 requires a successor proof for the moved arm. This file is that proof: every original
// `mustFlag`/`mustPass` example from `d6f36904f` (the commit immediately before `99b7429e2` split them)
// replayed through the frozen legacy dispatcher and, byte-identically, through both final policies
// together.
//
// THE THREE CLASSIFIED DIFFERENCES, asserted rather than waved at:
//   1. SPLIT — one legacy gate, two final policies. The union is compared, never one half.
//   2. TRIPWIRE ANCHOR — the legacy `reportUnresolvedHomes` reported the stale-row verdict on line 1 of the
//      GATE MODULE ITSELF (`tooling/src/verify/gates/no-raw-*.ts`). That path is outside the final
//      policy's own `["@client","@ui"]` population, so `ctx.report.file` cannot express it; the health
//      policy anchors on its real-tree anchor (`packages/ui/src/tokens/index.ts`) instead. The trailing
//      "in <path>" of the message follows the same change (full repo path → module basename).
//   3. OCCURRENCE MESSAGE TEXT — reworded at conversion (#1954) from "in className" to "in a class string
//      (a `className` attribute or a `cn`/`clsx`/`cva`/`tv` call)", because the carrier fence admits the
//      class-composer call too and the old text claimed a context narrower than the visitor's. Both texts
//      are pinned verbatim below, so a FOURTH, unintended text drift reds this test.
// Everything else — which sites flag, at which position, with which token, and which sanctioned-home row
// the tripwire names — must be IDENTICAL.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { Project } from "ts-morph";
import type { GateDescriptor, GateExample } from "../../../../tooling/src/verify/contract/gate.ts";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { gate as noRawSpacing } from "../../../../tooling/src/verify/gates/no-raw-spacing-in-features.ts";
import { gate as noRawTypography } from "../../../../tooling/src/verify/gates/no-raw-typography-in-features.ts";
import { gate as spacingTierHealth } from "../../../../tooling/src/verify/gates/spacing-tier-home-health.ts";
import { gate as typographyTierHealth } from "../../../../tooling/src/verify/gates/typography-tier-home-health.ts";
import { runPass } from "../../../../tooling/src/verify/lib/pass.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ROOT = "/tier-home-health";
const ANCHOR = "packages/ui/src/tokens/index.ts";
const FAMILY = [spacingTierHealth, typographyTierHealth];

test("both -health tripwires preserve their founding fixtures", () => {
  expect(verifyPolicyProofs(FAMILY)).toEqual([]);
});

test("a narrowed request defers the entire-population tripwire instead of declaring every home dead", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  const files: Readonly<Record<string, string>> = {
    [ANCHOR]: "export const tokens = {};\n",
    "packages/ui/src/layout/stack.tsx": "export const S = null;\n",
    "packages/ui/src/markdown/render.tsx": "export const M = null;\n",
  };
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, source);
  }
  for (const policy of FAMILY) {
    // A run over the WHOLE project reports nothing (both homes resolve) — the control this pin depends on.
    const whole = runPolicyPass({ knownPolicies: [policy], policies: [policy], root: ROOT, project, reviewedGrants: [], failOnWarnings: false });
    expect(whole.toolErrors).toEqual([]);
    expect(whole.policies.find(({ id }) => id === policy.id)?.findings).toEqual([]);

    // A request narrowed to ONE file must not partially run the tripwire and "discover" the other home
    // dead — it must DEFER, exactly like `no-tailwind-dark-variant`'s pin for the same `execution` value.
    const narrowed = runPolicyPass({
      knownPolicies: [policy],
      policies: [policy],
      root: ROOT,
      project,
      requestedPaths: [ANCHOR],
      reviewedGrants: [],
      failOnWarnings: false,
    });
    expect(narrowed.toolErrors).toEqual([]);
    const owner = narrowed.policies.find(({ id }) => id === policy.id);
    expect(owner?.owner).toMatchObject({ status: "not-applicable", population: "complete" });
    expect(owner?.findings).toEqual([]);
  }
});

// ─── §4.6 SPLIT-ARM DIFFERENTIAL ───────────────────────────────────────────────────────────────────────
/** The commit immediately before `99b7429e2` split each legacy gate into an occurrence policy plus a
 *  `-health` tripwire — the last commit where one descriptor carried both arms. */
const BASE = "d6f36904fa6946238678e61760888aaf62ba0c93";

interface SplitFamily {
  readonly legacyPath: string;
  readonly occurrence: GatePolicy;
  readonly health: GatePolicy;
  /** CLASSIFIED DIFFERENCE 3, pinned verbatim in both directions. */
  readonly legacyMessage: string;
  readonly finalMessage: string;
}

const SPLIT_FAMILIES: readonly SplitFamily[] = [
  {
    legacyPath: "tooling/src/verify/gates/no-raw-spacing-in-features.ts",
    occurrence: noRawSpacing,
    health: spacingTierHealth,
    legacyMessage:
      "raw spacing utility in className — use a layout primitive (<Stack>, <Row>, <Section>, <Toolbar>) or an intent token (gap-section, p-row, py-block, gap-gutter). See docs/architecture/core/UI-Architecture-and-Layout.md.",
    finalMessage:
      "raw spacing utility in a class string (a `className` attribute or a `cn`/`clsx`/`cva`/`tv` call) — use a layout primitive (<Stack>, <Row>, <Section>, <Toolbar>) or an intent token (gap-section, p-row, py-block, gap-gutter). See docs/architecture/core/UI-Architecture-and-Layout.md.",
  },
  {
    legacyPath: "tooling/src/verify/gates/no-raw-typography-in-features.ts",
    occurrence: noRawTypography,
    health: typographyTierHealth,
    legacyMessage:
      "raw font-size utility in className — use a typography intent token (text-micro, text-label, text-body, text-hint, text-mono-tag). See docs/architecture/core/UI-Architecture-and-Layout.md.",
    finalMessage:
      "raw font-size utility in a class string (a `className` attribute or a `cn`/`clsx`/`cva`/`tv` call) — use a typography intent token (text-micro, text-label, text-body, text-hint, text-mono-tag). See docs/architecture/core/UI-Architecture-and-Layout.md.",
  },
];

function projectOf(files: Readonly<Record<string, string>>): Project {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, source);
  }
  return project;
}

function legacyFiles(example: GateExample): Readonly<Record<string, string>> {
  return typeof example.files === "string" ? { [example.at ?? "packages/client/src/x.tsx"]: example.files } : example.files;
}

/** The tripwire's subject: the sanctioned-home KEY its message quotes. Undefined for an occurrence
 *  finding, which is how the two arms are told apart across the anchor change. */
const TRIPWIRE_KEY_RE = /stale SANCTIONED-HOME row — "(?<key>[^"]+)"/u;

interface Verdict {
  /** One comparable line per finding: the ARM plus the identity of what it named. */
  readonly lines: readonly string[];
  /** Every file a tripwire finding was anchored on — classified difference 2. */
  readonly tripwireAnchors: readonly string[];
}

function verdictOf(
  findings: readonly { readonly file: string; readonly line: number; readonly column: number; readonly token?: string; readonly message: string }[],
): Verdict {
  const lines: string[] = [];
  const tripwireAnchors: string[] = [];
  for (const finding of findings) {
    const key = TRIPWIRE_KEY_RE.exec(finding.message)?.groups?.["key"];
    if (key === undefined) {
      lines.push(`OCCURRENCE ${finding.file}:${finding.line}:${finding.column} ${finding.token ?? "<no token>"}`);
      continue;
    }
    lines.push(`TRIPWIRE ${key}`);
    tripwireAnchors.push(finding.file);
  }
  return {
    lines: lines.toSorted((left, right) => left.localeCompare(right)),
    tripwireAnchors: tripwireAnchors.toSorted((left, right) => left.localeCompare(right)),
  };
}

function legacyVerdict(gate: GateDescriptor, files: Readonly<Record<string, string>>): Verdict {
  const project = projectOf(files);
  const result = runPass([gate], { root: ROOT, project, scope: { kind: "project" }, files: project.getSourceFiles(), checker: () => project.getTypeChecker() });
  expect(result.toolErrors).toEqual([]);
  expect(result.gates).toHaveLength(1);
  return verdictOf((result.gates[0]?.findings ?? []).map((finding) => ({ ...finding, message: finding.message ?? gate.message })));
}

/** The UNION of the two final policies — the whole point of a split differential. Running one half alone
 *  would "prove" the missing arm away. */
function finalVerdict(family: SplitFamily, files: Readonly<Record<string, string>>): Verdict {
  const policies = [family.occurrence, family.health];
  const project = projectOf(files);
  const result = runPolicyPass({ knownPolicies: policies, policies, root: ROOT, project, reviewedGrants: [], failOnWarnings: false });
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

async function frozenLegacyGate(path: string, scratch: string): Promise<GateDescriptor> {
  const source = execFileSync("git", ["show", `${BASE}:${path}`], { encoding: "utf8" });
  const target = join(scratch, basename(path));
  // The copy lives outside the checkout, so its RELATIVE imports are rewritten to file URLs. All three
  // named modules are still on the tree and `lib/sanctioned-home.ts` changed only ADDITIVELY since BASE
  // (`coveredFiles`/`unresolvedSanctionedHomeKeys` were appended; `reportUnresolvedHomes` is untouched),
  // so the frozen descriptor runs the same code it ran at BASE.
  const rewritten = source
    .replace('from "../contract/gate.ts"', `from ${toolingHref("../contract/gate.ts")}`)
    .replace('from "../lib/pass.ts"', `from ${toolingHref("../lib/pass.ts")}`)
    .replace('from "../lib/sanctioned-home.ts"', `from ${toolingHref("../lib/sanctioned-home.ts")}`);
  writeFileSync(target, rewritten);
  return ((await import(`${pathToFileURL(target).href}?frozen=${basename(path)}`)) as { readonly gate: GateDescriptor }).gate;
}

test("the split occurrence+health pair reproduces the frozen legacy gate on every original example", async ({ scratch }) => {
  for (const family of SPLIT_FAMILIES) {
    const legacy = await frozenLegacyGate(family.legacyPath, scratch);
    expect(legacy.message, family.legacyPath).toBe(family.legacyMessage);
    expect(family.occurrence.message, family.occurrence.id).toBe(family.finalMessage);
    const examples = [...legacy.mustFlag, ...legacy.mustPass];
    expect(examples.length, family.legacyPath).toBeGreaterThan(0);
    let tripwireExamples = 0;
    for (const example of examples) {
      const files = legacyFiles(example);
      const label = `${family.occurrence.id} + ${family.health.id}: ${example.why}`;
      const before = legacyVerdict(legacy, files);
      const after = finalVerdict(family, files);
      // THE DIFFERENTIAL: identical arms, identical subjects, identical positions.
      expect(after.lines, label).toEqual(before.lines);
      if (before.tripwireAnchors.length === 0) {
        continue;
      }
      tripwireExamples += 1;
      // CLASSIFIED DIFFERENCE 2 — and it is a real move, asserted in both directions so that "the tripwire
      // silently stopped firing" cannot read as "the anchors merely agree".
      expect(before.tripwireAnchors, label).toEqual(before.tripwireAnchors.map(() => family.legacyPath));
      expect(after.tripwireAnchors, label).toEqual(before.tripwireAnchors.map(() => ANCHOR));
    }
    // The legacy corpus MUST have exercised the arm that moved, or this differential proves nothing about
    // the split it exists to check.
    expect(tripwireExamples, family.legacyPath).toBeGreaterThan(0);
  }
});
