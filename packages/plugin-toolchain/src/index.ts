import type { Dirent } from "node:fs";
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import process from "node:process";
import { zipSync } from "fflate";
import ts from "typescript";
import { surfaceLinkProblems } from "./surface-links.ts";

export { PLUGIN_AUTHOR_SUPPORT } from "./support.generated.ts";
export {
  pluginAuthorSupportGuideIsCurrent,
  renderPluginAuthorSupport,
  writePluginAuthorSupportGuide,
} from "./support.ts";
export type {
  PluginAuthorCapabilitySupport,
  PluginAuthorExecution,
  PluginAuthorHookSupport,
  PluginAuthorPlacementSupport,
  PluginAuthorRuntimeSupport,
  PluginAuthorSupport,
  PluginAuthorSupportFormat,
  PluginAuthorSupportSection,
  PluginAuthorSupportSource,
  PluginAuthorSurfaceSupport,
  PluginAuthorTierSupport,
  PluginAuthorWorld,
} from "./support-model.ts";
export {
  createPluginAuthorSupport,
  PLUGIN_AUTHOR_EXECUTIONS,
  PLUGIN_AUTHOR_SUPPORT_FORMATS,
  PLUGIN_AUTHOR_SUPPORT_SECTIONS,
  PLUGIN_AUTHOR_WORLDS,
  pluginAuthorSupportDrift,
} from "./support-model.ts";

export const PLUGIN_AUTHOR_RUNTIMES = ["main", "ui", "frame"] as const;
export type PluginAuthorRuntime = (typeof PLUGIN_AUTHOR_RUNTIMES)[number];

export interface PluginAuthorDiagnostic {
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly message: string;
}

export interface PluginAuthorArtifact {
  readonly runtime: PluginAuthorRuntime;
  readonly sourcePath: string;
  readonly outputPath: string;
  readonly bytes: Uint8Array;
}

export interface PluginAuthorResult {
  readonly artifacts: readonly PluginAuthorArtifact[];
  readonly diagnostics: readonly PluginAuthorDiagnostic[];
  readonly obsoleteOutputPaths: readonly string[];
}

export interface PluginAuthorProject {
  readonly pluginDirectory: string;
  readonly sdkDirectory: string;
  readonly sourceDirectory?: string;
  readonly outputDirectory?: string;
  readonly compilerObserver?: PluginAuthorCompilerObserver;
}

/** Observe the reads and resolution probes of the compiler that checks the authored scripts. */
export interface PluginAuthorCompilerObserver {
  readonly readFile: (path: string, text: string | undefined) => void;
  readonly fileExists: (path: string, exists: boolean) => void;
  readonly directoryExists: (path: string, exists: boolean) => void;
}

export interface PluginAuthorBundleResult extends PluginAuthorResult {
  readonly bundle: Uint8Array | null;
}

const QUICKJS_FORBIDDEN_GLOBALS = new Set([
  "Date",
  "EventSource",
  "WebSocket",
  "Worker",
  "XMLHttpRequest",
  "clearInterval",
  "clearTimeout",
  "document",
  "fetch",
  "localStorage",
  "navigator",
  "performance",
  "process",
  "queueMicrotask",
  "require",
  "sessionStorage",
  "setInterval",
  "setTimeout",
  "window",
]);

const FRAME_FORBIDDEN_GLOBALS = new Set(["EventSource", "WebSocket", "Worker", "XMLHttpRequest", "fetch", "orb", "process", "require"]);
const FRAME_SCRIPT_MARKER = "/* @orb-frame-script */";

function sdkEntry(sdkDirectory: string, runtime: PluginAuthorRuntime): string {
  return join(sdkDirectory, `${runtime}.d.ts`);
}

function sourcePosition(source: ts.SourceFile, node: ts.Node, message: string): PluginAuthorDiagnostic {
  const point = source.getLineAndCharacterOfPosition(node.getStart(source));
  return { file: source.fileName, line: point.line + 1, column: point.character + 1, message };
}

function isDeclarationName(node: ts.Identifier, parent: ts.Node | undefined): boolean {
  if (parent === undefined) {
    return false;
  }
  return (
    (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
    (ts.isPropertyAssignment(parent) && parent.name === node) ||
    (ts.isShorthandPropertyAssignment(parent) && parent.name === node) ||
    (ts.isMethodDeclaration(parent) && parent.name === node) ||
    (ts.isPropertyDeclaration(parent) && parent.name === node) ||
    (ts.isBindingElement(parent) && parent.name === node) ||
    (ts.isVariableDeclaration(parent) && parent.name === node) ||
    (ts.isFunctionDeclaration(parent) && parent.name === node) ||
    (ts.isParameter(parent) && parent.name === node)
  );
}

function isModuleSyntax(node: ts.Node): boolean {
  return (
    ts.isImportDeclaration(node) ||
    ts.isImportEqualsDeclaration(node) ||
    ts.isExportDeclaration(node) ||
    ts.isExportAssignment(node) ||
    (ts.canHaveModifiers(node) && ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) === true) ||
    (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword)
  );
}

function forbiddenGlobalName(node: ts.Node, forbidden: ReadonlySet<string>): string | undefined {
  let name: string | undefined;
  if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "globalThis" && forbidden.has(node.name.text)) {
    name = node.name.text;
  } else if (
    ts.isElementAccessExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === "globalThis" &&
    ts.isStringLiteral(node.argumentExpression) &&
    forbidden.has(node.argumentExpression.text)
  ) {
    name = node.argumentExpression.text;
  }
  return name;
}

function isMathRandom(node: ts.Node): boolean {
  return ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "Math" && node.name.text === "random";
}

function syntaxDiagnostics(source: ts.SourceFile, runtime: PluginAuthorRuntime): readonly PluginAuthorDiagnostic[] {
  const diagnostics: PluginAuthorDiagnostic[] = [];
  const forbidden = runtime === "frame" ? FRAME_FORBIDDEN_GLOBALS : QUICKJS_FORBIDDEN_GLOBALS;
  const visit = (node: ts.Node, parent?: ts.Node): void => {
    if (isModuleSyntax(node)) {
      diagnostics.push(sourcePosition(source, node, `${runtime} source must be a self-contained script; imports and exports are not available at runtime`));
    }
    if (ts.isIdentifier(node) && forbidden.has(node.text) && !isDeclarationName(node, parent)) {
      diagnostics.push(sourcePosition(source, node, `${node.text} is unavailable in the ${runtime} runtime`));
    }
    const globalName = forbiddenGlobalName(node, forbidden);
    if (globalName !== undefined) {
      diagnostics.push(sourcePosition(source, node, `${globalName} is unavailable in the ${runtime} runtime`));
    }
    if (runtime !== "frame" && isMathRandom(node)) {
      diagnostics.push(sourcePosition(source, node, "Math.random is unavailable in QuickJS guests; use the injected random seam"));
    }
    ts.forEachChild(node, (child) => visit(child, node));
  };
  visit(source);
  return diagnostics;
}

function compilerOptions(runtime: PluginAuthorRuntime): ts.CompilerOptions {
  return {
    ignoreDeprecations: "6.0",
    lib: runtime === "frame" ? ["lib.es2023.d.ts", "lib.dom.d.ts"] : ["lib.es2023.d.ts"],
    module: ts.ModuleKind.ESNext,
    moduleDetection: ts.ModuleDetectionKind.Legacy,
    newLine: ts.NewLineKind.LineFeed,
    noEmitOnError: true,
    noImplicitReturns: true,
    removeComments: false,
    skipLibCheck: false,
    strict: true,
    target: ts.ScriptTarget.ES2023,
    types: [],
    useDefineForClassFields: true,
  };
}

function formatCompilerDiagnostic(diagnostic: ts.Diagnostic, fallbackFile: string): PluginAuthorDiagnostic {
  const source = diagnostic.file;
  const point = source === undefined || diagnostic.start === undefined ? { line: 0, character: 0 } : source.getLineAndCharacterOfPosition(diagnostic.start);
  return {
    file: source?.fileName ?? fallbackFile,
    line: point.line + 1,
    column: point.character + 1,
    message: ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
  };
}

function emitScript(sourceText: string, sourcePath: string, runtime: PluginAuthorRuntime): string {
  const result = ts.transpileModule(sourceText, { compilerOptions: compilerOptions(runtime), fileName: sourcePath, reportDiagnostics: false });
  return result.outputText;
}

async function compileSource(
  sdkDirectory: string,
  sourcePath: string,
  runtime: PluginAuthorRuntime,
  observer?: PluginAuthorCompilerObserver,
): Promise<{ text: string; diagnostics: readonly PluginAuthorDiagnostic[] }> {
  const absolute = resolve(sourcePath);
  const text = await readFile(absolute, "utf8");
  const options = compilerOptions(runtime);
  const host = ts.createCompilerHost(options);
  if (observer !== undefined) {
    const { readFile: readCompilerFile, fileExists: compilerFileExists, directoryExists } = host;
    host.readFile = (path): string | undefined => {
      const contents = readCompilerFile(path);
      observer.readFile(path, contents);
      return contents;
    };
    host.fileExists = (path): boolean => {
      const exists = compilerFileExists(path);
      observer.fileExists(path, exists);
      return exists;
    };
    if (directoryExists !== undefined) {
      host.directoryExists = (path): boolean => {
        const exists = directoryExists(path);
        observer.directoryExists(path, exists);
        return exists;
      };
    }
  }
  const program = ts.createProgram({ rootNames: [sdkEntry(sdkDirectory, runtime), absolute], options, host });
  const source = program.getSourceFile(absolute);
  if (source === undefined) {
    return { text: "", diagnostics: [{ file: absolute, line: 1, column: 1, message: "TypeScript did not load the authored source" }] };
  }
  const diagnostics = [
    ...syntaxDiagnostics(source, runtime),
    ...ts.getPreEmitDiagnostics(program).map((diagnostic) => formatCompilerDiagnostic(diagnostic, absolute)),
    ...(runtime === "main" ? surfaceLinkProblems(program.getTypeChecker(), source).map(({ node, message }) => sourcePosition(source, node, message)) : []),
  ];
  return { text: diagnostics.length === 0 ? emitScript(text, absolute, runtime) : "", diagnostics };
}

function outputFor(sourcePath: string, outputDirectory: string): string {
  return join(outputDirectory, `${basename(sourcePath, ".ts")}.js`);
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await readFile(path);
    return true;
  } catch (error) {
    if (isMissingFile(error)) {
      return false;
    }
    throw error;
  }
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

async function readOptionalText(path: string): Promise<string | undefined> {
  let text: string | undefined;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if (!isMissingFile(error)) {
      throw error;
    }
  }
  return text;
}

function templateLiteralBody(text: string): string {
  return text.replaceAll("\\", "\\\\").replaceAll("`", "\\`").replaceAll("${", "\\${");
}

interface FrameCompilation {
  readonly sourceText: string | undefined;
  readonly emittedText: string | undefined;
  readonly diagnostics: readonly PluginAuthorDiagnostic[];
}

async function compileFrame(sdkDirectory: string, sourceDirectory: string, observer?: PluginAuthorCompilerObserver): Promise<FrameCompilation> {
  const sourcePath = join(sourceDirectory, "frame.ts");
  const sourceText = await readOptionalText(sourcePath);
  if (sourceText === undefined) {
    return { sourceText: undefined, emittedText: undefined, diagnostics: [] };
  }
  const compiled = await compileSource(sdkDirectory, sourcePath, "frame", observer);
  return {
    sourceText,
    emittedText: compiled.diagnostics.length === 0 ? compiled.text.trimEnd() : undefined,
    diagnostics: compiled.diagnostics,
  };
}

type EmbeddedFrame = { readonly text: string; readonly diagnostic?: never } | { readonly text?: never; readonly diagnostic: PluginAuthorDiagnostic };

function embedFrame(sourcePath: string, sourceText: string, emittedFrame: string): EmbeddedFrame {
  const markerCount = sourceText.split(FRAME_SCRIPT_MARKER).length - 1;
  if (markerCount !== 1) {
    return {
      diagnostic: { file: sourcePath, line: 1, column: 1, message: `frame source requires exactly one ${FRAME_SCRIPT_MARKER} marker in main.ts` },
    };
  }
  return { text: emitScript(sourceText.replace(FRAME_SCRIPT_MARKER, templateLiteralBody(emittedFrame)), sourcePath, "main") };
}

interface RuntimeCompilation {
  readonly sdkDirectory: string;
  readonly sourceDirectory: string;
  readonly outputDirectory: string;
  readonly runtime: "main" | "ui";
  readonly frame: FrameCompilation;
  readonly observer?: PluginAuthorCompilerObserver;
}

async function compileRuntime({
  sdkDirectory,
  sourceDirectory,
  outputDirectory,
  runtime,
  frame,
  observer,
}: RuntimeCompilation): Promise<{ readonly artifact?: PluginAuthorArtifact; readonly diagnostics: readonly PluginAuthorDiagnostic[] }> {
  const sourcePath = join(sourceDirectory, `${runtime}.ts`);
  const sourceText = await readOptionalText(sourcePath);
  if (sourceText === undefined) {
    return {
      diagnostics: runtime === "main" ? [{ file: sourcePath, line: 1, column: 1, message: "main.ts is required" }] : [],
    };
  }
  const compiled = await compileSource(sdkDirectory, sourcePath, runtime, observer);
  if (compiled.diagnostics.length > 0) {
    return { diagnostics: compiled.diagnostics };
  }
  let output = compiled.text;
  if (runtime === "main" && frame.emittedText !== undefined) {
    const embedded = embedFrame(sourcePath, sourceText, frame.emittedText);
    if (embedded.diagnostic !== undefined) {
      return { diagnostics: [embedded.diagnostic] };
    }
    output = embedded.text;
  } else if (runtime === "main" && frame.sourceText === undefined && sourceText.includes(FRAME_SCRIPT_MARKER)) {
    return { diagnostics: [{ file: sourcePath, line: 1, column: 1, message: `${FRAME_SCRIPT_MARKER} requires authored frame.ts` }] };
  }
  return {
    artifact: { runtime, sourcePath, outputPath: outputFor(sourcePath, outputDirectory), bytes: new TextEncoder().encode(output) },
    diagnostics: [],
  };
}

async function legacyOutputDiagnostics(sourceDirectory: string): Promise<readonly PluginAuthorDiagnostic[]> {
  const mainPath = join(sourceDirectory, "main.js");
  const framePath = join(sourceDirectory, "frame.js");
  const diagnostics: PluginAuthorDiagnostic[] = [];
  if (await fileExists(mainPath)) {
    diagnostics.push({
      file: mainPath,
      line: 1,
      column: 1,
      message: "main.js is generated output; keep it in the configured output directory, not beside source",
    });
  }
  if (await fileExists(framePath)) {
    diagnostics.push({ file: framePath, line: 1, column: 1, message: "frame.js is not a runtime entry; frame.ts must be embedded into main.js" });
  }
  return diagnostics;
}

async function obsoleteUiOutput(sourceDirectory: string, outputDirectory: string): Promise<readonly string[]> {
  if ((await fileExists(join(sourceDirectory, "ui.ts"))) || !(await fileExists(join(outputDirectory, "ui.js")))) {
    return [];
  }
  return [join(outputDirectory, "ui.js")];
}

export async function compilePluginDirectory(project: PluginAuthorProject): Promise<PluginAuthorResult> {
  const { pluginDirectory, sdkDirectory } = project;
  const sourceDirectory = project.sourceDirectory ?? pluginDirectory;
  const outputDirectory = project.outputDirectory ?? join(pluginDirectory, ".orb-plugin", "build");
  const frame = await compileFrame(sdkDirectory, sourceDirectory, project.compilerObserver);
  const runtimeResults = await Promise.all(
    (["main", "ui"] as const).map((runtime) =>
      compileRuntime({
        sdkDirectory,
        sourceDirectory,
        outputDirectory,
        runtime,
        frame,
        ...(project.compilerObserver === undefined ? {} : { observer: project.compilerObserver }),
      }),
    ),
  );
  const diagnostics = [...(await legacyOutputDiagnostics(sourceDirectory)), ...frame.diagnostics, ...runtimeResults.flatMap((result) => result.diagnostics)];
  const missingUiSource = !(await fileExists(join(sourceDirectory, "ui.ts")));
  const sourceUiOutput = join(sourceDirectory, "ui.js");
  if (missingUiSource && (await fileExists(sourceUiOutput))) {
    diagnostics.push({ file: sourceUiOutput, line: 1, column: 1, message: "ui.js exists without authored ui.ts" });
  }
  return {
    artifacts: diagnostics.length === 0 ? runtimeResults.flatMap((result) => (result.artifact === undefined ? [] : [result.artifact])) : [],
    diagnostics,
    obsoleteOutputPaths: await obsoleteUiOutput(sourceDirectory, outputDirectory),
  };
}

export function formatPluginAuthorDiagnostics(repoRoot: string, diagnostics: readonly PluginAuthorDiagnostic[]): string {
  return diagnostics.map((diagnostic) => `${relative(repoRoot, diagnostic.file)}:${diagnostic.line}:${diagnostic.column} ${diagnostic.message}`).join("\n");
}

export async function writePluginArtifacts(result: PluginAuthorResult): Promise<void> {
  if (result.diagnostics.length > 0) {
    throw new Error("cannot write plugin artifacts while author diagnostics are present");
  }
  await Promise.all([
    ...result.obsoleteOutputPaths.map((path) => rm(path, { force: true })),
    ...result.artifacts.map(async (artifact) => {
      await mkdir(dirname(artifact.outputPath), { recursive: true });
      const temporary = `${artifact.outputPath}.tmp-${process.pid}`;
      try {
        await writeFile(temporary, artifact.bytes);
        await rename(temporary, artifact.outputPath);
      } finally {
        await rm(temporary, { force: true });
      }
    }),
  ]);
}

export async function stalePluginArtifacts(result: PluginAuthorResult): Promise<readonly string[]> {
  const stale: string[] = [...result.obsoleteOutputPaths];
  for (const artifact of result.artifacts) {
    let current: Buffer;
    try {
      current = await readFile(artifact.outputPath);
    } catch {
      stale.push(artifact.outputPath);
      continue;
    }
    if (!current.equals(artifact.bytes)) {
      stale.push(artifact.outputPath);
    }
  }
  return stale;
}

const BUNDLE_MTIME_MS = 331_257_600_000;

async function optionalAssetEntries(pluginDirectory: string): Promise<ReadonlyArray<readonly [string, Uint8Array]>> {
  const assetDirectory = join(pluginDirectory, "ui", "assets");
  let entries: Dirent[];
  try {
    entries = await readdir(assetDirectory, { withFileTypes: true });
  } catch (error) {
    if (isMissingFile(error)) {
      return [];
    }
    throw error;
  }
  const nested = entries.filter((entry) => !entry.isFile());
  if (nested.length > 0) {
    throw new Error(
      `plugin assets must be files directly under ui/assets: ${nested
        .map((entry) => entry.name)
        .toSorted((left, right) => left.localeCompare(right))
        .join(", ")}`,
    );
  }
  const assets: Array<readonly [string, Uint8Array]> = [];
  for (const entry of entries.toSorted((left, right) => left.name.localeCompare(right.name))) {
    assets.push([`ui/assets/${entry.name}`, new Uint8Array(await readFile(join(assetDirectory, entry.name)))]);
  }
  return assets;
}

/** Compile and deterministically pack the public install artifact. The application still runs its own
 * install-funnel validation over these bytes; this function owns artifact construction for first- and
 * third-party authors so templates never copy a private packer. */
export async function packPluginDirectory(project: PluginAuthorProject): Promise<PluginAuthorBundleResult> {
  const result = await compilePluginDirectory(project);
  if (result.diagnostics.length > 0) {
    return { ...result, bundle: null };
  }
  const main = result.artifacts.find((artifact) => artifact.runtime === "main");
  if (main === undefined) {
    throw new Error("plugin author compiler produced no main artifact");
  }
  const entries: Record<string, [Uint8Array, { readonly mtime: number }]> = {
    "manifest.json": [new Uint8Array(await readFile(join(project.pluginDirectory, "manifest.json"))), { mtime: BUNDLE_MTIME_MS }],
    "main.js": [main.bytes, { mtime: BUNDLE_MTIME_MS }],
  };
  const ui = result.artifacts.find((artifact) => artifact.runtime === "ui");
  if (ui !== undefined) {
    entries["ui.js"] = [ui.bytes, { mtime: BUNDLE_MTIME_MS }];
  }
  for (const [path, bytes] of await optionalAssetEntries(project.pluginDirectory)) {
    entries[path] = [bytes, { mtime: BUNDLE_MTIME_MS }];
  }
  return { ...result, bundle: zipSync(entries) };
}
