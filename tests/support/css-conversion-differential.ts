import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Project } from "ts-morph";
import { PRODUCT_STYLESHEETS } from "../../tooling/src/verify/contract/css-family.ts";
import type { Finding, GateDescriptor, GateExample } from "../../tooling/src/verify/contract/gate.ts";
import type { CoordinatedGateFinding, GateAuthorityAlarm, ReviewedGateGrant } from "../../tooling/src/verify/contract/gate-authority.ts";
import type { GateScan } from "../../tooling/src/verify/contract/pass.ts";
import type { GatePolicy } from "../../tooling/src/verify/contract/policy.ts";
import { SOURCE_ANCHOR, VENDOR_SURFACE_FIXTURE } from "../../tooling/src/verify/lib/css-family-proof-fixtures.ts";
import { runPass } from "../../tooling/src/verify/lib/pass.ts";
import { runPolicyPass } from "../../tooling/src/verify/lib/policy-pass.ts";

export type CssFixture = Readonly<Record<string, string>>;

export interface LegacyCssReplay {
  readonly findings: readonly Finding[];
  readonly scan: GateScan;
  readonly toolErrors: readonly string[];
}

export interface FinalCssReplay {
  readonly findings: readonly CoordinatedGateFinding[];
  readonly alarms: readonly GateAuthorityAlarm[];
  readonly grantedIds: readonly string[];
  readonly sourcePaths: readonly string[];
  readonly resourcePaths: readonly string[];
  readonly toolErrors: readonly string[];
}

export function cssExampleFiles(example: GateExample): CssFixture {
  return typeof example.files === "string" ? { [example.at ?? "packages/ui/src/x.tsx"]: example.files } : example.files;
}

/** Complete only the final resource substrate. Every family test separately proves this addition leaves
 * the frozen legacy verdict unchanged. A neutral declaration plus comments make absent CSS homes readable
 * without inventing a custom-property definition, reference, class selector or raw length. */
export function completeCssFixture(files: CssFixture, withVendor: boolean): CssFixture {
  const completed: Record<string, string> = { ...files };
  for (const path of PRODUCT_STYLESHEETS) {
    completed[path] ??= path === PRODUCT_STYLESHEETS[0] ? ":root { color: red; }\n" : "/* conversion differential completion */\n";
  }
  if (withVendor) {
    for (const [path, text] of Object.entries(VENDOR_SURFACE_FIXTURE)) {
      completed[path] ??= text;
    }
    if (files["docs/vendor/base-ui/INDEX.md"] === undefined) {
      completed["docs/vendor/base-ui/INDEX.md"] = "# Base UI docs mirror — v9.9.9\n";
    }
    const packagePath = "packages/ui/node_modules/@base-ui/react/package.json";
    const parsed = JSON.parse(completed[packagePath] ?? "{}") as Record<string, unknown>;
    if (parsed["name"] === undefined) {
      completed[packagePath] = `${JSON.stringify({ name: "@base-ui/react", ...parsed })}\n`;
    }
  }
  if (!Object.keys(completed).some((path) => /^packages\/(?:client|ui)\/src\/.*\.tsx?$/u.test(path))) {
    completed[SOURCE_ANCHOR] = "export const conversionProof = null;\n";
  }
  return completed;
}

function relative(root: string, path: string): string {
  return path.startsWith(`${root}/`) ? path.slice(root.length + 1) : path;
}

function plant(root: string, files: CssFixture): Project {
  const project = new Project({ skipAddingFilesFromTsConfig: true });
  for (const [path, text] of Object.entries(files)) {
    const absolute = join(root, path);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, text);
    if (/\.tsx?$/u.test(path) && !path.includes("/node_modules/")) {
      project.addSourceFileAtPath(absolute);
    }
  }
  return project;
}

export function replayLegacyCss(gate: GateDescriptor, files: CssFixture): LegacyCssReplay {
  const root = mkdtempSync(join(tmpdir(), "orb-css-legacy-"));
  try {
    const project = plant(root, files);
    const result = runPass([gate], {
      root,
      project,
      scope: { kind: "project" },
      files: project.getSourceFiles(),
      checker: () => project.getTypeChecker(),
    });
    const observed = result.gates[0];
    if (observed === undefined) {
      throw new Error(`legacy CSS dispatcher omitted ${gate.name}`);
    }
    return {
      findings: observed.findings.map((finding) => ({ ...finding, file: relative(root, finding.file) })),
      scan: observed.scan,
      toolErrors: result.toolErrors.map((error) => `${error.gate}/${error.phase}:${error.message}`).toSorted(),
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

export function replayFinalCss(policies: readonly GatePolicy[], files: CssFixture, reviewedGrants: readonly ReviewedGateGrant[]): FinalCssReplay {
  const root = mkdtempSync(join(tmpdir(), "orb-css-final-"));
  try {
    const project = plant(root, files);
    const parser = new Project({ useInMemoryFileSystem: true });
    const overlay = Object.fromEntries(Object.entries(files).filter(([path]) => !path.includes("/node_modules/")));
    const result = runPolicyPass({
      knownPolicies: [...policies],
      policies: [...policies],
      root,
      project,
      reviewedGrants: [...reviewedGrants],
      failOnWarnings: false,
      resourceOptions: {
        overlay,
        parseSource: (path, text) => parser.createSourceFile(`${root}/${path}`, text, { overwrite: true }),
      },
    });
    const sourcePaths = new Set<string>();
    const resourcePaths = new Set<string>();
    for (const owner of result.policies) {
      for (const path of owner.population.effectiveSourcePaths) {
        sourcePaths.add(relative(root, path));
      }
      for (const path of owner.population.effectiveResourcePaths) {
        resourcePaths.add(relative(root, path));
      }
    }
    return {
      findings: result.authority.effectiveFindings.map((finding) => ({ ...finding, file: relative(root, finding.file) })),
      alarms: result.authority.authorityAlarms,
      grantedIds: result.authority.grantedFindings.map(({ grantId }) => grantId).toSorted(),
      sourcePaths: [...sourcePaths].toSorted(),
      resourcePaths: [...resourcePaths].toSorted(),
      toolErrors: [
        ...result.toolErrors.map((error) => `${error.policyId}/${error.phase}:${error.message}`),
        ...result.factErrors.map((error) => `${error.factId}/${error.phase}:${error.message}`),
        ...result.authority.toolErrors.map((error) => `${error.policyId ?? "authority"}/authority:${error.message}`),
      ].toSorted(),
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
