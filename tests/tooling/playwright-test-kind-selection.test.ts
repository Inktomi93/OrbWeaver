import { matchesGlob } from "node:path";
import { TEST_KIND_DEFINITIONS } from "@orb/tooling/_shared/test-kinds";
import ctConfig from "../../playwright-ct.config.ts";
import { readPolicyRepositoryInventory } from "../../tooling/src/verify/lib/policy-repo-inventory.ts";
import { MODE_PROJECTS } from "../e2e/support/modes.ts";
import { expect, test } from "../support/tool-fixtures.ts";

function configuredCtVite(): Exclude<NonNullable<NonNullable<typeof ctConfig.use>["ctViteConfig"]>, () => Promise<unknown>> {
  const vite = ctConfig.use?.ctViteConfig;
  if (vite === undefined || typeof vite === "function") {
    throw new Error("CT must expose its configured Vite build contract");
  }
  return vite;
}

test("CT leaves its lease-owned output directory cleanup to the launcher", () => {
  expect(configuredCtVite().build?.emptyOutDir).toBe(false);
});

test("CT filters only verified Zod prose annotations and forwards real or unfamiliar warnings", () => {
  const onwarn = configuredCtVite().build?.rollupOptions?.onwarn;
  if (typeof onwarn !== "function") {
    throw new Error("CT must expose its native Rollup warning handler");
  }
  const vendorRoot = "/repo/node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core";
  const utilComment =
    "// Wrapped in a `@__PURE__` IIFE: esbuild never tree-shakes a top-level initializer that contains a member access on `Number`, so the bare object literal survived into every bundle.";
  const regexComment =
    "/** Anchors a pattern source. The interpolation lives here rather than at the call site because\n * esbuild will not drop a `@__PURE__` call whose own argument interpolates a variable, but it\n * will drop `anchor(dateSource)`. Keeping it inline pinned `date` into every bundle. */";
  const warnings = [
    {
      code: "INVALID_ANNOTATION",
      id: `${vendorRoot}/util.js`,
      message: `A comment\n\n"${utilComment}"\n\nin util.js contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues.`,
    },
    {
      code: "INVALID_ANNOTATION",
      id: `${vendorRoot}/regexes.js`,
      message: `A comment\n\n"${regexComment}"\n\nin regexes.js contains an annotation that Rollup cannot interpret due to the position of the comment. The comment will be removed to avoid issues.`,
    },
  ] as const;
  const forwarded: Parameters<Parameters<typeof onwarn>[1]>[0][] = [];
  const handle = (warning: Parameters<typeof onwarn>[0]): void => {
    onwarn(warning, (value: Parameters<Parameters<typeof onwarn>[1]>[0]) => forwarded.push(value));
  };
  for (const warning of warnings) {
    handle(warning);
  }
  expect(forwarded).toEqual([]);
  const controls = [
    { ...warnings[0], id: "/repo/packages/kit/src/util.js" },
    { ...warnings[0], id: `${vendorRoot}/new-file.js` },
    { ...warnings[0], code: "NEW_WARNING_CODE" },
    { ...warnings[0], message: "Invalid actual annotation /* @__PURE__ */ on a declaration" },
    { ...warnings[1], message: "New upstream annotation warning" },
    { code: "SOURCEMAP_ERROR", id: "/repo/packages/ui/src/field.tsx", message: "Authored source map failure" },
    { code: "NEW_WARNING_CODE", message: "Unfamiliar warning without a module id" },
  ];
  for (const warning of controls) {
    handle(warning);
  }
  expect(forwarded).toEqual(controls);
});

test("Playwright CT selects every registered component filename and rejects other kinds", () => {
  expect(Array.isArray(ctConfig.testMatch)).toBe(true);
  const patterns = Array.isArray(ctConfig.testMatch) ? ctConfig.testMatch.filter((pattern): pattern is string => typeof pattern === "string") : [];
  for (const { suffix } of TEST_KIND_DEFINITIONS.filter(({ family }) => family === "component")) {
    expect(patterns.some((pattern) => matchesGlob(`tests/ui/representative${suffix}`, pattern))).toBe(true);
  }
  expect(patterns.some((pattern) => matchesGlob("tests/ui/representative.test.ts", pattern))).toBe(false);
  expect(patterns.some((pattern) => matchesGlob("tests/e2e/representative.spec.ts", pattern))).toBe(false);
});

test("every registered and authored e2e spec belongs to exactly one auth-mode project", ({ repoRoot }) => {
  const suffixes = TEST_KIND_DEFINITIONS.filter(({ family }) => family === "e2e").map(({ suffix: value }) => value);
  for (const suffix of suffixes) {
    expect(MODE_PROJECTS.filter(({ testMatch }) => testMatch.test(`representative${suffix}`)).map(({ name }) => name)).toEqual(["single-user"]);
    expect(MODE_PROJECTS.filter(({ testMatch }) => testMatch.test(`representative.local${suffix}`)).map(({ name }) => name)).toEqual(["local"]);
    expect(MODE_PROJECTS.filter(({ testMatch }) => testMatch.test(`representative.forward${suffix}`)).map(({ name }) => name)).toEqual(["forward-header"]);
  }
  expect(MODE_PROJECTS.some(({ testMatch }) => testMatch.test("representative.ct.tsx"))).toBe(false);
  const specs = readPolicyRepositoryInventory(repoRoot).trackedPaths.filter(
    (path) => path.startsWith("tests/e2e/") && suffixes.some((suffix) => path.endsWith(suffix)),
  );
  expect(specs.length).toBeGreaterThan(0);
  for (const spec of specs) {
    expect(MODE_PROJECTS.filter(({ testMatch }) => testMatch.test(spec)).map(({ name }) => name)).toHaveLength(1);
  }
});
