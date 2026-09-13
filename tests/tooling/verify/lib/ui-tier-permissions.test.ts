import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { Project } from "ts-morph";
import type { GateDescriptor, GateExample } from "../../../../tooling/src/verify/contract/gate.ts";
import type { ReviewedGateGrant } from "../../../../tooling/src/verify/contract/gate-authority.ts";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { gate as pointerOutside } from "../../../../tooling/src/verify/gates/no-pointer-variants-in-features.ts";
import { gate as zOutside } from "../../../../tooling/src/verify/gates/no-raw-z-index.ts";
import { gate as pointerHealth } from "../../../../tooling/src/verify/gates/pointer-capability-tier-health.ts";
import { gate as pointerPermission } from "../../../../tooling/src/verify/gates/pointer-capability-tier-permission.ts";
import { gate as skinHealth } from "../../../../tooling/src/verify/gates/skin-fragment-tier-health.ts";
import { gate as skinPermission } from "../../../../tooling/src/verify/gates/skin-fragment-tier-permission.ts";
import { gate as skinOutside } from "../../../../tooling/src/verify/gates/ui-skin-fragment-purity.ts";
import { gate as zHealth } from "../../../../tooling/src/verify/gates/z-index-tier-health.ts";
import { gate as zPermission } from "../../../../tooling/src/verify/gates/z-index-tier-permission.ts";
import { runPass } from "../../../../tooling/src/verify/lib/pass.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { reviewedGrantsFor } from "../../../../tooling/src/verify/lib/reviewed-grants.ts";
import { uiTierPermissionFact } from "../../../../tooling/src/verify/lib/ui-tier-permissions.ts";
import { waivableCoordinate } from "../../../../tooling/src/verify/lib/waivable-coordinate.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ROOT = "/ui-tier-family";
const ALL = [zOutside, zPermission, zHealth, skinOutside, skinPermission, skinHealth, pointerOutside, pointerPermission, pointerHealth];
const SKIN = [skinOutside, skinPermission, skinHealth];

function run(
  policies: readonly GatePolicy[],
  files: Readonly<Record<string, string>>,
  grants: readonly ReviewedGateGrant[] = reviewedGrantsFor(policies),
  requestedPaths?: readonly string[],
): ReturnType<typeof runPolicyPass> {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, source);
  }
  return runPolicyPass({
    knownPolicies: policies,
    policies,
    root: ROOT,
    project,
    reviewedGrants: grants,
    failOnWarnings: false,
    ...(requestedPaths === undefined ? {} : { requestedPaths }),
  });
}

test("the complete converted family proof corpus dispatches through production", () => {
  expect(verifyPolicyProofs(ALL)).toEqual([]);
});

test("a live reviewed home grants once at zero and many raw hits while an outside twin remains effective", () => {
  for (const homeSource of ["export const clean = true;", 'export const a = "bg-backdrop"; export const b = "focus-visible:ring-2";']) {
    const result = run(SKIN, {
      "packages/ui/src/lib/fragments.ts": homeSource,
      "packages/ui/src/primitives/outside.ts": 'export const outside = "bg-backdrop";',
    });
    expect(result.toolErrors).toEqual([]);
    expect(result.authority.grantedFindings).toHaveLength(1);
    expect(result.authority.effectiveFindings.filter(({ policyId }) => policyId === skinOutside.id)).toHaveLength(1);
  }
});

test("missing or changed reviewed home identity stays hard and stales the central grant", () => {
  const missing = run(SKIN, { "packages/ui/src/primitives/x.ts": "export const x = true;" });
  expect(missing.authority.effectiveFindings.some(({ policyId }) => policyId === skinHealth.id)).toBe(true);
  expect(missing.authority.authorityAlarms.map(({ kind }) => kind)).toContain("stale-reviewed-grant");

  const [grant] = reviewedGrantsFor([skinPermission]);
  const changed = grant === undefined ? [] : [{ ...grant, subject: "packages/ui/src/lib-renamed/" }];
  const changedResult = run([skinPermission], { "packages/ui/src/lib/x.ts": "export const x = true;" }, changed);
  expect(changedResult.authority.authorityAlarms.map(({ kind }) => kind)).toContain("stale-reviewed-grant");
});

test("health findings anchor inside their owner when the shared fact also admits the other world", () => {
  for (const [policy, files] of [
    [
      skinHealth,
      {
        "packages/client/src/a.ts": "export const client = true;",
        "packages/ui/src/primitives/x.ts": "export const ui = true;",
      },
    ],
    [
      pointerHealth,
      {
        "packages/ui/src/a.ts": "export const ui = true;",
        "packages/client/src/main.ts": "export const client = true;",
      },
    ],
  ] as const) {
    const result = run([policy], files, []);
    expect(result.toolErrors).toEqual([]);
    expect(result.factErrors).toEqual([]);
    expect(result.authority.effectiveFindings).toHaveLength(1);
    expect(result.authority.effectiveFindings[0]?.policyId).toBe(policy.id);
  }
});

test("a narrowed request defers every whole-population owner", () => {
  const files = { "packages/ui/src/lib/x.ts": "export const x = true;", "packages/ui/src/primitives/y.ts": "export const y = true;" };
  for (const policy of SKIN) {
    const result = run([policy], files, reviewedGrantsFor([policy]), ["packages/ui/src/primitives/y.ts"]);
    expect(result.policies.find(({ id }) => id === policy.id)?.owner).toMatchObject({ status: "not-applicable", population: "complete" });
  }
});

const LEGACY_BASE = "31c6f9a3977c64dc8e620d4a14f8019323f07a32";
interface LegacyFamily {
  readonly path: string;
  readonly policies: readonly GatePolicy[];
  readonly kind: "z" | "skin" | "pointer";
}
const LEGACY_FAMILIES: readonly LegacyFamily[] = [
  { path: "tooling/src/verify/gates/no-raw-z-index.ts", policies: [zOutside, zPermission, zHealth], kind: "z" },
  { path: "tooling/src/verify/gates/ui-skin-fragment-purity.ts", policies: [skinOutside, skinPermission, skinHealth], kind: "skin" },
  { path: "tooling/src/verify/gates/no-pointer-variants-in-features.ts", policies: [pointerOutside, pointerPermission, pointerHealth], kind: "pointer" },
];

function toolingHref(relative: string): string {
  return JSON.stringify(pathToFileURL(join(process.cwd(), "tooling/src/verify/gates", relative)).href);
}

async function frozenLegacyGate(family: LegacyFamily, scratch: string): Promise<GateDescriptor> {
  const source = execFileSync("git", ["show", `${LEGACY_BASE}:${family.path}`], { encoding: "utf8" });
  const target = join(scratch, `legacy-${basename(family.path)}`);
  const rewritten = source
    .replace('from "../contract/gate.ts"', `from ${toolingHref("../contract/gate.ts")}`)
    .replace('from "../lib/pass.ts"', `from ${toolingHref("../lib/pass.ts")}`)
    .replace('from "../lib/sanctioned-home.ts"', `from ${toolingHref("../lib/sanctioned-home.ts")}`)
    .replace('from "../lib/tailwind-class-token.ts"', `from ${toolingHref("../lib/tailwind-class-token.ts")}`);
  writeFileSync(target, rewritten);
  return ((await import(`${pathToFileURL(target).href}?family=${family.kind}`)) as { readonly gate: GateDescriptor }).gate;
}

function exampleFiles(example: GateExample): Record<string, string> {
  return typeof example.files === "string" ? { [example.at ?? "packages/client/src/x.tsx"]: example.files } : { ...example.files };
}

const HEALTHY_Z = '{"z":{"base":{},"raised":{},"overlay":{},"modal":{},"popover":{},"toast":{},"tooltip":{}}}';
function withFamilySupport(family: LegacyFamily, arm: "mustFlag" | "mustPass", index: number, original: Record<string, string>): Record<string, string> {
  const files = { ...original };
  if (family.kind === "z") {
    files["packages/ui/src/tokens/tokens.json"] ??= HEALTHY_Z;
    files["packages/ui/src/layout/__differential.ts"] ??= "export const layout = true;";
    if (!(arm === "mustFlag" && index === 5)) {
      files["packages/ui/src/markdown/__differential.ts"] ??= "export const markdown = true;";
    }
  } else if (family.kind === "skin") {
    if (!(arm === "mustFlag" && index === 3)) {
      files["packages/ui/src/lib/__differential.ts"] ??= "export const lib = true;";
    }
  } else if (!((arm === "mustFlag" && index === 3) || (arm === "mustFlag" && index === 4))) {
    files["packages/client/src/features/app-shell/__differential.ts"] ??= "export const shell = true;";
  }
  return files;
}

function physicalProject(root: string, files: Readonly<Record<string, string>>): Project {
  const project = new Project({ skipAddingFilesFromTsConfig: true });
  for (const [path, source] of Object.entries(files)) {
    const target = join(root, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, source);
    if (path.endsWith(".ts") || path.endsWith(".tsx")) {
      project.createSourceFile(target, source, { overwrite: true });
    }
  }
  return project;
}

const OCCURRENCE_MESSAGES = {
  z: "raw z-N or unknown semantic z-index outside the reviewed implementation tier — use a governed z-(--z-*) token.",
  skin: "a static string outside packages/ui/src/lib/ hand-spells a homed skin fragment — compose the lib constant instead.",
  pointer: "pointer/hover capability variant in a feature string — device capability lives at the token or shell layer.",
} as const;

function normalizedVerdict(
  findings: readonly { readonly file: string; readonly line: number; readonly token?: string; readonly message?: string; readonly policyId?: string }[],
  legacyMessageReplacement?: string,
): readonly string[] {
  return findings
    .map((finding) => {
      const message = finding.message ?? "";
      if (message.includes("vocabulary drift")) {
        return "HEALTH vocabulary";
      }
      if (message.includes("BLIND") || message.includes("feature-root census")) {
        return "HEALTH feature-root";
      }
      const home = /(?:stale SANCTIONED-HOME row — "|missing reviewed (?:z-index|skin-fragment|pointer-capability) home: )(?<home>packages\/[^" ]+)/u.exec(
        message,
      )?.groups?.["home"];
      if (home !== undefined) {
        return `HEALTH home ${home}`;
      }
      return JSON.stringify({
        file: finding.file,
        line: finding.line,
        token: waivableCoordinate(finding.token ?? "") ?? finding.token ?? "<none>",
        message: legacyMessageReplacement ?? message,
        policyId: finding.policyId,
      });
    })
    .toSorted();
}

// Health findings move from gate/self or historical anchors to admitted source anchors. Each frozen
// row names that transition explicitly; category parity below is supplementary, never identity proof.
const HEALTH_TRANSITIONS: Readonly<
  Record<
    string,
    readonly {
      file: string;
      line: number;
      column: number;
      token: string;
      message: string;
      policyId: string;
    }[]
  >
> = {
  "z:mustFlag:4": [
    {
      file: "packages/ui/src/layout/__differential.ts",
      line: 1,
      column: 1,
      token: "export",
      policyId: "z-index-tier-health",
      message:
        "z-index vocabulary drift: expected [base, modal, overlay, popover, raised, toast, tooltip], found [base, modal, overlay, popover, raised, toast]",
    },
  ],
  "z:mustFlag:5": [
    {
      file: "packages/ui/src/layout/__differential.ts",
      line: 1,
      column: 1,
      token: "export",
      policyId: "z-index-tier-health",
      message: "missing reviewed z-index home: packages/ui/src/markdown/",
    },
  ],
  "skin:mustFlag:3": [
    {
      file: "packages/ui/src/primitives/toast/variants.ts",
      line: 1,
      column: 1,
      token: "export",
      policyId: "skin-fragment-tier-health",
      message: "missing reviewed skin-fragment home: packages/ui/src/lib/",
    },
  ],
  "pointer:mustFlag:3": [
    {
      file: "packages/client/src/main.tsx",
      line: 1,
      column: 1,
      token: "export",
      policyId: "pointer-capability-tier-health",
      message: "feature-root census is blind: packages/client/src/features/ resolved zero files",
    },
  ],
  "pointer:mustFlag:4": [
    {
      file: "packages/client/src/features/rpg/components/x.tsx",
      line: 1,
      column: 1,
      token: "export",
      policyId: "pointer-capability-tier-health",
      message: "missing reviewed pointer-capability home: packages/client/src/features/app-shell/",
    },
  ],
};

function classifierAdmits(kind: LegacyFamily["kind"], path: string): boolean {
  if (kind === "z") {
    return /^packages\/(?:client|ui)\/src\//u.test(path);
  }
  if (kind === "skin") {
    return path.startsWith("packages/ui/src/");
  }
  return path.startsWith("packages/client/src/features/");
}

test("the three-policy unions reproduce every frozen legacy example with classified authority changes", async ({ scratch }) => {
  let fixture = 0;
  for (const family of LEGACY_FAMILIES) {
    const legacy = await frozenLegacyGate(family, scratch);
    for (const arm of ["mustFlag", "mustPass"] as const) {
      for (const [index, example] of legacy[arm].entries()) {
        const files = withFamilySupport(family, arm, index, exampleFiles(example));
        const root = join(scratch, `fixture-${fixture++}`);
        const legacyProject = physicalProject(root, files);
        const before = runPass([legacy], {
          root,
          project: legacyProject,
          scope: { kind: "project" },
          files: legacyProject.getSourceFiles(),
          checker: () => legacyProject.getTypeChecker(),
        });
        expect(before.toolErrors, `${family.kind} ${arm}[${index}] legacy`).toEqual([]);

        const finalProject = physicalProject(root, files);
        const after = runPolicyPass({
          knownPolicies: family.policies,
          policies: family.policies,
          root,
          project: finalProject,
          reviewedGrants: reviewedGrantsFor(family.policies),
          failOnWarnings: false,
        });
        expect(after.toolErrors, `${family.kind} ${arm}[${index}] final`).toEqual([]);
        expect(after.factErrors, `${family.kind} ${arm}[${index}] facts`).toEqual([]);
        expect(
          after.authority.effectiveFindings
            .filter(({ policyId }) => policyId.endsWith("-health"))
            .map(({ file, line, column, token, message, policyId }) => ({ file, line, column, token, message, policyId })),
          `${family.kind} ${arm}[${index}] explicit health identity transition`,
        ).toEqual(HEALTH_TRANSITIONS[`${family.kind}:${arm}:${index}`] ?? []);
        expect(
          normalizedVerdict(
            after.authority.effectiveFindings.map((finding) => ({
              ...finding,
              message: finding.message ?? family.policies.find((policy) => policy.id === finding.policyId)?.message,
            })),
          ),
          `${family.kind} ${arm}[${index}] ${example.why}`,
        ).toEqual(
          normalizedVerdict(
            (before.gates[0]?.findings ?? []).map((finding) => ({ ...finding, message: finding.message ?? legacy.message, policyId: family.policies[0]?.id })),
            OCCURRENCE_MESSAGES[family.kind],
          ),
        );
        const expectedStale = reviewedGrantsFor(family.policies).filter((grant) => !Object.keys(files).some((path) => path.startsWith(grant.subject))).length;
        expect(
          after.authority.authorityAlarms.filter(({ kind }) => kind === "stale-reviewed-grant").length,
          `${family.kind} ${arm}[${index}] stale grant`,
        ).toBe(expectedStale);
      }
    }
  }
});

test("legacy scan predicates equal the shared classifier predicates, with the pointer provider widening explicit", async ({ scratch }) => {
  const tracked = execFileSync("git", ["ls-files", "*.ts", "*.tsx"], { encoding: "utf8" }).trim().split("\n").filter(Boolean);
  let pointerLegacy: GateDescriptor | undefined;
  for (const family of LEGACY_FAMILIES) {
    const legacy = await frozenLegacyGate(family, scratch);
    if (family.kind === "pointer") {
      pointerLegacy = legacy;
    }
    const legacySet = tracked.filter((path) => legacy.scanRoot(path));
    const classifierSet = tracked.filter((path) => classifierAdmits(family.kind, path));
    expect(
      classifierSet.filter((path) => !legacySet.includes(path)),
      `${family.kind} final-minus-legacy predicate`,
    ).toEqual([]);
    expect(
      legacySet.filter((path) => !classifierSet.includes(path)),
      `${family.kind} legacy-minus-final predicate`,
    ).toEqual([]);
  }
  const providerOnly = tracked.filter((path) => path.startsWith("packages/client/src/") && !path.startsWith("packages/client/src/features/"));
  expect(uiTierPermissionFact.population).toEqual(["@client", "@ui"]);
  expect(zOutside.population).toEqual(["@client", "@ui"]);
  expect(skinOutside.population).toBe("@ui");
  expect(pointerOutside.population).toBe("@client");
  expect(providerOnly.length).toBeGreaterThan(0);
  expect(pointerLegacy).toBeDefined();
  expect(providerOnly.some((path) => pointerLegacy?.scanRoot(path) === true)).toBe(false);
});
