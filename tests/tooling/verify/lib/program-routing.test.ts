// Typecheck routing is derived from native compiler roots; intent only selects a primary among real roots.
import { chmodSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { isLegacyTestProgram } from "@orb/tooling/floor/compiler/project-worlds";
import { execFixtureGit } from "@orb/tooling/floor/git/git-fixture";
import { processEnvValue, withProcessEnv } from "@orb/tooling/floor/process/process-env";
import { planTypecheckPrograms } from "@orb/tooling/verify";
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
    ["tests/legacy/client/agent-nav/index.dom.test.ts", "tsconfig.tests-legacy-dom.json"],
    ["tests/legacy/ui/primitives/input/index.dom.test-d.ts", "tsconfig.tests-legacy-dom.json"],
    ["tests/legacy/server/entry/compose/services.test.ts", "tsconfig.tests-legacy.json"],
    ["tests/legacy/client/routes/app-root.ct.tsx", "tsconfig.tests-legacy-dom.json"],
    ["tests/support/node/set-number.ts", "tsconfig.json"],
    ["tests/support/browser/ct-data-providers.tsx", "tsconfig.tests-dom.json"],
    ["tooling/src/verify/lib/program-routing.ts", "tooling/tsconfig.json"],
    ["packages/client/src/main.tsx", "packages/client/tsconfig.json"],
    ["packages/plugin-sdk/main.d.ts", "packages/plugin-sdk/tsconfig.author-main.json"],
    ["packages/showcase-plugins/bundles/card-atlas/main.ts", "packages/showcase-plugins/tsconfig.author-main.json"],
    ["packages/showcase-plugins/bundles/pocket-arcade/frame.ts", "packages/showcase-plugins/tsconfig.author-frame.json"],
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

// Run first in its process it pays the same config parse as the primary case above. MEASURED alone: 4.3 s and 4.8 s at
// per-core load 0.6 to 0.7, and 5.0 s to 16.8 s beside three whole typechecks. The base is twice the worst loaded reading.
test("ambient and inherited tsconfig edits select every native dependent program", { timeout: scaledBudget(34_000) }, ({ repoRoot }) => {
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
  // An affected plan leaves the legacy programs to CI unless the deleted path was itself a legacy file.
  expect(deleted.programs).toEqual(ambient?.filter((config) => !isLegacyTestProgram(config)));
  expect(ambient).toContain("tsconfig.tests-legacy.json");
  const deletedLegacy = planTypecheckPrograms(repoRoot, [{ path: "tests/legacy/deleted.test.ts", status: "deleted", previousPath: null }], "affected");
  expect(deletedLegacy.programs).toEqual(ambient);
});

test("non-TypeScript inputs are explicit not-applicable results", ({ repoRoot }) => {
  const plan = planTypecheckPrograms(
    repoRoot,
    [present("packages/ui/src/styles/globals.css"), present("tests/legacy/kit/cel/cel-goldens.json"), present("docs/law/Core-Tooling-Law.md")],
    "primary",
  );
  expect(plan.programs).toEqual([]);
  expect(plan.subjects.every((subject) => subject.disposition === "not-applicable")).toBe(true);
});

test("non-TypeScript planning bypasses malformed compiler configs while TypeScript planning refuses them", ({ scratch }) => {
  execFixtureGit(scratch, ["init", "--quiet", "--template=", "--initial-branch=main"]);
  mkdirSync(join(scratch, "src"), { recursive: true });
  writeFileSync(join(scratch, "README.md"), "# Fixture\n");
  writeFileSync(join(scratch, "src/owned.ts"), "export {};\n");
  writeFileSync(join(scratch, "tsconfig.bad.json"), "{");

  expect(planTypecheckPrograms(scratch, [present("README.md")], "primary")).toEqual({
    mode: "primary",
    coverage: "advisory-primary-programs",
    programs: [],
    subjects: [
      {
        ...present("README.md"),
        disposition: "not-applicable",
        rootedBy: [],
        containedBy: [],
        selectedPrograms: [],
        reason: "not-type-input",
      },
    ],
  });
  expect(() => planTypecheckPrograms(scratch, [present("src/owned.ts")], "primary")).toThrow(/could not read|could not parse/u);
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

/** A git fixture of native programs that list their closures through the real TS7 wrapper. */
function closureFixture(scratch: string, repoRoot: string, files: Readonly<Record<string, string>>): void {
  execFixtureGit(scratch, ["init", "--quiet", "--template=", "--initial-branch=main"]);
  mkdirSync(join(scratch, "scripts"));
  symlinkSync(join(repoRoot, "node_modules"), join(scratch, "node_modules"), "dir");
  for (const [path, text] of Object.entries({ ".gitignore": "node_modules\nscripts/\n", "package.json": JSON.stringify({ type: "module" }), ...files })) {
    mkdirSync(dirname(join(scratch, path)), { recursive: true });
    writeFileSync(join(scratch, path), text);
  }
}

function program(files: readonly string[]): string {
  return JSON.stringify({ compilerOptions: { types: [] }, files });
}

function containedBy(plan: ReturnType<typeof planTypecheckPrograms>): Readonly<Record<string, readonly string[]>> {
  return Object.fromEntries(plan.subjects.map((subject) => [subject.path, subject.containedBy]));
}

test("closure planning preserves the caller runtime and heap without a nested package manager", { timeout: scaledBudget(30_000) }, async ({
  scratch,
  repoRoot,
}) => {
  const observed = join(scratch, "scripts/context.txt");
  const heapMiB = 8192;
  const nodeOptions = `--max-old-space-size=${String(heapMiB)}`;
  closureFixture(scratch, repoRoot, {
    "tsconfig.json": program(["entry.ts"]),
    "entry.ts": 'import "./target.ts";\n',
    "target.ts": "export const target = true;\n",
    "bin/pnpm": '#!/bin/sh\necho "unexpected nested package manager" >&2\nexit 91\n',
    "bin/pnpm.cmd": "@echo unexpected nested package manager >&2\r\n@exit /b 91\r\n",
    "scripts/ts7.ts": `import { writeFileSync } from "node:fs";
import { getHeapStatistics } from "node:v8";
writeFileSync(${JSON.stringify(observed)}, [process.execPath, process.env.NODE_OPTIONS, getHeapStatistics().heap_size_limit / 1048576].join("\\n"));
await import(${JSON.stringify(pathToFileURL(join(repoRoot, "scripts/ts7.ts")).href)});
`,
  });
  chmodSync(join(scratch, "bin/pnpm"), 0o755);
  await withProcessEnv("NODE_OPTIONS", nodeOptions, async () => {
    await withProcessEnv("PATH", `${join(scratch, "bin")}${process.platform === "win32" ? ";" : ":"}${processEnvValue("PATH") ?? ""}`, () => {
      const plan = planTypecheckPrograms(scratch, [present("target.ts")], "affected");
      expect(plan.subjects[0]).toMatchObject({ rootedBy: [], containedBy: ["tsconfig.json"], selectedPrograms: ["tsconfig.json"] });
      return Promise.resolve();
    });
  });
  const [runtime, options, limit] = readFileSync(observed, "utf8").split("\n");
  expect(runtime).toBe(process.execPath);
  expect(options).toBe(nodeOptions);
  expect(Number(limit)).toBeGreaterThanOrEqual(heapMiB);
  expect(Number(limit)).toBeLessThan(heapMiB + 1024);
});

test.for(["bridge edit", "resolution candidate", "package metadata"] as const)(
  "affected routing refreshes ignored compiler inputs: %s",
  { timeout: scaledBudget(30_000) },
  (control, { scratch, repoRoot }) => {
    const entry = control === "package metadata" ? "./generated/pkg" : "./generated/bridge";
    closureFixture(scratch, repoRoot, {
      ".gitignore": "node_modules\nscripts/\ngenerated/\n",
      "tsconfig.json": program(["entry.ts"]),
      "tsconfig.leaf.json": program(["target.ts"]),
      "entry.ts": `import ${JSON.stringify(entry)};\n`,
      "target.ts": "export const target = true;\n",
      "generated/bridge/index.ts": "export {};\n",
      "generated/pkg/package.json": '{"types":"first.d.ts"}',
      "generated/pkg/first.d.ts": "export {};\n",
      "generated/pkg/second.d.ts": 'export { target } from "../../target";\n',
    });
    symlinkSync(join(repoRoot, "scripts/ts7.ts"), join(scratch, "scripts/ts7.ts"), "file");
    const selected = (): readonly string[] => planTypecheckPrograms(scratch, [present("target.ts")], "affected").programs;
    expect(selected()).toEqual(["tsconfig.leaf.json"]);
    if (control === "bridge edit") {
      writeFileSync(join(scratch, "generated/bridge/index.ts"), 'import "../../target";\n');
    } else if (control === "resolution candidate") {
      writeFileSync(join(scratch, "generated/bridge.ts"), 'import "../target";\n');
    } else {
      writeFileSync(join(scratch, "generated/pkg/package.json"), '{"types":"second.d.ts"}');
    }
    expect(selected()).toEqual(["tsconfig.json", "tsconfig.leaf.json"]);
    if (control === "resolution candidate") {
      rmSync(join(scratch, "generated/bridge.ts"));
    } else if (control === "bridge edit") {
      writeFileSync(join(scratch, "generated/bridge/index.ts"), "export {};\n");
    } else {
      writeFileSync(join(scratch, "generated/pkg/package.json"), '{"types":"first.d.ts"}');
    }
    expect(selected()).toEqual(["tsconfig.leaf.json"]);
  },
);

// The repository's world split in miniature: the root program's test glob matches the DOM test and excludes it, and
// only the package program roots the leaf file, so the other two programs reach it through imports alone.
// Three cold native closure reads. MEASURED: 1.4 s to 1.6 s at per-core load 0.5. The base matches the sibling closure cases.
test("affected routing includes native imported consumers while direct DOM roots remain in their one world", { timeout: scaledBudget(30_000) }, ({
  scratch,
  repoRoot,
}) => {
  const leaf = "packages/kit/src/ids/index.ts";
  const domTest = "tests/client/agent-nav/index.dom.test.ts";
  closureFixture(scratch, repoRoot, {
    "packages/kit/tsconfig.json": JSON.stringify({ compilerOptions: { types: [] }, include: ["src"] }),
    "tsconfig.json": JSON.stringify({ compilerOptions: { types: [] }, include: ["tests/**/*.ts"], exclude: ["tests/**/*.dom.test.ts"] }),
    "tsconfig.tests-dom.json": JSON.stringify({ compilerOptions: { types: [], lib: ["esnext", "dom"] }, include: ["tests/**/*.dom.test.ts"] }),
    [leaf]: "export const id = 1;\n",
    "tests/kit/ids/index.test.ts": 'import { id } from "../../../packages/kit/src/ids/index";\nexport const node = id;\n',
    [domTest]: 'import { id } from "../../../packages/kit/src/ids/index";\nexport const dom = id;\n',
  });
  symlinkSync(join(repoRoot, "scripts/ts7.ts"), join(scratch, "scripts/ts7.ts"), "file");

  const plan = planTypecheckPrograms(scratch, [present(leaf), present(domTest)], "affected");
  expect(plan.coverage).toBe("complete-affected-programs");
  expect(plan.subjects).toMatchObject([
    {
      path: leaf,
      rootedBy: ["packages/kit/tsconfig.json"],
      containedBy: ["packages/kit/tsconfig.json", "tsconfig.json", "tsconfig.tests-dom.json"],
      selectedPrograms: ["packages/kit/tsconfig.json", "tsconfig.json", "tsconfig.tests-dom.json"],
    },
    { path: domTest, rootedBy: ["tsconfig.tests-dom.json"], containedBy: ["tsconfig.tests-dom.json"], selectedPrograms: ["tsconfig.tests-dom.json"] },
  ]);
});

// Three cold native closure reads per plan. MEASURED: 2.7 s, and 4.1 s at per-core load 0.8 to 1.4.
// The base matches the sibling closure cases.
test("planning reacquires membership after tracked and untracked edits", { timeout: scaledBudget(30_000) }, ({ scratch, repoRoot }) => {
  closureFixture(scratch, repoRoot, {
    "tsconfig.json": program(["a.ts", "c.ts"]),
    "tsconfig.b.json": program(["b.ts"]),
    "tsconfig.d.json": program(["d.ts"]),
    "a.ts": "export {};\n",
    "b.ts": "export const b = 1;\n",
    "d.ts": "export const d = 1;\n",
  });
  symlinkSync(join(repoRoot, "scripts/ts7.ts"), join(scratch, "scripts/ts7.ts"), "file");
  execFixtureGit(scratch, ["add", "--all"]);
  execFixtureGit(scratch, ["-c", "user.email=fixture@example.test", "-c", "user.name=fixture", "commit", "--quiet", "--message=fixture"]);
  writeFileSync(join(scratch, "c.ts"), "export {};\n");
  const subjects = [present("b.ts"), present("d.ts")];

  expect(containedBy(planTypecheckPrograms(scratch, subjects, "affected"))).toEqual({ "b.ts": ["tsconfig.b.json"], "d.ts": ["tsconfig.d.json"] });
  // Only the tracked importer changes: Git status names it, and only its bytes move the answer.
  writeFileSync(join(scratch, "a.ts"), 'import "./b";\n');
  expect(containedBy(planTypecheckPrograms(scratch, subjects, "affected"))).toEqual({
    "b.ts": ["tsconfig.b.json", "tsconfig.json"],
    "d.ts": ["tsconfig.d.json"],
  });
  // Only the untracked importer changes: its path was already untracked, so only its bytes move the answer.
  writeFileSync(join(scratch, "c.ts"), 'import "./d";\n');
  expect(containedBy(planTypecheckPrograms(scratch, subjects, "affected"))).toEqual({
    "b.ts": ["tsconfig.b.json", "tsconfig.json"],
    "d.ts": ["tsconfig.d.json", "tsconfig.json"],
  });
});

// The fixture's wrapper rewrites the importer before its first two `tsconfig.json` listings, then delegates to the
// real wrapper. Both planning attempts therefore read membership while their key moves.
const REWRITING_WRAPPER = (realWrapper: string): string => `import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
const args = process.argv.slice(2);
const count = existsSync("scripts/rewrites") ? Number(readFileSync("scripts/rewrites", "utf8")) : 0;
const variants = ['import "./b";\\n', "export const two = 2;\\n"];
if (args.includes("tsconfig.json") && count < variants.length) {
  writeFileSync("scripts/rewrites", String(count + 1));
  writeFileSync("a.ts", variants[count]);
}
const result = spawnSync(process.execPath, [${JSON.stringify(realWrapper)}, ...args], { stdio: "inherit" });
process.exit(result.status ?? 1);
`;

// Three planning attempts over two cold native closure reads each. MEASURED: 2.2 s, and 2.9 s at per-core load 0.8 to
// 1.4. The base matches the sibling closure cases.
test("an unstable membership read refuses and a later stable read recovers", { timeout: scaledBudget(30_000) }, ({ scratch, repoRoot }) => {
  closureFixture(scratch, repoRoot, {
    "tsconfig.json": program(["a.ts"]),
    "tsconfig.b.json": program(["b.ts"]),
    "a.ts": "export {};\n",
    "b.ts": "export const b = 1;\n",
    "scripts/ts7.ts": REWRITING_WRAPPER(join(repoRoot, "scripts/ts7.ts")),
  });

  expect(() => planTypecheckPrograms(scratch, [present("b.ts")], "affected")).toThrow(/no stable plan is available/u);
  // Restore the bytes the second attempt keyed on. Its membership was read at other bytes, so it must not answer.
  writeFileSync(join(scratch, "a.ts"), 'import "./b";\n');
  expect(containedBy(planTypecheckPrograms(scratch, [present("b.ts")], "affected"))).toEqual({ "b.ts": ["tsconfig.b.json", "tsconfig.json"] });
});

test("planning rediscovers roots after authored config changes", ({ scratch }) => {
  execFixtureGit(scratch, ["init", "--quiet", "--template=", "--initial-branch=main"]);
  mkdirSync(join(scratch, "src"), { recursive: true });
  writeFileSync(join(scratch, "tsconfig.json"), '{"include":["src/one.ts"]}\n');
  writeFileSync(join(scratch, "src/one.ts"), "export {};\n");
  expect(planTypecheckPrograms(scratch, [present("src/one.ts")], "primary").programs).toEqual(["tsconfig.json"]);
  writeFileSync(join(scratch, "tsconfig.json"), '{"include":["src/*.ts"]}\n');
  writeFileSync(join(scratch, "src/two.ts"), "export {};\n");
  expect(planTypecheckPrograms(scratch, [present("src/two.ts")], "primary").programs).toEqual(["tsconfig.json"]);
});

test("a later plan observes an importer removed during its authored-input read", { timeout: scaledBudget(30_000) }, async ({ scratch, repoRoot }) => {
  execFixtureGit(scratch, ["init", "--quiet", "--template=", "--initial-branch=main"]);
  mkdirSync(join(scratch, "scripts"));
  mkdirSync(join(scratch, "bin"));
  symlinkSync(join(repoRoot, "scripts/ts7.ts"), join(scratch, "scripts/ts7.ts"), "file");
  symlinkSync(join(repoRoot, "node_modules"), join(scratch, "node_modules"), "dir");
  writeFileSync(join(scratch, ".gitignore"), "node_modules\nscripts/ts7.ts\n");
  writeFileSync(join(scratch, "package.json"), JSON.stringify({ type: "module" }));
  writeFileSync(join(scratch, "tsconfig.json"), JSON.stringify({ compilerOptions: { types: [] }, files: ["consumer.ts"] }));
  writeFileSync(join(scratch, "consumer.ts"), 'import "./target";\n');
  writeFileSync(join(scratch, "target.ts"), "export {};\n");
  const wrapper = join(scratch, "bin/git");
  writeFileSync(
    wrapper,
    '#!/usr/bin/env bash\n/usr/bin/git "$@"\nstatus=$?\nif [[ -f .git/mutate-on-diff && " $* " == *" diff --name-only "* ]]; then\n  printf "export {};\\n" > consumer.ts\n  rm .git/mutate-on-diff\nfi\nexit "$status"\n',
  );
  chmodSync(wrapper, 0o755);
  execFixtureGit(scratch, ["add", ".gitignore", "package.json", "tsconfig.json", "consumer.ts", "target.ts", "bin/git"]);
  execFixtureGit(scratch, ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "commit", "--quiet", "-m", "fixture"]);
  expect(planTypecheckPrograms(scratch, [present("target.ts")], "affected").programs).toEqual(["tsconfig.json"]);

  // Git returns the old diff, then changes the imported consumer before the memo-hit plan returns.
  writeFileSync(join(scratch, ".git/mutate-on-diff"), "");
  await withProcessEnv("PATH", `${join(scratch, "bin")}:${processEnvValue("PATH") ?? ""}`, () => {
    expect(() => planTypecheckPrograms(scratch, [present("target.ts")], "affected")).toThrow(/no native compiler closure/u);
    return Promise.resolve();
  });
});
