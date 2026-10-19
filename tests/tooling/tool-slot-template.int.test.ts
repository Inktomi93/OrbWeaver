// The five-slot tool template (docs/law/Core-Tooling-Law.md §4.1): tooling/src holds tool directories and floor/;
// a tool is cli.ts + index.ts + {contract,ops,lib}; floor/ is role folders of flat modules. An ENGINE is an
// index.ts-only tool directory that a module under snap/ enters through that index, so it owes no argv door.
import { readFileSync } from "node:fs";
import { posix } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { ts } from "ts-morph";
import { readAuthoredRepositoryInventory } from "../../tooling/src/floor/compiler/authored-repository.ts";

const TOOLING_SRC = "tooling/src";
const FLOOR = "floor";
const SNAP = "snap";
const TOOL_ROOT_FILES: ReadonlySet<string> = new Set(["cli.ts", "index.ts"]);
const TOOL_SLOT_DIRS: ReadonlySet<string> = new Set(["contract", "ops", "lib"]);
// verify/gates is a descriptor corpus the loader globs (it is the registry), so it is the one sanctioned sixth slot.
// The row is keyed per tool: a second stray directory under any tool, including verify, is still a violation.
const CORPUS_SLOTS: Readonly<Record<string, string>> = { verify: "gates" };

type Rule = "loose-file" | "no-index" | "no-cli" | "not-a-slot" | "stray-root-file" | "loose-floor-module" | "nested-floor-folder" | "stale-corpus-row";

interface Violation {
  readonly rule: Rule;
  readonly path: string;
}

type Kind = "file" | "directory";

/** Directory listing of every tooling/src directory, derived from the file paths. */
function listing(files: readonly string[]): Listing {
  const dirs = new Map<string, Map<string, Kind>>();
  for (const file of files) {
    const segments = file.split("/");
    for (let depth = 2; depth < segments.length; depth += 1) {
      const dir = segments.slice(0, depth).join("/");
      const kind: Kind = depth === segments.length - 1 ? "file" : "directory";
      const members = dirs.get(dir) ?? new Map<string, Kind>();
      members.set(segments[depth] ?? "", kind);
      dirs.set(dir, members);
    }
  }
  return dirs;
}

/** Tool dirs some module under snap/ enters through `<tool>/index.ts`, read from snap's own relative import declarations. */
function engineTools(files: readonly string[], read: (path: string) => string): ReadonlySet<string> {
  const engines = new Set<string>();
  for (const file of files.filter((path) => path.startsWith(`${TOOLING_SRC}/${SNAP}/`) && /\.tsx?$/u.test(path))) {
    const source = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest);
    for (const statement of source.statements) {
      if (!(ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier) && statement.moduleSpecifier.text.startsWith("."))) {
        continue;
      }
      const target = posix.relative(TOOLING_SRC, posix.normalize(posix.join(posix.dirname(file), statement.moduleSpecifier.text))).split("/");
      const [tool, entry] = target;
      if (target.length === 2 && tool !== undefined && tool !== SNAP && tool !== FLOOR && entry === "index.ts") {
        engines.add(tool);
      }
    }
  }
  return engines;
}

type Listing = ReadonlyMap<string, ReadonlyMap<string, Kind>>;

function floorViolations(dirs: Listing): readonly Violation[] {
  const floor = `${TOOLING_SRC}/${FLOOR}`;
  return [...(dirs.get(floor) ?? [])].flatMap(([role, roleKind]): readonly Violation[] => {
    if (roleKind === "file") {
      return [{ rule: "loose-floor-module", path: `${floor}/${role}` }];
    }
    return [...(dirs.get(`${floor}/${role}`) ?? [])].flatMap(([member, memberKind]) =>
      memberKind === "directory" ? [{ rule: "nested-floor-folder" as const, path: `${floor}/${role}/${member}` }] : [],
    );
  });
}

function toolViolations(dirs: Listing, tool: string, engines: ReadonlySet<string>): readonly Violation[] {
  const path = `${TOOLING_SRC}/${tool}`;
  const members = dirs.get(path) ?? new Map<string, Kind>();
  const out: Violation[] = [];
  if (!members.has("index.ts")) {
    out.push({ rule: "no-index", path });
  }
  if (!(members.has("cli.ts") || (members.has("index.ts") && engines.has(tool)))) {
    out.push({ rule: "no-cli", path });
  }
  for (const [member, kind] of members) {
    if (kind === "directory" && !(TOOL_SLOT_DIRS.has(member) || CORPUS_SLOTS[tool] === member)) {
      out.push({ rule: "not-a-slot", path: `${path}/${member}` });
    } else if (kind === "file" && !TOOL_ROOT_FILES.has(member)) {
      out.push({ rule: "stray-root-file", path: `${path}/${member}` });
    }
  }
  return out;
}

function slotViolations(files: readonly string[], engines: ReadonlySet<string>): readonly Violation[] {
  const dirs = listing(files);
  const out: Violation[] = [];
  for (const [name, kind] of dirs.get(TOOLING_SRC) ?? []) {
    if (kind === "file") {
      out.push({ rule: "loose-file", path: `${TOOLING_SRC}/${name}` });
    } else {
      out.push(...(name === FLOOR ? floorViolations(dirs) : toolViolations(dirs, name, engines)));
    }
  }
  // A corpus row whose tool or slot directory is gone exempts nothing.
  for (const [tool, slot] of Object.entries(CORPUS_SLOTS)) {
    if (dirs.get(`${TOOLING_SRC}/${tool}`)?.get(slot) !== "directory") {
      out.push({ rule: "stale-corpus-row", path: `${TOOLING_SRC}/${tool}/${slot}` });
    }
  }
  return out;
}

/** Judge a synthetic tooling/src tree given as path to text. */
function judge(tree: Readonly<Record<string, string>>): readonly Violation[] {
  const files = Object.keys(tree);
  return slotViolations(
    files,
    engineTools(files, (path) => tree[path] ?? ""),
  );
}

const HOMES: Readonly<Record<string, string>> = {
  "tooling/src/verify/index.ts": "export {};\n",
  "tooling/src/verify/cli.ts": "export {};\n",
  "tooling/src/verify/gates/example.ts": "export {};\n",
};
const SNAP_TOOL: Readonly<Record<string, string>> = { "tooling/src/snap/cli.ts": "export {};\n", "tooling/src/snap/index.ts": "export {};\n" };
const ENGINE: Readonly<Record<string, string>> = { "tooling/src/enginetool/index.ts": "export const engine = 1;\n" };
const ENTERS: Readonly<Record<string, string>> = {
  "tooling/src/snap/ops/arms/design.ts": 'import { engine } from "../../../enginetool/index.ts";\nexport const d = engine;\n',
};
const IGNORES: Readonly<Record<string, string>> = { "tooling/src/snap/ops/arms/design.ts": "export const d = 1;\n" };

test("a conforming tool, an engine entered through snap, and the verify/gates corpus pass", () => {
  expect(judge({ ...HOMES, ...ENGINE, ...SNAP_TOOL, ...ENTERS })).toEqual([]);
  expect(
    judge({
      ...HOMES,
      "tooling/src/goodtool/cli.ts": "export {};\n",
      "tooling/src/goodtool/index.ts": "export {};\n",
      "tooling/src/goodtool/ops/run.ts": "export const r = 1;\n",
      "tooling/src/floor/cli/log.ts": "export const l = 1;\n",
    }),
  ).toEqual([]);
});

test("an index.ts-only dir that nothing under snap imports still owes its cli.ts", () => {
  expect(judge({ ...HOMES, ...ENGINE, ...SNAP_TOOL, ...IGNORES })).toEqual([{ rule: "no-cli", path: "tooling/src/enginetool" }]);
  // An engine still owes its index.ts: the clause never widens the other half.
  expect(judge({ ...HOMES, ...SNAP_TOOL, ...ENTERS, "tooling/src/enginetool/lib/walk.ts": "export const walk = 1;\n" })).toEqual(
    expect.arrayContaining([{ rule: "no-index", path: "tooling/src/enginetool" }]),
  );
});

test("a tool with neither front door, a loose root file and a loose floor module are each reported", () => {
  expect(judge({ ...HOMES, "tooling/src/badtool/stray.ts": "export const x = 1;\n" }).map(({ rule }) => rule)).toEqual([
    "no-index",
    "no-cli",
    "stray-root-file",
  ]);
  expect(judge({ ...HOMES, "tooling/src/loose.ts": "export const x = 1;\n" })).toEqual([{ rule: "loose-file", path: "tooling/src/loose.ts" }]);
  expect(judge({ ...HOMES, "tooling/src/floor/x.ts": "export const x = 1;\n" })).toEqual([{ rule: "loose-floor-module", path: "tooling/src/floor/x.ts" }]);
  expect(judge({ ...HOMES, "tooling/src/floor/process/sub/x.ts": "export const x = 1;\n" })).toEqual([
    { rule: "nested-floor-folder", path: "tooling/src/floor/process/sub" },
  ]);
  // No tool is shell-fronted.
  expect(judge({ ...HOMES, "tooling/src/sometool/cli.ts": "", "tooling/src/sometool/index.ts": "", "tooling/src/sometool/run.sh": "#!/bin/sh\n" })).toEqual([
    { rule: "stray-root-file", path: "tooling/src/sometool/run.sh" },
  ]);
});

test("the corpus slot is keyed to verify/gates alone and a stale row is reported", () => {
  const front = { "tooling/src/othertool/cli.ts": "", "tooling/src/othertool/index.ts": "" };
  expect(judge({ ...HOMES, ...front, "tooling/src/othertool/corpus/x.ts": "export const x = 1;\n" })).toEqual([
    { rule: "not-a-slot", path: "tooling/src/othertool/corpus" },
  ]);
  expect(judge({ ...HOMES, "tooling/src/verify/anything/x.ts": "export {};\n" })).toEqual([{ rule: "not-a-slot", path: "tooling/src/verify/anything" }]);
  const { "tooling/src/verify/gates/example.ts": _gates, ...withoutCorpus } = HOMES;
  expect(judge({ ...withoutCorpus, "tooling/src/verify/anything/x.ts": "export {};\n" }).map(({ rule }) => rule)).toContain("stale-corpus-row");
});

test("tooling/src follows the five-slot template", ({ repoRoot }) => {
  const files = readAuthoredRepositoryInventory(repoRoot).paths.filter((path) => path.startsWith(`${TOOLING_SRC}/`));
  const engines = engineTools(files, (path) => readFileSync(`${repoRoot}/${path}`, "utf8"));
  // A reader that goes blind finds no tools and no engines and reports nothing.
  expect(listing(files).get(TOOLING_SRC)?.size).toBeGreaterThan(10);
  expect(engines.size).toBeGreaterThan(0);
  expect(slotViolations(files, engines)).toEqual([]);
});
