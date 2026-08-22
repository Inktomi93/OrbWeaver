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

export interface WorkspaceOptions {
  readonly root: string;
  /** false (default) = pure-AST harness project; true = tsconfig-loaded full type graph (codemod arm). */
  readonly types?: boolean;
  /** Override the file set. Default: harnessGlobs (types:false — the gate harness's PINNED scope,
   *  never widen it) / searchGlobs (types:true). Search tools pass searchGlobs explicitly. */
  readonly globs?: readonly string[];
}

/** The source globs the gate harness loads: the historical `getProject` packages+tests fileset PLUS
 *  `tooling/src/**` (the `@orb/tooling` first-class tree — docs/design/tooling-package.md §3.2: the widening
 *  ran the before/after scanned-count diff; every catch-all gate's delta got an explicit fence-or-embrace
 *  decision in the P1 commit). The whole-project scanners (commented-code, no-caller-user-id,
 *  pd-citation-integrity) pin their `scanRoot` to packages+tests so this addition does NOT change THEIR
 *  findings.
 *
 *  THE PIN — "never widen it" — SURVIVES; its INPUT changed twice. The gate CORPUS used to need its own
 *  glob line (`scripts/check/gates/**`, the diagnostic-legibility §2.2 fold-in that let that gate read the
 *  gate files from the SHARED project instead of its own third `new Project`). At the P6 move the corpus
 *  became `tooling/src/verify/gates/`, which `tooling/src/**` already sweeps — so the dedicated line was
 *  DELETED as a second spelling of the same set, not as a narrowing. The candidate set is unchanged. */
export function harnessGlobs(root: string): readonly string[] {
  return [
    `${root}/packages/*/src/**/*.ts`,
    `${root}/packages/*/src/**/*.tsx`,
    `${root}/tests/**/*.ts`,
    `${root}/tests/**/*.tsx`,
    `${root}/tooling/src/**/*.ts`,
  ];
}

/** The SEARCH scope: harnessGlobs + the closure tail the gate harness deliberately excludes but a
 *  whole-workspace search must see — membership proven against `tsgo --listFilesOnly` unioned over
 *  the root/ui/client programs (the tests-type-membership pattern): all of scripts/, package-root
 *  scripts (tokens.build.ts, vite configs), the CT harness, and .mts files. */
export function searchGlobs(root: string): readonly string[] {
  return [
    ...harnessGlobs(root),
    `${root}/scripts/**/*.ts`,
    // The ONE fence in this file: `scripts/**/*.ts` above would otherwise sweep the ST-parity probe's
    // captured SillyTavern install (scripts/probes/st-goldens/sillytavern-runtime/ — gitignored, ~4,300
    // `.ts` files, nearly all third-party `node_modules` declarations). It is a foreign app we do not
    // own; loading it costs a multi-second parse for zero signal and floods whole-project lenses with
    // findings in code nobody here can fix. Fenced by GLOB, not by a parse-then-removeSourceFile loop
    // (which is what this cost before 2026-08-06) — negated globs DO work in ts-morph, verified against
    // a planted file: 261 files → 260, runtime hits 1 → 0.
    `!${root}/scripts/probes/st-goldens/sillytavern-runtime/**`,
    `${root}/packages/*/*.ts`,
    `${root}/packages/*/src/**/*.mts`,
    `${root}/tests/**/*.mts`,
    `${root}/playwright/**/*.tsx`,
  ];
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
