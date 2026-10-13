import { dirname } from "node:path";
import type { FileSystemHost, RuntimeDirEntry } from "ts-morph";
import type { InventoryInput, InventoryOverlay } from "../code-facts/semantic-inventory-contract.ts";
import { inputVersion } from "../code-facts/semantic-inventory-inputs.ts";

/** Preserve native absolute resolution paths while projecting transaction bytes into a child. */
export function inventoryFileSystem(base: FileSystemHost, overlay?: InventoryOverlay, inputs?: Map<string, InventoryInput>): FileSystemHost {
  const text = new Map(overlay?.files.map((file) => [file.path, file.text]));
  const deleted = new Set(overlay?.deleted);
  const directories = new Set<string>();
  for (const path of text.keys()) {
    let directory = dirname(path);
    while (directory.startsWith(overlay?.root ?? "\0")) {
      directories.add(directory);
      const parent = dirname(directory);
      if (directory === parent) {
        break;
      }
      directory = parent;
    }
  }
  const observe = (path: string, kind: InventoryInput["kind"]): void => {
    const key = `${kind}\0${path}`;
    if (inputs !== undefined && !inputs.has(key)) {
      inputs.set(key, { path, kind, version: inputVersion(path, kind, plain) });
    }
  };
  const readDirectory = (directory: string): RuntimeDirEntry[] => {
    const entries = new Map(
      (base.directoryExistsSync(directory) ? base.readDirSync(directory) : []).filter((entry) => !deleted.has(entry.name)).map((entry) => [entry.name, entry]),
    );
    for (const path of text.keys()) {
      if (dirname(path) === directory) {
        entries.set(path, { name: path, isFile: true, isDirectory: false, isSymlink: false });
      }
    }
    for (const path of directories) {
      if (dirname(path) === directory) {
        entries.set(path, { name: path, isFile: false, isDirectory: true, isSymlink: false });
      }
    }
    return [...entries.values()];
  };
  const plain: FileSystemHost = {
    isCaseSensitive: () => base.isCaseSensitive(),
    delete: async (path) => await base.delete(path),
    deleteSync: (path) => base.deleteSync(path),
    readDirSync: readDirectory,
    readFile: async (path, encoding) => text.get(path) ?? (await base.readFile(path, encoding)),
    readFileSync: (path, encoding) => text.get(path) ?? base.readFileSync(path, encoding),
    writeFile: async (path, value) => await base.writeFile(path, value),
    writeFileSync: (path, value) => base.writeFileSync(path, value),
    mkdir: async (path) => await base.mkdir(path),
    mkdirSync: (path) => base.mkdirSync(path),
    move: async (source, target) => await base.move(source, target),
    moveSync: (source, target) => base.moveSync(source, target),
    copy: async (source, target) => await base.copy(source, target),
    copySync: (source, target) => base.copySync(source, target),
    fileExists: async (path) => !deleted.has(path) && (text.has(path) || (await base.fileExists(path))),
    fileExistsSync: (path) => !deleted.has(path) && (text.has(path) || base.fileExistsSync(path)),
    directoryExists: async (path) => directories.has(path) || (await base.directoryExists(path)),
    directoryExistsSync: (path) => directories.has(path) || base.directoryExistsSync(path),
    realpathSync: (path) => (text.has(path) || directories.has(path) ? path : base.realpathSync(path)),
    getCurrentDirectory: () => base.getCurrentDirectory(),
    glob: async (patterns) => await base.glob(patterns),
    globSync: (patterns) => base.globSync(patterns),
  };
  return {
    ...plain,
    readDirSync: (path): RuntimeDirEntry[] => {
      observe(path, "directory");
      return plain.readDirSync(path);
    },
    readFileSync: (path, encoding): string => {
      observe(path, "file");
      return plain.readFileSync(path, encoding);
    },
    fileExistsSync: (path): boolean => {
      observe(path, "exists");
      return plain.fileExistsSync(path);
    },
    directoryExistsSync: (path): boolean => {
      observe(path, "directory");
      return plain.directoryExistsSync(path);
    },
  };
}
