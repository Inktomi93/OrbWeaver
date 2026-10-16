// @subject tooling/src/floor/compiler/semantic-inventory-extract.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { Project, SyntaxKind, ts } from "ts-morph";
import { readCompilerPrograms } from "../../../../tooling/src/floor/compiler/compiler-programs.ts";
import { extractInventoryPartition } from "../../../../tooling/src/floor/compiler/semantic-inventory-extract.ts";
import { execFixtureGit } from "../../../../tooling/src/floor/git/git-fixture.ts";
import { scaledBudget } from "../../_load-budget.ts";

const ROOTS = ["left/use.ts", "right/use.ts"] as const;
const options = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  noLib: true,
  types: [],
};

function packageFiles(): Readonly<Record<string, string>> {
  return Object.fromEntries(
    ROOTS.flatMap((root, index) => {
      const directory = dirname(root);
      return [
        [root, 'import {value} from "peer"; export const result=value;'],
        [`${directory}/node_modules/peer/package.json`, JSON.stringify({ name: "peer", version: "1.0.0", types: "index.d.ts" })],
        [`${directory}/node_modules/peer/index.d.ts`, `export declare const value: "${index === 0 ? "canonical" : "physical-other"}";`],
      ];
    }),
  );
}

function redirectWorld(): {
  project: Project;
  program: ts.Program;
  native: ts.SourceFile;
  host: import("ts-morph").SourceFile;
} {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: options });
  const fileSystem = project.getFileSystem();
  for (const [path, text] of Object.entries(packageFiles())) {
    fileSystem.writeFileSync(`/${path}`, text);
  }
  for (const root of ROOTS) {
    project.addSourceFileAtPath(`/${root}`);
  }
  project.resolveSourceFileDependencies();
  const program = project.getProgram().compilerObject;
  const native = program.getSourceFiles().find((source) => project.getSourceFile(source.fileName)?.compilerNode !== source);
  if (native === undefined) {
    throw new Error("duplicate package identities did not produce a native redirect");
  }
  return { project, program, native, host: project.getSourceFileOrThrow(native.fileName) };
}

test("Program admission preserves native redirect meaning and ancestry without changing the host registry", () => {
  const { project, program, native, host } = redirectWorld();
  const roots = project.getSourceFiles();
  const physicalText = host.getFullText();
  const view = project.getProgramSourceFile(native, program);
  expect(view).not.toBe(host);
  expect(view.compilerNode).toBe(native);
  expect(view.getProject()).toBe(project);
  expect(view.getFullText()).not.toBe(physicalText);
  expect(project.getSourceFile(native.fileName)).toBe(host);
  expect(project.getSourceFiles()).toEqual(roots);
  expect(project.getProgram().compilerObject).toBe(program);
  const statement = view.getStatements()[0];
  if (statement === undefined) {
    throw new Error("redirect statement is missing");
  }
  expect(statement.compilerNode).toBe(native.statements[0]);
  expect(statement.getParent()?.compilerNode).toBe(statement.compilerNode.parent);
  expect(statement.getSourceFile().compilerNode).toBe(statement.compilerNode.getSourceFile());
  expect(statement.getSourceFile()).not.toBe(view);
  expect(view.getSymbol()?.compilerSymbol).toBe(program.getTypeChecker().getSymbolAtLocation(native));
  for (const root of ROOTS) {
    expect(project.getSourceFileOrThrow(`/${root}`).getVariableDeclarationOrThrow("result").getType().getText()).toBe('"canonical"');
  }
  expect(host.getFullText()).toBe(physicalText);
});

test("borrowed root I/O and manipulation refuse before altering host bytes or compiler ownership", async () => {
  const { project, program, native, host } = redirectWorld();
  const view = project.getProgramSourceFile(native, program);
  const physicalText = host.getFullText();
  const fileSystem = project.getFileSystem();
  for (const mutate of [
    (): void => {
      view.saveSync();
    },
    (): void => {
      view.delete();
    },
    (): void => {
      view.deleteImmediatelySync();
    },
    (): void => {
      view.copy("/copy.d.ts");
    },
    (): void => {
      view.move("/moved.d.ts");
    },
    (): void => {
      view.replaceWithText("export {};");
    },
    (): void => {
      view.addStatements("export {};");
    },
    (): void => {
      view.applyTextChanges([{ span: { start: 0, length: 0 }, newText: " " }]);
    },
    (): void => {
      view.refreshFromFileSystemSync();
    },
  ]) {
    expect(mutate).toThrow("read-only");
    expect(project.getProgram().compilerObject).toBe(program);
    expect(project.getSourceFile(native.fileName)).toBe(host);
    expect(host.getFullText()).toBe(physicalText);
    expect(fileSystem.readFileSync(native.fileName)).toBe(physicalText);
  }
  await expect(view.save()).rejects.toThrow("read-only");
  await expect(view.deleteImmediately()).rejects.toThrow("read-only");
  await expect(view.refreshFromFileSystem()).rejects.toThrow("read-only");
  expect(fileSystem.fileExistsSync("/copy.d.ts")).toBe(false);
  expect(fileSystem.fileExistsSync("/moved.d.ts")).toBe(false);
});

test("native admission rejects foreign, cloned and stale sources while forget and reset preserve host reuse", () => {
  const { project, program, native, host } = redirectWorld();
  const foreign = redirectWorld();
  const clone = ts.createSourceFile(native.fileName, native.text, native.languageVersion, true);
  expect(() => project.getProgramSourceFile(clone, program)).toThrow("not admitted");
  expect(() => project.getProgramSourceFile(native, foreign.program)).toThrow("not admitted");
  expect(() => foreign.project.getProgramSourceFile(native, program)).toThrow("not admitted");
  const view = project.getProgramSourceFile(native, program);
  view.getStatements();
  view.forget();
  expect(project.getSourceFile(native.fileName)).toBe(host);
  expect(project.getProgram().compilerObject).toBe(program);
  const renewed = project.getProgramSourceFile(native, program);
  expect(renewed).not.toBe(view);
  project.getSourceFileOrThrow(`/${ROOTS[0]}`).addStatements("export const changed=1;");
  expect(renewed.wasForgotten()).toBe(true);
  expect(() => project.getProgramSourceFile(native, program)).toThrow("not admitted");
  expect(() => renewed.getText()).toThrow("forgotten");
  const next = project.getProgram().compilerObject;
  const nextNative = next.getSourceFile(native.fileName);
  if (nextNative === undefined) {
    throw new Error("updated Program lost its package closure");
  }
  expect(project.getProgramSourceFile(nextNative, next).compilerNode).toBe(nextNative);
  expect(project.getSourceFile(native.fileName)).toBe(host);
  expect(project.getSourceFileOrThrow(`/${ROOTS[1]}`).getVariableDeclarationOrThrow("result").getType().getText()).toBe('"canonical"');
});

test(
  "native invocation extraction admits the full redirected closure while retaining each path's physical input bytes",
  ({ scratch }) => {
    const files = {
      ...packageFiles(),
      ".gitignore": "node_modules/\n.cache/\n",
      "tsconfig.json": JSON.stringify({
        compilerOptions: { target: "ES2022", module: "ESNext", moduleResolution: "Bundler", noLib: true, types: [] },
        files: ROOTS,
      }),
    };
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(dirname(join(scratch, path)), { recursive: true });
      writeFileSync(join(scratch, path), text);
    }
    execFixtureGit(scratch, ["init", "-q"]);
    const descriptor = readCompilerPrograms(scratch).find(({ id }) => id === "tsconfig.json");
    if (descriptor === undefined) {
      throw new Error("admission fixture compiler world is missing");
    }
    const project = new Project({ skipAddingFilesFromTsConfig: true, compilerOptions: descriptor.commandLine.options });
    const source = project.addSourceFileAtPath(join(scratch, ROOTS[0]));
    const node = source.getVariableDeclarationOrThrow("result").getInitializerOrThrow();
    const partition = extractInventoryPartition({
      root: scratch,
      descriptor,
      destination: join(scratch, "unused.sqlite"),
      families: ["invocation-evidence", "global-origins", "computed-names"],
      invocationQueries: [
        {
          node: { file: source.getFilePath(), start: node.getStart(), end: node.getEnd(), kind: SyntaxKind.Identifier },
          mode: "value",
          facets: ["module"],
          arguments: [],
        },
      ],
      globalOriginQueries: [],
      globalBindingQueries: [],
      computedNameQueries: [],
    });
    expect(partition.invocationEvidence).toHaveLength(1);
    const module = partition.invocationEvidence[0]?.profiles.find((profile) => profile.module !== undefined)?.module;
    if (module?.kind !== "resolved") {
      throw new Error("native imported value origin did not resolve");
    }
    expect(module.value.canonical).toMatchObject({
      kind: "project",
      sourceFile: { file: join(scratch, "left/node_modules/peer/index.d.ts") },
      exportedName: "value",
      declaration: { file: join(scratch, "left/node_modules/peer/index.d.ts") },
    });
    const declarations = Object.entries(packageFiles()).filter(([path]) => path.endsWith("index.d.ts"));
    expect(declarations).toHaveLength(2);
    for (const [path, text] of declarations) {
      expect(partition.sources.find((entry) => entry.path === join(scratch, path))?.text).toBe(text);
    }
  },
  scaledBudget(30_000),
);
