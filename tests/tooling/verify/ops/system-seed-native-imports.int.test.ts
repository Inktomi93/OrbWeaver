import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, plantFile, test } from "@orb/testkit/node/tool-fixtures.ts";
import { runNicedSync } from "@orb/tooling/floor/process/proc";
import type { ICruiseResult } from "dependency-cruiser";

const RULES = ["system-theme-writes-boot-only", "system-preset-writes-boot-only", "system-seed-writes-no-forwarding"] as const;
const OWNERS = [
  { domain: "settings", root: "seed-themes", query: "system-themes", rule: RULES[0] },
  { domain: "preset", root: "seed", query: "system-default", rule: RULES[1] },
] as const;
const FORMS = ["named", "namespace", "default", "dynamic", "type", "forward"] as const;

function cruise(repoRoot: string, scratch: string, omitted = ""): ICruiseResult {
  const config = plantFile(
    scratch,
    "selected.cjs",
    `const actual = require(${JSON.stringify(join(repoRoot, ".dependency-cruiser.cjs"))});
module.exports = { ...actual, extends: [], required: [], forbidden: actual.forbidden.filter(({ name }) => ${JSON.stringify(RULES)}.includes(name) && name !== ${JSON.stringify(omitted)}) };
`,
  );
  const result = runNicedSync(join(repoRoot, "node_modules/.bin/depcruise"), ["packages/server/src", "--config", config, "--output-type", "json"], {
    cwd: scratch,
  });
  const parsed = JSON.parse(result.stdout) as ICruiseResult;
  expect(result.status, result.stderr).toBe(0);
  return parsed;
}

test("actual selected native seed rules reject resolved import forms, admit boot owners and lose their own findings under each cut", ({
  repoRoot,
  scratch,
}) => {
  plantFile(scratch, "packages/server/package.json", readFileSync(join(repoRoot, "packages/server/package.json"), "utf8"));
  for (const { domain, root, query } of OWNERS) {
    const home = `packages/server/src/domain/${domain}`;
    plantFile(scratch, `${home}/persistence/${query}.ts`, "export const write = () => 1; export default write;\n");
    plantFile(scratch, `${home}/${root}.ts`, `import { write } from "./persistence/${query}.ts"; export function seed() { return write(); }\n`);
    const target = `../persistence/${query}.ts`;
    const sources = {
      named: `import { write as alias } from "${target}"; export const stolen = alias;`,
      namespace: `import * as writes from "${target}"; export const stolen = writes.write;`,
      default: `import write from "${target}"; export const stolen = write;`,
      dynamic: `export const stolen = import("${target}");`,
      type: `import type { write } from "${target}"; export type Stolen = typeof write;`,
      forward: `export * from "${target}";`,
    };
    for (const form of FORMS) {
      plantFile(scratch, `${home}/verbs/${form}.ts`, sources[form]);
    }
  }
  const baseline = cruise(repoRoot, scratch);
  const verdict = runNicedSync(
    join(repoRoot, "node_modules/.bin/depcruise"),
    ["packages/server/src", "--config", join(scratch, "selected.cjs"), "--output-type", "err-long"],
    { cwd: scratch },
  );
  expect(baseline.summary.advisedExitCode).toBeGreaterThan(0);
  expect(verdict.status, verdict.stderr).toBe(baseline.summary.advisedExitCode);
  for (const rule of RULES) {
    expect(verdict.stdout).toContain(rule);
  }
  expect(baseline.modules.length).toBeGreaterThan(0);
  expect(new Set(baseline.summary.violations.map(({ rule }) => rule.name))).toEqual(new Set(RULES));
  for (const { domain, root, query, rule } of OWNERS) {
    const home = `packages/server/src/domain/${domain}`;
    expect(
      baseline.summary.violations
        .filter((violation) => violation.rule.name === rule)
        .map(({ from }) => from)
        .toSorted(),
    ).toEqual(FORMS.map((form) => `${home}/verbs/${form}.ts`).toSorted());
    expect(baseline.summary.violations.filter(({ from }) => from === `${home}/${root}.ts`)).toEqual([]);
    for (const form of FORMS) {
      const dependency = baseline.modules.find(({ source }) => source === `${home}/verbs/${form}.ts`)?.dependencies[0];
      expect(dependency).toMatchObject({ couldNotResolve: false, resolved: `${home}/persistence/${query}.ts` });
    }
  }
  // Isolate the export edge: depcruise can deduplicate a mixed import/re-export to the import facet.
  // The stock HARD root syntax suite owns mixed and locally forwarded bindings.
  plantFile(scratch, "packages/server/src/domain/preset/seed.ts", 'export { write } from "./persistence/system-default.ts";\n');
  const forwarded = cruise(repoRoot, scratch);
  expect(
    forwarded.summary.violations
      .filter(({ rule }) => rule.name === RULES[2])
      .map(({ from }) => from)
      .toSorted(),
  ).toEqual([
    "packages/server/src/domain/preset/seed.ts",
    "packages/server/src/domain/preset/verbs/forward.ts",
    "packages/server/src/domain/settings/verbs/forward.ts",
  ]);
  for (const omitted of RULES) {
    const cut = cruise(repoRoot, scratch, omitted);
    expect(cut.summary.violations).toEqual(forwarded.summary.violations.filter(({ rule }) => rule.name !== omitted));
  }
});
