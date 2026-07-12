// The ONE ts-morph workspace bootstrap — the single home for "load the repo into a Project", shared by
// the check harness (pure-AST gate run) and (later) the codemod kit. Extracting it here kills the two
// divergent bootstrap paths (harness globbed packages+tests; the kit globs src/tests/scripts under a
// tsconfig) so scope decisions live in one place (TSMORPH-SINGLE-PASS-AUDIT.md §1.5, phase 0).
//
//   • types:false → today's harness project: skipAddingFilesFromTsConfig + the packages/tests globs,
//     pure AST, no type graph (the fast ~1s load — no Program/binder until a gate asks for the checker).
//   • types:true  → a tsconfig-loaded full-type-graph project (the codemod arm; not used by the gate
//     run). Kept as a declared arm so a future checker-tier gate / the --fix codemod path has ONE
//     bootstrap to call, never a fourth `new Project(` site.
//
// `collectByKinds` is the dispatcher's inner loop promoted to neutral territory (§1.4/§6): ONE
// forEachDescendant walk per file, dispatching each node only to the visitors subscribed to its kind.
// Both the gate runner (pass.ts) and any multi-helper codemod consume this instead of N kind sweeps.
import type { Node, SourceFile, SyntaxKind } from "ts-morph";
import { Project } from "ts-morph";

export type WorkspaceOptions = {
  readonly root: string;
  /** false (default) = pure-AST harness project; true = tsconfig-loaded full type graph (codemod arm). */
  readonly types?: boolean;
};

/** The source globs the gate harness loads: the historical `getProject` packages+tests fileset PLUS the
 *  gate corpus itself (`scripts/check/gates/**`, the diagnostic-legibility §2.2 fold-in — that gate now
 *  reads the gate files from the SHARED project via `scanRoot`, instead of its own third `new Project`).
 *  The whole-project scanners (commented-code, no-caller-user-id, no-inline-union-redecl,
 *  pd-citation-integrity) pin their `scanRoot` to packages+tests so this addition does NOT change THEIR
 *  findings (TSMORPH-SINGLE-PASS-AUDIT.md §2.2 caveat — the one intended-delta-carrier is isolated to the
 *  gate whose scanRoot opts IN to the gate corpus). */
export function harnessGlobs(root: string): readonly string[] {
  return [
    `${root}/packages/*/src/**/*.ts`,
    `${root}/packages/*/src/**/*.tsx`,
    `${root}/tests/**/*.ts`,
    `${root}/tests/**/*.tsx`,
    `${root}/scripts/check/gates/**/*.ts`,
  ];
}

/** Build a workspace Project. The `types:false` arm is the shared pure-AST project the gate run uses. */
export function getWorkspace(opts: WorkspaceOptions): Project {
  if (opts.types === true) {
    const project = new Project({ tsConfigFilePath: `${opts.root}/tsconfig.json` });
    return project;
  }
  const project = new Project({ skipAddingFilesFromTsConfig: true });
  project.addSourceFilesAtPaths([...harnessGlobs(opts.root)]);
  return project;
}

/** One node visitor keyed to the SyntaxKinds it wants to see. */
export type KindVisitor = (node: Node, sf: SourceFile) => void;

/** ONE forEachDescendant pass over `files`, dispatching each node only to the visitors subscribed to its
 *  kind. This is the single-pass primitive: no `Map<SyntaxKind, Node[]>` materialization (holding 1.4M
 *  wrapped nodes alive is a memory cliff) — dispatch happens DURING the streaming walk (§1.4). */
export function collectByKinds(
  files: readonly SourceFile[],
  byKind: ReadonlyMap<SyntaxKind, readonly KindVisitor[]>,
): void {
  if (byKind.size === 0) {
    return;
  }
  for (const sf of files) {
    sf.forEachDescendant((node) => {
      const subs = byKind.get(node.getKind());
      if (subs === undefined) {
        return;
      }
      for (const visit of subs) {
        visit(node, sf);
      }
    });
  }
}
