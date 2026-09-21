// Program discovery uses authored paths and compiler references, independent of directory layout.
import { mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { execFixtureGit } from "@orb/tooling/_shared/git-fixture";
import { readCompilerPrograms } from "@orb/tooling/verify";
import type { PolicyProgramMembership } from "../../../../tooling/src/verify/contract/policy-scope.ts";
import {
  compilerConfigRoster,
  readAvailablePolicyPrograms,
  readCompilerConfigEntries,
  readPolicyProgramGraph,
} from "../../../../tooling/src/verify/lib/policy-program-membership.ts";
import { readPolicyRepositoryInventory } from "../../../../tooling/src/verify/lib/policy-repo-inventory.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

function plant(root: string, files: Readonly<Record<string, string>>): void {
  execFixtureGit(root, ["init", "--quiet", "--template=", "--initial-branch=main"]);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
}

test("nested variants and a references-only solution are discovered without a program list", ({ scratch }) => {
  plant(scratch, {
    ".gitignore": "node_modules/\nreports/\n",
    "tsconfig.json": '{ "files": [], "references": [{ "path": "./scripts/probe-world" }, { "path": "./scripts/probe-world/tsconfig.json" }] }',
    "scripts/probe-world/tsconfig.json": '{ "files": ["a.ts"] }',
    "scripts/probe-world/a.ts": "export const a = 1;",
    "packages/a/tsconfig.browser.json": '{ "files": ["src/a.ts"] }',
    "packages/a/src/a.ts": "export const a = 1;",
    "node_modules/tsconfig.json": "{",
    "reports/tsconfig.json": "{",
  });
  const read = (): readonly PolicyProgramMembership[] => readAvailablePolicyPrograms(readPolicyRepositoryInventory(scratch));
  expect(read().map((program) => program.config)).toEqual(["packages/a/tsconfig.browser.json", "scripts/probe-world/tsconfig.json", "tsconfig.json"]);
  expect(read().find((program) => program.config === "tsconfig.json")?.references).toEqual(["scripts/probe-world/tsconfig.json"]);
  writeFileSync(join(scratch, "tsconfig.extra.json"), '{ "files": ["scripts/probe-world/a.ts"] }');
  expect(read().find((program) => program.config === "tsconfig.extra.json")?.files).toEqual(["scripts/probe-world/a.ts"]);
});

test("used and unused files-empty templates stay abstract while their leaf retains inherited ownership", ({ scratch }) => {
  plant(scratch, {
    "tsconfig.world.json": '{ "files": [] }',
    "tsconfig.unused.json": '{ "files": [] }',
    "packages/a/tsconfig.json": '{ "extends": "../../tsconfig.world.json", "include": ["src"] }',
    "packages/a/src/a.ts": "export const a = 1;",
  });
  const inventory = readPolicyRepositoryInventory(scratch);
  const programs = readAvailablePolicyPrograms(inventory);
  expect(programs.map((program) => program.config)).toEqual(["packages/a/tsconfig.json"]);
  expect(programs[0]?.configPaths).toEqual(["packages/a/tsconfig.json", "tsconfig.world.json"]);
  expect(() => readPolicyProgramGraph(inventory, ["tsconfig.unused.json"])).toThrow(/zero authored files/u);
});

test.for(["files", "include"] as const)("a concrete extended parent retains its %s roots beside overriding child roots", (field, { scratch }) => {
  plant(scratch, {
    "tsconfig.json": JSON.stringify({ [field]: ["parent.ts"] }),
    "tsconfig.child.json": JSON.stringify({ extends: "./tsconfig.json", [field]: ["child.ts"] }),
    "parent.ts": "export const parent = 1;",
    "child.ts": "export const child = 1;",
  });
  expect(readCompilerPrograms(scratch).map(({ config, files }) => ({ config, files }))).toEqual([
    { config: "tsconfig.child.json", files: ["child.ts"] },
    { config: "tsconfig.json", files: ["parent.ts"] },
  ]);
});

test("extended programs sharing roots retain their distinct compiler options", ({ scratch }) => {
  plant(scratch, {
    "tsconfig.json": JSON.stringify({ compilerOptions: { strictNullChecks: true }, files: ["shared.ts"] }),
    "tsconfig.child.json": JSON.stringify({ extends: "./tsconfig.json", compilerOptions: { strictNullChecks: false } }),
    "shared.ts": "export const value: number = null;",
  });
  expect(
    readCompilerPrograms(scratch).map(({ config, files, commandLine }) => ({ config, files, strictNullChecks: commandLine.options.strictNullChecks })),
  ).toEqual([
    { config: "tsconfig.child.json", files: ["shared.ts"], strictNullChecks: false },
    { config: "tsconfig.json", files: ["shared.ts"], strictNullChecks: true },
  ]);
});

test("empty templates never absolve an unmatched include or a broken reference", ({ scratch }) => {
  plant(scratch, {
    "tsconfig.world.json": '{ "files": [] }',
    "tsconfig.json": '{ "extends": "./tsconfig.world.json", "include": ["missing/**/*.ts"] }',
  });
  const read = (): readonly PolicyProgramMembership[] => readAvailablePolicyPrograms(readPolicyRepositoryInventory(scratch));
  expect(read).toThrow(/zero authored files/u);
  writeFileSync(join(scratch, "tsconfig.json"), '{ "files": [], "references": [{ "path": "./missing" }] }');
  expect(read).toThrow(/reference/u);
  writeFileSync(join(scratch, "tsconfig.json"), '{ "extends": "./missing.json" }');
  expect(read).toThrow(/could not parse/u);
});

test("declaration-only projects keep an owner; they are not empty templates", ({ scratch }) => {
  plant(scratch, {
    "tsconfig.json": '{ "files": ["ambient.d.ts"] }',
    "ambient.d.ts": "export {};",
  });
  const programs = readAvailablePolicyPrograms(readPolicyRepositoryInventory(scratch));
  expect(programs.map((program) => program.config)).toEqual(["tsconfig.json"]);
  expect(programs[0]?.files).toEqual(["ambient.d.ts"]);
});

test("compiler consumers receive inherited native options, absolute roots and references from the authored graph", ({ scratch }) => {
  plant(scratch, {
    "tsconfig.world.json": '{ "files": [], "compilerOptions": { "strict": true, "lib": ["es2025"], "paths": { "#value": ["./src/value.ts"] } } }',
    "tsconfig.json": '{ "files": [], "references": [{ "path": "./browser" }] }',
    "browser/tsconfig.json": '{ "extends": "../tsconfig.world.json", "compilerOptions": { "lib": ["es2025", "dom"] }, "include": ["src"] }',
    "browser/src/value.ts": "export const title = document.title;",
  });
  const programs = readCompilerPrograms(scratch);
  expect(programs.map((program) => program.config)).toEqual(["browser/tsconfig.json", "tsconfig.json"]);
  const browser = programs[0];
  expect(browser?.commandLine.fileNames).toEqual([join(scratch, "browser/src/value.ts")]);
  expect(browser?.commandLine.options).toMatchObject({ strict: true, lib: ["lib.es2025.d.ts", "lib.dom.d.ts"], paths: { "#value": ["./src/value.ts"] } });
  expect(programs[1]?.commandLine.projectReferences?.[0]?.path).toBe(join(scratch, "browser"));
  expect(browser?.files).toEqual(["browser/src/value.ts"]);
  writeFileSync(join(scratch, "browser/tsconfig.json"), '{ "extends": "../missing.json" }');
  expect(() => readCompilerPrograms(scratch)).toThrow(/could not parse/u);
});

test("a source filename overlay exactly matches native materialized config expansion", ({ scratch }) => {
  plant(scratch, {
    "tsconfig.base.json": JSON.stringify({
      compilerOptions: { strict: true, noEmit: true, allowJs: true, types: [] },
      include: ["tests/**/*.ts", "tests/**/*.js"],
      exclude: ["tests/client", "tests/support/browser", "**/ignored/**"],
    }),
    "tsconfig.json": JSON.stringify({ extends: "./tsconfig.base.json", references: [{ path: "./tsconfig.dom.json" }] }),
    "tsconfig.dom.json": JSON.stringify({
      extends: "./tsconfig.base.json",
      compilerOptions: { lib: ["es2025", "dom"] },
      include: ["tests/client/**/*.ts", "tests/support/browser/**/*.ts"],
      exclude: ["**/ignored/**"],
    }),
    "nested/tsconfig.json": JSON.stringify({ extends: "../tsconfig.base.json", include: ["../tests/client/**/*.ts"], exclude: [] }),
    "empty/tsconfig.json": JSON.stringify({ compilerOptions: { strict: true, noEmit: true }, include: ["src/**/*.ts"] }),
    "tsconfig.explicit.json": JSON.stringify({ compilerOptions: { strict: true, noEmit: true }, files: ["tests/explicit.ts"] }),
    "tsconfig.alias.json": JSON.stringify({ compilerOptions: { strict: true, noEmit: true }, include: ["client-alias/**/*.ts"] }),
    "tests/client/forms/autosave.test-d.ts": "export const title = document.title;",
    "tests/support/browser/helper.ts": "export const title = document.title;",
    "tests/anchor.ts": "export {};",
    "tests/explicit.ts": "export {};",
    "tests/twin.js": "export {};",
  });
  symlinkSync(join(scratch, "tests/client"), join(scratch, "client-alias"), "dir");
  const addedPaths = [
    "tests/client/forms/editor/autosave-contract.test-d.ts",
    "tests/support/node/helper.ts",
    "tests/client/.hidden.ts",
    "tests/client/ignored/no.ts",
    "tests/twin.ts",
    "empty/src/new.ts",
  ];
  const deletedPaths = ["tests/client/forms/autosave.test-d.ts", "tests/support/browser/helper.ts"];
  const virtual = readCompilerPrograms(scratch, { addedPaths, deletedPaths });

  for (const path of deletedPaths) {
    rmSync(join(scratch, path));
  }
  for (const path of addedPaths) {
    const absolute = join(scratch, path);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, "export {};\n");
  }
  const materialized = readCompilerPrograms(scratch);
  const roots = (programs: ReturnType<typeof readCompilerPrograms>): Readonly<Record<string, readonly string[]>> =>
    Object.fromEntries(programs.map((program) => [program.id, program.commandLine.fileNames.map((file) => relative(scratch, file))]));
  expect(roots(virtual)).toEqual(roots(materialized));
  expect(virtual.map((program) => ({ id: program.id, files: program.files }))).toEqual(
    materialized.map((program) => ({ id: program.id, files: program.files })),
  );
  expect(roots(virtual)["tsconfig.dom.json"]).toContain("tests/client/forms/editor/autosave-contract.test-d.ts");
  expect(roots(virtual)["tsconfig.json"]).toContain("tests/support/node/helper.ts");
  expect(roots(virtual)["tsconfig.json"]).not.toContain("tests/twin.js");
  expect(roots(virtual)["tsconfig.dom.json"]).not.toContain("tests/client/.hidden.ts");
  expect(roots(virtual)["tsconfig.dom.json"]).not.toContain("tests/client/ignored/no.ts");
  expect(roots(virtual)["tsconfig.alias.json"]).toContain("client-alias/forms/editor/autosave-contract.test-d.ts");
  expect(roots(virtual)["empty/tsconfig.json"]).toEqual(["empty/src/new.ts"]);
});

test("a filename overlay refuses an explicitly listed deleted root", ({ scratch }) => {
  plant(scratch, {
    "tsconfig.json": JSON.stringify({ compilerOptions: { strict: true, noEmit: true }, files: ["tests/explicit.ts"] }),
    "tests/explicit.ts": "export {};",
  });
  expect(() => readCompilerPrograms(scratch, { addedPaths: [], deletedPaths: ["tests/explicit.ts"] })).toThrow(/compiler member.*cannot be resolved/u);
});

test("a source overlay may empty a previously nonempty include program", ({ scratch }) => {
  plant(scratch, {
    "tsconfig.json": JSON.stringify({ compilerOptions: { strict: true, noEmit: true }, include: ["tests/**/*.ts"] }),
    "tests/only.ts": "export {};",
  });
  const programs = readCompilerPrograms(scratch, { addedPaths: [], deletedPaths: ["tests/only.ts"] });
  expect(programs).toHaveLength(1);
  expect(programs[0]?.files).toEqual([]);
  expect(programs[0]?.commandLine.fileNames).toEqual([]);
  expect(programs[0]?.commandLine.errors).toEqual([]);
});

test("a virtual addition whose nearest existing ancestor escapes the repository is refused", ({ scratch }) => {
  plant(scratch, {
    ".gitignore": "node_modules/\n",
    "tsconfig.json": JSON.stringify({ compilerOptions: { strict: true, noEmit: true }, include: ["node_modules/escape/**/*.ts"] }),
  });
  mkdirSync(join(scratch, "node_modules"));
  symlinkSync(dirname(scratch), join(scratch, "node_modules/escape"), "dir");
  expect(() => readCompilerPrograms(scratch, { addedPaths: ["node_modules/escape/new.ts"], deletedPaths: [] })).toThrow(
    "virtual compiler source resolves outside repository: node_modules/escape/new.ts",
  );
});

test("a virtual addition cannot claim a real node_modules path as authored source", ({ scratch }) => {
  plant(scratch, {
    ".gitignore": "node_modules/\n",
    "tsconfig.json": JSON.stringify({ compilerOptions: { strict: true, noEmit: true }, files: ["tests/anchor.ts"] }),
    "tests/anchor.ts": "export {};",
    "node_modules/vendor/package.json": "{}",
  });
  expect(() => readCompilerPrograms(scratch, { addedPaths: ["node_modules/vendor/new.ts"], deletedPaths: [] })).toThrow(
    "virtual compiler source is not authored repository source: node_modules/vendor/new.ts",
  );
});

// ── the RAW half (#2021): what `ParsedCommandLine` consumes and destroys ───────────────────────────────
// `readCompilerConfigEntries` publishes the authored QUESTION (`include`/`exclude` as spelled, with line
// identity) beside the folded ANSWER the rest of this module derives. Its consumer is the `grant-liveness`
// family's entry-liveness pair, which judges entries that expand to NOTHING — precisely the rows that leave
// no trace in `fileNames`.

test("raw entries are unfolded, unexpanded, and carry their own line", () => {
  const text = `{\n  "extends": "./base.json",\n  "include": ["src", "../reset.d.ts"],\n  "compilerOptions": { "strict": true },\n  "exclude": [\n    "**/node_modules"\n  ]\n}\n`;
  const read = readCompilerConfigEntries("packages/ui/tsconfig.json", text);
  expect(read.status).toBe("read");
  expect(read.status === "read" ? read.entries : []).toEqual([
    { field: "include", value: "src", line: 3 },
    { field: "include", value: "../reset.d.ts", line: 3 },
    { field: "exclude", value: "**/node_modules", line: 6 },
  ]);
});

test("a comment and a trailing comma are JSONC, not a parse failure — but a malformed config IS one", () => {
  const jsonc = readCompilerConfigEntries("tsconfig.json", `{\n  // the world root\n  "include": ["a.ts",],\n}\n`);
  expect(jsonc.status === "read" ? jsonc.entries.map(({ value }) => value) : []).toEqual(["a.ts"]);
  const broken = readCompilerConfigEntries("tsconfig.json", '{\n  "include": [ \n}\n');
  expect(broken.status).toBe("unparseable");
  // The distinction is the whole point: "no entries" and "I could not read" must never be the same answer,
  // because a silently-defaulted type config checks a program nobody declared.
  expect(broken.status === "unparseable" ? broken.reason : "").toContain("expected");
});

test("the roster is derived from a path inventory, never from a directory walk", ({ repoRoot }) => {
  const roster = compilerConfigRoster(readPolicyRepositoryInventory(repoRoot).paths);
  expect(roster).toEqual(expect.arrayContaining(["tsconfig.json", "tsconfig.base.json", "packages/ui/tsconfig.json", "tooling/tsconfig.json"]));
  // Strictly broader than the three directories the retired `readdirSync` roster looked in, and it includes
  // the TEMPLATE configs program discovery excludes — an entry in a template is authored authority too.
  expect(roster.some((config) => config.endsWith("tsconfig.world-node.json"))).toBe(true);
  expect(roster.every((config) => /(?:^|\/)tsconfig[^/]*\.json$/u.test(config))).toBe(true);
});

test("the real programs are shared across policy scope and membership checking", ({ repoRoot }) => {
  const programs = readAvailablePolicyPrograms(readPolicyRepositoryInventory(repoRoot));
  expect(programs.map((program) => program.config)).toEqual(
    expect.arrayContaining(["tsconfig.json", "tsconfig.tests-dom.json", "packages/showcase-plugins/tsconfig.json", "tooling/tsconfig.json"]),
  );
  expect(programs.some((program) => program.config === "tsconfig.base.json")).toBe(false);
  expect(programs.find((program) => program.config === "tooling/tsconfig.json")?.files).toContain("tooling/src/verify/lib/selection.ts");
});
