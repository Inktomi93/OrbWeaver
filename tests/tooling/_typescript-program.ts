import { join } from "node:path";
import ts from "typescript";

/** Lint a virtual source with the checked-in compiler options and real dependency declarations. */
export function programForSource(root: string, configPath: string, fileName: string, source: string): ts.Program {
  const parsed = ts.getParsedCommandLineOfConfigFile(
    join(root, configPath),
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
  const options = { ...parsed.options, noEmit: true };
  const host = ts.createCompilerHost(options, true);
  const read = host.getSourceFile.bind(host);
  host.getSourceFile = (name, version, onError, create): ts.SourceFile | undefined =>
    name === fileName ? ts.createSourceFile(name, source, version, true) : read(name, version, onError, create);
  const exists = host.fileExists.bind(host);
  host.fileExists = (name): boolean => name === fileName || exists(name);
  const declarations = parsed.fileNames.filter((path) => /\.d\.[cm]?ts$/u.test(path));
  return ts.createProgram([fileName, ...declarations], options, host);
}
