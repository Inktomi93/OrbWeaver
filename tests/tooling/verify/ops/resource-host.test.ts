import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { Project } from "ts-morph";
import type { ResourceHost } from "../../../../tooling/src/verify/contract/resource-host.ts";
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
