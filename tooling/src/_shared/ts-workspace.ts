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
import { existsSync, globSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { FileSystemHost, KindToNodeMappings, Node, SourceFile, SyntaxKind } from "ts-morph";
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

interface ReferenceOrigin {
  readonly sourcePath: string;
  readonly start: number;
  readonly width: number;
}

function referencesInProgram(root: string, program: SemanticProgram, origin: ReferenceOrigin): readonly SemanticReference[] {
  const local = program.sourceFile(origin.sourcePath)?.getDescendantAtStartWithWidth(origin.start, origin.width);
  if (local === undefined || !TsNode.isReferenceFindable(local)) {
    return [];
  }
  return local.findReferencesAsNodes().map((reference) => ({
    program,
    node: reference,
    canonicalPath: canonicalCompilerPath(root, reference.getSourceFile().getFilePath()),
    start: reference.getStart(),
    end: reference.getEnd(),
  }));
}

function firstPhysicalReference(seen: Set<string>, reference: SemanticReference): boolean {
  const key = `${reference.canonicalPath}\0${String(reference.start)}\0${String(reference.end)}`;
  if (seen.has(key)) {
    return false;
  }
  seen.add(key);
  return true;
}

function ownerFirst(programs: readonly SemanticProgram[], owner: SemanticProgram | undefined): readonly SemanticProgram[] {
  return owner === undefined || !programs.includes(owner) ? programs : [owner, ...programs.filter((program) => program !== owner)];
}

function lazySemanticProgram(
  root: string,
  descriptor: CompilerProgram,
  fileSystem: FileSystemHost | undefined,
  register: (project: Project, program: SemanticProgram) => void,
): SemanticProgram {
  let cached: Project | undefined;
  const view: SemanticProgram = {
    descriptor,
    project: () => {
      if (cached === undefined) {
        cached = semanticProject(root, descriptor, fileSystem);
        register(cached, view);
      }
      return cached;
    },
    sourceFile: (path) => view.project().getSourceFile(canonicalCompilerPath(root, path)),
  };
  return view;
}

const semanticWorkspaces = new WeakMap<object, SemanticWorkspace>();
const semanticPrograms = new WeakMap<Project, SemanticProgram>();

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

/** Visit references without forcing a complete cross-world union when the consumer already has its verdict. */
export function visitSemanticReferenceNodes(node: Node, visit: (reference: Node) => boolean): boolean {
  const workspace = semanticWorkspaces.get(node.getProject());
  if (workspace !== undefined) {
    return workspace.visitReferences(node, ({ node: reference }) => visit(reference));
  }
  if (!TsNode.isReferenceFindable(node)) {
    return true;
  }
  for (const reference of node.findReferencesAsNodes()) {
    if (!visit(reference)) {
      return false;
    }
  }
  return true;
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
  const registerProject = (project: Project, program: SemanticProgram): void => {
    semanticWorkspaces.set(project, workspace);
    semanticPrograms.set(project, program);
  };
  for (const descriptor of descriptors) {
    const view = lazySemanticProgram(root, descriptor, options.fileSystem, registerProject);
    byConfig.set(descriptor.config, view);
  }
  const programs = [...byConfig.values()];
  let corpus: SourceCorpus | undefined;
  const containingByPath = new Map<string, readonly SemanticProgram[]>();
  const rootOwners = (path: string): readonly SemanticProgram[] => {
    const rel = repoRelative(root, path);
    return programs.filter(({ descriptor }) => descriptor.files.includes(rel));
  };
  const containingPrograms = (path: string): readonly SemanticProgram[] => {
    const canonical = canonicalCompilerPath(root, path);
    const cached = containingByPath.get(canonical);
    if (cached !== undefined) {
      return cached;
    }
    const containing = programs.filter((candidate) => candidate.project().getSourceFile(canonical) !== undefined);
    containingByPath.set(canonical, containing);
    return containing;
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
  const visitReferences = (node: Node, visit: (reference: SemanticReference) => boolean): boolean => {
    const sourcePath = canonicalCompilerPath(root, node.getSourceFile().getFilePath());
    const origin = { sourcePath, start: node.getStart(), width: node.getWidth() };
    const ordered = ownerFirst(containingPrograms(sourcePath), semanticPrograms.get(node.getProject()));
    const seen = new Set<string>();
    for (const program of ordered) {
      for (const reference of referencesInProgram(root, program, origin)) {
        if (!firstPhysicalReference(seen, reference)) {
          continue;
        }
        if (!visit(reference)) {
          return false;
        }
      }
    }
    return true;
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
    visitReferences,
  };
  return workspace;
}

/** The gate harness's governed TS/TSX corpus: EVERY authored TypeScript file the repository tracks. Individual
 *  descriptors still fence their own population; the foreign SillyTavern runtime capture is excluded before
 *  parsing because Orbweaver does not own it. The repo-root files, the package files outside `src/` and
 *  `playwright/` joined on 2026-09-23 (work item 0036): the suppressions policy judges everything this corpus
 *  loads, so a tracked file missing here is an ungoverned directive. `tests/tooling/verify/contract/population.test.ts`
 *  reds when a tracked TypeScript file falls outside these globs. */
export function harnessGlobs(root: string): readonly string[] {
  return [
    `${root}/*.ts`,
    `${root}/packages/*/*.ts`,
    `${root}/packages/*/bundles/**/*.ts`,
    `${root}/packages/*/src/**/*.ts`,
    `${root}/packages/*/src/**/*.tsx`,
    `${root}/playwright/**/*.ts`,
    `${root}/playwright/**/*.tsx`,
    `${root}/tests/**/*.ts`,
    `${root}/tests/**/*.tsx`,
    `${root}/tooling/src/**/*.ts`,
    `${root}/tooling/src/**/*.tsx`,
    `${root}/scripts/**/*.ts`,
    `${root}/scripts/**/*.tsx`,
    `!${root}/playwright/.cache/**`,
    `!${root}/scripts/probes/st-goldens/sillytavern-runtime/**`,
  ];
}

/** The SEARCH scope adds MTS sources to the harness corpus. */
export function searchGlobs(root: string): readonly string[] {
  return [...harnessGlobs(root), `${root}/packages/*/src/**/*.mts`, `${root}/tests/**/*.mts`];
}

const FOREIGN_TREE_RE = /(?:^|\/)(?:\.claude\/worktrees|\.cache)(?:\/|$)/u;

/** The globbed files, none under a lane worktree or `.cache`; ts-morph's adder walks every directory under root. */
function addGlobbedSourceFiles(project: Project, root: string, globs: readonly string[]): void {
  const [include, negated] = [globs.filter((glob) => !glob.startsWith("!")), globs.filter((glob) => glob.startsWith("!")).map((glob) => glob.slice(1))];
  for (const path of globSync(include, { exclude: negated })) {
    if (!FOREIGN_TREE_RE.test(relative(root, path).split(sep).join("/"))) {
      project.addSourceFileAtPath(path);
    }
  }
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
    addGlobbedSourceFiles(project, opts.root, opts.globs ?? searchGlobs(opts.root));
    return project;
  }
  const project = new Project({ skipAddingFilesFromTsConfig: true });
  addGlobbedSourceFiles(project, opts.root, opts.globs ?? harnessGlobs(opts.root));
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
