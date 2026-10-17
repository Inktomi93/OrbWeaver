import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

async function run(mode: string, implementation: string, root: string): Promise<object> {
  const moduleURL = (relative: string): string => new URL(relative, pathToFileURL(`${implementation}/tooling/src/floor/`)).href;
  const { createSemanticWorkspace } = (await import(
    moduleURL("compiler/ts-workspace.ts")
  )) as typeof import("../../../../tooling/src/floor/compiler/ts-workspace.ts");
  const { createSemanticInventory } = (await import(
    moduleURL("code-facts/semantic-inventory.ts")
  )) as typeof import("../../../../tooling/src/floor/code-facts/semantic-inventory.ts");
  const { openInventoryDatabase, latestInventoryGeneration } = (await import(
    moduleURL("code-facts/semantic-inventory-database.ts")
  )) as typeof import("../../../../tooling/src/floor/code-facts/semantic-inventory-database.ts");
  const write = (file: string, text: string): void => {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), text);
  };
  if (mode === "cast-session") {
    const { projectCtx } = (await import(
      moduleURL("../verify/lib/project-context.ts")
    )) as typeof import("../../../../tooling/src/verify/lib/project-context.ts");
    const { SyntaxKind } = await import("ts-morph");
    const context = projectCtx(root);
    using relations = context.nativeTypeFacts?.();
    if (relations === undefined) {
      throw new Error("native cast session missing");
    }
    const node = context.project.getSourceFileOrThrow(join(root, "tests/native/value.test.ts")).getFirstDescendantByKindOrThrow(SyntaxKind.AsExpression);
    const dom = context.project.getSourceFileOrThrow(join(root, "tests/native/value.dom.test.ts")).getFirstDescendantByKindOrThrow(SyntaxKind.AsExpression);
    const refusal = (action: () => void): string | null => {
      try {
        action();
        return null;
      } catch (error) {
        return String(error);
      }
    };
    relations.request("control", { kind: "cast-relations", nodes: [node] });
    const beforeSeal = refusal(() => {
      relations.castRelations("control", [node]);
    });
    relations.seal(new Set(["control"]));
    const relation = relations.castRelations("control", [node]).get(node);
    const registration = refusal(() => {
      relations.request("control", { kind: "cast-relations", nodes: [dom] });
    });
    relations[Symbol.dispose]();
    const disposed = refusal(() => {
      relations.castRelations("control", [node]);
    });
    return { mode, beforeSeal, relation, registration, disposed };
  }
  if (mode === "drizzle-session") {
    const { projectCtx } = (await import(
      moduleURL("../verify/lib/project-context.ts")
    )) as typeof import("../../../../tooling/src/verify/lib/project-context.ts");
    const { SyntaxKind } = await import("ts-morph");
    const context = projectCtx(root);
    const source = context.project.getSourceFileOrThrow(join(root, "packages/server/src/entry.ts"));
    const call = source.getVariableDeclarationOrThrow("direct").getInitializerOrThrow().asKindOrThrow(SyntaxKind.CallExpression);
    const sources = ["packages/db/src/schema/assets.ts", "packages/db/src/schema/unrelated.ts"].map((path) =>
      context.project.getSourceFileOrThrow(join(root, path)),
    );
    using facts = context.nativeTypeFacts?.();
    if (facts === undefined) {
      throw new Error("native Drizzle session missing");
    }
    const refusal = (action: () => void): string | null => {
      try {
        action();
        return null;
      } catch (error) {
        return String(error);
      }
    };
    facts.request("schema", { kind: "schema-identities", nodes: sources });
    facts.request("writer", { kind: "drizzle-identities", nodes: [call], mode: "called-member" });
    const beforeSeal = refusal(() => {
      facts.drizzleEvidence("writer", [call], "called-member");
    });
    facts.seal(new Set(["schema", "writer"]));
    const evidence = facts.drizzleEvidence("writer", [call], "called-member").get(call);
    const wrongMode = refusal(() => {
      facts.drizzleEvidence("writer", [call], "instance");
    });
    const wrongOwner = refusal(() => {
      facts.drizzleEvidence("other", [call], "called-member");
    });
    const incompleteRoster = refusal(() => {
      facts.schemaIdentity("schema", sources.slice(0, 1));
    });
    const registration = refusal(() => {
      facts.request("writer", { kind: "drizzle-identities", nodes: [call], mode: "instance" });
    });
    facts[Symbol.dispose]();
    const disposed = refusal(() => {
      facts.drizzleEvidence("writer", [call], "called-member");
    });
    return {
      mode,
      beforeSeal,
      calledMember: evidence?.mode === "called-member",
      resolvedTable: evidence?.mode === "called-member" && evidence.table.kind === "resolved",
      wrongMode,
      wrongOwner,
      incompleteRoster,
      registration,
      disposed,
    };
  }
  if (mode === "workspace-config") {
    write("a.ts", "export const choice='a';\n");
    write("b.ts", "export const choice='b';\n");
    write("consumer.ts", "import {choice} from '@choice';export const used=choice;\n");
    const config = (choice: string): string =>
      JSON.stringify({
        files: ["a.ts", "b.ts", "consumer.ts"],
        compilerOptions: {
          noLib: true,
          types: [],
          module: "ESNext",
          moduleResolution: "Bundler",
          paths: { "@choice": [`./${choice}.ts`] },
        },
      });
    write("tsconfig.json", config("a"));
    write("tsconfig.side.json", JSON.stringify({ files: ["a.ts"], compilerOptions: { noLib: true, types: [] } }));
    const workspace = createSemanticWorkspace({ root });
    const captured = workspace.programs.map(({ descriptor }) => descriptor);
    using previous = workspace.inventory();
    const target = (inventory: typeof previous): string | undefined => {
      const source = inventory.sourceCorpus().getSourceFile("consumer.ts");
      if (source === undefined) {
        throw new Error("workspace adapter importer missing");
      }
      return inventory.moduleTarget(source.getImportDeclarationOrThrow("@choice"))?.getBaseName();
    };
    const before = target(previous);
    write("tsconfig.json", config("b"));
    let stale: string | null = null;
    try {
      using _stale = createSemanticInventory({ root, programs: captured });
    } catch (failure) {
      stale = String(failure);
    }
    using database = openInventoryDatabase(join(root, ".cache/semantic-inventory.sqlite"));
    const refusedWithoutPublication = latestInventoryGeneration(database) === previous.generation;
    using current = workspace.inventory();
    using fresh = createSemanticInventory({ root });
    const descriptors = createSemanticWorkspace({ root }).programs.map(({ descriptor }) => descriptor);
    using selected = createSemanticInventory({ root, programs: descriptors.filter(({ id }) => id === "tsconfig.json") });
    return {
      mode,
      before,
      stale,
      refusedWithoutPublication,
      current: target(current),
      fresh: target(fresh),
      freshReused: fresh.generation === current.generation,
      selected: target(selected),
      selectedPrograms: selected.programs,
      pinned: target(previous),
    };
  }
  const options = { noLib: true, types: [], module: "ESNext", moduleResolution: "Bundler" };
  write("tsconfig.json", JSON.stringify({ compilerOptions: options, files: ["shared.ts", "node.ts", "browser.ts"] }));
  write("tsconfig.tests-dom.json", JSON.stringify({ compilerOptions: { ...options, customConditions: ["browser"] }, files: ["shared.ts"] }));
  write("package.json", JSON.stringify({ type: "module", imports: { "#target": { browser: "./browser.ts", default: "./node.ts" } } }));
  write("node.ts", "export interface Kind {readonly node:true}\nexport const marker=1;\n");
  write("browser.ts", "export interface Kind {readonly browser:true}\nexport const marker=2;\n");
  write(
    "shared.ts",
    'import "#target";\nimport type {Kind} from "#target";\nexport type {Kind as Public} from "#target";\nimport "./missing.ts";\nconst own=1;export {own};\n',
  );
  const workspace = createSemanticWorkspace({ root });
  const importer = workspace.sourceViews("shared.ts").find((view) => view.program.descriptor.id === "tsconfig.tests-dom.json")?.sourceFile;
  const door = importer?.getImportDeclarations()[0];
  if (importer === undefined || door === undefined) {
    throw new Error("registered non-primary native importer missing");
  }
  const { projectCtx } = (await import(
    moduleURL("../verify/lib/project-context.ts")
  )) as typeof import("../../../../tooling/src/verify/lib/project-context.ts");
  const acquire = projectCtx(root).nativeTypeFacts;
  if (acquire === undefined) {
    throw new Error("contextual module acquisition missing");
  }
  using owner = acquire();
  owner.request("owner", { kind: "module-targets", nodes: [door], importer });
  owner.seal(new Set(["owner"]));
  const target = owner.moduleTargets("owner", [door], importer).get(door)?.getBaseName();
  importer.replaceWithText(importer.getFullText());
  let stale: string | null = null;
  try {
    owner.moduleTargets("owner", [door], importer);
  } catch (failure) {
    stale = String(failure);
  }
  return { mode, target, stale };
}

if (process.argv[1] === import.meta.filename) {
  const mode = process.argv[2];
  const implementation = process.argv[3];
  const root = process.argv[4];
  const result = process.argv[5];
  if (
    (mode !== "workspace-config" && mode !== "module-owner" && mode !== "drizzle-session" && mode !== "cast-session") ||
    implementation === undefined ||
    root === undefined ||
    result === undefined
  ) {
    throw new Error("native adapter case requires its closed case and parent-owned paths");
  }
  writeFileSync(result, JSON.stringify(await run(mode, implementation, root)));
}
