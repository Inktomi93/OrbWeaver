// The relative-specifier dynamic-import resolver (ts-morph gives no primitive for it).
import type { SourceFile } from "ts-morph";
import type { SourceCorpus } from "../../floor/compiler/ts-workspace.ts";

const MODULE_FILE_EXTS = [".ts", ".tsx"] as const;

/** Resolve a relative import specifier to its workspace source file (used for dynamic `import()` — which
 *  ts-morph gives no resolution primitive for). Non-relative specs (`#alias`/`@orb`) are left unresolved here;
 *  the dev-only dynamic imports that mattered for the false-orphan class are all relative. */
export function resolveModule(project: SourceCorpus, fromDir: string, spec: string): SourceFile | undefined {
  if (!spec.startsWith(".")) {
    return;
  }
  const base = `${fromDir}/${spec}`;
  const candidates = [base, ...MODULE_FILE_EXTS.map((e) => `${base}${e}`), ...MODULE_FILE_EXTS.map((e) => `${base}/index${e}`)];
  return candidates.map((c) => project.getSourceFile(c)).find((sf) => sf !== undefined);
}
