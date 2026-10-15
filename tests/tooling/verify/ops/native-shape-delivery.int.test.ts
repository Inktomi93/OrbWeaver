import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { execFixtureGit } from "../../../../tooling/src/floor/git/git-fixture.ts";
import { gate } from "../../../../tooling/src/verify/gates/contract-structural-copy.ts";
import { gate as testHandShape } from "../../../../tooling/src/verify/gates/test-hand-shape.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { nativeTypeFactOptions, projectCtx } from "../../../../tooling/src/verify/lib/project-context.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { runStructure } from "../../../../tooling/src/verify/ops/structure.ts";
import { scaledBudget } from "../../_load-budget.ts";

test(
  "copy delivery refuses opposing co-located worlds instead of selecting the syntax or primary checker",
  async ({ scratch, repoRoot }) => {
    const write = (path: string, text: string): void => {
      mkdirSync(dirname(join(scratch, path)), { recursive: true });
      writeFileSync(join(scratch, path), text);
    };
    write(".gitignore", "node_modules\n.cache\nreports\n");
    symlinkSync(join(repoRoot, "node_modules"), join(scratch, "node_modules"), "dir");
    const common = { strict: true, skipLibCheck: true, target: "ES2022", module: "ESNext", moduleResolution: "Bundler" };
    const node = { ...common, lib: ["es2022"], types: ["node"] };
    const contract = "packages/contracts/src/row.ts";
    const candidate = "packages/server/src/domain/chat/copy.ts";
    write(contract, "export interface Row {a:ReturnType<typeof setTimeout>;b:string;c:string;d:string}");
    write(
      candidate,
      "import type {Row} from '../../../../contracts/src/row'; type Keep=Row; interface Copy {a:number;b:string;c:string;d:string} export type Use=Copy|Keep;",
    );
    write("packages/contracts/tsconfig.json", JSON.stringify({ compilerOptions: node, files: ["src/row.ts"] }));
    write("packages/server/tsconfig.json", JSON.stringify({ compilerOptions: node, files: ["src/domain/chat/copy.ts"] }));
    write("tsconfig.tests-dom.json", JSON.stringify({ compilerOptions: { ...common, lib: ["es2022", "dom"], types: [] }, files: [contract, candidate] }));
    write(
      "tooling/tsconfig.json",
      JSON.stringify({ compilerOptions: node, files: ["src/verify/gates/contract-structural-copy.ts", "src/verify/gates/contract-derives-not-respells.ts"] }),
    );
    write(
      "tooling/src/verify/gates/contract-structural-copy.ts",
      `export {gate} from ${JSON.stringify(pathToFileURL(join(repoRoot, "tooling/src/verify/gates/contract-structural-copy.ts")).href)};`,
    );
    write(
      "tooling/src/verify/gates/contract-derives-not-respells.ts",
      `export {gate} from ${JSON.stringify(pathToFileURL(join(repoRoot, "tooling/src/verify/gates/contract-derives-not-respells.ts")).href)};`,
    );
    execFixtureGit(scratch, ["init", "-q"]);
    expect(await runStructure(scratch, ["--check=contract-structural-copy"])).toBe(2);
    const context = projectCtx(scratch);
    const result = runPolicyPass({
      root: scratch,
      project: context.project,
      ...nativeTypeFactOptions(context),
      policies: [gate],
      knownPolicies: [gate],
      reviewedGrants: [],
      failOnWarnings: false,
    });
    expect(result.toolErrors.some(({ message }) => message.includes("native compiler programs disagree"))).toBe(true);
    expect(result.authority.withheldPolicyIds).toContain(gate.id);
  },
  scaledBudget(60_000),
);

test("both migrated copy policies preserve every existing planted judgment and authority control", () => {
  expect(verifyPolicyProofs([gate, testHandShape])).toEqual([]);
});
