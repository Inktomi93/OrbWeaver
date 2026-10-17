import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { z } from "zod";
import { execFixtureGit } from "../../../../tooling/src/floor/git/git-fixture.ts";
import { runNicedSync } from "../../../../tooling/src/floor/process/proc.ts";
import { gate } from "../../../../tooling/src/verify/gates/contract-structural-copy.ts";
import { gate as testHandShape } from "../../../../tooling/src/verify/gates/test-hand-shape.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { scaledBudget } from "../../_load-budget.ts";
import { nativeVerifyFixture } from "../../floor/compiler/native-verify-fixture.ts";

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
      `export {gate} from ${JSON.stringify(new URL("../../../../tooling/src/verify/gates/contract-structural-copy.ts", import.meta.url).href)};`,
    );
    write(
      "tooling/src/verify/gates/contract-derives-not-respells.ts",
      `export {gate} from ${JSON.stringify(new URL("../../../../tooling/src/verify/gates/contract-derives-not-respells.ts", import.meta.url).href)};`,
    );
    execFixtureGit(scratch, ["init", "-q"]);
    expect(await nativeVerifyFixture(scratch, "structure", ["--check=contract-structural-copy"], { forbidSyntax: true })).toBe(2);
    const entry = fileURLToPath(new URL("../../floor/compiler/native-shape-cases.ts", import.meta.url));
    const bootstrap = fileURLToPath(new URL("../../../../tooling/src/floor/compiler/semantic-inventory-runtime.ts", import.meta.url));
    const output = join(scratch, ".cache/native-shape-result.json");
    const completed = runNicedSync(process.execPath, ["--import", bootstrap, entry, "policy-ambiguous", scratch, output]);
    expect(completed.status, completed.stderr).toBe(0);
    const result = z
      .object({ toolErrors: z.array(z.object({ message: z.string() })), withheld: z.array(z.string()) })
      .parse(JSON.parse(readFileSync(output, "utf8")));
    expect(result.toolErrors.some(({ message }) => message.includes("native compiler programs disagree"))).toBe(true);
    expect(result.withheld).toContain(gate.id);
  },
  scaledBudget(60_000),
);

test("both migrated copy policies preserve every existing planted judgment and authority control", () => {
  expect(verifyPolicyProofs([gate, testHandShape])).toEqual([]);
});
