import { join } from "node:path";
import ts from "typescript";

interface Owner {
  readonly options: ts.CompilerOptions;
  readonly declarations: readonly string[];
  // Every file a program read from disk, parsed once: a case's program differs from the last only in its virtual source.
  readonly parsed: Map<string, ts.SourceFile | undefined>;
}

const owners = new Map<string, Owner>();

function ownerOf(root: string, configPath: string): Owner {
  const key = join(root, configPath);
  const held = owners.get(key);
  if (held !== undefined) {
    return held;
  }
  const parsed = ts.getParsedCommandLineOfConfigFile(
    key,
    {},
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: (diagnostic): never => {
        throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
      },
    },
  );
  if (parsed === undefined) {
    throw new Error(`Cannot read the owning TypeScript config: ${configPath}`);
  }
  if (parsed.fileNames.length === 0) {
    throw new Error(`TypeScript harness owner has no configured roots: ${configPath}`);
  }
  const owner: Owner = {
    options: { ...parsed.options, noEmit: true },
    declarations: parsed.fileNames.filter((path) => /\.d\.[cm]?ts$/u.test(path)),
    parsed: new Map(),
  };
  owners.set(key, owner);
  return owner;
}

/** Lint a virtual source with the checked-in compiler options and real dependency declarations. */
export function programForSource(root: string, configPath: string, fileName: string, source: string): ts.Program {
  const owner = ownerOf(root, configPath);
  const host = ts.createCompilerHost(owner.options, true);
  const read = host.getSourceFile.bind(host);
  host.getSourceFile = (name, version, onError, create): ts.SourceFile | undefined => {
    if (name === fileName) {
      return ts.createSourceFile(name, source, version, true);
    }
    if (!owner.parsed.has(name)) {
      owner.parsed.set(name, read(name, version, onError, create));
    }
    return owner.parsed.get(name);
  };
  const exists = host.fileExists.bind(host);
  host.fileExists = (name): boolean => name === fileName || exists(name);
  return ts.createProgram([fileName, ...owner.declarations], owner.options, host);
}
