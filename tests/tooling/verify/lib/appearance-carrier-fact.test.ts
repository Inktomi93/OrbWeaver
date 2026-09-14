import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { Project } from "ts-morph";
import type { GateDescriptor } from "../../../../tooling/src/verify/contract/gate.ts";
import { gate } from "../../../../tooling/src/verify/gates/appearance-carrier-contract.ts";
import { gate as health } from "../../../../tooling/src/verify/gates/appearance-carrier-health.ts";
import { runPass } from "../../../../tooling/src/verify/lib/pass.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

function projectFor(root: string, files: Readonly<Record<string, string>>): Project {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, text] of Object.entries(files)) {
    project.createSourceFile(join(root, path), text);
  }
  return project;
}

test("preserves all declared appearance controls through final dispatch", () => {
  expect(verifyPolicyProofs([gate, health])).toEqual([]);
});

test("all frozen legacy examples preserve complete finding messages and tokens", async ({ scratch }) => {
  const source = execFileSync("git", ["show", "4e6a09f5c:tooling/src/verify/gates/appearance-carrier-contract.ts"], { encoding: "utf8" });
  const target = join(scratch, "legacy-appearance.ts");
  const relocated = source.replace(
    /from "(\.\.\/[^"\n]+)"/gu,
    (_, specifier: string) => `from ${JSON.stringify(pathToFileURL(join(process.cwd(), "tooling/src/verify/gates", specifier)).href)}`,
  );
  writeFileSync(target, relocated);
  const legacy = ((await import(pathToFileURL(target).href)) as { gate: GateDescriptor }).gate;
  const rows = [...legacy.mustFlag, ...legacy.mustPass];
  expect(rows).toHaveLength(4);
  for (const row of rows) {
    if (typeof row.files === "string") {
      throw new Error("appearance legacy corpus unexpectedly changed representation");
    }
    const project = projectFor(scratch, row.files);
    const before = runPass([legacy], {
      root: scratch,
      project,
      scope: { kind: "project" },
      files: project.getSourceFiles(),
      checker: () => project.getTypeChecker(),
    });
    const after = runPolicyPass({ root: scratch, project, knownPolicies: [gate, health], policies: [gate, health], reviewedGrants: [], failOnWarnings: false });
    expect(after.toolErrors).toEqual([]);
    expect(after.factErrors).toEqual([]);
    // Hard health findings preserve their manifest file/line and descriptive token. The legacy zero
    // column becomes the final runtime's one-based column; this is the only coordinate normalization.
    interface Identity {
      file: string;
      line: number;
      column: number;
      message?: string;
      token?: string;
    }
    const normalize = (findings: readonly Identity[]): Identity[] =>
      findings.map(({ file, line, column, message, token }) => ({
        file,
        line,
        column: Math.max(1, column),
        ...(message === undefined ? {} : { message }),
        ...(token === undefined ? {} : { token }),
      }));
    expect(normalize(after.authority.effectiveFindings), row.why).toEqual(normalize(before.gates[0]?.findings ?? []));
  }
});

test("an exact empty-carrier waiver cannot suppress independent graph health or survive a removed occurrence", () => {
  const manifest = "packages/client/src/lib/appearance-carrier-manifest.ts";
  const files = { ...gate.mustFlag[0].files };
  const original = files[manifest];
  expect(original).toBeDefined();
  const drive = (text: string): ReturnType<typeof runPolicyPass> => {
    const root = "/appearance-authority";
    return runPolicyPass({
      root,
      project: projectFor(root, { ...files, [manifest]: text }),
      knownPolicies: [gate, health],
      policies: [gate, health],
      reviewedGrants: [],
      failOnWarnings: false,
    });
  };
  const bare = drive(original);
  const marked = drive(original.replace("={width:", "={\n// @orb-waive appearance-carrier-contract(width): isolated carrier probe\nwidth:"));
  expect(marked.toolErrors).toEqual([]);
  expect(marked.factErrors).toEqual([]);
  expect(marked.authority.waivedFindings.map(({ finding }) => finding.policyId)).toEqual([gate.id]);
  expect(marked.authority.effectiveFindings.filter(({ policyId }) => policyId === health.id)).toEqual(
    bare.authority.effectiveFindings.filter(({ policyId }) => policyId === health.id),
  );
  const stale = drive(
    original
      .replace("carriers:[]", 'carriers:["shell-grid"]')
      .replace("={width:", "={\n// @orb-waive appearance-carrier-contract(width): isolated carrier probe\nwidth:"),
  );
  expect(stale.authority.waivedFindings).toEqual([]);
  expect(stale.authority.authorityAlarms.some(({ policyId }) => policyId === gate.id)).toBe(true);
});

test("the former real-tree planted manifest remains covered and invocation state does not leak", () => {
  const root = "/appearance-planted";
  const base = health.mustPass[0].files;
  const path = "packages/client/src/lib/__g_appearance-carrier-manifest.ts";
  const source =
    'const C={file:"packages/client/src/lib/__g_appearance-carrier-manifest.ts",symbol:"AppShell"};\nexport const APPEARANCE_CARRIER_MANIFEST={density:{owner:"sizing",carriers:["theme-scope"],consumer:C,lifecycle:"hydrated-from-prepaint-hint",portal:"shared-theme-scope-sibling",requiredDistinctArms:["compact","compact"]}};\nexport function AppShell(){ const density = "compact"; return density; }\n';
  const drive = (files: Readonly<Record<string, string>>): ReturnType<typeof runPolicyPass> =>
    runPolicyPass({
      root,
      project: projectFor(root, files),
      knownPolicies: [gate, health],
      policies: [gate, health],
      reviewedGrants: [],
      failOnWarnings: false,
    });
  const planted = drive({ ...base, [path]: source });
  expect(planted.toolErrors).toEqual([]);
  expect(planted.factErrors).toEqual([]);
  expect(planted.authority.effectiveFindings.map(({ message }) => message)).toEqual(["required-distinct arms for density are equal or malformed"]);
  const next = drive({ ...base, "packages/server/src/lib/__g_appearance-carrier-manifest.ts": source });
  expect(next.toolErrors).toEqual([]);
  expect(next.factErrors).toEqual([]);
  expect(next.authority.effectiveFindings).toEqual([]);
});
