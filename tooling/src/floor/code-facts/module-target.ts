// Native importer lookup preserves its relative-source-first policy; typed dynamic targets are separate facts.
import { dirname, resolve } from "node:path";
import type { Node, SourceFile } from "ts-morph";
import { Node as TsNode, ts } from "ts-morph";
import type { SourceCorpus } from "../compiler/ts-workspace-contract.ts";
import { SemanticInventoryError } from "./semantic-inventory-contract.ts";
import { semanticInventoryOf } from "./semantic-inventory-reader.ts";

/** Resolve an importer target in the supplied native program, retaining authored relative-source admission. */
export function importerModulePath(sf: SourceFile, spec: string): string | undefined {
  if (semanticInventoryOf(sf.getProject()) !== undefined) {
    throw new SemanticInventoryError("importer target lookup requires an explicit native program view");
  }
  if (spec.startsWith(".")) {
    const base = resolve(dirname(sf.getFilePath()), spec);
    for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}.mts`, `${base}/index.ts`, `${base}/index.tsx`, `${base}/index.mts`]) {
      const source = sf.getProject().getSourceFile(candidate);
      if (source !== undefined) {
        return source.getFilePath();
      }
    }
  }
  const fs = sf.getProject().getFileSystem();
  const readFile = (path: string): string | undefined => {
    let content: string | undefined;
    try {
      content = fs.readFileSync(path, "utf-8");
      // @orb-waive caught-failure-ownership(catch): TypeScript intentionally probes nonexistent module candidates; an unreadable candidate is `undefined` so resolution continues. Ends if this callback reads an already-proven-existing path.
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

const MODULE_FILE_EXTS = [".ts", ".tsx"] as const;

/** Resolve a relative import specifier to its workspace source file (used for dynamic `import()` — which
 *  ts-morph gives no resolution primitive for). Non-relative specs (`#alias`/`@orb`) are left unresolved here;
 *  the dev-only dynamic imports that mattered for the false-orphan class are all relative. */
export function relativeModuleTarget(project: SourceCorpus, fromDir: string, spec: string): SourceFile | undefined {
  if (!spec.startsWith(".")) {
    return;
  }
  const base = `${fromDir}/${spec}`;
  const candidates = [base, ...MODULE_FILE_EXTS.map((e) => `${base}${e}`), ...MODULE_FILE_EXTS.map((e) => `${base}/index${e}`)];
  return candidates.map((c) => project.getSourceFile(c)).find((sf) => sf !== undefined);
}
