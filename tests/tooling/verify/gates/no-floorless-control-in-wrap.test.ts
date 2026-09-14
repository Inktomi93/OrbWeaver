import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { Project } from "ts-morph";
import type { GateDescriptor, GateExample } from "../../../../tooling/src/verify/contract/gate.ts";
import { gate as health } from "../../../../tooling/src/verify/gates/floorless-control-vocabulary-health.ts";
import { gate } from "../../../../tooling/src/verify/gates/no-floorless-control-in-wrap.ts";
import { runPass } from "../../../../tooling/src/verify/lib/pass.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ROOT = "/floorless-conversion";
const SUBJECT = "packages/client/src/features/rpg/components/rpg-pack-rows.tsx";
const WRAP = 'export const Grid = <Row className="flex-wrap">{xs.map(x => <Button size="glyph-lg" />)}</Row>;';
function drive(files: Readonly<Record<string, string>>, requestedPaths?: readonly string[]): ReturnType<typeof runPolicyPass> {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, source);
  }
  const result = runPolicyPass({
    knownPolicies: [gate, health],
    policies: [gate, health],
    project,
    root: ROOT,
    reviewedGrants: [],
    failOnWarnings: false,
    ...(requestedPaths === undefined ? {} : { requestedPaths }),
  });
  expect(result.toolErrors).toEqual([]);
  expect(result.factErrors).toEqual([]);
  return result;
}

test("preserves every legacy collision and vocabulary proof through the two authority owners", () => {
  expect(verifyPolicyProofs([gate, health])).toEqual([]);
});

test("exact geometry permission does not exempt another occurrence and goes stale when fixed", () => {
  const source = `// @orb-waive no-floorless-control-in-wrap(glyph-lg): measured spacing remedy.\n${WRAP}\nexport const second = <Row className="flex-wrap">{xs.map(x => <Button size="inline" />)}</Row>;`;
  const result = drive({ [SUBJECT]: source });
  expect(result.authority.waivedFindings.map((f) => f.finding.token)).toEqual(["glyph-lg"]);
  expect(result.authority.effectiveFindings.map((f) => f.token)).toEqual(["inline"]);
  const wrong = drive({ [SUBJECT]: `// @orb-waive no-floorless-control-in-wrap(glyph): wrong position.\n${WRAP}` });
  expect(wrong.authority.waivedFindings).toEqual([]);
  expect(wrong.authority.effectiveFindings).toHaveLength(1);
  expect(wrong.authority.authorityAlarms.length).toBeGreaterThan(0);
  const stale = drive({
    [SUBJECT]: `// @orb-waive no-floorless-control-in-wrap(glyph-lg): former spacing remedy.\n${WRAP.replace('size="glyph-lg"', 'size="sm"')}`,
  });
  expect(stale.authority.effectiveFindings).toEqual([]);
  expect(stale.authority.authorityAlarms.length).toBeGreaterThan(0);
});

test("shared whole-population evidence defers a narrowed run instead of claiming a clean verdict", () => {
  const files = { [SUBJECT]: WRAP, "packages/client/src/clean.ts": "export const clean = true;" };
  expect(drive(files).authority.effectiveFindings).toHaveLength(1);
  const scoped = drive(files, ["packages/client/src/clean.ts"]);
  expect(scoped.policies).toHaveLength(2);
  for (const policy of scoped.policies) {
    expect(policy.owner).toMatchObject({ status: "not-applicable", reason: "entire-population policy deferred for a proper subset selection" });
  }
});

test("the ruled product sites keep their geometry and only their exact occurrences are licensed", () => {
  const files = {
    [SUBJECT]: readFileSync(new URL("../../../../packages/client/src/features/rpg/components/rpg-pack-rows.tsx", import.meta.url), "utf8"),
    "packages/client/src/features/rpg/components/rpg-actor-trackers.tsx": readFileSync(
      new URL("../../../../packages/client/src/features/rpg/components/rpg-actor-trackers.tsx", import.meta.url),
      "utf8",
    ),
  };
  const result = drive(files);
  expect(result.authority.effectiveFindings).toEqual([]);
  expect(result.authority.waivedFindings).toHaveLength(2);
  expect(result.authority.authorityAlarms.filter((a) => a.policyId === gate.id)).toEqual([]);
  const raw = Object.fromEntries(Object.entries(files).map(([path, source]) => [path, source.replace(/^.*@orb-waive no-floorless-control-in-wrap.*$/gmu, "")]));
  expect(
    drive(raw)
      .authority.effectiveFindings.map((f) => f.token)
      .sort(),
  ).toEqual(["glyph-lg", "glyph-xs"]);
});

test("all 15 frozen floorless rows preserve occurrences or explicitly move health and stale authority", async ({ scratch }) => {
  const source = execFileSync("git", ["show", "cc4fdfc2aa2b058b004c84676e65fc90b9ad89cd:tooling/src/verify/gates/no-floorless-control-in-wrap.ts"], {
    encoding: "utf8",
  });
  let rewritten = source;
  for (const relative of ["../contract/gate.ts", "../lib/pass.ts", "../lib/comment-spans.ts"]) {
    rewritten = rewritten.replace(
      `from "${relative}"`,
      `from ${JSON.stringify(pathToFileURL(join(process.cwd(), "tooling/src/verify/gates", relative)).href)}`,
    );
  }
  const target = join(scratch, "legacy-floorless.ts");
  writeFileSync(target, rewritten);
  const legacy = ((await import(pathToFileURL(target).href)) as { gate: GateDescriptor }).gate;
  expect([legacy.mustFlag.length, legacy.mustPass.length]).toEqual([7, 8]);
  for (const arm of ["mustFlag", "mustPass"] as const) {
    for (const [index, example] of legacy[arm].entries()) {
      verifyFloorlessRow(legacy, arm, index, example);
    }
  }
});

function healthIdentities(index: number): { file: string; line: number; column: number; token: string; message: string; policyId: string }[] {
  const file = "packages/ui/src/primitives/button/variants.ts";
  const messages = [
    ...["inline", "glyph-xs", "glyph-sm", "glyph-md", "glyph-lg"].map(
      (key) => `Button size arm ${key} is no longer declared in ${file}; rederive the floorless vocabulary.`,
    ),
    `${file} no longer spells the touch-target overflow pseudo; rederive the floorless vocabulary.`,
  ];
  return messages.map((message) => ({ file, line: index === 3 ? 2 : 1, column: 1, token: "export", message, policyId: "floorless-control-vocabulary-health" }));
}

function verifyFloorlessRow(legacy: GateDescriptor, arm: "mustFlag" | "mustPass", index: number, example: GateExample): void {
  const original = typeof example.files === "string" ? { [example.at ?? "packages/client/src/x.tsx"]: example.files } : example.files;
  // The retired table's fixture was DB-only. Both runners receive the same inert admitted client file.
  const files = { ...original, "packages/client/src/__floorless_replay.ts": "export const replay = true;" };
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, content] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, content);
  }
  const before = runPass([legacy], {
    root: ROOT,
    project,
    scope: { kind: "project" },
    files: project.getSourceFiles(),
    checker: () => project.getTypeChecker(),
  });
  const after = drive(files);
  expect(before.toolErrors, example.why).toEqual([]);
  const findings = before.gates[0]?.findings ?? [];
  const expectedCount = arm === "mustFlag" ? [1, 2, 6, 6, 2, 1, 1][index] : 0;
  if (expectedCount === undefined) {
    throw new Error(`frozen floorless ${arm}[${index}] has no declared finding count`);
  }
  expect(findings, example.why).toHaveLength(expectedCount);
  const retired = arm === "mustFlag" && index === 4;
  const vocabulary = arm === "mustFlag" && (index === 2 || index === 3);
  expect(
    findings.filter((finding) => finding.message?.startsWith("JUDGMENT_DEFERRED row matching NO live violation") === true),
    example.why,
  ).toHaveLength(retired ? 2 : 0);
  // Ordinary wording and positions survive verbatim. Health deliberately moves from the legacy
  // self-file at 0:0 to the declaring source; local-table staleness is held by central-marker tests above.
  let expected = findings.map(({ file, line, column, token, message }) => ({
    file,
    line,
    column,
    token,
    message: message ?? legacy.message,
    policyId: "no-floorless-control-in-wrap",
  }));
  if (retired) {
    expected = [];
  }
  if (vocabulary) {
    expected = healthIdentities(index);
  }
  expect(
    after.authority.effectiveFindings
      .map(({ file, line, column, token, message, policyId }) => ({
        file,
        line,
        column,
        token,
        message: message ?? gate.message,
        policyId,
      }))
      .map((finding) => JSON.stringify(finding))
      .toSorted(),
    example.why,
  ).toEqual(expected.map((finding) => JSON.stringify(finding)).toSorted());
}
