import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { Project } from "ts-morph";
import type { GateDescriptor, GateExample } from "../../../../tooling/src/verify/contract/gate.ts";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { gate as commentedCode } from "../../../../tooling/src/verify/gates/commented-code.ts";
import { gate as toolingSize } from "../../../../tooling/src/verify/gates/tooling-size.ts";
import { runPass } from "../../../../tooling/src/verify/lib/pass.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ROOT = "/simple-file-hooks";
const BASE = "0acf26cb82200e3a8290b1dd6b3c3458e36c19a6";
const PATHS = ["tooling/src/verify/gates/commented-code.ts", "tooling/src/verify/gates/tooling-size.ts"] as const;

function projectOf(files: Readonly<Record<string, string>>): Project {
  const project = new Project({ useInMemoryFileSystem: true });
  const corpus = { "tooling/src/verify/lib/file-hook-control.ts": "export const control = true;\n", ...files };
  for (const [path, source] of Object.entries(corpus)) {
    project.createSourceFile(`${ROOT}/${path}`, source);
  }
  return project;
}

function legacyFiles(example: GateExample): Readonly<Record<string, string>> {
  return typeof example.files === "string" ? { [example.at ?? "packages/ui/src/x.ts"]: example.files } : example.files;
}

function legacyFindings(gate: GateDescriptor, files: Readonly<Record<string, string>>): readonly { readonly file: string; readonly message: string }[] {
  const project = projectOf(files);
  const result = runPass([gate], { root: ROOT, project, scope: { kind: "project" }, files: project.getSourceFiles(), checker: () => project.getTypeChecker() });
  expect(result.toolErrors).toEqual([]);
  expect(result.gates).toHaveLength(1);
  return (result.gates[0]?.findings ?? [])
    .map((finding) => ({ file: finding.file, message: finding.message ?? gate.message }))
    .toSorted((left, right) => left.file.localeCompare(right.file) || left.message.localeCompare(right.message));
}

function finalFindings(gate: GatePolicy, files: Readonly<Record<string, string>>): readonly { readonly file: string; readonly message: string }[] {
  const project = projectOf(files);
  const result = runPolicyPass({ knownPolicies: [gate], policies: [gate], root: ROOT, project, reviewedGrants: [], failOnWarnings: false });
  expect(result.toolErrors).toEqual([]);
  expect(result.factErrors).toEqual([]);
  expect(result.policies[0]?.owner.status).toBe("success");
  return result.authority.effectiveFindings
    .map((finding) => ({ file: finding.file, message: finding.message ?? gate.message }))
    .toSorted((left, right) => left.file.localeCompare(right.file) || left.message.localeCompare(right.message));
}

async function frozenLegacyGate(path: (typeof PATHS)[number], scratch: string): Promise<GateDescriptor> {
  const source = execFileSync("git", ["show", `${BASE}:${path}`], { encoding: "utf8" });
  const target = join(scratch, basename(path));
  writeFileSync(
    target,
    source.replace('from "../contract/gate.ts"', `from ${JSON.stringify(pathToFileURL(join(process.cwd(), "tooling/src/verify/contract/gate.ts")).href)}`),
  );
  return ((await import(`${pathToFileURL(target).href}?frozen=${basename(path)}`)) as { readonly gate: GateDescriptor }).gate;
}

test("the converted file-hook policies pass their production proof runtime", () => {
  expect(verifyPolicyProofs([commentedCode, toolingSize])).toEqual([]);
});

test("the final policies match the frozen legacy policies on every original proof corpus", async ({ scratch }) => {
  for (const [path, policy] of [
    [PATHS[0], commentedCode],
    [PATHS[1], toolingSize],
  ] as const) {
    const legacy = await frozenLegacyGate(path, scratch);
    for (const example of [...legacy.mustFlag, ...legacy.mustPass]) {
      const files = legacyFiles(example);
      expect(finalFindings(policy, files), `${policy.id}: ${example.why}`).toEqual(legacyFindings(legacy, files));
    }
  }
});

test("comment-looking template data no longer becomes commented code", async ({ scratch }) => {
  const legacy = await frozenLegacyGate(PATHS[0], scratch);
  const files = { "packages/ui/src/x/template.ts": "export const source = `\n// const rendered = true;\n`;\n" };
  expect(legacyFindings(legacy, files)).toHaveLength(1);
  expect(finalFindings(commentedCode, files)).toEqual([]);
});
