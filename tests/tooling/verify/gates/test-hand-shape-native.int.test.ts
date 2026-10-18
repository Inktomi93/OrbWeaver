import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { Node } from "ts-morph";
import { vi } from "vitest";
import { execFixtureGit } from "../../../../tooling/src/floor/git/git-fixture.ts";
import { gate } from "../../../../tooling/src/verify/gates/test-hand-shape.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { nativeTypeFactOptions, projectCtx } from "../../../../tooling/src/verify/lib/project-context.ts";
import { scaledBudget } from "../../_load-budget.ts";
import { nativeInventoryFixture } from "../../floor/compiler/native-inventory-fixture.ts";
import { nativeVerifyFixture } from "../../floor/compiler/native-verify-fixture.ts";

function fixture(root: string, repoRoot: string, browser: boolean): void {
  const put = (path: string, text: string): void => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  put(".gitignore", "node_modules\n.cache\nreports\n");
  symlinkSync(join(repoRoot, "node_modules"), join(root, "node_modules"), "dir");
  put(
    "package.json",
    JSON.stringify({
      type: "module",
      imports: { "#owner": { browser: "./packages/contracts/src/browser.ts", default: "./packages/contracts/src/native.ts" } },
    }),
  );
  for (const world of ["browser", "native"]) {
    put(
      `packages/contracts/src/${world}.ts`,
      `import {z} from "zod"; export const schema=z.object({value:z.string()}); export type ${world === "browser" ? "BrowserOwner" : "NativeOwner"}=z.infer<typeof schema>; export type { ${world === "browser" ? "BrowserOwner" : "NativeOwner"} as Owner };`,
    );
  }
  put(
    "tests/support/node/shape.ts",
    `
import type { Owner as Output } from "#owner";
import { schema } from "#owner";
import type { z } from "zod";
interface Hand { value: string }
interface Options { value: string }
interface Derived extends Output {}
type Picked = Pick<Output, "value">;
type Inferred = z.infer<typeof schema>;
type Indexed = {owner:Output}["owner"];
declare const hand: Hand;
declare const derived: Derived;
declare const picked: Picked;
declare const inferred: Inferred;
declare const indexed: Indexed;
export const seen: Output = hand;
export const first: Output = derived;
export const second: Output = picked;
export const third: Output = inferred;
export const fourth: Output = indexed;
`,
  );
  const options = {
    strict: true,
    skipLibCheck: true,
    target: "ES2022",
    module: "ESNext",
    moduleResolution: "Bundler",
    types: [],
    ...(browser ? { customConditions: ["browser"] } : {}),
  };
  put("tsconfig.json", JSON.stringify({ compilerOptions: options, files: ["tests/support/node/shape.ts"] }));
  put("packages/contracts/tsconfig.json", JSON.stringify({ compilerOptions: options, files: ["src/native.ts", "src/browser.ts"] }));
  put("tooling/tsconfig.json", JSON.stringify({ compilerOptions: options, files: ["src/verify/gates/test-hand-shape.ts"] }));
  put(
    "tooling/src/verify/gates/test-hand-shape.ts",
    `export {gate} from ${JSON.stringify(new URL("../../../../tooling/src/verify/gates/test-hand-shape.ts", import.meta.url).href)};`,
  );
  execFixtureGit(root, ["init", "-q"]);
}

test(
  "native boundary ownership preserves importing-world aliases and installed derives without reading syntax-carrier types",
  async ({ scratch, repoRoot }) => {
    const inventoryModule = await import("../../../../tooling/src/floor/code-facts/semantic-inventory.ts");
    const producer = vi.spyOn(inventoryModule, "createSemanticInventory").mockImplementation(nativeInventoryFixture);
    try {
      for (const browser of [false, true]) {
        const root = join(scratch, browser ? "browser" : "native");
        fixture(root, repoRoot, browser);
        const syntaxReads: number[] = [];
        expect(await nativeVerifyFixture(root, "structure", ["--check=test-hand-shape"], { forbidSyntax: true, syntaxReads })).toBe(1);
        expect(syntaxReads).toEqual([0]);
        const context = projectCtx(root);
        const original = Node.prototype.getType;
        const poison = vi.spyOn(Node.prototype, "getType").mockImplementation(function (this: Node) {
          if (this.getProject() === context.project) {
            throw new Error("syntax carrier type read");
          }
          return original.call(this);
        });
        try {
          const result = runPolicyPass({
            root,
            project: context.project,
            ...nativeTypeFactOptions(context),
            policies: [gate],
            knownPolicies: [gate],
            reviewedGrants: [],
            failOnWarnings: false,
          });
          expect(result.toolErrors).toEqual([]);
          expect(result.factErrors).toEqual([]);
          expect(result.policies[0]?.findings).toMatchObject([
            {
              token: "Hand",
              operation: `boundary:Hand=packages/contracts/src/${browser ? "browser" : "native"}.ts#${browser ? "BrowserOwner" : "NativeOwner"}`,
            },
          ]);
          expect(result.policies[0]?.findings).toHaveLength(1);
        } finally {
          poison.mockRestore();
        }
      }
    } finally {
      producer.mockRestore();
    }
  },
  scaledBudget(120_000),
);
