import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { Node } from "ts-morph";
import { vi } from "vitest";
import { execFixtureGit } from "../../../../tooling/src/floor/git/git-fixture.ts";
import { gate as clock } from "../../../../tooling/src/verify/gates/no-raw-clock.ts";
import { gate as random } from "../../../../tooling/src/verify/gates/no-raw-random.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { nativeTypeFactOptions, nativeTypeFactSession, projectCtx } from "../../../../tooling/src/verify/lib/project-context.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { runScopedCli } from "../../../../tooling/src/verify/ops/scoped.ts";
import { runStructure } from "../../../../tooling/src/verify/ops/structure.ts";
import { scaledBudget } from "../../_load-budget.ts";

const NODE_SOURCE = "packages/server/src/domain/feature/ambient.ts";
const BROWSER_SOURCE = "packages/client/src/ambient.ts";
const SHADOW_SOURCE = "packages/server/src/domain/feature/shadow.ts";
const SOURCE = `import {NOW,RANDOM} from '#keys';
const D=Date; const CTOR=D;
export const stamp=Date[NOW]();
export const draw=Math[RANDOM]();
export const date=new CTOR();
`;

function fixture(root: string, repoRoot: string): void {
  const write = (path: string, text: string): void => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  write(".gitignore", "node_modules\n.cache\nreports\n");
  symlinkSync(join(repoRoot, "node_modules"), join(root, "node_modules"), "dir");
  const compilerOptions = { target: "ES2022", module: "ESNext", moduleResolution: "Bundler", strict: true, skipLibCheck: true };
  write(
    "tsconfig.json",
    JSON.stringify({
      compilerOptions: { ...compilerOptions, lib: ["es2022"], types: ["node"] },
      files: [NODE_SOURCE, SHADOW_SOURCE, "augment.d.ts", "node.ts", "browser.ts"],
    }),
  );
  write(
    "packages/client/tsconfig.json",
    JSON.stringify({ compilerOptions: { ...compilerOptions, lib: ["es2022", "dom"], types: [], customConditions: ["browser"] }, files: ["src/ambient.ts"] }),
  );
  write(
    "package.json",
    JSON.stringify({ name: "native-global-fixture", type: "module", imports: { "#keys": { browser: "./browser.ts", default: "./node.ts" } } }),
  );
  write("node.ts", "export const NOW='now'; export const RANDOM='random';");
  write("browser.ts", "export const NOW='absent'; export const RANDOM='absent';");
  write(NODE_SOURCE, SOURCE);
  write(
    SHADOW_SOURCE,
    "const Math={random:()=>0}; class Date {static now():number{return 0;}} export const stamp=Date.now();export const draw=Math.random();export const date=new Date();",
  );
  write("augment.d.ts", "export {}; declare global { interface Math { inspectionOnly: boolean; } }");
  write(BROWSER_SOURCE, SOURCE.replace("export const date=new CTOR();", "export const date=new CTOR(0);"));
  write("tooling/tsconfig.json", JSON.stringify({ compilerOptions, files: [clock, random].map(({ id }) => `src/verify/gates/${id}.ts`) }));
  for (const { id } of [clock, random]) {
    write(
      `tooling/src/verify/gates/${id}.ts`,
      `export {gate} from ${JSON.stringify(pathToFileURL(join(repoRoot, `tooling/src/verify/gates/${id}.ts`)).href)};`,
    );
  }
  execFixtureGit(root, ["init", "-q"]);
}

test(
  "ambient command doors use closed native global and binding evidence without syntax Type or Symbol reads",
  async ({ scratch, repoRoot }) => {
    fixture(scratch, repoRoot);
    const contexts = await import("../../../../tooling/src/verify/lib/project-context.ts");
    const context = projectCtx(scratch);
    const getContext = vi.spyOn(contexts, "projectCtx").mockReturnValue(context);
    const symbolFor = Node.prototype.getSymbol;
    const typeFor = Node.prototype.getType;
    const symbols = vi.spyOn(Node.prototype, "getSymbol").mockImplementation(function (this: Node) {
      if (this.getProject() === context.project) {
        throw new Error("syntax ambient Symbol read");
      }
      return symbolFor.call(this);
    });
    const types = vi.spyOn(Node.prototype, "getType").mockImplementation(function (this: Node) {
      if (this.getProject() === context.project) {
        throw new Error("syntax ambient Type read");
      }
      return typeFor.call(this);
    });
    try {
      const exits = [
        await runStructure(scratch, ["--check=no-raw-clock"]),
        await runStructure(scratch, ["--check=no-raw-random"]),
        await runScopedCli(scratch, ["--scope", "packages,tooling"]),
      ];
      expect(exits).toEqual([1, 1, 1]);
      const result = runPolicyPass({
        root: scratch,
        project: context.project,
        ...nativeTypeFactOptions(context),
        knownPolicies: [clock, random],
        policies: [clock, random],
        reviewedGrants: [],
        failOnWarnings: false,
      });
      expect(result.toolErrors).toEqual([]);
      expect(
        result.policies.map(({ id, findings }) => ({ id, findings: findings.map(({ file, subject, operation }) => ({ file, subject, operation })) })),
      ).toEqual([
        { id: clock.id, findings: [{ file: NODE_SOURCE, subject: NODE_SOURCE, operation: "ambient-clock-read" }] },
        { id: random.id, findings: [{ file: NODE_SOURCE, subject: NODE_SOURCE, operation: "ambient-entropy-draw" }] },
      ]);
      const grants = [
        {
          id: "native-clock",
          policyId: clock.id,
          subject: NODE_SOURCE,
          operation: "ambient-clock-read",
          why: "native grant identity control",
          endsWhen: "fixture is removed",
        },
        {
          id: "native-random",
          policyId: random.id,
          subject: NODE_SOURCE,
          operation: "ambient-entropy-draw",
          why: "native grant identity control",
          endsWhen: "fixture is removed",
        },
      ];
      const granted = runPolicyPass({
        root: scratch,
        project: context.project,
        ...nativeTypeFactOptions(context),
        knownPolicies: [clock, random],
        policies: [clock, random],
        reviewedGrants: grants,
        failOnWarnings: false,
      });
      expect(granted.toolErrors).toEqual([]);
      expect(granted.authority.grantedFindings).toHaveLength(2);
      expect(granted.authority.effectiveFindings).toEqual([]);
      expect(granted.authority.authorityAlarms).toEqual([]);
      const mismatched = runPolicyPass({
        root: scratch,
        project: context.project,
        ...nativeTypeFactOptions(context),
        knownPolicies: [clock, random],
        policies: [clock, random],
        reviewedGrants: grants.map((grant) => (grant.policyId === clock.id ? { ...grant, operation: "foreign-operation" } : grant)),
        failOnWarnings: false,
      });
      expect(mismatched.toolErrors).toEqual([]);
      expect(mismatched.authority.grantedFindings).toHaveLength(1);
      expect(mismatched.authority.effectiveFindings).toHaveLength(1);
      expect(mismatched.authority.authorityAlarms).toHaveLength(1);
    } finally {
      getContext.mockRestore();
      symbols.mockRestore();
      types.mockRestore();
    }
  },
  scaledBudget(60_000),
);

test(
  "native ambient adapters preserve the complete declared clock and entropy policies",
  () => {
    expect(verifyPolicyProofs([clock, random])).toEqual([]);
  },
  scaledBudget(60_000),
);

test(
  "ambient missing services and failed native acquisition withhold actual command judgments",
  async ({ scratch, repoRoot }) => {
    fixture(scratch, repoRoot);
    const contexts = await import("../../../../tooling/src/verify/lib/project-context.ts");
    const context = projectCtx(scratch);
    const missing = runPolicyPass({
      root: scratch,
      project: context.project,
      knownPolicies: [clock, random],
      policies: [clock, random],
      reviewedGrants: [],
      failOnWarnings: false,
    });
    expect(missing.toolErrors).toHaveLength(2);
    expect(missing.policies.every(({ findings }) => findings.length === 0)).toBe(true);
    const acquire = vi.fn((): never => {
      throw new Error("failed native ambient acquisition");
    });
    const getContext = vi.spyOn(contexts, "projectCtx").mockReturnValue({ ...context, nativeTypeFacts: () => nativeTypeFactSession(acquire) });
    try {
      expect(await runStructure(scratch, ["--check=no-raw-clock"])).toBe(2);
      expect(await runStructure(scratch, ["--check=no-raw-random"])).toBe(2);
      expect(await runScopedCli(scratch, ["--scope", "packages,tooling"])).toBe(2);
      expect(acquire).toHaveBeenCalledTimes(3);
    } finally {
      getContext.mockRestore();
    }
  },
  scaledBudget(60_000),
);
