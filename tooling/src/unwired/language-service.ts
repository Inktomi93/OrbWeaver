// Engine one: the TypeScript language service's findReferences for every function-typed member of every interface
// and object type alias in production source, one world at a time.
import { relative } from "node:path";
import ts from "typescript";
import type { ReferenceKind } from "./classify.ts";
import { classifyReference } from "./classify.ts";
import { isProduction, loadWorld, realpath } from "./worlds.ts";

/** One member and what each engine found pointing at it. Lines are 1-based. */
export interface MemberReferences {
  readonly key: string;
  readonly file: string;
  readonly line: number;
  readonly character: number;
  readonly home: string;
  readonly member: string;
  readonly counts: Readonly<Record<ReferenceKind, number>>;
  /** Up to a few production use sites, `file:line`. */
  readonly uses: readonly string[];
}

const SAMPLE_USES = 3;

function createService(root: string, config: string): ts.LanguageService {
  const parsed = loadWorld(root, config);
  const host: ts.LanguageServiceHost = {
    getScriptFileNames: () => parsed.fileNames,
    getScriptVersion: () => "0",
    getScriptSnapshot: (file) => {
      const text = ts.sys.readFile(file);
      return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text);
    },
    getCurrentDirectory: () => root,
    getCompilationSettings: () => parsed.options,
    getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
    fileExists: ts.sys.fileExists,
    readFile: ts.sys.readFile,
    readDirectory: ts.sys.readDirectory,
    directoryExists: ts.sys.directoryExists,
    getDirectories: ts.sys.getDirectories,
    // Without it a workspace package loads through its node_modules link and every cross-package use is lost.
    realpath,
  };
  return ts.createLanguageService(host, ts.createDocumentRegistry());
}

function membersOf(node: ts.Node): ts.NodeArray<ts.TypeElement> | null {
  if (ts.isInterfaceDeclaration(node)) {
    return node.members;
  }
  return ts.isTypeAliasDeclaration(node) && ts.isTypeLiteralNode(node.type) ? node.type.members : null;
}

function isFunctionTyped(
  checker: ts.TypeChecker,
  member: ts.TypeElement,
): member is (ts.MethodSignature | ts.PropertySignature) & { readonly name: ts.Identifier } {
  if (!((ts.isMethodSignature(member) || ts.isPropertySignature(member)) && ts.isIdentifier(member.name))) {
    return false;
  }
  return ts.isMethodSignature(member) || checker.getNonNullableType(checker.getTypeAtLocation(member)).getCallSignatures().length > 0;
}

/** Every scanned member of one world with its classified references. */
export function scanWorld(root: string, config: string): readonly MemberReferences[] {
  const service = createService(root, config);
  const program = service.getProgram();
  if (program === undefined) {
    throw new Error(`${config}: the language service built no program`);
  }
  const checker = program.getTypeChecker();
  const found: MemberReferences[] = [];
  for (const source of program.getSourceFiles()) {
    const file = relative(root, source.fileName);
    if (source.isDeclarationFile || !isProduction(file)) {
      continue;
    }
    const visit = (node: ts.Node): void => {
      const members = membersOf(node);
      const home = ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node) ? node.name.text : "";
      for (const member of members ?? []) {
        if (isFunctionTyped(checker, member)) {
          found.push(referencesOf(root, service, program, { source, file, home, member }));
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return found;
}

interface Site {
  readonly source: ts.SourceFile;
  readonly file: string;
  readonly home: string;
  readonly member: ts.TypeElement & { readonly name: ts.Identifier };
}

function referencesOf(root: string, service: ts.LanguageService, program: ts.Program, site: Site): MemberReferences {
  const at = site.member.name.getStart(site.source);
  const counts: Record<ReferenceKind, number> = { use: 0, builder: 0, plumbing: 0, test: 0, external: 0 };
  const uses: string[] = [];
  for (const group of service.findReferences(site.source.fileName, at) ?? []) {
    for (const reference of group.references) {
      if (reference.fileName === site.source.fileName && reference.textSpan.start === at) {
        continue;
      }
      const source = program.getSourceFile(reference.fileName);
      const file = relative(root, reference.fileName);
      const kind = source === undefined ? "external" : classifyReference(source, reference.textSpan.start, file);
      counts[kind]++;
      if (kind === "use" && source !== undefined && uses.length < SAMPLE_USES) {
        uses.push(`${file}:${source.getLineAndCharacterOfPosition(reference.textSpan.start).line + 1}`);
      }
    }
  }
  const position = site.source.getLineAndCharacterOfPosition(at);
  return {
    key: `${site.file}:${site.home}.${site.member.name.text}`,
    file: site.file,
    line: position.line + 1,
    character: position.character,
    home: site.home,
    member: site.member.name.text,
    counts,
    uses,
  };
}
