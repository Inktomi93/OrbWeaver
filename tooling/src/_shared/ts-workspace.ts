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
import { Project, Node as TsNode, ts } from "ts-morph";

export interface WorkspaceOptions {
  readonly root: string;
  /** false (default) = pure-AST harness project; true = tsconfig-loaded full type graph (codemod arm). */
  readonly types?: boolean;
  /** Override the file set. Default: harnessGlobs (types:false — the gate harness's governed scope) /
   *  searchGlobs (types:true). Search tools pass searchGlobs explicitly. */
  readonly globs?: readonly string[];
}

/** The gate harness's governed TS/TSX corpus. Individual descriptors still fence their own scanRoot; the
 *  foreign SillyTavern runtime capture is excluded before parsing because Orbweaver does not own it. */
export function harnessGlobs(root: string): readonly string[] {
  return [
    `${root}/packages/*/src/**/*.ts`,
    `${root}/packages/*/src/**/*.tsx`,
    `${root}/tests/**/*.ts`,
    `${root}/tests/**/*.tsx`,
    `${root}/tooling/src/**/*.ts`,
    `${root}/tooling/src/**/*.tsx`,
    `${root}/scripts/**/*.ts`,
    `${root}/scripts/**/*.tsx`,
    `!${root}/scripts/probes/st-goldens/sillytavern-runtime/**`,
  ];
}

/** The SEARCH scope adds package-root entrypoints, MTS sources, and the Playwright CT harness. */
export function searchGlobs(root: string): readonly string[] {
  return [...harnessGlobs(root), `${root}/packages/*/*.ts`, `${root}/packages/*/src/**/*.mts`, `${root}/tests/**/*.mts`, `${root}/playwright/**/*.tsx`];
}

/** Build a workspace Project. The `types:false` arm is the shared pure-AST project the gate run uses. */
export function getWorkspace(opts: WorkspaceOptions): Project {
  if (opts.types === true) {
    // Root-tsconfig OPTIONS (moduleResolution etc. — needed so `@orb/*` subpath-exports and `#alias`
    // imports resolve for the language service) but OUR file set, not the root include/exclude: the
    // root aggregator is deliberately DOM-less and EXCLUDES packages/ui/src + packages/client/src,
    // which a whole-workspace symbol search must see. Search scope ≠ typecheck scope.
    const project = new Project({
      tsConfigFilePath: `${opts.root}/tsconfig.json`,
      skipAddingFilesFromTsConfig: true,
    });
    project.addSourceFilesAtPaths([...(opts.globs ?? searchGlobs(opts.root))]);
    return project;
  }
  const project = new Project({ skipAddingFilesFromTsConfig: true });
  project.addSourceFilesAtPaths([...(opts.globs ?? harnessGlobs(opts.root))]);
  return project;
}

/** One node visitor keyed to the SyntaxKinds it wants to see. */
export type KindVisitor = (node: Node, sf: SourceFile) => void;

/** ONE forEachDescendant pass over `files`, dispatching each node only to the visitors subscribed to its
 *  kind. This is the single-pass primitive: no `Map<SyntaxKind, Node[]>` materialization (holding 1.4M
 *  wrapped nodes alive is a memory cliff) — dispatch happens DURING the streaming walk (§1.4). */
export function collectByKinds(files: readonly SourceFile[], byKind: ReadonlyMap<SyntaxKind, readonly KindVisitor[]>): void {
  if (byKind.size === 0) {
    return;
  }
  // Walk the RAW compiler tree (`ts.forEachChild`, ~0.2 s for the repo's 5.9 M nodes) and wrap a node
  // into ts-morph only when a visitor is subscribed to its kind. `SourceFile#forEachDescendant` wraps
  // EVERY node (~5.8 s and +800 MB over the same tree, measured 2026-09-06) and the wrappers were the
  // single largest slice of the composed pass's CPU profile. `_getNodeFromCompilerNode` is ts-morph's own
  // wrap-on-demand door (the one `getChildren`/`forEachChild` use internally); it returns the cached
  // wrapper when one exists, so identity is unchanged for a node any reader has already touched.
  for (const sf of files) {
    const wrap = (sf as unknown as { _getNodeFromCompilerNode: (compilerNode: ts.Node) => Node })._getNodeFromCompilerNode.bind(sf);
    const walk = (compilerNode: ts.Node): void => {
      const subs = byKind.get(compilerNode.kind);
      if (subs !== undefined) {
        const node = wrap(compilerNode);
        for (const visit of subs) {
          visit(node, sf);
        }
      }
      ts.forEachChild(compilerNode, walk);
    };
    ts.forEachChild(sf.compilerNode, walk);
  }
}

/** Identifiers CALLED at module scope (`f(…)` / `await f(…)` as a top-level statement). AST-POSITIONAL on
 *  purpose: a text search for a guard name matched it inside `new-gate.ts`'s scaffold TEMPLATE STRING once
 *  and reported an unarmed module as armed — a lying proof (#509). A statement node cannot live in a string.
 *
 *  ONE HOME on purpose (2026-08-26): the `tooling-ops-direct-invocation` gate and its behavioural twin
 *  `tests/tooling/_shared/entrypoint.int.test.ts` both ask "is this module a PROGRAM?", and when each kept
 *  its own answer they drifted — the gate derived program-ness from the source while the test carried a
 *  hand-kept name list, so `dev-identity-entry.ts` was born a program and only the test noticed. */
export function moduleScopeCallees(sf: SourceFile): ReadonlySet<string> {
  const out = new Set<string>();
  for (const st of sf.getStatements()) {
    if (!TsNode.isExpressionStatement(st)) {
      continue;
    }
    const expr = st.getExpression();
    const call = TsNode.isAwaitExpression(expr) ? expr.getExpression() : expr;
    if (!TsNode.isCallExpression(call)) {
      continue;
    }
    const callee = call.getExpression();
    if (TsNode.isIdentifier(callee)) {
      out.add(callee.getText());
    }
  }
  return out;
}

/** The ONE exported function declaration of a module — the derived name, or undefined when the file is
 *  absent or no longer exports exactly one function. BOTH are blindness, not silence: a caller keyed on a
 *  name that stopped resolving would pass every file forever, so callers must treat undefined as RED. */
export function soleExportedFunction(project: Project, path: string): string | undefined {
  const sf = project.getSourceFile(path);
  if (sf === undefined) {
    return;
  }
  const names = sf
    .getFunctions()
    .filter((f) => f.isExported())
    .map((f) => f.getName())
    .filter((n): n is string => n !== undefined);
  return names.length === 1 ? names[0] : undefined;
}
