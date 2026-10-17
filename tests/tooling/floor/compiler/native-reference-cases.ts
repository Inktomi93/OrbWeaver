import childProcess from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { join } from "node:path";
import process from "node:process";
import { isDeepStrictEqual } from "node:util";
import type { Node } from "ts-morph";
import type { InventoryBuildRequest, InventorySpan } from "../../../../tooling/src/floor/code-facts/semantic-inventory-contract.ts";

function required<T>(value: T | undefined): T {
  if (value === undefined) {
    throw new Error("native reference case input missing");
  }
  return value;
}
function physical(nodes: readonly Node[]): readonly InventorySpan[] {
  return nodes.map((node) => ({ file: node.getSourceFile().getFilePath(), start: node.getStart(), end: node.getEnd(), kind: node.getKind() }));
}
function refusal(action: () => void): string | null {
  try {
    action();
    return null;
  } catch (error) {
    return String(error);
  }
}

async function run(mode: string, root: string): Promise<object> {
  const workers: string[] = [];
  const spawn = childProcess.spawnSync;
  Object.defineProperty(childProcess, "spawnSync", {
    value: (...args: Parameters<typeof spawn>): ReturnType<typeof spawn> => {
      const index = args[1]?.findIndex((value) => value.endsWith("semantic-inventory-worker.ts")) ?? -1;
      const request = index < 0 ? undefined : args[1]?.[index + 1];
      if (request !== undefined) {
        workers.push((JSON.parse(readFileSync(request, "utf8")) as InventoryBuildRequest).descriptor.id);
      }
      return spawn(...args);
    },
  });
  syncBuiltinESMExports();
  const { Project, SyntaxKind } = await import("ts-morph");
  const { createSemanticInventory } = await import("../../../../tooling/src/floor/code-facts/semantic-inventory.ts");
  const { createSemanticWorkspace, hasRegisteredSemanticProgram, semanticWorkspaceOf } = await import("../../../../tooling/src/floor/compiler/ts-workspace.ts");
  const { projectCtx, nativeTypeFactOptions } = await import("../../../../tooling/src/verify/lib/project-context.ts");
  try {
    if (mode === "capability") {
      const { defineGate } = await import("../../../../tooling/src/verify/contract/policy.ts");
      const { runPolicyPass } = await import("../../../../tooling/src/verify/lib/policy-pass.ts");
      const entry = "packages/server/src/importer.ts";
      const context = projectCtx(root);
      const dependency = context.project.addSourceFileAtPath(join(root, ".deps/external.d.ts")).getVariableDeclarationOrThrow("external").getNameNode();
      const source = context.project.getSourceFileOrThrow(join(root, entry));
      let observed: readonly Node[] = [];
      const policy = defineGate({
        id: "native-reference-probe",
        family: "native-reference-probe",
        authority: "hard",
        severity: "error",
        population: "@server",
        analysis: "types",
        execution: "selected-files",
        facts: [],
        resources: [],
        message: "reference capability probe",
        create: (ctx) => ({
          prepare: () => required(ctx.nativeTypes).request({ kind: "references", nodes: [dependency], importer: source }),
          evaluate: () => {
            observed = required(required(ctx.nativeTypes).references([dependency], source).get(dependency));
          },
        }),
        mustFlag: [{ mode: "types", files: { [entry]: "export const unused=1;" }, why: "the production capability control owns the result" }],
        mustPass: [{ mode: "types", files: { [entry]: "export const unused=1;" }, why: "the production capability control owns the result" }],
      });
      const options = { root, project: context.project, ...nativeTypeFactOptions(context), reviewedGrants: [], failOnWarnings: false };
      const result = runPolicyPass({ ...options, knownPolicies: [policy], policies: [policy] });
      const outside = defineGate({
        ...policy,
        id: "native-reference-foreign-root",
        family: "native-reference-foreign-root",
        create: (ctx) => ({
          prepare: () => required(ctx.nativeTypes).request({ kind: "references", nodes: [dependency], importer: dependency.getSourceFile() }),
          evaluate: () => undefined,
        }),
      });
      const refused = runPolicyPass({ ...options, knownPolicies: [outside], policies: [outside] });
      return { errors: result.toolErrors, files: observed.map((node) => node.getSourceFile().getBaseName()).toSorted(), refused: refused.toolErrors };
    }
    if (mode === "owners") {
      const path = "packages/server/src/shared.ts";
      const workspace = createSemanticWorkspace({ root });
      const views = workspace.sourceViews(path);
      const context = projectCtx(root);
      using session = required(context.nativeTypeFacts)();
      const cases = views.map((view) => {
        const query = required(view.sourceFile.getDescendantsOfKind(SyntaxKind.InterfaceDeclaration)[0]).getNameNode();
        session.request("native", { kind: "references", nodes: [query], importer: view.sourceFile });
        return { view, query, expected: physical(query.findReferencesAsNodes()) };
      });
      session.seal(new Set(["native"]));
      const registered = cases.map(({ view, query, expected: expectedReferences }) => ({
        registered: hasRegisteredSemanticProgram(view.sourceFile.getProject()),
        same: isDeepStrictEqual(physical(required(session.references("native", [query], view.sourceFile).get(query))), expectedReferences),
      }));
      const server = required(cases.find((value) => value.view.program.descriptor.id === "packages/server/tsconfig.json"));
      const browser = required(cases.find((value) => value.view.program.descriptor.id === "tsconfig.tests-dom.json"));
      const neutralWorkspace = createSemanticWorkspace({
        root,
        programs: workspace.programs.filter((program) => program.descriptor.id !== "packages/server/tsconfig.json").map((program) => program.descriptor),
      });
      const neutral = required(neutralWorkspace.sourceCorpus().getSourceFile(path));
      const neutralQuery = required(neutral.getDescendantsOfKind(SyntaxKind.InterfaceDeclaration)[0]).getNameNode();
      using neutralSession = required(context.nativeTypeFacts)();
      neutralSession.request("neutral", { kind: "references", nodes: [neutralQuery], importer: neutral });
      neutralSession.seal(new Set(["neutral"]));
      const neutralSame = isDeepStrictEqual(
        physical(required(neutralSession.references("neutral", [neutralQuery], neutral).get(neutralQuery))),
        server.expected,
      );
      server.view.sourceFile.getProject().compilerOptions.set({ strict: true });
      const changed = refusal(() => {
        session.references("native", [server.query], server.view.sourceFile);
      });
      browser.view.sourceFile.forget();
      const forgotten = refusal(() => {
        session.references("native", [browser.query], browser.view.sourceFile);
      });
      const alteredDescriptor = {
        ...server.view.program.descriptor,
        commandLine: { ...server.view.program.descriptor.commandLine, options: { ...server.view.program.descriptor.commandLine.options, strict: true } },
      };
      const altered = required(required(createSemanticWorkspace({ root, programs: [alteredDescriptor] }).program(alteredDescriptor.id)).sourceFile(path));
      const alteredQuery = required(altered.getDescendantsOfKind(SyntaxKind.InterfaceDeclaration)[0]).getNameNode();
      using alteredSession = required(context.nativeTypeFacts)();
      alteredSession.request("altered", { kind: "references", nodes: [alteredQuery], importer: altered });
      alteredSession.seal(new Set(["altered"]));
      const alteredError = refusal(() => {
        alteredSession.references("altered", [alteredQuery], altered);
      });
      const foreign = required(required(createSemanticWorkspace({ root: join(root, ".cache/foreign") }).program("tsconfig.json")).sourceFile("shared.ts"));
      const foreignQuery = foreign.getVariableDeclarationOrThrow("use").getInitializerOrThrow();
      using foreignSession = required(context.nativeTypeFacts)();
      foreignSession.request("foreign", { kind: "references", nodes: [foreignQuery], importer: foreign });
      foreignSession.seal(new Set(["foreign"]));
      const foreignError = refusal(() => {
        foreignSession.references("foreign", [foreignQuery], foreign);
      });
      return {
        views: views.length,
        registered,
        different: !isDeepStrictEqual(server.expected, browser.expected),
        neutralWorkspace: semanticWorkspaceOf(neutral.getProject()) === neutralWorkspace,
        neutralRegistered: hasRegisteredSemanticProgram(neutral.getProject()),
        neutralSame,
        changed,
        forgotten,
        alteredError,
        foreignError,
      };
    }
    const modeName = mode === "shape-complete" ? "complete" : "closed";
    const workspace = createSemanticWorkspace({ root });
    const selected = required(workspace.program("tsconfig.json"));
    const other = required(workspace.program("tsconfig.tests-dom.json"));
    const source = required(selected.sourceFile("shared.ts"));
    const syntax = new Project({ useInMemoryFileSystem: true, skipLoadingLibFiles: true }).createSourceFile(source.getFilePath(), source.getFullText());
    const [sourceSpan] = physical([syntax]);
    const queries = physical([
      syntax.getVariableDeclarationOrThrow("use").getInitializerOrThrow(),
      syntax.getVariableDeclarationOrThrow("isolated").getNameNode(),
    ]).map((node) => ({ program: selected.descriptor.id, root: required(sourceSpan), node }));
    const options = { root, programs: [selected.descriptor], families: ["references"] as const, referenceDemand: { mode: "closed" as const, queries } };
    const shapePlan = { sources: [source], owners: new Map([[source, selected.descriptor]]), prepare: (): [] => [] };
    using cold = createSemanticInventory({ ...options, databasePath: join(root, ".cache/cold.sqlite"), shapePlan });
    const coldSource = required(cold.sourceCorpus().getSourceFile("shared.ts"));
    const expected = physical(cold.references(coldSource.getVariableDeclarationOrThrow("use").getInitializerOrThrow(), "tsconfig.json", coldSource));
    using prior = createSemanticInventory({
      root,
      programs: [other.descriptor],
      families: ["references"],
      referenceDemand: { mode: modeName, queries: modeName === "complete" ? [] : queries.map((query) => ({ ...query, program: other.descriptor.id })) },
    });
    const { openInventoryDatabase, readInventoryGeneration } = await import("../../../../tooling/src/floor/code-facts/semantic-inventory-database.ts");
    const { readInventoryReferenceQueries } = await import("../../../../tooling/src/floor/code-facts/semantic-inventory-queries.ts");
    using db = openInventoryDatabase(join(root, ".cache/semantic-inventory.sqlite"));
    const retained = required(readInventoryGeneration(db, prior.generation)[0]);
    workers.length = 0;
    using warm = createSemanticInventory({ ...options, shapePlan });
    const warmSource = required(warm.sourceCorpus().getSourceFile("shared.ts"));
    const warmSame = isDeepStrictEqual(
      physical(warm.references(warmSource.getVariableDeclarationOrThrow("use").getInitializerOrThrow(), "tsconfig.json", warmSource)),
      expected,
    );
    const priorSource = required(prior.sourceCorpus().getSourceFile("shared.ts"));
    const pinned =
      modeName === "closed"
        ? prior.references(priorSource.getVariableDeclarationOrThrow("use").getInitializerOrThrow(), other.descriptor.id, priorSource)
        : prior.references(priorSource.getVariableDeclarationOrThrow("isolated"));
    return {
      expectedCount: expected.length,
      retainedProgram: retained.program,
      retainedMode: retained.referenceMode,
      retainedQueries: [...readInventoryReferenceQueries(db, retained.id)].length,
      workers,
      warmSame,
      isolated: warm.references(warmSource.getVariableDeclarationOrThrow("isolated").getNameNode(), "tsconfig.json", warmSource),
      completeRefusal: refusal(() => {
        warm.references(warmSource.getVariableDeclarationOrThrow("use"));
      }),
      retainedSame: required(readInventoryGeneration(db, warm.generation).find((partition) => partition.program === other.descriptor.id)).id === retained.id,
      pinnedSame: isDeepStrictEqual(physical(pinned), modeName === "closed" ? expected : []),
    };
  } finally {
    Object.defineProperty(childProcess, "spawnSync", { value: spawn });
  }
}

if (process.argv[1] === import.meta.filename) {
  const mode = process.argv[2];
  const root = process.argv[3];
  const result = process.argv[4];
  if (
    !(["capability", "owners", "shape-complete", "shape-closed"] as const).some((value) => value === mode) ||
    mode === undefined ||
    root === undefined ||
    result === undefined
  ) {
    throw new Error("native reference case requires its closed mode and subject paths");
  }
  writeFileSync(result, JSON.stringify(await run(mode, root)));
}
