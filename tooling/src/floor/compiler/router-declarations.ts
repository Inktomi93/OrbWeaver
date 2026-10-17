// The server's inferred router contract is emitted by its installed compiler, never copied by hand.
// Internal aliases must resolve inside the emitted tree; external contracts retain their canonical homes.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import ts from "typescript";
import { routerDeclarationInputs } from "./router-declaration-inputs.ts";
import { publishRouterDeclarations } from "./router-declaration-publication.ts";
import type { RouterDeclarationPreparation } from "./router-declarations-contract.ts";

type DeclarationImportSite = ts.ImportDeclaration | ts.ExportDeclaration | ts.ImportTypeNode;

function declarationResolutionMode(source: ts.SourceFile, site: DeclarationImportSite, options: ts.CompilerOptions, printer: ts.Printer): ts.ResolutionMode {
  // Emitted nodes may lack parents; parse a query-only reference context instead of mutating immutable native nodes.
  const printed = printer.printNode(ts.EmitHint.Unspecified, site, source);
  const text = ts.isImportTypeNode(site) ? `type Resolution = ${printed};` : printed;
  const query = ts.createSourceFile(source.fileName, text, source.languageVersion, true);
  const statement = query.statements[0];
  let usage: ts.Node | undefined;
  if (statement !== undefined && (ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement))) {
    usage = statement.moduleSpecifier;
  } else if (
    statement !== undefined &&
    ts.isTypeAliasDeclaration(statement) &&
    ts.isImportTypeNode(statement.type) &&
    ts.isLiteralTypeNode(statement.type.argument)
  ) {
    usage = statement.type.argument.literal;
  }
  if (usage === undefined || !ts.isStringLiteral(usage)) {
    throw new Error("Native declaration resolution requires one parsed module reference.");
  }
  return ts.getModeForUsageLocation(source, usage, options);
}

function declarationReference(target: ts.SourceFile | string, serverSource: string, sourceDirectory: string, outputDirectory: string): string {
  const fileName = typeof target === "string" ? target : target.fileName;
  const declaration = typeof target !== "string" && target.isDeclarationFile;
  const internal = fileName.replaceAll("\\", "/").startsWith(serverSource) && !declaration;
  return relative(internal ? sourceDirectory : outputDirectory, fileName).replaceAll("\\", "/");
}

function declarationImports(
  root: string,
  options: ts.CompilerOptions & { readonly outDir: string },
  host: ts.CompilerHost,
  program: ts.Program,
): ts.TransformerFactory<ts.SourceFile | ts.Bundle> {
  const serverSource = `${resolve(root, "packages/server/src").replaceAll("\\", "/")}/`;
  const printer = ts.createPrinter();
  return (context) => (source) => {
    if (ts.isBundle(source)) {
      throw new Error("Router declarations require individual native module outputs.");
    }
    const rewrite = (node: ts.StringLiteral, site: DeclarationImportSite): ts.StringLiteral => {
      const mode = declarationResolutionMode(source, site, options, printer);
      const target = ts.resolveModuleName(node.text, source.fileName, options, host, undefined, undefined, mode).resolvedModule?.resolvedFileName;
      if (target === undefined) {
        return node;
      }
      if (!(node.text.startsWith(".") || target.replaceAll("\\", "/").startsWith(serverSource))) {
        return node;
      }
      const path = declarationReference(
        program.getSourceFile(target) ?? target,
        serverSource,
        dirname(source.fileName),
        dirname(join(options.outDir, relative(root, source.fileName))),
      );
      return context.factory.createStringLiteral(path.startsWith(".") ? path : `./${path}`);
    };
    const importType = (node: ts.ImportTypeNode): ts.ImportTypeNode => {
      if (!(ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal))) {
        return node;
      }
      return context.factory.updateImportTypeNode(
        node,
        context.factory.updateLiteralTypeNode(node.argument, rewrite(node.argument.literal, node)),
        node.attributes,
        node.qualifier,
        node.typeArguments?.map((typeArgument) => ts.visitNode(typeArgument, visit, ts.isTypeNode)),
        node.isTypeOf,
      );
    };
    const moduleSpecifier = (node: ts.ExportDeclaration): ts.Expression | undefined =>
      node.moduleSpecifier !== undefined && ts.isStringLiteral(node.moduleSpecifier) ? rewrite(node.moduleSpecifier, node) : node.moduleSpecifier;
    const visit = (node: ts.Node): ts.VisitResult<ts.Node> => {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        return context.factory.updateImportDeclaration(node, node.modifiers, node.importClause, rewrite(node.moduleSpecifier, node), node.attributes);
      }
      if (ts.isExportDeclaration(node)) {
        return context.factory.updateExportDeclaration(node, node.modifiers, node.isTypeOnly, node.exportClause, moduleSpecifier(node), node.attributes);
      }
      if (ts.isImportTypeNode(node)) {
        return importType(node);
      }
      return ts.visitEachChild(node, visit, context);
    };
    return ts.visitNode(source, visit, ts.isSourceFile);
  };
}

function diagnosticsText(diagnostics: readonly ts.Diagnostic[], root: string): string {
  return ts.formatDiagnostics(diagnostics, { getCurrentDirectory: () => root, getCanonicalFileName: (path) => path, getNewLine: () => "\n" });
}

/** Emit a fresh native family and atomically select it without invalidating historical readers. */
export function prepareRouterDeclarations(root: string): RouterDeclarationPreparation {
  const serverRoot = join(root, "packages/server");
  const output = join(serverRoot, "dist/router-types");
  const generations = join(output, "generations");
  mkdirSync(generations, { recursive: true });
  const temporary = mkdtempSync(join(generations, ".pending-"));
  const observation = routerDeclarationInputs();
  try {
    const configPath = join(serverRoot, "tsconfig.json");
    const parsed = ts.getParsedCommandLineOfConfigFile(configPath, undefined, {
      ...observation.system,
      onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
        throw new Error(diagnosticsText([diagnostic], root));
      },
    });
    if (parsed === undefined) {
      throw new Error("Native server config could not be parsed.");
    }
    const options: ts.CompilerOptions & { readonly outDir: string } = {
      ...parsed.options,
      noEmit: false,
      noEmitOnError: true,
      declaration: true,
      declarationMap: true,
      emitDeclarationOnly: true,
      rootDir: root,
      outDir: temporary,
    };
    const host = ts.createCompilerHost(options);
    host.readFile = observation.system.readFile;
    host.fileExists = observation.system.fileExists;
    host.directoryExists = observation.system.directoryExists;
    host.getDirectories = observation.system.getDirectories;
    host.readDirectory = observation.system.readDirectory;
    const program = ts.createProgram({
      rootNames: parsed.fileNames,
      options,
      host,
      ...(parsed.projectReferences === undefined ? {} : { projectReferences: parsed.projectReferences }),
    });
    const diagnostics = [...parsed.errors, ...ts.getPreEmitDiagnostics(program)];
    if (diagnostics.length > 0) {
      throw new Error(diagnosticsText(diagnostics, root));
    }
    const roots = new Set(program.getRootFileNames());
    const ambient = program
      .getSourceFiles()
      .filter(
        (source) => !program.isSourceFileDefaultLibrary(source) && (source.isDeclarationFile || roots.has(source.fileName) || !ts.isExternalModule(source)),
      );
    const commandLine = { ...parsed, fileNames: program.getSourceFiles().map((file) => file.fileName), options };
    const emittedAmbients = ambient
      .filter((source) => !source.isDeclarationFile)
      .flatMap((source) => ts.getOutputFileNames(commandLine, source.fileName, !ts.sys.useCaseSensitiveFileNames));
    const ambientOutputs = new Set(emittedAmbients);
    const ambientPaths = [
      ...ambient.filter((source) => source.isDeclarationFile).map((source) => source.fileName),
      ...emittedAmbients.filter((path) => !path.endsWith(".map")),
    ];
    let declarations = 0;
    const emitted = program.emit(
      undefined,
      (path, text) => {
        if (!(relative(temporary, path).replaceAll("\\", "/").startsWith("packages/server/src/") || ambientOutputs.has(path))) {
          return;
        }
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, text);
        if (path.endsWith(".d.ts")) {
          declarations += 1;
        }
      },
      undefined,
      true,
      { afterDeclarations: [declarationImports(root, options, host, program)] },
    );
    if (emitted.emitSkipped || emitted.diagnostics.length > 0 || declarations === 0) {
      throw new Error(`Router declaration generation failed (${String(declarations)} declarations).\n${diagnosticsText(emitted.diagnostics, root)}`);
    }
    observation.assertCurrent();
    return publishRouterDeclarations({
      output,
      staging: temporary,
      ambientPaths,
      declarations,
      inputs: [...observation.inputs.values()],
      assertInputsCurrent: observation.assertCurrent,
    });
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}
