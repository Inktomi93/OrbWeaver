import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { Project } from "ts-morph";
import { defineGate } from "../../../../tooling/src/verify/contract/policy.ts";
import type { ResourceHost } from "../../../../tooling/src/verify/contract/resource-host.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { createResourceHost } from "../../../../tooling/src/verify/ops/resource-host.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

test("the host has closed resource doors and acquires only requested facts", ({ scratch }) => {
  type Forbidden = Extract<keyof ResourceHost, "read" | "tree" | "root" | "project" | "glob" | "parseSource">;
  const closed: Forbidden extends never ? true : false = true;
  const invocation = createResourceHost({ root: scratch });
  expect(closed).toBe(true);
  expect(invocation.receipts()).toEqual([]);
  expect(Object.keys(invocation.host).sort()).toEqual([
    "authoredCss",
    "authoredTree",
    "cssInventory",
    "nativeConfig",
    "packageMetadata",
    "productCss",
    "staticConfig",
    "trackedFiles",
  ]);
  const first = invocation.host.packageMetadata("root");
  expect(first.status).toBe("missing");
  expect(invocation.host.packageMetadata("root")).toBe(first);
  expect(invocation.receipts()).toEqual([first.receipt]);
  expect(Object.isFrozen(invocation.host)).toBe(true);
});

test("a missing acquired package does not throw while collecting ordinary waiver sources", ({ scratch }) => {
  const invocation = createResourceHost({ root: scratch });

  expect(invocation.host.packageMetadata("root").status).toBe("missing");
  expect(invocation.ordinaryWaiverSources()).toEqual([]);
});

test("package and tree facts share overlay contents and callers cannot mutate cached values", ({ scratch }) => {
  const content = JSON.stringify({ name: "@orb/ui", private: true, exports: { "./button": "./src/button.ts" } });
  const { host } = createResourceHost({ root: scratch, overlay: { "packages/ui/package.json": content } });
  const metadata = host.packageMetadata("ui");
  const tree = host.authoredTree("packages");
  expect(metadata.status).toBe("ready");
  expect(tree.status).toBe("ready");
  if (metadata.status !== "ready" || tree.status !== "ready") {
    throw new Error("fixture resource failed");
  }
  expect(metadata.value.exports).toEqual({ "./button": "./src/button.ts" });
  expect(tree.value.find((entry) => entry.path === "packages/ui/package.json")?.bytes).toBe(Buffer.byteLength(content));
  expect(Reflect.set(metadata.value.exports, "./unsafe", "x")).toBe(false);
  expect(Reflect.set(metadata.receipt, "members", 0)).toBe(false);
});

test("static parsing is lazy and repeated requests parse once while a new host re-reads", ({ scratch }) => {
  writeFileSync(join(scratch, "eslint.config.js"), "export default [{files:['first.ts']}];");
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { allowJs: true } });
  let parses = 0;
  const { host } = createResourceHost({
    root: scratch,
    parseSource: (path, text) => {
      parses += 1;
      return project.createSourceFile(join(scratch, path), text);
    },
  });
  expect(parses).toBe(0);
  const first = host.staticConfig("eslint");
  expect(first.status).toBe("ready");
  writeFileSync(join(scratch, "eslint.config.js"), "export default [{files:['second.ts']}];");
  expect(host.staticConfig("eslint")).toBe(first);
  expect(parses).toBe(1);
  expect(createResourceHost({ root: scratch }).host.staticConfig("eslint")).toMatchObject({ status: "ready", value: { rows: [{ value: "second.ts" }] } });
});

test("provider exceptions are cached unresolved facts with acquisition receipts", ({ scratch }) => {
  const invocation = createResourceHost({
    root: scratch,
    overlay: { "eslint.config.js": "export default [{files:['x.ts']}];" },
    parseSource: () => {
      throw new Error("parser unavailable");
    },
  });
  const fact = invocation.host.staticConfig("eslint");
  expect(fact).toMatchObject({ status: "unresolved", reason: expect.stringContaining("parser unavailable") });
  expect(invocation.host.staticConfig("eslint")).toBe(fact);
  expect(invocation.receipts()).toHaveLength(1);
});

test("an injected parser cannot substitute a same-suffix source from another root", ({ scratch }) => {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { allowJs: true } });
  const invocation = createResourceHost({
    root: scratch,
    overlay: { "eslint.config.js": "export default [{files:['x.ts']}];" },
    parseSource: (path, text) => project.createSourceFile(`/outside/${path}`, text),
  });
  expect(invocation.host.staticConfig("eslint")).toMatchObject({ status: "unresolved", reason: expect.stringContaining("exact invocation identity") });
});

test("native configuration observes the host overlay and caches its exact transaction receipt", ({ scratch }) => {
  writeFileSync(join(scratch, "vitest.config.ts"), 'import { ROWS } from "./rows.js"; export default { test: { include: ROWS } };');
  writeFileSync(join(scratch, "rows.js"), 'export const ROWS = ["tests/disk.test.ts"];');
  execFileSync("git", ["init", "-q"], { cwd: scratch });
  execFileSync("git", ["add", "-A"], { cwd: scratch });
  const overlay = { "rows.js": 'export const ROWS = ["tests/overlay.test.ts"];' };
  const invocation = createResourceHost({ root: scratch, overlay });
  overlay["rows.js"] = 'export const ROWS = ["tests/wrong.test.ts"];';
  const first = invocation.host.nativeConfig("vitest");
  expect(first).toMatchObject({
    status: "ready",
    value: { runner: "vitest", selectors: expect.arrayContaining([{ owner: "root", field: "test.include", values: ["tests/overlay.test.ts"] }]) },
  });
  expect(first.paths).toEqual(["rows.js", "vitest.config.ts"]);
  expect(invocation.host.nativeConfig("vitest")).toBe(first);
  expect(invocation.receipts()).toEqual([first.receipt]);
  expect(createResourceHost({ root: scratch }).host.nativeConfig("vitest")).toMatchObject({
    status: "ready",
    value: { selectors: expect.arrayContaining([{ owner: "root", field: "test.include", values: ["tests/disk.test.ts"] }]) },
  });
});

test("declared native configuration is consumed through the production dispatcher", ({ scratch }) => {
  const config = 'export default { test: { include: ["tests/live.test.ts"] } };';
  writeFileSync(join(scratch, "vitest.config.ts"), config);
  execFileSync("git", ["init", "-q"], { cwd: scratch });
  execFileSync("git", ["add", "-A"], { cwd: scratch });
  let observed = false;
  const gate = defineGate({
    id: "native-config-proof",
    family: "native-config-proof",
    authority: "hard",
    severity: "error",
    population: { of: "none", why: "configuration resources own this policy population" },
    analysis: "resource",
    execution: "entire-population",
    facts: [],
    resources: [{ kind: "native-config", id: "vitest" }],
    message: "fixture selector",
    mustFlag: [{ mode: "resource", files: { "vitest.config.ts": config.replace("live", "forbidden") }, why: "the forbidden selector is observable" }],
    mustPass: [{ mode: "resource", files: { "vitest.config.ts": config }, why: "the live selector is permitted" }],
    create: (context) => ({
      evaluate: () => {
        const fact = context.resources.nativeConfig("vitest");
        observed = fact.status === "ready" && fact.value.selectors.some((row) => row.values.includes("tests/live.test.ts"));
        if (fact.status === "ready" && fact.value.selectors.some((row) => row.values.includes("tests/forbidden.test.ts"))) {
          context.report.file("vitest.config.ts");
        }
      },
    }),
  });
  const input = {
    root: scratch,
    project: new Project({ useInMemoryFileSystem: true }),
    knownPolicies: [gate],
    policies: [gate],
    reviewedGrants: [],
    failOnWarnings: false,
  };
  const result = runPolicyPass(input);
  expect(observed).toBe(true);
  expect(result.toolErrors).toEqual([]);
  expect(result.policies[0]?.owner).toMatchObject({ status: "success", population: "complete" });
  expect(result.policies[0]?.receipts).toContainEqual({ kind: "resource", source: "native-config:vitest", resources: expect.any(Number), unresolved: 0 });
  const rejected = runPolicyPass({ ...input, resourceOptions: { overlay: { "vitest.config.ts": config.replace("live", "forbidden") } } });
  expect(rejected.toolErrors).toEqual([]);
  expect(rejected.authority.verdict.errors).toBe(1);
});

test("native resource failures stay explicit and do not execute another config family", ({ scratch }) => {
  const missing = createResourceHost({ root: scratch }).host.nativeConfig("vitest");
  expect(missing.status).toBe("missing");
  writeFileSync(join(scratch, "vitest.config.ts"), "");
  expect(createResourceHost({ root: scratch }).host.nativeConfig("vitest").status).toBe("empty");
  expect(createResourceHost({ root: scratch }).host.nativeConfig("ct" as never).status).toBe("unresolved");
});
