import { dirname } from "node:path";
import type { CompilerSourceOverlay } from "@orb/tooling/_shared/compiler-programs";
import { readCompilerPrograms } from "@orb/tooling/_shared/compiler-programs";
import type { SemanticWorkspace } from "@orb/tooling/_shared/ts-workspace";
import { canonicalCompilerPath, createSemanticWorkspace } from "@orb/tooling/_shared/ts-workspace";
import type { FileSystemHost, Project, RuntimeDirEntry, SourceFile } from "ts-morph";

function currentSources(project: Project, root: string): ReadonlyMap<string, SourceFile> {
  return new Map(project.getSourceFiles().map((sourceFile) => [canonicalCompilerPath(root, sourceFile.getFilePath()), sourceFile]));
}

function virtualDirectoryPaths(paths: Iterable<string>, root: string): ReadonlySet<string> {
  const directories = new Set<string>();
  for (const path of paths) {
    let directory = dirname(path);
    while (directory.startsWith(root)) {
      directories.add(directory);
      const parent = dirname(directory);
      if (parent === directory) {
        break;
      }
      directory = parent;
    }
  }
  return directories;
}

function overlayDirectoryEntries(opts: {
  base: FileSystemHost;
  directory: string;
  text: ReadonlyMap<string, string>;
  deleted: ReadonlySet<string>;
  virtualDirectories: ReadonlySet<string>;
  identity: (path: string) => string;
}): RuntimeDirEntry[] {
  const { base, directory, text, deleted, virtualDirectories, identity } = opts;
  const canonicalDirectory = identity(directory);
  const entries = new Map<string, RuntimeDirEntry>();
  for (const entry of base.directoryExistsSync(directory) ? base.readDirSync(directory) : []) {
    if (!deleted.has(identity(entry.name))) {
      entries.set(identity(entry.name), entry);
    }
  }
  for (const path of text.keys()) {
    if (dirname(path) === canonicalDirectory) {
      entries.set(path, { name: path, isFile: true, isDirectory: false, isSymlink: false });
    }
  }
  for (const path of virtualDirectories) {
    if (dirname(path) === canonicalDirectory) {
      entries.set(path, { name: path, isFile: false, isDirectory: true, isSymlink: false });
    }
  }
  return [...entries.values()];
}

function overlayFileSystem(
  base: FileSystemHost,
  mutationSources: ReadonlyMap<string, SourceFile>,
  overlay: CompilerSourceOverlay,
  root: string,
): FileSystemHost {
  const text = new Map([...mutationSources].map(([path, sourceFile]) => [path, sourceFile.getFullText()]));
  const deleted = new Set(overlay.deletedPaths.map((path) => canonicalCompilerPath(root, path)));
  const virtualDirectories = virtualDirectoryPaths(text.keys(), root);
  const identity = (path: string): string => canonicalCompilerPath(root, path);
  return {
    isCaseSensitive: () => base.isCaseSensitive(),
    delete: async (path) => await base.delete(path),
    deleteSync: (path) => base.deleteSync(path),
    readDirSync: (directory) => overlayDirectoryEntries({ base, directory, text, deleted, virtualDirectories, identity }),
    readFile: async (path, encoding) => text.get(identity(path)) ?? (await base.readFile(path, encoding)),
    readFileSync: (path, encoding) => text.get(identity(path)) ?? base.readFileSync(path, encoding),
    writeFile: async (path, fileText) => await base.writeFile(path, fileText),
    writeFileSync: (path, fileText) => base.writeFileSync(path, fileText),
    mkdir: async (path) => await base.mkdir(path),
    mkdirSync: (path) => base.mkdirSync(path),
    move: async (source, destination) => await base.move(source, destination),
    moveSync: (source, destination) => base.moveSync(source, destination),
    copy: async (source, destination) => await base.copy(source, destination),
    copySync: (source, destination) => base.copySync(source, destination),
    fileExists: async (path) => !deleted.has(identity(path)) && (text.has(identity(path)) || (await base.fileExists(path))),
    fileExistsSync: (path) => !deleted.has(identity(path)) && (text.has(identity(path)) || base.fileExistsSync(path)),
    directoryExists: async (path) => virtualDirectories.has(identity(path)) || (await base.directoryExists(path)),
    directoryExistsSync: (path) => virtualDirectories.has(identity(path)) || base.directoryExistsSync(path),
    realpathSync: (path) => (text.has(identity(path)) ? identity(path) : base.realpathSync(path)),
    getCurrentDirectory: () => base.getCurrentDirectory(),
    glob: async (patterns) => await base.glob(patterns),
    globSync: (patterns) => base.globSync(patterns),
  };
}

/** Build a fresh native-program semantic view over the codemod transaction's current in-memory bytes. */
export function createCodemodSemanticWorkspace(opts: {
  readonly project: Project;
  readonly repoRoot: string;
  readonly overlay: CompilerSourceOverlay;
}): SemanticWorkspace {
  const { project, repoRoot, overlay } = opts;
  const programs = readCompilerPrograms(repoRoot, overlay);
  const sources = currentSources(project, repoRoot);
  return createSemanticWorkspace({ root: repoRoot, programs, overlay, fileSystem: overlayFileSystem(project.getFileSystem(), sources, overlay, repoRoot) });
}
