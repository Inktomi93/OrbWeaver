// Command-level lens and formatting proofs over tiny projects. These call the production VERBS table,
// ledger, emitter, TypeScript checker, and module resolver; only repository bootstrap/process behavior
// remains in cli.repo.int.test.ts.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import type { CompilerOptions } from "ts-morph";
import { ModuleKind, ModuleResolutionKind, Project } from "ts-morph";
import { describe } from "vitest";
import { installOutputSink } from "../../../../tooling/src/_shared/log.ts";
import { getWorkspace, searchGlobs } from "../../../../tooling/src/_shared/ts-workspace.ts";
import type { Hit } from "../../../../tooling/src/ast/index.ts";
import {
  AstToolError,
  beginRun,
  CORPUS_SYNTACTIC,
  CORPUS_TYPED,
  CORPUS_WIDE_SYNTACTIC,
  finishRun,
  parseFlags,
  runDepcruise,
  TYPED_VERBS,
  VERBS,
  WIDE_SYNTACTIC_VERBS,
} from "../../../../tooling/src/ast/index.ts";
import { emit } from "../../../../tooling/src/ast/lib/emit.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ROOT = "/repo";

interface VerbRun {
  readonly stdout: string;
  readonly stderr: string;
  readonly status: number;
  readonly epilogue: Record<string, string>;
}

interface VerbRunOptions {
  readonly verb: string;
  readonly arg: string;
  readonly argv?: readonly string[];
  readonly corpus?: string;
}

function projectOf(files: Readonly<Record<string, string>>, compilerOptions: CompilerOptions = {}): Project {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { baseUrl: ROOT, ...compilerOptions } });
  for (const [path, text] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, text);
  }
  return project;
}

function writeFixture(root: string, path: string, text: string): void {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, text);
}

function parseEpilogue(stderr: string): Record<string, string> {
  const line = stderr.split("\n").find((candidate) => candidate.startsWith("[ast] verb="));
  if (line === undefined) {
    return {};
  }
  const fields: Record<string, string> = {};
  for (const token of line.slice("[ast] ".length).split(" ")) {
    const cut = token.indexOf("=");
    if (cut > 0) {
      fields[token.slice(0, cut)] = token.slice(cut + 1);
    }
  }
  return fields;
}

/** Parse the documented composite JSON protocol: consecutive pretty-printed top-level values, with no
 *  narration between them. Nested object braces are indented by JSON.stringify, so only column-zero
 *  braces delimit a section. */
function parseJsonSections(stdout: string): readonly unknown[] {
  const sections: unknown[] = [];
  let lines: string[] = [];
  for (const line of stdout.split("\n")) {
    if (lines.length === 0) {
      if (line === "{") {
        lines = [line];
        continue;
      }
      if (line.trim() !== "") {
        throw new Error(`non-JSON stdout outside a composite section: ${line}`);
      }
      continue;
    }
    lines.push(line);
    if (line === "}") {
      sections.push(JSON.parse(lines.join("\n")) as unknown);
      lines = [];
    }
  }
  if (lines.length > 0) {
    throw new Error("unterminated composite JSON section");
  }
  return sections;
}

function runVerb(project: Project, options: VerbRunOptions): VerbRun {
  const { verb, arg, argv = [], corpus = CORPUS_SYNTACTIC } = options;
  const stdout: string[] = [];
  const stderr: string[] = [];
  const previousExitCode = process.exitCode;
  const release = installOutputSink({ line: (line) => stdout.push(line), warn: (line) => stderr.push(line) });
  process.exitCode = undefined;
  try {
    const flags = parseFlags([...argv]);
    const operation = VERBS[verb];
    if (operation === undefined) {
      throw new Error(`unregistered ast verb: ${verb}`);
    }
    beginRun(verb, corpus, flags);
    try {
      operation(project, arg, flags);
      finishRun();
    } catch (error) {
      if (!(error instanceof AstToolError)) {
        throw error;
      }
    }
    const stderrText = stderr.join("\n");
    return {
      stdout: stdout.join("\n"),
      stderr: stderrText,
      status: typeof process.exitCode === "number" ? process.exitCode : 0,
      epilogue: parseEpilogue(stderrText),
    };
  } finally {
    process.exitCode = previousExitCode;
    release();
  }
}

describe("ast command output over bounded projects", () => {
  test("composite JSON parsing refuses narration outside section values", () => {
    const section = '{\n "section": 1\n}';
    expect(() => parseJsonSections(`narration\n${section}\n`)).toThrow();
    expect(() => parseJsonSections(`${section}\ntrailing narration`)).toThrow();
  });

  test("a narrated single-result verb emits exactly one parseable JSON value", () => {
    const project = projectOf({ "packages/client/src/probe.ts": "export const present = 1;" });
    const run = runVerb(project, { verb: "dead", arg: "missing", argv: ["--json"], corpus: CORPUS_TYPED });
    const parsed = JSON.parse(run.stdout) as { label: string; total: number; hits: unknown[] };
    expect(parsed).toMatchObject({ label: "dead missing", total: 0, hits: [] });
    expect(run.stderr).toContain("dead missing: no declaration found");
    expect(run.stdout.trimStart().startsWith("{")).toBe(true);
    expect(run.stdout.trimEnd().endsWith("}")).toBe(true);
  });

  test("JSON emission preserves distinct same-line findings while collapsing exact duplicates", () => {
    const hits: Hit[] = [
      { file: "packages/contracts/src/probe.ts", line: 1, kind: "field-declared-only", text: "probeSchema.first" },
      { file: "packages/contracts/src/probe.ts", line: 1, kind: "field-declared-only", text: "probeSchema.first" },
      { file: "packages/contracts/src/probe.ts", line: 1, kind: "field-declared-only", text: "probeSchema.second" },
      { file: "packages/server/src/out.ts", line: 1, kind: "field-declared-only", text: "filtered.out" },
    ];
    const flags = parseFlags(["--json", "--max", "1", "--in", "packages/contracts"]);
    const stdout: string[] = [];
    const stderr: string[] = [];
    const previousExitCode = process.exitCode;
    const release = installOutputSink({ line: (line) => stdout.push(line), warn: (line) => stderr.push(line) });
    process.exitCode = undefined;
    try {
      beginRun("contract-field-liveness", CORPUS_SYNTACTIC, flags);
      emit(hits, flags, "contract-field-liveness fixture");
      finishRun();
      const payload = JSON.parse(stdout.join("\n")) as { total: number; shown: number; hits: Hit[]; meta: { matches: number; status: string } };
      expect(Object.keys(payload)).toEqual(["label", "total", "shown", "hits", "meta"]);
      expect(payload).toMatchObject({ total: 2, shown: 1, meta: { matches: 2, status: "partial" } });
      expect(payload.hits.map(({ text }) => text)).toEqual(["probeSchema.first"]);
      expect(stderr.join("\n")).toContain("2 hit(s) found, 1 displayed");
      expect(parseEpilogue(stderr.join("\n"))).toMatchObject({ matches: "2", status: "partial" });
    } finally {
      process.exitCode = previousExitCode;
      release();
    }
  });

  test("JSON extras cannot overwrite reserved result protocol fields", () => {
    const stdout: string[] = [];
    const release = installOutputSink({ line: (line) => stdout.push(line), warn: () => undefined });
    try {
      expect(() => emit([], parseFlags(["--json"]), "collision fixture", { jsonFields: { total: 999 } })).toThrow(
        /jsonFields collides with reserved result field "total"/u,
      );
      expect(stdout).toEqual([]);
    } finally {
      release();
    }
  });

  test("syntactic corpus receipts match the shared standard and extra search roots", ({ scratch }) => {
    writeFixture(scratch, "packages/client/src/main.ts", "export const sourceOnly = 1;\n");
    writeFixture(scratch, "tests/client/main.test.ts", "export const testOnly = 1;\n");
    writeFixture(scratch, "tooling/src/probe.ts", "export const toolingOnly = 1;\n");
    writeFixture(scratch, "scripts/dev/probe.ts", "export const scriptOnly = 1;\n");
    writeFixture(scratch, "packages/client/vite.config.ts", "export const packageRootOnly = 1;\n");
    writeFixture(scratch, "packages/client/src/extra.mts", "export const mtsOnly = 1;\n");
    writeFixture(scratch, "playwright/probe.tsx", "export const playwrightOnly = <main />;\n");
    writeFixture(scratch, "scripts/probes/st-goldens/sillytavern-runtime/ignored.ts", "export const ignoredCapture = 1;\n");

    const standard = getWorkspace({ root: scratch, types: false });
    const wide = getWorkspace({ root: scratch, types: false, globs: searchGlobs(scratch) });
    const relativePaths = (project: Project): string[] =>
      project
        .getSourceFiles()
        .map((source) => source.getFilePath().slice(scratch.length + 1))
        .sort();
    expect(relativePaths(standard)).toEqual(["packages/client/src/main.ts", "scripts/dev/probe.ts", "tests/client/main.test.ts", "tooling/src/probe.ts"]);
    expect(relativePaths(wide)).toEqual([
      "packages/client/src/extra.mts",
      "packages/client/src/main.ts",
      "packages/client/vite.config.ts",
      "playwright/probe.tsx",
      "scripts/dev/probe.ts",
      "tests/client/main.test.ts",
      "tooling/src/probe.ts",
    ]);
    expect(CORPUS_SYNTACTIC).toContain("scripts/**/*.ts");
    expect(CORPUS_SYNTACTIC).toContain("tooling/src/**/*.ts");
    expect(CORPUS_TYPED).toBe("native-program-authored-roots(per-tsconfig)");
    expect(CORPUS_WIDE_SYNTACTIC).toContain("packages/*/*.ts");
    expect(CORPUS_WIDE_SYNTACTIC).toContain("playwright/**/*.tsx");
    expect([...WIDE_SYNTACTIC_VERBS].sort()).toEqual(["aliases", "exports", "ident", "literal"]);
    expect([...TYPED_VERBS]).toEqual(expect.arrayContaining(["callers", "importers", "jsx", "refs"]));

    const scriptHit = runVerb(standard, { verb: "ident", arg: "scriptOnly" });
    expect(scriptHit.stdout).toContain("scripts/dev/probe.ts");
    const packageRootHit = runVerb(wide, { verb: "ident", arg: "packageRootOnly", corpus: CORPUS_WIDE_SYNTACTIC });
    expect(packageRootHit.stdout).toContain("packages/client/vite.config.ts");
    const absent = runVerb(wide, { verb: "ident", arg: "missing", corpus: CORPUS_WIDE_SYNTACTIC });
    expect(absent.stdout).toContain("RESULT ast ident missing: no results");
    expect(absent.stdout).not.toContain("excludes");
  });

  test("name lookup caveats and output filters distinguish empty answers from empty scans", () => {
    const project = projectOf({ "packages/client/src/calls.ts": "export function present(): void {}" });
    const absent = runVerb(project, { verb: "callers", arg: "missing", corpus: CORPUS_TYPED });
    expect(absent.status).toBe(0);
    expect(absent.stdout).toContain("no results");
    expect(absent.epilogue).toMatchObject({ scanned: "1", matches: "0", status: "complete" });

    const filtered = runVerb(project, { verb: "ident", arg: "present", argv: ["--in", "no-such-path"] });
    expect(filtered.status).toBe(2);
    expect(filtered.stderr).toContain("SCOPE ENTERED NOTHING");
    expect(filtered.epilogue).toMatchObject({ scanned: "0", status: "error" });

    const invalidScope = runVerb(project, { verb: "exports", arg: "packages/no-such-package/src" });
    expect(invalidScope.status).toBe(2);
    expect(invalidScope.epilogue["skipped"]).not.toBe("0");
    expect(invalidScope.epilogue).toMatchObject({ scanned: "0", status: "error" });

    const positive = runVerb(project, { verb: "exports", arg: "packages/client/src/calls.ts" });
    expect(positive.status).toBe(0);
    expect(positive.stdout).toContain("RESULT ast exports packages/client/src/calls.ts: 1 hit(s) in 1 file(s)");
  });

  test("literal searches include source and fixture literals while ignoring identifiers and comments", () => {
    const project = projectOf({
      "packages/contracts/src/events.ts": 'export const event = "chatDeleted";',
      "tests/contracts/events.test.ts": "export const fixture = `chatDeleted`;",
      "scripts/check.ts": "const chatDeletedIdentifier = 1; // chatDeleted comment",
    });
    const found = runVerb(project, { verb: "literal", arg: "chatDeleted", corpus: CORPUS_WIDE_SYNTACTIC });
    expect(found.stdout).toContain("packages/contracts/src/events.ts");
    expect(found.stdout).toContain("tests/contracts/events.test.ts");
    expect(found.stdout).not.toContain("scripts/check.ts");
    expect(found.epilogue).toMatchObject({ scanned: "3", matches: "2", status: "complete" });

    const absent = runVerb(project, { verb: "literal", arg: "nowhereAtAll9f3a1c", corpus: CORPUS_WIDE_SYNTACTIC });
    expect(absent.stdout).toContain("RESULT ast literal nowhereAtAll9f3a1c: no results");
    expect(absent.epilogue).toMatchObject({ matches: "0", status: "complete" });
  });

  test("source queries count distinct same-line AST occurrences", () => {
    const project = projectOf({
      "packages/client/src/query-sites.tsx": `
export function target(): null { return null; }
export function Widget(): null { return null; }
target(); target();
export const view = <><Widget /><Widget /></>;
export const names = [target, target];
export const values = ["needle", "needle"];
`,
    });
    expect(runVerb(project, { verb: "callers", arg: "target", corpus: CORPUS_TYPED }).epilogue).toMatchObject({ matches: "2" });
    expect(runVerb(project, { verb: "jsx", arg: "Widget", corpus: CORPUS_TYPED }).epilogue).toMatchObject({ matches: "2" });
    expect(runVerb(project, { verb: "ident", arg: "target" }).epilogue).toMatchObject({ matches: "5" });
    expect(runVerb(project, { verb: "literal", arg: "needle", corpus: CORPUS_WIDE_SYNTACTIC }).epilogue).toMatchObject({ matches: "2" });
  });

  test("refs discovers ordinary module-local declaration kinds", () => {
    const project = projectOf({
      "packages/kit/src/local-declarations.ts": `
class LocalClass {};
interface LocalInterface { value: string }
type LocalType = LocalInterface;
enum LocalEnum { Value }
const classUse = new LocalClass();
const interfaceUse: LocalInterface = { value: "x" };
const typeUse: LocalType = interfaceUse;
const enumUse = LocalEnum.Value;
`,
    });
    for (const name of ["LocalClass", "LocalInterface", "LocalType", "LocalEnum"]) {
      const run = runVerb(project, { verb: "refs", arg: name, corpus: CORPUS_TYPED });
      expect(run.stdout, name).toContain("[def]");
      expect(run.stdout, name).toContain("[ref]");
    }
  });

  test("callers and jsx follow declaration identity through aliases", () => {
    const project = projectOf({
      "packages/ui/src/subject.tsx": `
export function execute(): null { return null; }
export function Widget(): null { return null; }
`,
      "packages/client/src/use.tsx": `
import { execute as run, Widget as RenamedWidget } from "../../ui/src/subject";
run(); run();
function unrelated(): null { return null; }
const collision = { execute: unrelated, Widget: (): null => null };
collision.execute();
export const view = <>
  <RenamedWidget />
  <collision.Widget />
</>;
`,
    });
    const callers = runVerb(project, { verb: "callers", arg: "execute", corpus: CORPUS_TYPED });
    expect(callers.epilogue).toMatchObject({ matches: "2" });
    expect(callers.stdout).not.toContain("collision.execute");
    const jsx = runVerb(project, { verb: "jsx", arg: "Widget", corpus: CORPUS_TYPED });
    expect(jsx.epilogue).toMatchObject({ matches: "1" });
    expect(jsx.stdout).toContain("RenamedWidget");
    expect(jsx.stdout).not.toContain("collision.Widget");
  });

  test("callers follows resolved class methods without admitting same-spelled property collisions", () => {
    const project = projectOf({
      "packages/server/src/service.ts": `
export class Service { sendTurn(): void {} }
export class Other { sendTurnElsewhere(): void {} }
const service = new Service();
const other = new Other();
service.sendTurn();
const collision = { sendTurn: other.sendTurnElsewhere.bind(other) };
collision.sendTurn();
`,
    });
    const run = runVerb(project, { verb: "callers", arg: "sendTurn", corpus: CORPUS_TYPED });
    expect(run.epilogue).toMatchObject({ matches: "1" });
    expect(run.stdout).toContain("service.sendTurn()");
    expect(run.stdout).not.toContain("collision.sendTurn()");
  });

  test("importers canonicalizes a subject to resolved target identity", () => {
    const project = projectOf(
      {
        "packages/kit/src/target.ts": "export const value = 1;",
        "packages/kit/src/one.ts": 'import { value } from "#target"; import { value as sameLine } from "#target"; export { value, sameLine };',
        "packages/kit/src/nested/two.ts": 'import { value } from "../target"; export { value };',
        "packages/kit/src/nested/lazy.ts": 'export const load = () => import("../target");',
      },
      {
        module: ModuleKind.NodeNext,
        moduleResolution: ModuleResolutionKind.NodeNext,
        paths: { "#target": ["packages/kit/src/target.ts"] },
      },
    );
    project.resolveSourceFileDependencies();
    const run = runVerb(project, { verb: "importers", arg: "#target", corpus: CORPUS_TYPED });
    expect(run.epilogue).toMatchObject({ matches: "4" });
    expect(run.stdout).toContain("src/one.ts");
    expect(run.stdout).toContain("src/nested/two.ts");
    expect(run.stdout).toContain("src/nested/lazy.ts");
  });

  test("cycles reports one stable cyclic component for overlapping cycles", () => {
    const project = projectOf({
      "packages/kit/src/a.ts": 'import "./b"; import "./c";',
      "packages/kit/src/b.ts": 'import "./a";',
      "packages/kit/src/c.ts": 'import "./a";',
    });
    project.resolveSourceFileDependencies();
    const run = runVerb(project, { verb: "cycles", arg: "kit", corpus: CORPUS_TYPED });
    expect(run.epilogue).toMatchObject({ matches: "1" });
    expect(run.stdout).toContain("a.ts");
    expect(run.stdout).toContain("b.ts");
    expect(run.stdout).toContain("c.ts");
  });

  test("cycles retains a resolved self-import as a cyclic component", () => {
    const project = projectOf({
      "packages/kit/src/self.ts": 'import "./self"; export const value = 1;',
    });
    project.resolveSourceFileDependencies();
    const run = runVerb(project, { verb: "cycles", arg: "kit", corpus: CORPUS_TYPED });
    expect(run.epilogue).toMatchObject({ matches: "1" });
    expect(run.stdout).toContain("self.ts");
  });

  test("aliases reports local and exported const rebindings", () => {
    const project = projectOf({
      "packages/kit/src/aliases.ts": "const origin = (): void => {}; const localAlias = origin; export const publicAlias = origin;",
    });
    const run = runVerb(project, { verb: "aliases", arg: "packages/kit/src", corpus: CORPUS_WIDE_SYNTACTIC });
    expect(run.epilogue).toMatchObject({ matches: "2" });
    expect(run.stdout).toContain("const localAlias = origin");
    expect(run.stdout).toContain("const publicAlias = origin");
  });

  test("flow and reaches pass the governed graph roots and receipt through dependency-cruiser", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const calls: { cmd: string; args: readonly string[] }[] = [];
    const previousExitCode = process.exitCode;
    const release = installOutputSink({ line: (line) => stdout.push(line), warn: (line) => stderr.push(line) });
    process.exitCode = undefined;
    try {
      beginRun("flow", "depcruise(.dependency-cruiser.cjs)", parseFlags([]));
      await runDepcruise("--focus", "probe", (cmd, args) => {
        calls.push({ cmd, args });
        return Promise.resolve({ stdout: "packages/a.ts -> tooling/src/b.ts\n", stderr: "", code: 0, timedOut: false });
      });
      finishRun();
      expect(calls).toEqual([
        {
          cmd: "node_modules/.bin/depcruise",
          args: ["packages", "tooling", "--config", ".dependency-cruiser.cjs", "--output-type", "text", "--focus", "probe"],
        },
      ]);
      expect(stdout).toEqual(["packages/a.ts -> tooling/src/b.ts"]);
      expect(parseEpilogue(stderr.join("\n"))).toMatchObject({ scope: expect.stringContaining("graph-roots:packages,tooling"), matches: "1" });
    } finally {
      process.exitCode = previousExitCode;
      release();
    }
  });

  test("columns --all prints finding and healthy tables plus the total sweep receipt", () => {
    const project = projectOf({
      "packages/db/src/drizzle.ts": `
export declare function sqliteTable<T>(name: string, cols: T): T;
export declare function text(name: string): string;
export declare const db: {
  insert: (table: unknown) => { values: (value: unknown) => void };
  select: () => { from: (table: unknown) => unknown[] };
};`,
      "packages/db/src/schema/tables.ts": `
import { sqliteTable, text } from "../drizzle";
export const widgets = sqliteTable("widgets", { live: text("live"), ghost: text("ghost") });
export const healthy = sqliteTable("healthy", { id: text("id"), label: text("label") });`,
      "packages/server/src/use-tables.ts": `
import { db } from "../../db/src/drizzle";
import { healthy, widgets } from "../../db/src/schema/tables";
db.insert(widgets).values({ live: widgets.live });
db.insert(healthy).values({ id: healthy.id, label: healthy.label });
db.select().from(healthy);`,
    });
    const run = runVerb(project, { verb: "columns", arg: "", argv: ["--all", "--max", "20"], corpus: CORPUS_TYPED });
    expect(run.status).toBe(0);
    expect(run.stdout).toContain("widgets (widgets): 1 of 2 column(s) flagged");
    expect(run.stdout).toContain("healthy (healthy): healthy — 0 of 2 column(s) flagged");
    expect(run.stdout).toContain("columns --all: swept 2 table(s), 1 carrying a finding.");
    expect(run.stdout).toContain("columns: 4 column(s) across 2 table(s)");

    const jsonRun = runVerb(project, { verb: "columns", arg: "", argv: ["--all", "--json", "--max", "20"], corpus: CORPUS_TYPED });
    const payload = JSON.parse(jsonRun.stdout) as { label: string; total: number; hits: unknown[] };
    expect(payload).toMatchObject({ label: "columns (all tables)", total: 1 });
    expect(payload.hits).toHaveLength(1);
    expect(jsonRun.stderr).toContain("healthy — 0 of 2 column(s) flagged");
    expect(jsonRun.stderr).toContain("columns --all: swept 2 table(s), 1 carrying a finding.");
  });

  test("columns JSON reports a consumed table with no production writer and clears it only with real write evidence", () => {
    const base = {
      "packages/db/src/drizzle.ts": `
export declare function sqliteTable<T>(name: string, cols: T): T;
export declare function text(name: string): string;
export declare const db: {
  insert: (table: unknown) => { values: (value: unknown) => void };
  update: (table: unknown) => { set: (value: unknown) => void };
};`,
      "packages/db/src/schema/tables.ts": `
import { sqliteTable, text } from "../drizzle";
export const widgets = sqliteTable("widgets", { live: text("live"), ghost: text("ghost") });`,
      "packages/server/src/read.ts": `
import { widgets } from "../../db/src/schema/tables";
export const read = (): unknown => widgets.live;`,
    };
    const tableHits = (files: Readonly<Record<string, string>>): readonly Hit[] => {
      const run = runVerb(projectOf({ ...base, ...files }), { verb: "columns", arg: "widgets", argv: ["--json", "--max", "20"], corpus: CORPUS_TYPED });
      expect(run.status).toBe(0);
      const payload = JSON.parse(run.stdout) as { hits: Hit[] };
      return payload.hits.filter(({ kind }) => kind === "column-table-producerless");
    };

    const missingWriter = runVerb(projectOf(base), { verb: "columns", arg: "widgets", argv: ["--json", "--max", "20"], corpus: CORPUS_TYPED });
    const missingPayload = JSON.parse(missingWriter.stdout) as { hits: Hit[] };
    expect(missingPayload.hits.filter(({ kind }) => kind === "column-table-producerless")).toHaveLength(1);
    expect(new Set(missingPayload.hits.map(({ kind }) => kind))).toEqual(new Set(["column-table-producerless", "column-read-only", "column-neither"]));

    expect(
      tableHits({
        "tests/server/widgets.test.ts": `
import { db } from "../../packages/db/src/drizzle";
import { widgets } from "../../packages/db/src/schema/tables";
db.insert(widgets).values({ live: "fixture" });`,
      }),
    ).toHaveLength(1);
    expect(
      tableHits({
        "packages/server/src/write.ts": `
import { db } from "../../db/src/drizzle";
import { widgets } from "../../db/src/schema/tables";
db.insert(widgets).values({});`,
      }),
    ).toEqual([]);
    expect(
      tableHits({
        "packages/server/src/write.ts": `
import { db } from "../../db/src/drizzle";
import { widgets } from "../../db/src/schema/tables";
declare const row: unknown;
db.insert(widgets).values(row);`,
      }),
    ).toEqual([]);
    expect(
      tableHits({
        "packages/server/src/write.ts": `
import { db } from "../../db/src/drizzle";
import { widgets } from "../../db/src/schema/tables";
db.update(widgets).set({});`,
      }),
    ).toEqual([]);
    expect(
      tableHits({
        "packages/server/src/write.ts": `
declare const sql: {
  (parts: TemplateStringsArray, ...values: unknown[]): unknown;
  raw: (text: string) => unknown;
};
export const taggedStatement = sql\`INSERT INTO widgets DEFAULT VALUES\`;
export const rawStatement = sql.raw("INSERT INTO widgets DEFAULT VALUES");`,
      }),
    ).toHaveLength(1);
    expect(
      tableHits({
        "packages/server/src/write.ts": `
declare const db: { execute: (statement: unknown) => unknown };
declare const sql: (parts: TemplateStringsArray, ...values: unknown[]) => unknown;
const statement = sql\`INSERT INTO widgets DEFAULT VALUES\`;
db.execute(statement);`,
      }),
    ).toEqual([]);
    expect(
      tableHits({
        "packages/server/src/write.ts": `
declare const db: { execute: (statement: unknown) => unknown };
declare const sql: {
  (parts: TemplateStringsArray, ...values: unknown[]): unknown;
  raw: (text: string) => unknown;
};
declare const dynamicText: string;
let statement = sql\`INSERT INTO widgets DEFAULT VALUES\`;
statement = sql.raw(dynamicText);
db.execute(statement);`,
      }),
    ).toHaveLength(1);

    const healthyFiles = {
      "packages/server/src/write.ts": `
import { db } from "../../db/src/drizzle";
import { widgets } from "../../db/src/schema/tables";
db.insert(widgets).values({ live: "production", ghost: "production" });`,
      "packages/server/src/read-ghost.ts": `
import { widgets } from "../../db/src/schema/tables";
export const readGhost = (): unknown => widgets.ghost;`,
    };
    const healthyRun = runVerb(projectOf({ ...base, ...healthyFiles }), {
      verb: "columns",
      arg: "widgets",
      argv: ["--json", "--max", "20"],
      corpus: CORPUS_TYPED,
    });
    expect((JSON.parse(healthyRun.stdout) as { hits: Hit[] }).hits).toEqual([]);
    expect(
      tableHits({
        "packages/server/src/read-ghost.ts": healthyFiles["packages/server/src/read-ghost.ts"],
      }),
    ).toHaveLength(1);
  });

  test("columns --all keeps same-named schema exports in their canonical table sections", () => {
    const project = projectOf({
      "packages/db/src/drizzle.ts": `
export declare function sqliteTable<T>(name: string, cols: T): T;
export declare function text(name: string): string;
export declare const db: { insert: (table: unknown) => { values: (value: unknown) => void } };`,
      "packages/db/src/schema/a.ts": `
import { sqliteTable, text } from "../drizzle";
export const events = sqliteTable("a_events", { aValue: text("a_value") });`,
      "packages/db/src/schema/b.ts": `
import { sqliteTable, text } from "../drizzle";
export const events = sqliteTable("b_events", { bValue: text("b_value") });`,
      "packages/server/src/events.ts": `
import { db } from "../../db/src/drizzle";
import { events as aEvents } from "../../db/src/schema/a";
db.insert(aEvents).values({ aValue: "written" });
export const read = aEvents.aValue;`,
    });

    const run = runVerb(project, { verb: "columns", arg: "", argv: ["--all", "--max", "20"], corpus: CORPUS_TYPED });
    expect(run.stdout).toContain("a_events (events): healthy — 0 of 1 column(s) flagged");
    expect(run.stdout).toContain("b_events (events): 1 of 1 column(s) flagged");
    expect(run.stdout).not.toContain("b_events (events): producerless table");
    expect(run.stdout).not.toContain("table reads:1");
  });

  test("columns reports a writerless full-table select but not an import-only table", () => {
    const project = projectOf({
      "packages/db/src/drizzle.ts": `
export declare function sqliteTable<T>(name: string, cols: T): T;
export declare function text(name: string): string;
export declare const db: { select: () => { from: (table: unknown) => unknown[] } };`,
      "packages/db/src/schema/tables.ts": `
import { sqliteTable, text } from "../drizzle";
export const selected = sqliteTable("selected", { value: text("value") });
export const mentioned = sqliteTable("mentioned", { value: text("value") });`,
      "packages/server/src/read.ts": `
import { db } from "../../db/src/drizzle";
import { mentioned, selected } from "../../db/src/schema/tables";
export const tableAlias = mentioned;
export function readAll(): unknown[] { return db.select().from(selected); }`,
    });

    const run = runVerb(project, { verb: "columns", arg: "", argv: ["--json", "--max", "20"], corpus: CORPUS_TYPED });
    const payload = JSON.parse(run.stdout) as { hits: Hit[] };
    expect(payload.hits.filter(({ kind }) => kind === "column-table-producerless").map(({ text }) => text)).toEqual([expect.stringContaining("selected")]);
    expect(payload.hits.filter(({ text }) => text.includes("selected.value"))).toEqual([expect.objectContaining({ kind: "column-neither" })]);
    expect(payload.hits.filter(({ text }) => text.includes("mentioned.value"))).toEqual([expect.objectContaining({ kind: "column-neither" })]);
  });

  test("regkeys --all keeps same-file property reads alive and reports an unused control registry", () => {
    const project = projectOf({
      "packages/client/src/motion.ts": `
export const MOTION_BUDGETS = { frameGapMs: 1, cssScanIntervalMs: 2, spaceScanCap: 3 } as const;
export function reads(): number {
  return MOTION_BUDGETS.frameGapMs + MOTION_BUDGETS?.cssScanIntervalMs + MOTION_BUDGETS["spaceScanCap"];
}
export const UNUSED_KEYS = { first: 1, second: 2, third: 3 } as const;`,
    });
    const run = runVerb(project, { verb: "regkeys", arg: "", argv: ["--all", "--max", "20"] });
    expect(run.status).toBe(0);
    expect(run.stdout).toContain("MOTION_BUDGETS (/repo/packages/client/src/motion.ts): healthy — 0 of 3 row(s) undispatched");
    expect(run.stdout).toContain("UNUSED_KEYS (/repo/packages/client/src/motion.ts): 3 of 3 row(s) undispatched");
    expect(run.stdout).toContain("regkeys --all: swept 2 registry/registries, 1 carrying a finding.");
  });

  test("rot follows a package import-map lazy member without crediting its untouched export", () => {
    const project = new Project({
      useInMemoryFileSystem: true,
      compilerOptions: {
        module: ModuleKind.NodeNext,
        moduleResolution: ModuleResolutionKind.NodeNext,
        resolvePackageJsonImports: true,
        strict: true,
      },
    });
    project
      .getFileSystem()
      .writeFileSync(
        `${ROOT}/packages/ui/package.json`,
        JSON.stringify({ name: "@fixture/ui", type: "module", imports: { "#code-editor": "./src/code-editor/code-editor.ts" } }),
      );
    project.createSourceFile(
      `${ROOT}/packages/ui/src/code-editor/code-editor.ts`,
      "export function CodeEditor(): null { return null; }\nexport function ControlOnly(): null { return null; }",
    );
    project.createSourceFile(`${ROOT}/packages/ui/src/consumer.ts`, 'export const load = () => import("#code-editor").then((module) => module.CodeEditor);');
    project.createSourceFile(
      `${ROOT}/tests/ui/code-editor.test.ts`,
      'import { ControlOnly } from "../../packages/ui/src/code-editor/code-editor"; export const control = ControlOnly;',
    );
    project.resolveSourceFileDependencies();

    const run = runVerb(project, { verb: "rot", arg: "ui", argv: ["--max", "20"], corpus: CORPUS_TYPED });
    expect(run.status).toBe(0);
    expect(run.stdout).not.toContain("CodeEditor  —");
    expect(run.stdout).toContain("ControlOnly");
    expect(run.stdout).toContain("RESULT ast rot ui :: testonly: 1 hit(s)");
    expect(run.epilogue["status"]).toBe("complete");

    const jsonRun = runVerb(project, { verb: "rot", arg: "ui", argv: ["--json", "--max", "20"], corpus: CORPUS_TYPED });
    const sections = parseJsonSections(jsonRun.stdout) as readonly { label: string }[];
    expect(sections.map(({ label }) => label)).toEqual([
      "rot ui :: orphans",
      "rot ui :: testonly",
      "rot ui :: chains",
      "rot ui :: typeonly-alive",
      "rot ui :: swallowed",
    ]);
    expect(jsonRun.stderr).toContain("ONE project load + ONE liveness build");
  });

  test("jsx recognizes paired and self-closing elements with the full known flag vocabulary", () => {
    const project = projectOf({
      "packages/client/src/view.tsx":
        "export function Button(): null { return null; } export function Skeleton(): null { return null; } export const view = <><Button>Save</Button><Skeleton /></>;",
      "packages/ui/src/other.tsx": 'import { Skeleton } from "../../client/src/view"; export const other = <Skeleton />;',
    });
    const paired = runVerb(project, { verb: "jsx", arg: "Button", argv: ["--files"], corpus: CORPUS_TYPED });
    expect(paired.stdout).toContain("packages/client/src/view.tsx");
    expect(paired.epilogue["langs"]).toMatch(/tsx:\d+/u);

    const selfClosing = runVerb(project, {
      verb: "jsx",
      arg: "Skeleton",
      argv: ["--in", "packages/client/src", "--max", "5", "--json"],
      corpus: CORPUS_TYPED,
    });
    const payload = JSON.parse(selfClosing.stdout) as { total: number; hits: { file: string }[] };
    expect(payload.total).toBe(1);
    expect(payload.hits.every(({ file }) => file.includes("packages/client/src"))).toBe(true);
  });
});
