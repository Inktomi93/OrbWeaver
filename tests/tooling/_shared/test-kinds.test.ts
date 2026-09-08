import {
  BROWSER_TEST_SUFFIXES,
  classifyTestFilename,
  looksLikeTestFilename,
  RUNTIME_TEST_SUFFIXES,
  runtimeForTestFamily,
  TEST_KIND_DEFINITIONS,
  TEST_KIND_SUFFIXES,
  TYPE_TEST_SUFFIXES,
} from "@orb/tooling/_shared/test-kinds";
import { expect, test } from "../../support/tool-fixtures.ts";

test("classifies overlapping suffixes by longest match and keeps the source basename", () => {
  expect(classifyTestFilename("drift.suite.int.test.ts")).toMatchObject({
    definition: { suffix: ".suite.int.test.ts", family: "integration", mirror: "suite" },
    sourceBasename: "drift",
  });
  expect(classifyTestFilename("shape.contract.test.ts")).toMatchObject({
    definition: { suffix: ".contract.test.ts", family: "contract", mirror: "module" },
    sourceBasename: "shape",
  });
  expect(classifyTestFilename("plain.int.test.ts")?.definition.suffix).toBe(".int.test.ts");
});

test("distinguishes DOM runtime and type kinds from their node-world twins", () => {
  expect(classifyTestFilename("view.dom.test.ts")?.definition).toMatchObject({ family: "unit", compilerWorld: "browser" });
  expect(classifyTestFilename("view.dom.test-d.ts")?.definition).toMatchObject({ family: "type", compilerWorld: "browser" });
  expect(classifyTestFilename("view.test.ts")?.definition).toMatchObject({ family: "unit", compilerWorld: "node" });
  expect(classifyTestFilename("view.test-d.ts")?.definition).toMatchObject({ family: "type", compilerWorld: "node" });
});

test("component mirrors accept TSX or TS sources and unknown suffixes stay unclassified", () => {
  expect(classifyTestFilename("button.ct.tsx")?.definition.sourceExtensions).toEqual([".tsx", ".ts"]);
  expect(classifyTestFilename("matrix.suite.ct.tsx")?.definition).toMatchObject({ mirror: "suite", compilerWorld: "browser" });
  expect(classifyTestFilename("button.browser.ts")).toBeUndefined();
  expect(classifyTestFilename("button.test.tsx")).toBeUndefined();
  expect(looksLikeTestFilename("button.test.tsx")).toBe(true);
  expect(looksLikeTestFilename("button.ct-d.ts")).toBe(true);
  expect(looksLikeTestFilename("button.fixtures.tsx")).toBe(false);
});

test("derived selectors and runtime dispatch cover the registry without duplicate suffixes", () => {
  expect(new Set(TEST_KIND_SUFFIXES).size).toBe(TEST_KIND_DEFINITIONS.length);
  expect(TEST_KIND_DEFINITIONS.map(({ suffix }) => suffix.length)).toEqual(
    TEST_KIND_DEFINITIONS.map(({ suffix }) => suffix.length).toSorted((left, right) => right - left),
  );
  expect(TYPE_TEST_SUFFIXES).toContain(".test-d.ts");
  expect(TYPE_TEST_SUFFIXES).toContain(".dom.test-d.ts");
  expect(TYPE_TEST_SUFFIXES.every((suffix) => !RUNTIME_TEST_SUFFIXES.includes(suffix))).toBe(true);
  expect(BROWSER_TEST_SUFFIXES).toEqual(expect.arrayContaining([".dom.test.ts", ".dom.test-d.ts", ".ct.tsx", ".spec.ts"]));
  expect(runtimeForTestFamily("integration")).toBe("vitest");
  expect(runtimeForTestFamily("type")).toBe("vitest-typecheck");
  expect(runtimeForTestFamily("component")).toBe("playwright-ct");
  expect(runtimeForTestFamily("e2e")).toBe("playwright-e2e");
});
