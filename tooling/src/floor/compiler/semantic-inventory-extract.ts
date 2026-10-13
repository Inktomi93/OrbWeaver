// Each extraction owns exactly one native descriptor. No Project crosses the worker boundary.

import { createRequire } from "node:module";
import { resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import type { Node as MorphNode, SourceFile } from "ts-morph";
import { Node, Project, SyntaxKind } from "ts-morph";
import { inventoryConsumerClass } from "../code-facts/inventory-consumers.ts";
import type { InventoryBuildRequest, InventoryInput, InventoryPartition, InventorySpan } from "../code-facts/semantic-inventory-contract.ts";
import { INVENTORY_FORMAT } from "../code-facts/semantic-inventory-contract.ts";
import { canonicalInventoryPath, descriptorVersion, inputVersion } from "../code-facts/semantic-inventory-inputs.ts";
import { readAuthoredRepositoryInventory } from "./authored-repository.ts";
import { inventoryFileSystem } from "./semantic-inventory-filesystem.ts";
import { descendantsOfKind, nativeCompilerSourceFiles } from "./ts-workspace.ts";

function inventorySpan(node: MorphNode): InventorySpan {
  return { file: canonicalInventoryPath(node.getSourceFile().getFilePath()), start: node.getStart(), end: node.getEnd(), kind: node.getKind() };
}

function bindingFacts(node: MorphNode): { lexical: InventorySpan[]; origins: InventorySpan[] } {
  const parent = node.getParent();
  const symbol = Node.isShorthandPropertyAssignment(parent) && parent.getNameNode() === node ? parent.getValueSymbol() : node.getSymbol();
  return {
    lexical: (symbol?.getDeclarations() ?? []).map(inventorySpan),
    origins: ((symbol?.getAliasedSymbol() ?? symbol)?.getDeclarations() ?? []).map(inventorySpan),
  };
}

function moduleFacts(sf: SourceFile): InventoryPartition["modules"] {
  const out: InventoryPartition["modules"] = [];
  for (const node of [...sf.getImportDeclarations(), ...sf.getExportDeclarations()]) {
    const literal = node.getModuleSpecifier();
    if (literal === undefined) {
      continue;
    }
    const target = node.getModuleSpecifierSourceFile();
    out.push({
      node: inventorySpan(node),
      target: target === undefined ? null : canonicalInventoryPath(target.getFilePath()),
      declarations: (literal.getSymbol()?.getDeclarations() ?? []).map(inventorySpan),
      specifier: literal.getLiteralText(),
      dynamic: false,
    });
  }
  for (const call of descendantsOfKind(sf, SyntaxKind.CallExpression)) {
    if (call.getExpression().getKind() !== SyntaxKind.ImportKeyword) {
      continue;
    }
    const literal = call.getArguments()[0];
    if (literal === undefined || !Node.isStringLiteral(literal)) {
      out.push({ node: inventorySpan(call), target: null, declarations: [], specifier: null, dynamic: true });
      continue;
    }
    const [module] = call.getType().getTypeArguments();
    const target = module?.getSymbol()?.getDeclarations().find(Node.isSourceFile);
    out.push({
      node: inventorySpan(call),
      target: target === undefined ? null : canonicalInventoryPath(target.getFilePath()),
      declarations: (module?.getSymbol()?.getDeclarations() ?? []).map(inventorySpan),
      specifier: literal.getLiteralText(),
      dynamic: true,
    });
  }
  return out;
}

function witnessFacts(sf: SourceFile): InventoryPartition["witnesses"] {
  const out: InventoryPartition["witnesses"] = [];
  for (const node of descendantsOfKind(sf, SyntaxKind.SatisfiesExpression)) {
    const type = node.getTypeNode();
    if (!Node.isTypeOperatorTypeNode(type) || type.getOperator() !== SyntaxKind.KeyOfKeyword) {
      continue;
    }
    const imported = type.getTypeNode();
    const expression = node.getExpression();
    if (!(Node.isImportTypeNode(imported) && imported.compilerNode.isTypeOf) || imported.getQualifier() !== undefined || !Node.isStringLiteral(expression)) {
      continue;
    }
    const name = expression.getLiteralText();
    const symbol = imported.getType().getProperty(name);
    out.push({ node: inventorySpan(node), name, declarations: ((symbol?.getAliasedSymbol() ?? symbol)?.getDeclarations() ?? []).map(inventorySpan) });
  }
  return out;
}

/** Extract primitive compiler facts without running any consumer classification. */
export function extractInventoryPartition(request: InventoryBuildRequest): InventoryPartition {
  const inputs = new Map<string, InventoryInput>();
  const base = new Project({ skipAddingFilesFromTsConfig: true }).getFileSystem();
  const fileSystem = inventoryFileSystem(base, request.overlay, inputs);
  const implementationInputs = [
    import.meta.filename,
    fileURLToPath(new URL("./semantic-inventory-filesystem.ts", import.meta.url)),
    fileURLToPath(new URL("../code-facts/semantic-inventory-contract.ts", import.meta.url)),
    fileURLToPath(new URL("../code-facts/semantic-inventory-inputs.ts", import.meta.url)),
    fileURLToPath(import.meta.resolve("ts-morph")),
    createRequire(import.meta.resolve("ts-morph")).resolve("@ts-morph/common"),
    resolve(request.root, "pnpm-lock.yaml"),
  ];
  for (const absolute of [...request.descriptor.configPaths.map((path) => resolve(request.root, path)), ...implementationInputs]) {
    inputs.set(`file\0${absolute}`, { path: absolute, kind: "file", version: inputVersion(absolute, "file", fileSystem) });
  }
  const project = new Project({ skipAddingFilesFromTsConfig: true, compilerOptions: request.descriptor.commandLine.options, fileSystem });
  for (const path of request.descriptor.files) {
    project.addSourceFileAtPath(resolve(request.root, path));
  }
  project.resolveSourceFileDependencies();
  const roots = request.descriptor.files.map((path) => canonicalInventoryPath(resolve(request.root, path)));
  const authored = new Set(
    [...readAuthoredRepositoryInventory(request.root).paths, ...(request.overlay?.files.map((file) => file.path) ?? [])].map((path) =>
      canonicalInventoryPath(resolve(request.root, path)),
    ),
  );
  const files = nativeCompilerSourceFiles(project);
  const facts = extractSourceFacts(files, authored);
  return {
    format: INVENTORY_FORMAT,
    program: request.descriptor.id,
    descriptorVersion: descriptorVersion(request.descriptor),
    compilerOptionsJson: JSON.stringify(request.descriptor.commandLine.options),
    configPaths: [...request.descriptor.configPaths],
    projectReferences: [...request.descriptor.references],
    workerPid: process.pid,
    roots,
    nativeRoots: [...project.getProgram().compilerObject.getRootFileNames()],
    inputs: [...inputs.values()].toSorted((a, b) => a.path.localeCompare(b.path) || a.kind.localeCompare(b.kind)),
    sources: files.map((sf) => ({
      file: canonicalInventoryPath(sf.getFilePath()),
      path: sf.getFilePath(),
      consumerClass: inventoryConsumerClass(sf.getFilePath()),
      text: sf.getFullText(),
      authored: authored.has(canonicalInventoryPath(sf.getFilePath())),
    })),
    ...facts,
  };
}

function registerReferenceDeclarations(declarations: readonly MorphNode[], authored: ReadonlySet<string>, target: Map<string, MorphNode>): void {
  for (const declaration of declarations) {
    if (authored.has(canonicalInventoryPath(declaration.getSourceFile().getFilePath())) && Node.isReferenceFindable(declaration)) {
      target.set(JSON.stringify(inventorySpan(declaration)), declaration);
    }
  }
}

function extractSourceFacts(
  files: readonly SourceFile[],
  authored: ReadonlySet<string>,
): Pick<InventoryPartition, "exports" | "modules" | "bindings" | "references" | "witnesses"> {
  const exports: InventoryPartition["exports"] = [];
  const modules: InventoryPartition["modules"] = [];
  const bindings: InventoryPartition["bindings"] = [];
  const witnesses: InventoryPartition["witnesses"] = [];
  const referenceDeclarations = new Map<string, MorphNode>();
  for (const sf of files) {
    const file = canonicalInventoryPath(sf.getFilePath());
    // Dependency exports are required because importing worlds can resolve a package to a distinct closure.
    for (const [name, declarations] of sf.getExportedDeclarations()) {
      exports.push({ file, name, declarations: declarations.map(inventorySpan) });
      registerReferenceDeclarations(declarations, authored, referenceDeclarations);
    }
    if (!authored.has(file)) {
      continue;
    }
    modules.push(...moduleFacts(sf));
    witnesses.push(...witnessFacts(sf));
    for (const id of descendantsOfKind(sf, SyntaxKind.Identifier)) {
      const symbols = bindingFacts(id);
      bindings.push({ node: inventorySpan(id), symbols });
      const symbol = id.getSymbol();
      registerReferenceDeclarations(symbol?.getDeclarations() ?? [], authored, referenceDeclarations);
    }
  }
  return { exports, modules, bindings, witnesses, references: extractReferenceFacts(referenceDeclarations) };
}

function extractReferenceFacts(referenceDeclarations: ReadonlyMap<string, MorphNode>): InventoryPartition["references"] {
  const references: InventoryPartition["references"] = [];
  // Use the native language service, not an approximation based on equal-spelled identifiers.
  for (const declaration of referenceDeclarations.values()) {
    if (!Node.isReferenceFindable(declaration)) {
      continue;
    }
    const span = inventorySpan(declaration);
    // ts-morph already queries the name for named declarations; both physical keys share its native result.
    const nativeReferences = declaration.findReferencesAsNodes();
    for (const reference of nativeReferences) {
      references.push({
        declaration: span,
        reference: inventorySpan(reference),
        consumerClass: inventoryConsumerClass(reference.getSourceFile().getFilePath()),
      });
    }
    const name = Node.hasName(declaration) ? declaration.getNameNode() : undefined;
    if (name !== undefined && Node.isReferenceFindable(name)) {
      for (const reference of nativeReferences) {
        references.push({
          declaration: inventorySpan(name),
          reference: inventorySpan(reference),
          consumerClass: inventoryConsumerClass(reference.getSourceFile().getFilePath()),
        });
      }
    }
  }
  return references;
}
