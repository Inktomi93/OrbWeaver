import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { Project } from "ts-morph";
import type { GateDescriptor, GateExample } from "../../../../tooling/src/verify/contract/gate.ts";
import { gate } from "../../../../tooling/src/verify/gates/ui-size-via-variant.ts";
import { runPass } from "../../../../tooling/src/verify/lib/pass.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ROOT = "/ui-size-conversion";
const SUBJECT = "packages/client/src/features/character/components/character-library-toolbar.tsx";
function drive(files: Readonly<Record<string, string>>): ReturnType<typeof runPolicyPass> {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, source);
  }
  const result = runPolicyPass({ knownPolicies: [gate], policies: [gate], project, root: ROOT, reviewedGrants: [], failOnWarnings: false });
  expect(result.toolErrors).toEqual([]);
  expect(result.factErrors).toEqual([]);
  return result;
}

test("carries every legacy size and layout predicate through production conformance", () => {
  expect(verifyPolicyProofs([gate])).toEqual([]);
});

test("former file permission binds one occurrence and cannot license another size", () => {
  const result = drive({
    [SUBJECT]:
      'import { Select } from "@orb/ui/select";\n// @orb-waive ui-size-via-variant(w-auto): content-sized Select.\nexport const x = <Select className="w-auto h-9" />;',
  });
  expect(result.authority.waivedFindings.map((f) => f.finding.token)).toEqual(["w-auto"]);
  expect(result.authority.effectiveFindings.map((f) => f.token)).toEqual(["h-9"]);
  expect(result.authority.authorityAlarms).toEqual([]);
  const wrong = drive({
    [SUBJECT]:
      'import { Select } from "@orb/ui/select";\n// @orb-waive ui-size-via-variant(w): wrong coordinate.\nexport const x = <Select className="w-auto" />;',
  });
  expect(wrong.authority.waivedFindings).toEqual([]);
  expect(wrong.authority.effectiveFindings).toHaveLength(1);
  expect(wrong.authority.authorityAlarms.length).toBeGreaterThan(0);
  const stale = drive({
    [SUBJECT]:
      'import { Select } from "@orb/ui/select";\n// @orb-waive ui-size-via-variant(w-auto): former content-width permission.\nexport const x = <Select className="w-full" />;',
  });
  expect(stale.authority.effectiveFindings).toEqual([]);
  expect(stale.authority.authorityAlarms.length).toBeGreaterThan(0);
});

test("named aliases are scanned while namespace and computed-carrier limits remain explicit", () => {
  const result = drive({
    [SUBJECT]:
      'import { Button as Action } from "@orb/ui/button";\nimport * as UI from "@orb/ui/button";\nconst cn = (...x: string[]) => x.join(" ");\nexport const x = <><Action className="h-9" /><UI.Button className="h-9" /><Action className={cn("h-9")} /><Action className="w-(--custom) max-h-9 min-w-9" /></>;',
  });
  expect(result.authority.effectiveFindings.map((f) => f.token)).toEqual(["h-9"]);
  const outside = drive({
    [SUBJECT]: "export const clean = true;",
    "packages/server/src/example.tsx": 'import { Button } from "@orb/ui/button"; export const x = <Button className="h-9" />;',
  });
  expect(outside.authority.effectiveFindings).toEqual([]);
  const next = drive({ [SUBJECT]: 'const Action = () => null; export const x = <Action className="h-9" />;' });
  expect(next.authority.effectiveFindings).toEqual([]);
});

test("both product permissions still bind and product files gain no blanket permission", () => {
  const files = {
    [SUBJECT]: readFileSync(new URL("../../../../packages/client/src/features/character/components/character-library-toolbar.tsx", import.meta.url), "utf8"),
    "packages/client/src/features/config/components/config-collection-landing.tsx": readFileSync(
      new URL("../../../../packages/client/src/features/config/components/config-collection-landing.tsx", import.meta.url),
      "utf8",
    ),
  };
  const result = drive(files);
  expect(result.authority.effectiveFindings).toEqual([]);
  expect(result.authority.waivedFindings).toHaveLength(2);
  expect(result.authority.authorityAlarms.filter((a) => a.policyId === gate.id)).toEqual([]);
  const unmarked = Object.fromEntries(Object.entries(files).map(([path, source]) => [path, source.replace(/^.*@orb-waive ui-size-via-variant.*$/gmu, "")]));
  expect(drive(unmarked).authority.effectiveFindings.map((f) => f.token)).toEqual(["w-auto", "w-auto"]);
});

test("all 18 frozen parent rows preserve occurrence identity or explicitly retire local-table staleness", async ({ scratch }) => {
  const source = execFileSync("git", ["show", "da943afb32c19f38cb76a6b3fd005e260eb5adf3:tooling/src/verify/gates/ui-size-via-variant.ts"], {
    encoding: "utf8",
  });
  let rewritten = source;
  for (const relative of ["../contract/gate.ts", "../lib/pass.ts", "../lib/tailwind-class-token.ts"]) {
    rewritten = rewritten.replace(
      `from "${relative}"`,
      `from ${JSON.stringify(pathToFileURL(join(process.cwd(), "tooling/src/verify/gates", relative)).href)}`,
    );
  }
  const target = join(scratch, "legacy-ui-size.ts");
  writeFileSync(target, rewritten);
  const legacy = ((await import(pathToFileURL(target).href)) as { gate: GateDescriptor }).gate;
  expect([legacy.mustFlag.length, legacy.mustPass.length]).toEqual([10, 8]);
  for (const arm of ["mustFlag", "mustPass"] as const) {
    for (const [index, example] of legacy[arm].entries()) {
      verifySizeRow(legacy, arm, index, example);
    }
  }
});

function verifySizeRow(legacy: GateDescriptor, arm: "mustFlag" | "mustPass", index: number, example: GateExample): void {
  const files = typeof example.files === "string" ? { [example.at ?? "packages/client/src/x.tsx"]: example.files } : example.files;
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
  const retired = arm === "mustFlag" && index === 9;
  const expectedFlagCount = index === 2 || retired ? 2 : 1;
  expect(findings, example.why).toHaveLength(arm === "mustPass" ? 0 : expectedFlagCount);
  // The sole removed row checked a private allowlist. Existing family controls above exercise
  // its successor: central stale/wrong-coordinate rejection against actual marked source.
  expect(
    findings.filter((finding) => finding.message?.startsWith("ALLOWLIST entry has NO scoped size utility")),
    example.why,
  ).toHaveLength(retired ? 2 : 0);
  const expected = (retired ? [] : findings).map(({ file, line, column, token }) => ({
    file,
    line,
    column,
    token,
    policyId: "ui-size-via-variant",
    message: "sizes come from variants — a call-site sizing utility overrides the primitive's sealed box; add a size/layout variant to the primitive instead.",
  }));
  expect(
    after.authority.effectiveFindings.map(({ file, line, column, token, policyId, message }) => ({
      file,
      line,
      column,
      token,
      policyId,
      message: message ?? gate.message,
    })),
    example.why,
  ).toEqual(expected);
}
