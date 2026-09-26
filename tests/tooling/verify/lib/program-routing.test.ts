// Typecheck routing is derived from native compiler roots; intent only selects a primary among real roots.
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { execFixtureGit } from "@orb/tooling/_shared/git-fixture";
import { planTypecheckPrograms } from "@orb/tooling/verify";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

function present(path: string): { readonly path: string; readonly status: "present"; readonly previousPath: null } {
  return { path, status: "present" as const, previousPath: null };
}

test("affected routing retains concrete parents for exclusive roots, shared roots and inherited config edits", { timeout: scaledBudget(30_000) }, ({
  scratch,
  repoRoot,
}) => {
  execFixtureGit(scratch, ["init", "--quiet", "--template=", "--initial-branch=main"]);
  mkdirSync(join(scratch, "scripts"));
  symlinkSync(join(repoRoot, "scripts/ts7.ts"), join(scratch, "scripts/ts7.ts"), "file");
  symlinkSync(join(repoRoot, "node_modules"), join(scratch, "node_modules"), "dir");
  for (const [path, text] of Object.entries({
    ".gitignore": "node_modules\nscripts/ts7.ts\n",
    "package.json": JSON.stringify({ type: "module" }),
    "tsconfig.json": JSON.stringify({ compilerOptions: { types: [], strictNullChecks: true }, files: ["parent.ts", "shared.ts"] }),
    "tsconfig.child.json": JSON.stringify({ extends: "./tsconfig.json", compilerOptions: { strictNullChecks: false }, files: ["child.ts", "shared.ts"] }),
    "parent.ts": "export {};",
    "child.ts": "export {};",
    "shared.ts": "export {};",
  })) {
    writeFileSync(join(scratch, path), text);
  }
  const plan = planTypecheckPrograms(
    scratch,
    [present("parent.ts"), present("shared.ts"), present("tsconfig.json"), present("tsconfig.child.json")],
    "affected",
  );
  expect(plan.subjects.map(({ path, selectedPrograms }) => ({ path, selectedPrograms }))).toEqual([
    { path: "parent.ts", selectedPrograms: ["tsconfig.json"] },
    { path: "shared.ts", selectedPrograms: ["tsconfig.child.json", "tsconfig.json"] },
    { path: "tsconfig.json", selectedPrograms: ["tsconfig.child.json", "tsconfig.json"] },
    { path: "tsconfig.child.json", selectedPrograms: ["tsconfig.child.json"] },
  ]);
});

// The first plan against the real repository parses every native program's config in process. MEASURED: 3.3 s at
// per-core load 0.4, and 10.9 s beside three whole typechecks at per-core load 1.1. The base is twice the loaded reading.
test("primary routing follows native roots for DOM runtime/type tests, Node tests, helpers, tooling and package source", {
  timeout: scaledBudget(22_000),
}, ({ repoRoot }) => {
  const cases: readonly (readonly [string, string])[] = [
    ["tests/client/agent-nav/index.dom.test.ts", "tsconfig.tests-dom.json"],
    ["tests/ui/primitives/input/index.dom.test-d.ts", "tsconfig.tests-dom.json"],
    ["tests/server/entry/compose/services.test.ts", "tsconfig.json"],
    ["tests/client/routes/app-root.ct.tsx", "tsconfig.tests-dom.json"],
    ["tests/support/node/set-number.ts", "tsconfig.json"],
    ["tests/support/browser/ct-data-providers.tsx", "tsconfig.tests-dom.json"],
    ["tooling/src/verify/lib/program-routing.ts", "tooling/tsconfig.json"],
    ["packages/client/src/main.tsx", "packages/client/tsconfig.json"],
    ["packages/client/vite.config.ts", "tsconfig.json"],
    ["vitest.config.ts", "tsconfig.json"],
  ];
  const plan = planTypecheckPrograms(
    repoRoot,
    cases.map(([path]) => present(path)),
    "primary",
  );
  for (const [path, expected] of cases) {
    expect(plan.subjects.find((subject) => subject.path === path)?.selectedPrograms, path).toEqual([expected]);
  }
});

test("ambient and inherited tsconfig edits select every native dependent program", ({ repoRoot }) => {
  const plan = planTypecheckPrograms(repoRoot, [present("reset.d.ts"), present("tsconfig.base.json")], "primary");
  const ambient = plan.subjects.find((subject) => subject.path === "reset.d.ts")?.selectedPrograms;
  const inherited = plan.subjects.find((subject) => subject.path === "tsconfig.base.json")?.selectedPrograms;
  expect(ambient?.length).toBeGreaterThan(1);
  expect(inherited).toEqual(ambient);
  expect(inherited).toContain("packages/client/tsconfig.json");
  expect(inherited).toContain("tooling/tsconfig.json");
  expect(inherited).toContain("tsconfig.tests-dom.json");

  const deleted = planTypecheckPrograms(repoRoot, [{ path: "tests/deleted.test.ts", status: "deleted", previousPath: null }], "affected");
  expect(deleted.subjects[0]?.reason).toBe("deleted-conservative");
  expect(deleted.programs).toEqual(ambient);
});

test("non-TypeScript inputs are explicit not-applicable results", ({ repoRoot }) => {
  const plan = planTypecheckPrograms(
    repoRoot,
    [present("packages/ui/src/styles/globals.css"), present("tests/kit/cel/cel-goldens.json"), present("docs/law/Core-Tooling-Law.md")],
    "primary",
  );
  expect(plan.programs).toEqual([]);
  expect(plan.subjects.every((subject) => subject.disposition === "not-applicable")).toBe(true);
});

test("affected routing includes native imported consumers while direct DOM roots remain in their one world", { timeout: scaledBudget(30_000) }, ({
  repoRoot,
}) => {
  const plan = planTypecheckPrograms(repoRoot, [present("packages/kit/src/ids/index.ts"), present("tests/client/agent-nav/index.dom.test.ts")], "affected");
  const kit = plan.subjects.find((subject) => subject.path === "packages/kit/src/ids/index.ts");
  const dom = plan.subjects.find((subject) => subject.path === "tests/client/agent-nav/index.dom.test.ts");
  expect(plan.coverage).toBe("complete-affected-programs");
  expect(kit?.containedBy).toContain("packages/kit/tsconfig.json");
  expect(kit?.containedBy).toContain("tsconfig.json");
  expect(kit?.containedBy).toContain("tsconfig.tests-dom.json");
  expect(dom?.selectedPrograms).toEqual(["tsconfig.tests-dom.json"]);
});

test("unknown TS roots and malformed configs refuse while an unused empty template is not applicable", ({ scratch }) => {
  execFixtureGit(scratch, ["init", "--quiet", "--template=", "--initial-branch=main"]);
  const write = (path: string, text: string): void => {
    mkdirSync(dirname(join(scratch, path)), { recursive: true });
    writeFileSync(join(scratch, path), text);
  };
  write("tsconfig.json", '{"files":["src/owned.ts"]}\n');
  write("tsconfig.template.json", '{"files":[]}\n');
  write("src/owned.ts", "export {};\n");
  write("outside/unknown.ts", "export {};\n");
  expect(planTypecheckPrograms(scratch, [present("tsconfig.template.json")], "primary").subjects[0]).toMatchObject({
    disposition: "not-applicable",
    reason: "abstract-config",
  });
  expect(() => planTypecheckPrograms(scratch, [present("outside/unknown.ts")], "primary")).toThrow(/no native compiler root/u);
  write("tsconfig.bad.json", "{");
  expect(() => planTypecheckPrograms(scratch, [present("src/owned.ts")], "primary")).toThrow(/could not read|could not parse/u);
});

test("the in-process membership snapshot invalidates when authored bytes add a root", ({ scratch }) => {
  execFixtureGit(scratch, ["init", "--quiet", "--template=", "--initial-branch=main"]);
  mkdirSync(join(scratch, "src"), { recursive: true });
  writeFileSync(join(scratch, "tsconfig.json"), '{"include":["src/one.ts"]}\n');
  writeFileSync(join(scratch, "src/one.ts"), "export {};\n");
  expect(planTypecheckPrograms(scratch, [present("src/one.ts")], "primary").programs).toEqual(["tsconfig.json"]);
  writeFileSync(join(scratch, "tsconfig.json"), '{"include":["src/*.ts"]}\n');
  writeFileSync(join(scratch, "src/two.ts"), "export {};\n");
  expect(planTypecheckPrograms(scratch, [present("src/two.ts")], "primary").programs).toEqual(["tsconfig.json"]);
});
