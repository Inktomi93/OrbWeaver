// The ONE ts-morph workspace bootstrap — the single home for "load the repo into a Project", shared by
// the check harness (pure-AST gate run) and (later) the codemod kit. Extracting it here kills the two
// divergent bootstrap paths (harness globbed packages+tests; the kit globs src/tests/scripts under a
// tsconfig) so scope decisions live in one place (the retired TSMORPH-SINGLE-PASS-AUDIT audit §1.5, phase 0).
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
import { existsSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { CallExpression, FileSystemHost, KindToNodeMappings, Node, SourceFile, SyntaxKind } from "ts-morph";
import { Project, Node as TsNode, ts } from "ts-morph";
import { readCompilerPrograms } from "./compiler-programs.ts";
import type { CompilerProgram } from "./compiler-programs-contract.ts";
import { predictedProgram } from "./project-worlds.ts";
import type {
  CoLocatedSemanticNodes,
  SemanticProgram,
  SemanticReference,
  SemanticSourceView,
  SemanticWorkspace,
  SemanticWorkspaceOptions,
  SourceCorpus,
  WorkspaceOptions,
} from "./ts-workspace-contract.ts";

export type {
  CoLocatedSemanticNodes,
  SemanticProgram,
  SemanticReference,
  SemanticSourceView,
  SemanticWorkspace,
  SemanticWorkspaceOptions,
  SourceCorpus,
  WorkspaceOptions,
} from "./ts-workspace-contract.ts";

export function canonicalCompilerPath(root: string, path: string): string {
  const absolute = isAbsolute(path) ? resolve(path) : resolve(root, path);
  return existsSync(absolute) ? realpathSync(absolute) : absolute;
}

function repoRelative(root: string, path: string): string {
  const rel = relative(root, canonicalCompilerPath(root, path));
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error(`semantic workspace path resolves outside repository: ${path}`);
  }
  return rel.split(sep).join("/");
}

export function selectCompilerProgram(programs: readonly CompilerProgram[], root: string, configPath: string): CompilerProgram {
  const config = repoRelative(root, configPath);
  const selected = programs.find((program) => program.config === config);
  if (selected === undefined) {
    throw new Error(`compiler program is not runnable: ${config}`);
  }
  return selected;
}

function semanticProject(root: string, descriptor: CompilerProgram, fileSystem?: FileSystemHost): Project {
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    compilerOptions: descriptor.commandLine.options,
    ...(fileSystem === undefined ? {} : { fileSystem }),
  });
  for (const path of descriptor.files) {
    project.addSourceFileAtPath(resolve(root, path));
  }
  project.resolveSourceFileDependencies();
  return project;
}

function lazySemanticProgram(
  root: string,
  descriptor: CompilerProgram,
  fileSystem: FileSystemHost | undefined,
  register: (project: Project) => void,
): SemanticProgram {
  let cached: Project | undefined;
  const view: SemanticProgram = {
    descriptor,
    project: () => {
      if (cached === undefined) {
        cached = semanticProject(root, descriptor, fileSystem);
        register(cached);
      }
      return cached;
    },
    sourceFile: (path) => view.project().getSourceFile(canonicalCompilerPath(root, path)),
  };
  return view;
}

const semanticWorkspaces = new WeakMap<object, SemanticWorkspace>();

export function semanticWorkspaceOf(value: object): SemanticWorkspace | undefined {
  return semanticWorkspaces.get(value);
}

/** References from every native program containing `node`; an ordinary in-memory Project keeps its native behavior. */
export function semanticReferenceNodes(node: Node): readonly Node[] {
  const workspace = semanticWorkspaces.get(node.getProject());
  if (workspace !== undefined) {
    return workspace.findReferences(node).map(({ node: reference }) => reference);
  }
  return TsNode.isReferenceFindable(node) ? node.findReferencesAsNodes() : [];
}

/** Map two nodes into one native program when their owning views differ but one compiler closure contains both. */
export function coLocatedSemanticNodes(left: Node, right: Node): readonly CoLocatedSemanticNodes[] {
  const workspace = semanticWorkspaces.get(left.getProject()) ?? semanticWorkspaces.get(right.getProject());
  if (workspace === undefined) {
    return [];
  }
  const leftPath = canonicalCompilerPath(workspace.root, left.getSourceFile().getFilePath());
  const rightPath = canonicalCompilerPath(workspace.root, right.getSourceFile().getFilePath());
  const rightPrograms = new Set(workspace.containingPrograms(rightPath));
  const views: CoLocatedSemanticNodes[] = [];
  for (const program of workspace.containingPrograms(leftPath)) {
    if (!rightPrograms.has(program)) {
      continue;
    }
    const localLeft = program.sourceFile(leftPath)?.getDescendantAtStartWithWidth(left.getStart(), left.getWidth());
    const localRight = program.sourceFile(rightPath)?.getDescendantAtStartWithWidth(right.getStart(), right.getWidth());
    if (localLeft !== undefined && localRight !== undefined) {
      views.push({ project: program.project(), left: localLeft, right: localRight });
    }
  }
  return views;
}

export function createSemanticWorkspace(options: SemanticWorkspaceOptions): SemanticWorkspace {
  const root = realpathSync(options.root);
  const descriptors = options.programs ?? readCompilerPrograms(root, options.overlay);
  if (descriptors.length === 0) {
    throw new Error(`semantic workspace found no runnable TypeScript programs under ${root}`);
  }
  const ownerConfigs = (path: string): readonly string[] => descriptors.filter(({ files }) => files.includes(path)).map(({ config }) => config);
  const primaryConfig = (path: string): string | undefined => {
    const owners = ownerConfigs(path);
    const predicted = predictedProgram(path);
    if (predicted !== undefined && owners.includes(predicted)) {
      return predicted;
    }
    return owners.length === 1 ? owners[0] : undefined;
  };
  const byConfig = new Map<string, SemanticProgram>();
  let workspace: SemanticWorkspace;
  const registerProject = (project: Project): void => {
    semanticWorkspaces.set(project, workspace);
  };
  for (const descriptor of descriptors) {
    const view = lazySemanticProgram(root, descriptor, options.fileSystem, registerProject);
    byConfig.set(descriptor.config, view);
  }
  const programs = [...byConfig.values()];
  let corpus: SourceCorpus | undefined;
  const rootOwners = (path: string): readonly SemanticProgram[] => {
    const rel = repoRelative(root, path);
    return programs.filter(({ descriptor }) => descriptor.files.includes(rel));
  };
  const containingPrograms = (path: string): readonly SemanticProgram[] => {
    const canonical = canonicalCompilerPath(root, path);
    return programs.filter((candidate) => candidate.project().getSourceFile(canonical) !== undefined);
  };
  const sourceViews = (path: string): readonly SemanticSourceView[] => {
    const canonicalPath = canonicalCompilerPath(root, path);
    return containingPrograms(canonicalPath).flatMap((program) => {
      const sourceFile = program.sourceFile(canonicalPath);
      return sourceFile === undefined ? [] : [{ program, sourceFile, canonicalPath }];
    });
  };
  const sourceFiles = (): readonly SourceFile[] => workspace.sourceCorpus().getSourceFiles();
  const findReferences = (node: Node): readonly SemanticReference[] => {
    const sourcePath = canonicalCompilerPath(root, node.getSourceFile().getFilePath());
    const start = node.getStart();
    const width = node.getWidth();
    const found = new Map<string, SemanticReference>();
    for (const program of containingPrograms(sourcePath)) {
      const local = program.sourceFile(sourcePath)?.getDescendantAtStartWithWidth(start, width);
      if (local === undefined || !TsNode.isReferenceFindable(local)) {
        continue;
      }
      for (const reference of local.findReferencesAsNodes()) {
        const canonicalPath = canonicalCompilerPath(root, reference.getSourceFile().getFilePath());
        const fact = { program, node: reference, canonicalPath, start: reference.getStart(), end: reference.getEnd() };
        found.set(`${canonicalPath}\0${String(fact.start)}\0${String(fact.end)}`, fact);
      }
    }
    return [...found.values()].toSorted((left, right) => left.canonicalPath.localeCompare(right.canonicalPath) || left.start - right.start);
  };
  workspace = {
    root,
    programs,
    program: (config): SemanticProgram | undefined => byConfig.get(repoRelative(root, config)),
    rootOwners,
    containingPrograms,
    sourceViews,
    sourceFiles,
    sourceCorpus: (): SourceCorpus => {
      if (corpus !== undefined) {
        return corpus;
      }
      const authoredRoots = [...new Set(descriptors.flatMap(({ files }) => files))].toSorted();
      const ambiguousRoots = authoredRoots.filter((path) => primaryConfig(path) === undefined);
      let candidates: Project | undefined;
      const candidateProject = (): Project => {
        if (candidates !== undefined) {
          return candidates;
        }
        candidates = new Project({ skipAddingFilesFromTsConfig: true, ...(options.fileSystem === undefined ? {} : { fileSystem: options.fileSystem }) });
        for (const path of ambiguousRoots) {
          candidates.addSourceFileAtPath(resolve(root, path));
        }
        semanticWorkspaces.set(candidates, workspace);
        return candidates;
      };
      corpus = {
        getSourceFiles: (): SourceFile[] =>
          authoredRoots.flatMap((path) => {
            const config = primaryConfig(path);
            if (config === undefined) {
              return candidateProject().getSourceFile(resolve(root, path)) ?? [];
            }
            const semantic = byConfig.get(config)?.sourceFile(path);
            if (semantic === undefined) {
              throw new Error(`semantic program ${config} did not load authored root: ${path}`);
            }
            return semantic;
          }),
        getSourceFile: (path): SourceFile | undefined => {
          const rel = repoRelative(root, path);
          const config = primaryConfig(rel);
          if (config === undefined) {
            return candidateProject().getSourceFile(canonicalCompilerPath(root, path));
          }
          return byConfig.get(config)?.sourceFile(rel);
        },
      };
      semanticWorkspaces.set(corpus, workspace);
      return corpus;
    },
    findReferences,
  };
  return workspace;
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
      tsConfigFilePath: opts.tsConfigFilePath ?? `${opts.root}/tsconfig.json`,
      skipAddingFilesFromTsConfig: true,
      ...(opts.skipFileDependencyResolution === undefined ? {} : { skipFileDependencyResolution: opts.skipFileDependencyResolution }),
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

/** ts-morph's own wrap-on-demand door (the one `getChildren`/`forEachChild` use internally): returns the cached
 *  wrapper when one exists, so identity is unchanged for a node any reader has already touched. The ONE place
 *  the internal name is spelled; every raw-walk primitive below wraps through it. */
function wrapDoor(sf: SourceFile): (compilerNode: ts.Node) => Node {
  return (sf as unknown as { _getNodeFromCompilerNode: (compilerNode: ts.Node) => Node })._getNodeFromCompilerNode.bind(sf);
}

/** Every descendant of `kind`, in `forEachChild` (document) order, wrapped only on match. The replacement for
 *  `sf.getDescendantsOfKind(kind)` in a whole-file reader: for a TOKEN kind (`Identifier`, `StringLiteral`,
 *  `NoSubstitutionTemplateLiteral` — anything below `SyntaxKind.FirstNode`) ts-morph's version takes its
 *  `getChildren` path, which materialises the file's entire token tree (SyntaxLists + punctuation + keywords)
 *  and leaves it cached on TypeScript's per-file WeakMap for the life of the Program — measured 2026-09-06 as
 *  the single largest slice inside the write-scan reader (`getCompilerChildren`/`hasParsedTokens`/`createChildren`)
 *  and a permanent memory tax. `forEachChild` reaches every AST child, identifiers and literals included; what it
 *  does NOT visit is JSDoc trivia, so a reader that needs a name inside a `@param {…}` tag keeps the ts-morph door. */
export function descendantsOfKind<TKind extends SyntaxKind>(sf: SourceFile, kind: TKind): KindToNodeMappings[TKind][] {
  const wrap = wrapDoor(sf);
  const out: KindToNodeMappings[TKind][] = [];
  const walk = (compilerNode: ts.Node): void => {
    if (compilerNode.kind === kind) {
      out.push(wrap(compilerNode) as KindToNodeMappings[TKind]);
    }
    ts.forEachChild(compilerNode, walk);
  };
  ts.forEachChild(sf.compilerNode, walk);
  return out;
}

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
  // single largest slice of the composed pass's CPU profile; wrapping goes through `wrapDoor` above.
  for (const sf of files) {
    const wrap = wrapDoor(sf);
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

/** The CALLS made at module scope (`f(…)` / `await f(…)` as a top-level statement), as nodes. AST-POSITIONAL
 *  on purpose: a text search for a guard name matched it inside `new-gate.ts`'s scaffold TEMPLATE STRING once
 *  and reported an unarmed module as armed — a lying proof (#509). A statement node cannot live in a string.
 *  Statement-level only (`getStatements`), never a descendant walk: the question is what a module DOES when
 *  it is loaded, and only a top-level statement runs then.
 *
 *  ONE HOME on purpose (2026-08-26): the `tooling-ops-direct-invocation` policy and its behavioural twin
 *  `tests/tooling/_shared/entrypoint.int.test.ts` both ask "is this module a PROGRAM?", and when each kept
 *  its own answer they drifted — the gate derived program-ness from the source while the test carried a
 *  hand-kept name list, so `dev-identity-entry.ts` was born a program and only the test noticed. The policy
 *  judges each call's CALLEE by declaration identity through `verify/lib/project-home-origin.ts`; the twin
 *  reads the callee NAMES through `moduleScopeCallees` below. Both start from this one statement shape. */
export function moduleScopeCalls(sf: SourceFile): readonly CallExpression[] {
  const out: CallExpression[] = [];
  for (const st of sf.getStatements()) {
    if (!TsNode.isExpressionStatement(st)) {
      continue;
    }
    const expr = st.getExpression();
    const call = TsNode.isAwaitExpression(expr) ? expr.getExpression() : expr;
    if (TsNode.isCallExpression(call)) {
      out.push(call);
    }
  }
  return out;
}

/** The NAMES of the identifiers called at module scope — `moduleScopeCalls` reduced to bare-identifier
 *  callees, for the behavioural twin's derived program census. */
export function moduleScopeCallees(sf: SourceFile): ReadonlySet<string> {
  const out = new Set<string>();
  for (const call of moduleScopeCalls(sf)) {
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
