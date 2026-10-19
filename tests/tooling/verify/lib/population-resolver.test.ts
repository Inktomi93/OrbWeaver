import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { PopulationExpr } from "../../../../tooling/src/verify/contract/population.ts";
import { POPULATION_ROOTS, POPULATION_SETS } from "../../../../tooling/src/verify/contract/population.ts";
import { gate as syntaxPolicy } from "../../../../tooling/src/verify/gates/ui-accname-survives-spread.ts";
import { assertGatePolicyDescriptor } from "../../../../tooling/src/verify/lib/policy-validation.ts";
import { assertPopulationExpr, compilePopulation, populationIncludes, resolvePopulation } from "../../../../tooling/src/verify/lib/population-resolver.ts";

test.describe("population vocabulary", () => {
  test("covers every authored zone through roots-only sets", () => {
    expect(POPULATION_ROOTS).toEqual({
      "@client": ["packages/client/src/"],
      "@ui": ["packages/ui/src/"],
      "@ui-authoring": ["packages/ui/"],
      "@server": ["packages/server/src/"],
      "@db": ["packages/db/src/"],
      "@contracts": ["packages/contracts/src/"],
      "@kit": ["packages/kit/src/"],
      "@showcase": ["packages/showcase-plugins/src/"],
      "@plugin-toolchain": ["packages/plugin-toolchain/src/"],
      "@default-content": ["packages/default-content/src/"],
      "@inference": ["packages/inference/src/"],
      "@tooling": ["tooling/src/"],
      "@tests": ["tests/"],
      "@legacy-tests": ["tests/legacy/"],
      "@scripts": ["scripts/"],
    });
    expect(POPULATION_SETS).toEqual({
      "@frontend": ["@client", "@ui"],
      "@backend": ["@server", "@db", "@contracts"],
      "@packages": ["@client", "@ui", "@server", "@db", "@contracts", "@kit"],
      "@product": ["@client", "@ui", "@server", "@db", "@contracts", "@kit", "@showcase", "@default-content", "@inference"],
      "@authored": [
        "@client",
        "@ui",
        "@ui-authoring",
        "@server",
        "@db",
        "@contracts",
        "@kit",
        "@showcase",
        "@plugin-toolchain",
        "@default-content",
        "@inference",
        "@tooling",
        "@tests",
        "@scripts",
      ],
    });
  });
});

test.describe("populationIncludes", () => {
  test("expands root refs, set refs, and ref unions with prefix boundaries", () => {
    expect(populationIncludes("@client", "packages/client/src/features/chat.ts")).toBe(true);
    expect(populationIncludes("@client", "packages/client/srcx/chat.ts")).toBe(false);
    expect(populationIncludes("@frontend", "packages/ui/src/button.tsx")).toBe(true);
    expect(populationIncludes(["@contracts", "@tooling"], "tooling/src/verify/cli.ts")).toBe(true);
    expect(populationIncludes("@authored", "tests/tooling/example.test.ts")).toBe(true);
    expect(populationIncludes("@authored", "scripts/probes/example.ts")).toBe(true);
    expect(populationIncludes("@authored", "packages/showcase-plugins/src/index.ts")).toBe(true);
    expect(populationIncludes("@product", "packages/default-content/src/index.ts")).toBe(true);
    expect(populationIncludes("@product", "packages/default-content/package.json")).toBe(false);
    expect(populationIncludes("@backend", "packages/client/src/api.ts")).toBe(false);
  });

  test("a nested root carves its subtree out of the enclosing root", () => {
    expect(populationIncludes("@tests", "tests/server/domain/chat/send.int.test.ts")).toBe(true);
    expect(populationIncludes("@tests", "tests/legacy/server/domain/chat/send.int.test.ts")).toBe(false);
    expect(populationIncludes("@authored", "tests/legacy/server/domain/chat/send.int.test.ts")).toBe(false);
    expect(populationIncludes("@legacy-tests", "tests/legacy/server/domain/chat/send.int.test.ts")).toBe(true);
    expect(populationIncludes(["@tests", "@legacy-tests"], "tests/legacy/server/domain/chat/send.int.test.ts")).toBe(true);
    expect(populationIncludes({ in: ["@tests"], depth: "flat" }, "tests/legacy/flat.test.ts")).toBe(false);
  });

  test("subtracts named roots and nested zones after expanding sets", () => {
    const expr = { in: ["@authored"], not: ["@tests"], notUnder: ["**/verify/gates/**"] } as const satisfies PopulationExpr;
    expect(populationIncludes(expr, "tooling/src/verify/cli.ts")).toBe(true);
    expect(populationIncludes(expr, "tooling/src/verify/gates/no-foo.ts")).toBe(false);
    expect(populationIncludes(expr, "tooling/src/verify/gates-extra/no-foo.ts")).toBe(true);
    expect(populationIncludes(expr, "tests/client/foo.test.ts")).toBe(false);
  });

  test("matches under, basename, negative basename, and extension conventions", () => {
    const expr = {
      in: ["@server"],
      under: ["**/domain/**", "**/transport/**"],
      named: ["*-service.ts", "*.route.ts"],
      notNamed: ["*.test.ts", "legacy-*"],
      ext: ["ts"],
      notExt: ["tsx"],
    } as const satisfies PopulationExpr;
    expect(populationIncludes(expr, "packages/server/src/domain/chat/chat-service.ts")).toBe(true);
    expect(populationIncludes(expr, "packages/server/src/transport/chat.route.ts")).toBe(true);
    expect(populationIncludes(expr, "packages/server/src/domain/chat/chat-service.test.ts")).toBe(false);
    expect(populationIncludes(expr, "packages/server/src/domain/chat/legacy-service.ts")).toBe(false);
    expect(populationIncludes(expr, "packages/server/src/infra/chat-service.ts")).toBe(false);
    expect(populationIncludes(expr, "packages/server/src/domain/chat/chat-service.tsx")).toBe(false);
  });

  test("flat depth admits direct children of any expanded top-level root only", () => {
    const expr = { in: ["@server", "@db"], depth: "flat" } as const satisfies PopulationExpr;
    expect(populationIncludes(expr, "packages/server/src/chat.ts")).toBe(true);
    expect(populationIncludes(expr, "packages/server/src/domain/chat.ts")).toBe(false);
    expect(populationIncludes(expr, "packages/db/src/users.ts")).toBe(true);
  });

  test("all and none are explicit, reasoned sentinels", () => {
    expect(populationIncludes({ of: "all", why: "resource gate owns the complete candidate manifest" }, "custom/tree/file.ts")).toBe(true);
    expect(populationIncludes({ of: "none", why: "resource-only gate dispatches no source files" }, "packages/client/src/file.ts")).toBe(false);
  });

  test("all may subtract exact nested zones without losing root or package-root sources", () => {
    const expression = {
      of: "all",
      why: "all compiler sources except gate contracts",
      notUnder: ["tooling/src/verify/gates/**"],
    } as const satisfies PopulationExpr;
    expect(
      ["vitest.config.ts", "packages/ui/tokens.build.ts", "packages/client/src/a.ts", "tests/tooling/verify/gates/countercontrol.test.ts"].map((path) =>
        populationIncludes(expression, path),
      ),
    ).toEqual([true, true, true, true]);
    expect(populationIncludes(expression, "tooling/src/verify/gates/commented-code.ts")).toBe(false);
    expect(populationIncludes(expression, "tooling/src/verify/gates-extra/commented-code.ts")).toBe(true);
  });
});

test.describe("compilePopulation", () => {
  test("is equivalent to one-shot evaluation for every expression family", () => {
    const expressions: readonly PopulationExpr[] = [
      "@client",
      ["@contracts", "@tooling"],
      { in: ["@authored"], not: ["@tests"], notUnder: ["**/verify/gates/**"] },
      { in: ["@server"], under: ["**/domain/**"], named: ["*.ts"], notNamed: ["*.test.ts"], ext: ["ts"], notExt: ["tsx"] },
      { in: ["@server"], depth: "flat" },
      { of: "all", why: "whole candidate corpus" },
      { of: "none", why: "resource-only policy" },
    ];
    const candidates = [
      "packages/client/src/file.ts",
      "packages/contracts/src/chat.ts",
      "tooling/src/verify/cli.ts",
      "tooling/src/verify/gates/no-foo.ts",
      "tests/tooling/example.test.ts",
      "packages/server/src/domain/chat.ts",
      "packages/server/src/domain/chat/service.ts",
      "packages/server/src/domain/chat/service.test.ts",
    ];
    for (const expression of expressions) {
      const compiled = compilePopulation(expression);
      expect(candidates.map((path) => compiled(path))).toEqual(candidates.map((path) => populationIncludes(expression, path)));
    }
  });

  test("validates the expression once at compile time and each path at predicate time", () => {
    const malformed: PopulationExpr = { in: ["@client"] };
    // A JavaScript caller can empty a formerly valid operand; compilation must still validate before returning.
    Object.assign(malformed, { in: [] });
    expect(() => compilePopulation(malformed)).toThrow(/population/i);
    const compiled = compilePopulation("@client");
    expect(() => compiled("/packages/client/src/file.ts")).toThrow(/path/i);
  });

  test("snapshots depth and extension operands before returning the predicate", () => {
    const expression: PopulationExpr = { in: ["@server"], depth: "flat", ext: ["ts"], notExt: ["tsx"] };
    const compiled = compilePopulation(expression);
    Object.assign(expression, { depth: undefined, ext: ["tsx"], notExt: ["ts"] });

    expect(compiled("packages/server/src/file.ts")).toBe(true);
    expect(compiled("packages/server/src/file.tsx")).toBe(false);
    expect(compiled("packages/server/src/domain/file.ts")).toBe(false);
  });
});

test.describe("runtime validation", () => {
  test.each([
    ["unknown ref", "@missing"],
    ["empty tuple", []],
    ["empty in", { in: [] }],
    ["empty optional member", { in: ["@client"], named: [] }],
    ["unknown nested ref", { in: ["@missing"] }],
    ["removed nested root", { in: ["@server/domain"] }],
    ["absolute convention", { in: ["@client"], under: ["/features/**"] }],
    ["non-posix convention", { in: ["@client"], under: ["features\\**"] }],
    ["empty negative zone", { in: ["@tooling"], notUnder: [] }],
    ["parent traversal", { in: ["@client"], under: ["../features/**"] }],
    ["named path instead of basename", { in: ["@client"], named: ["features/*.ts"] }],
    ["empty why", { of: "all", why: "  " }],
    ["none filter", { of: "none", why: "resource only", notUnder: ["tooling/**"] }],
    ["empty all filter", { of: "all", why: "all source", notUnder: [] }],
    ["absolute all filter", { of: "all", why: "all source", notUnder: ["/tooling/**"] }],
    ["unknown property", { in: ["@client"], customResolver: "escape" }],
    ["contradictory extensions", { in: ["@client"], ext: ["ts"], notExt: ["ts"] }],
    ["contradictory names", { in: ["@client"], named: ["*.ts"], notNamed: ["*.ts"] }],
    ["contradictory zones", { in: ["@tooling"], under: ["**/verify/**"], notUnder: ["**/verify/**"] }],
    ["self subtraction", { in: ["@client"], not: ["@client"] }],
    ["meaningless total subtraction", { in: ["@backend"], not: ["@server", "@db", "@contracts"] }],
    ["meaningless disjoint subtraction", { in: ["@client"], not: ["@server"] }],
  ])("refuses %s", (_label, value) => {
    expect(() => assertPopulationExpr(value)).toThrow(/population/i);
  });

  test("accepts every expression family", () => {
    for (const value of [
      "@client",
      ["@client", "@ui"],
      {
        in: ["@authored"],
        not: ["@tests"],
        under: ["**/src/**"],
        notUnder: ["**/verify/gates/**"],
        named: ["*.ts"],
        notNamed: ["*.test.ts"],
        ext: ["ts"],
        notExt: ["tsx"],
        depth: "flat",
      },
      { of: "all", why: "whole candidate corpus" },
      { of: "none", why: "resource-only policy" },
    ]) {
      expect(() => assertPopulationExpr(value)).not.toThrow();
    }
  });

  test.each([
    "/packages/client/src/a.ts",
    "C:/packages/client/src/a.ts",
    "packages\\client\\src\\a.ts",
    "../packages/client/src/a.ts",
    "packages/client/./src/a.ts",
    "packages/client/src/",
  ])("refuses invalid candidate path %s", (path) => {
    expect(() => populationIncludes("@client", path)).toThrow(/path/i);
  });

  test.each([
    ["0000", "\u0000"],
    ["0001", "\u0001"],
    ["001F", "\u001f"],
    ["007F", "\u007f"],
  ])("refuses ASCII control U+%s in candidate paths and patterns", (_label, control) => {
    expect(() => populationIncludes("@client", `packages/client/src/bad${control}.ts`)).toThrow(/path/i);
    expect(() => assertPopulationExpr({ in: ["@client"], under: [`**/bad${control}/**`] })).toThrow(/population/i);
  });
});

test.describe("resolvePopulation", () => {
  test("returns a sorted exact manifest and counts deduplicated candidates", () => {
    expect(
      resolvePopulation("@frontend", [
        "packages/ui/src/z.tsx",
        "packages/server/src/no.ts",
        "packages/client/src/a.ts",
        "packages/ui/src/z.tsx",
        "tooling/src/no.ts",
      ]),
    ).toEqual({
      paths: ["packages/client/src/a.ts", "packages/ui/src/z.tsx"],
      admitted: 2,
      rejected: 2,
      candidates: 4,
    });
  });

  test("validates the expression even when the candidate set is empty", () => {
    const malformed: PopulationExpr = { in: ["@client"] };
    // An empty candidate set must not bypass validation of an operand corrupted by a JavaScript caller.
    Object.assign(malformed, { in: [] });
    expect(() => resolvePopulation(malformed, [])).toThrow(/population/i);
  });

  test.each([
    [{ in: ["@tooling"], under: ["**/verify/**"], notUnder: ["**/verify/gates/**"] }, ["tooling/src/verify/gates/example.ts"]],
    [{ in: ["@tooling"], named: ["population-resolver.ts"], notNamed: ["population*.ts"] }, ["tooling/src/verify/lib/population-resolver.ts"]],
    [{ in: ["@client"], ext: ["ts"], notNamed: ["*"] }, ["packages/client/src/example.ts"]],
  ] as const)("refuses a non-none expression whose valid filters admit zero candidates", (expression, candidates) => {
    expect(() => resolvePopulation(expression, candidates)).toThrow(/population.*zero/i);
  });

  test("refuses an empty candidate corpus except for the explicit resource-only population", () => {
    expect(() => resolvePopulation("@authored", [])).toThrow(/population.*empty/i);
    expect(resolvePopulation({ of: "none", why: "resource-only policy" }, [])).toEqual({ paths: [], admitted: 0, rejected: 0, candidates: 0 });
  });
});

test("UI authoring joins authored sources without changing browser product or historic composite meanings", () => {
  const path = "packages/ui/tokens.build.ts";
  expect(populationIncludes("@authored", path)).toBe(true);
  expect(populationIncludes("@ui-authoring", path)).toBe(true);
  expect(populationIncludes("@product", path)).toBe(false);
  expect(populationIncludes("@frontend", path)).toBe(false);
  expect(populationIncludes("@packages", path)).toBe(false);
  expect(populationIncludes("@ui-authoring", "packages/ui/src/tokens/index.ts")).toBe(false);
  expect(populationIncludes("@ui", "packages/ui/src/tokens/index.ts")).toBe(true);
  expect(populationIncludes("@product", "packages/ui/src/tokens/index.ts")).toBe(true);
  expect(populationIncludes("@ui-authoring", "packages/ui-other/tokens.build.ts")).toBe(false);
});

test("bounded expression union preserves existing admission while adding only exact generated modules", () => {
  const expression = {
    anyOf: [{ in: ["@server"] }, { in: ["@ui"], under: ["packages/ui/src/tokens/index.ts", "packages/ui/src/tokens/themes.gen.ts"] }],
  } as const;
  expect(
    resolvePopulation(expression, [
      "packages/server/src/read.ts",
      "packages/ui/src/tokens/index.ts",
      "packages/ui/src/tokens/index.ts",
      "packages/ui/src/tokens/themes.gen.ts",
      "packages/ui/src/primitives/button.tsx",
    ]),
  ).toEqual({
    paths: ["packages/server/src/read.ts", "packages/ui/src/tokens/index.ts", "packages/ui/src/tokens/themes.gen.ts"],
    admitted: 3,
    rejected: 1,
    candidates: 4,
  });
});

test("expression union validates all branches, refuses cycles and snapshots child operands", () => {
  expect(() => assertPopulationExpr({ anyOf: ["@server", { in: ["@missing"] }] })).toThrow(/unknown ref/);
  expect(() => assertPopulationExpr({ anyOf: [] })).toThrow(/non-empty/);
  expect(() => assertPopulationExpr({ anyOf: ["@server"], in: ["@ui"] })).toThrow(/unknown property/);
  const cyclic: { anyOf: object[] } = { anyOf: [] };
  cyclic.anyOf.push(cyclic);
  expect(() => assertPopulationExpr(cyclic)).toThrow(/cyclic/);
  const child: Extract<PopulationExpr, { readonly in: readonly string[] }> = { in: ["@ui"], under: ["packages/ui/src/tokens/index.ts"] };
  const compiled = compilePopulation({ anyOf: ["@server", child] });
  Object.assign(child, { under: ["packages/ui/src/primitives/**"] });
  expect(compiled("packages/ui/src/tokens/index.ts")).toBe(true);
  expect(compiled("packages/ui/src/primitives/button.tsx")).toBe(false);
  expect(() => resolvePopulation({ anyOf: ["@server", "@ui"] }, [])).toThrow(/empty/);
  expect(() => resolvePopulation({ anyOf: ["@server", "@ui"] }, ["scripts/other.ts"])).toThrow(/zero/);
  expect(resolvePopulation({ anyOf: [{ of: "none", why: "no source" }] }, [])).toEqual({ paths: [], admitted: 0, rejected: 0, candidates: 0 });
});

test("an all-none bounded union cannot bypass resource-only descriptor semantics", () => {
  expect(() => assertGatePolicyDescriptor({ ...syntaxPolicy, population: { anyOf: [{ of: "none", why: "no source" }] } })).toThrow(
    "valid only for resource analysis",
  );
});

test("legacy analysis eligibility leaves syntax expressions and invalid-population refusals intact", () => {
  const legacy = "tests/legacy/server/old.test.ts";
  const maintained = "tests/server/current.test.ts";
  const all = { of: "all", why: "complete eligible subjects" } as const;
  expect(resolvePopulation(all, [legacy, maintained], "types")).toMatchObject({
    paths: [maintained],
    excludedLegacySourcePaths: [legacy],
    candidates: 2,
    admitted: 1,
    rejected: 1,
  });
  expect(resolvePopulation(all, [legacy, maintained], "syntax").paths).toEqual([legacy, maintained]);
  expect(populationIncludes("@legacy-tests", legacy, "types")).toBe(false);
  expect(populationIncludes("@legacy-tests", legacy, "syntax")).toBe(true);
  expect(() => resolvePopulation("@server", [legacy], "types")).toThrow("zero");
  expect(() => resolvePopulation(all, [], "types")).toThrow();
});
