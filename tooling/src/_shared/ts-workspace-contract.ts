import type { FileSystemHost, Node, Project, SourceFile } from "ts-morph";
import type { CompilerProgram, CompilerSourceOverlay } from "./compiler-programs-contract.ts";

export interface WorkspaceOptions {
  readonly root: string;
  /** false (default) = pure-AST harness project; true = a project using one tsconfig's options. */
  readonly types?: boolean;
  /** Exact config for the typed project; defaults to `<root>/tsconfig.json`. */
  readonly tsConfigFilePath?: string;
  /** Keep dependency resolution off for syntax-only mutable carriers such as codemods. */
  readonly skipFileDependencyResolution?: boolean;
  /** Override the file set. Default: harnessGlobs (types:false) / searchGlobs (types:true). */
  readonly globs?: readonly string[];
}

export interface SemanticProgram {
  readonly descriptor: CompilerProgram;
  readonly project: () => Project;
  readonly sourceFile: (path: string) => SourceFile | undefined;
}

export interface SemanticSourceView {
  readonly program: SemanticProgram;
  readonly sourceFile: SourceFile;
  readonly canonicalPath: string;
}

export interface SemanticReference {
  readonly program: SemanticProgram;
  readonly node: Node;
  readonly canonicalPath: string;
  readonly start: number;
  readonly end: number;
}

/** The complete project surface syntax-oriented readers need. Native Projects satisfy it structurally. */
export interface SourceCorpus {
  readonly getSourceFiles: () => SourceFile[];
  readonly getSourceFile: (path: string) => SourceFile | undefined;
}

export interface SemanticWorkspace {
  readonly root: string;
  readonly programs: readonly SemanticProgram[];
  readonly program: (config: string) => SemanticProgram | undefined;
  readonly rootOwners: (path: string) => readonly SemanticProgram[];
  readonly containingPrograms: (path: string) => readonly SemanticProgram[];
  readonly sourceViews: (path: string) => readonly SemanticSourceView[];
  /** One candidate-scan identity per authored file; typed interpretation stays on sourceViews/programs. */
  readonly sourceFiles: () => readonly SourceFile[];
  /** Authored-root-only carrier for syntax-oriented readers. */
  readonly sourceCorpus: () => SourceCorpus;
  /** References unioned across every native program containing the declaration, deduped by physical span. */
  readonly findReferences: (node: Node) => readonly SemanticReference[];
}

export interface SemanticWorkspaceOptions {
  readonly root: string;
  readonly programs?: readonly CompilerProgram[];
  readonly overlay?: CompilerSourceOverlay;
  readonly fileSystem?: FileSystemHost;
}

export interface CoLocatedSemanticNodes {
  readonly project: Project;
  readonly left: Node;
  readonly right: Node;
}
