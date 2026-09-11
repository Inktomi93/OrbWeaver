import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { Project } from "ts-morph";
import type { GateDescriptor, GateExample } from "../../../../tooling/src/verify/contract/gate.ts";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { gate as typesInContract } from "../../../../tooling/src/verify/gates/types-in-contract.ts";
import { gate as verbNaming } from "../../../../tooling/src/verify/gates/verb-naming.ts";
import { runPass } from "../../../../tooling/src/verify/lib/pass.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ROOT = "/server-file-hooks";
const BASE = "e656ce65d4a01510dae7d7c42fd25d825738caa6";
const PATHS = ["tooling/src/verify/gates/types-in-contract.ts", "tooling/src/verify/gates/verb-naming.ts"] as const;
const VERB = "packages/server/src/domain/chat/verbs/start-chat.ts";

function projectOf(files: Readonly<Record<string, string>>): Project {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, source);
  }
  return project;
}

function finalVerdict(policy: GatePolicy, files: Readonly<Record<string, string>>): ReturnType<typeof runPolicyPass> {
  const project = projectOf(files);
  return runPolicyPass({ knownPolicies: [policy], policies: [policy], root: ROOT, project, reviewedGrants: [], failOnWarnings: false });
}

function legacyFiles(example: GateExample): Readonly<Record<string, string>> {
  return typeof example.files === "string" ? { [example.at ?? VERB]: example.files } : example.files;
}

function withNeutralCarveControl(policy: GatePolicy, files: Readonly<Record<string, string>>): Readonly<Record<string, string>> {
  return policy.id === "verb-naming" && Object.keys(files).every((path) => path.endsWith("/verbs/index.ts"))
    ? { ...files, [VERB]: "export const createStartChat = () => undefined;\n" }
    : files;
}

function findingIdentities(findings: readonly { readonly file: string; readonly message?: string }[], fallback: string): readonly string[] {
  return findings.map((finding) => `${finding.file}:${finding.message ?? fallback}`).toSorted();
}

async function frozenLegacyGate(path: (typeof PATHS)[number], scratch: string): Promise<GateDescriptor> {
  const source = execFileSync("git", ["show", `${BASE}:${path}`], { encoding: "utf8" });
  const target = join(scratch, basename(path));
  const gateContract = pathToFileURL(join(process.cwd(), "tooling/src/verify/contract/gate.ts")).href;
  const astRead = pathToFileURL(join(process.cwd(), "tooling/src/verify/lib/ast-read.ts")).href;
  writeFileSync(
    target,
    source
      .replace('from "../contract/gate.ts"', `from ${JSON.stringify(gateContract)}`)
      .replace('from "../lib/ast-read.ts"', `from ${JSON.stringify(astRead)}`),
  );
  return ((await import(`${pathToFileURL(target).href}?frozen=${basename(path)}`)) as { readonly gate: GateDescriptor }).gate;
}

test("the converted server file-hook policies pass the final production proof runtime", () => {
  expect(verifyPolicyProofs([typesInContract, verbNaming])).toEqual([]);
});

test("the final policies match frozen legacy findings on every original proof corpus without tool errors", async ({ scratch }) => {
  for (const [path, policy] of [
    [PATHS[0], typesInContract],
    [PATHS[1], verbNaming],
  ] as const) {
    const legacy = await frozenLegacyGate(path, scratch);
    for (const example of [...legacy.mustFlag, ...legacy.mustPass]) {
      const files = withNeutralCarveControl(policy, legacyFiles(example));
      const project = projectOf(files);
      const old = runPass([legacy], {
        root: ROOT,
        project,
        scope: { kind: "project" },
        files: project.getSourceFiles(),
        checker: () => project.getTypeChecker(),
      });
      const current = finalVerdict(policy, files);
      expect(old.toolErrors, `${policy.id}: legacy ${example.why}`).toEqual([]);
      expect(current.toolErrors, `${policy.id}: final ${example.why}`).toEqual([]);
      expect(findingIdentities(current.authority.effectiveFindings, policy.message), `${policy.id}: ${example.why}`).toEqual(
        findingIdentities(old.gates[0]?.findings ?? [], legacy.message),
      );
    }
  }
});

test.each([
  ["a type-only expected-name export", "export type createStartChat = () => void;\n", 1],
  ["a non-callable expected-name constant", "export const createStartChat = 1;\n", 1],
  ["a callable annotation over a non-callable initializer", "export const createStartChat: () => void = 1 as never;\n", 1],
  ["an exported function declaration", "export function createStartChat() { return () => undefined; }\n", 0],
  ["an exported arrow function", "export const createStartChat = () => () => undefined;\n", 0],
  [
    "an exported alias of a callable runtime value",
    "function buildStartChat() { return () => undefined; }\nexport const createStartChat = buildStartChat;\n",
    0,
  ],
] as const)("verb naming preserves %s", (_label, source, findings) => {
  const result = finalVerdict(verbNaming, { [VERB]: source });
  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toHaveLength(findings);
});
