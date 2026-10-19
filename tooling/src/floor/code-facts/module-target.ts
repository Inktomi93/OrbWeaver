// Native importer lookup preserves its relative-source-first policy; typed dynamic targets are separate facts.
import { resolve } from "node:path";
import type { Node, SourceFile } from "ts-morph";
import { Node as TsNode, ts } from "ts-morph";
import type { SourceCorpus } from "../compiler/ts-workspace-contract.ts";
import type { RelativeModuleAdmission, StaticModuleEdge } from "./module-reach-contract.ts";
import { SemanticInventoryError } from "./semantic-inventory-contract.ts";
import { inventoryStaticTarget, semanticInventoryOf } from "./semantic-inventory-reader.ts";

/** The suffixes a relative specifier may omit, in probe order: the authored path first, then source files, then directory indexes. */
export const RELATIVE_MODULE_SUFFIXES = {
  "relative-source": ["", ".ts", ".tsx", "/index.ts", "/index.tsx"],
  "native-importer": ["", ".ts", ".tsx", ".mts", "/index.ts", "/index.tsx", "/index.mts"],
} as const satisfies Record<RelativeModuleAdmission, readonly string[]>;

/** Every static import and re-export declaration of a file, imports first, each with its native target. */
export function staticModuleEdges(sf: SourceFile): readonly StaticModuleEdge[] {
  return [...sf.getImportDeclarations(), ...sf.getExportDeclarations()].map((declaration) => ({ declaration, target: inventoryStaticTarget(declaration) }));
}

/** Resolve an importer target in the supplied native program, retaining authored relative-source admission. */
export function importerModulePath(sf: SourceFile, spec: string): string | undefined {
  if (semanticInventoryOf(sf.getProject()) !== undefined) {
    throw new SemanticInventoryError("importer target lookup requires an explicit native program view");
  }
  const relative = relativeModuleTarget(sf.getProject(), sf.getDirectoryPath(), spec, "native-importer");
  if (relative !== undefined) {
    return relative.getFilePath();
  }
  const fs = sf.getProject().getFileSystem();
  const readFile = (path: string): string | undefined => {
    let content: string | undefined;
    try {
      content = fs.readFileSync(path, "utf-8");
      // @orb-waive caught-failure-ownership(catch): this is the ts.ModuleResolutionHost.readFile contract, where undefined means "no such file" and TypeScript's own sys.readFile returns undefined on any read error; an unresolved spec returns undefined to the importer lookup. Ends if this callback reads a path already proven to exist.
    } catch {
      // TypeScript probes extension/package candidates that need not exist.
    }
    return content;
  };
  return ts.resolveModuleName(spec, sf.getFilePath(), sf.getProject().getCompilerOptions(), {
    directoryExists: (path) => fs.directoryExistsSync(path),
    fileExists: (path) => fs.fileExistsSync(path),
    getCurrentDirectory: () => fs.getCurrentDirectory(),
    readFile,
    realpath: (path) => fs.realpathSync(path),
  }).resolvedModule?.resolvedFileName;
}

/** Resolve a dynamic `import()` call through the checker. Its expression type is
 *  `Promise<typeof import("…")>`; the unwrapped module symbol declares the target SourceFile. */
export function dynamicModuleTarget(call: Node): SourceFile | undefined {
  const inventory = semanticInventoryOf(call.getProject());
  if (inventory !== undefined) {
    return inventory.moduleTarget(call);
  }
  if (!TsNode.isCallExpression(call)) {
    return;
  }
  const [moduleType] = call.getType().getTypeArguments();
  const declarations = moduleType?.getSymbol()?.getDeclarations() ?? [];
  return declarations.find((declaration): declaration is SourceFile => TsNode.isSourceFile(declaration));
}

/** Resolve a relative import specifier to its workspace source file (used for dynamic `import()` — which
 *  ts-morph gives no resolution primitive for). Non-relative specs (`#alias`/`@orb`) are left unresolved here;
 *  the dev-only dynamic imports that mattered for the false-orphan class are all relative. */
export function relativeModuleTarget(
  project: SourceCorpus,
  fromDir: string,
  spec: string,
  admission: RelativeModuleAdmission = "relative-source",
): SourceFile | undefined {
  if (!spec.startsWith(".")) {
    return;
  }
  const base = resolve(fromDir, spec);
  return RELATIVE_MODULE_SUFFIXES[admission].map((suffix) => project.getSourceFile(`${base}${suffix}`)).find((sf) => sf !== undefined);
}
