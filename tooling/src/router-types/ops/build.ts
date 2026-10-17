// The server's inferred router contract is emitted by its installed compiler, never copied by hand.
// Internal aliases must resolve inside the emitted tree; external contracts retain their canonical homes.
import { mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import process from "node:process";
import ts from "typescript";
import { refuseDirectInvocation } from "../../floor/cli/entrypoint.ts";

refuseDirectInvocation(import.meta.url, "pnpm build:router-types");

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

function declarationImports(root: string, options: ts.CompilerOptions, host: ts.CompilerHost): ts.TransformerFactory<ts.SourceFile | ts.Bundle> {
  const serverSource = `${resolve(root, "packages/server/src").replaceAll("\\", "/")}/`;
  const printer = ts.createPrinter();
  return (context) => (source) => {
    if (ts.isBundle(source)) {
      throw new Error("Router declarations require individual native module outputs.");
    }
    const rewrite = (node: ts.StringLiteral, site: DeclarationImportSite): ts.StringLiteral => {
      const mode = declarationResolutionMode(source, site, options, printer);
      const target = ts.resolveModuleName(node.text, source.fileName, options, host, undefined, undefined, mode).resolvedModule?.resolvedFileName;
      if (target === undefined || !target.replaceAll("\\", "/").startsWith(serverSource)) {
        return node;
      }
      const path = relative(dirname(source.fileName), target).replaceAll("\\", "/");
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

/** Rebuild the complete server declaration family; a failed generation leaves no previous artifact. */
export function buildRouterDeclarations(root: string): number {
  const serverRoot = join(root, "packages/server");
  const output = join(serverRoot, "dist/router-types");
  const temporary = join(serverRoot, `dist/.router-types-${String(process.pid)}`);
  rmSync(output, { recursive: true, force: true });
  rmSync(temporary, { recursive: true, force: true });
  try {
    const configPath = join(serverRoot, "tsconfig.json");
    const config = ts.readConfigFile(configPath, ts.sys.readFile);
    if (config.error !== undefined) {
      throw new Error(diagnosticsText([config.error], root));
    }
    const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, serverRoot);
    const options: ts.CompilerOptions = {
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
    const program = ts.createProgram([join(serverRoot, "src/index.ts"), ...parsed.fileNames.filter((path) => path.endsWith(".d.ts"))], options, host);
    const diagnostics = [...parsed.errors, ...ts.getPreEmitDiagnostics(program)];
    if (diagnostics.length > 0) {
      throw new Error(diagnosticsText(diagnostics, root));
    }
    let declarations = 0;
    const emitted = program.emit(
      undefined,
      (path, text) => {
        if (!relative(temporary, path).replaceAll("\\", "/").startsWith("packages/server/src/")) {
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
      { afterDeclarations: [declarationImports(root, options, host)] },
    );
    if (emitted.emitSkipped || emitted.diagnostics.length > 0 || declarations === 0) {
      throw new Error(`Router declaration generation failed (${String(declarations)} declarations).\n${diagnosticsText(emitted.diagnostics, root)}`);
    }
    renameSync(temporary, output);
    return declarations;
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}
