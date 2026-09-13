import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import type { SourceFile } from "ts-morph";
import { Node } from "ts-morph";
import { customPropertyDefinitions, customPropertyReferences } from "./css-resource-facts.ts";
import { parseCssStylesheet } from "./css-rules.ts";
import { walkStaticClassExpressions } from "./static-class-expression.ts";
import type { VendorContract } from "./vendor-css-contract.ts";
import { readVendorCssContract } from "./vendor-css-contract.ts";

const CUSTOM_PROPERTY = "--[a-zA-Z_][a-zA-Z0-9_-]*";
const CUSTOM_PROPERTY_NAME_RE = new RegExp(`^${CUSTOM_PROPERTY}$`, "u");
const VAR_START_RE = new RegExp(`var\\(\\s*(${CUSTOM_PROPERTY})`, "gu");
const ARBITRARY_VAR_RE = new RegExp(`(?:^|[^a-zA-Z0-9_-])[-a-zA-Z0-9_[\\].:/]+-\\((${CUSTOM_PROPERTY})\\)`, "gu");
const DYNAMIC_CUSTOM_PROPERTY_TAIL_RE = /(?:var\(\s*|[-a-zA-Z0-9_[\].:/]+-\()--[a-zA-Z0-9_-]*$/u;

export interface CssVariableSite {
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly name: string;
  readonly fallback: boolean;
  readonly node?: Node;
  readonly offset?: number;
}

export interface CssVariableInventory {
  readonly sourceFiles: number;
  readonly cssDefinitions: ReadonlySet<string>;
  readonly runtimeDefinitions: ReadonlySet<string>;
  readonly runtimeDefinitionSites: readonly CssVariableSite[];
  readonly definitions: ReadonlySet<string>;
  readonly references: readonly CssVariableSite[];
  readonly unsupported: readonly CssVariableSite[];
  readonly classRoots: number;
}

function repoRel(root: string, path: string): string {
  return relative(root, path).split(sep).join("/");
}

function lineColumn(text: string, offset: number): { readonly line: number; readonly column: number } {
  const before = text.slice(0, offset);
  const lastNewline = before.lastIndexOf("\n");
  return { line: before.split("\n").length, column: offset - lastNewline };
}

function quotedStep(text: string, index: number, quote: "'" | '"'): { readonly index: number; readonly quote: "'" | '"' | undefined } {
  const char = text[index];
  return char === "\\" ? { index: index + 1, quote } : { index, quote: char === quote ? undefined : quote };
}

function closingParen(text: string, open: number): number | undefined {
  let depth = 0;
  let quote: "'" | '"' | undefined;
  let result: number | undefined;
  for (let index = open; index < text.length; index += 1) {
    const char = text[index];
    if (quote !== undefined) {
      const step = quotedStep(text, index, quote);
      index = step.index;
      quote = step.quote;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
    } else if (char === "(") {
      depth += 1;
    } else if (char === ")") {
      depth -= 1;
      if (depth === 0) {
        result = index;
        break;
      }
    }
  }
  return result;
}

function hasTopLevelComma(text: string, start: number, end: number): boolean {
  let depth = 0;
  for (let index = start; index < end; index += 1) {
    const char = text[index];
    if (char === "(") {
      depth += 1;
    } else if (char === ")") {
      depth -= 1;
    } else if (char === "," && depth === 0) {
      return true;
    }
  }
  return false;
}

function varSites(text: string, file: string, node?: Node, sourceOffset = 0): CssVariableSite[] {
  const sites: CssVariableSite[] = [];
  for (const match of text.matchAll(VAR_START_RE)) {
    const name = match[1];
    const at = match.index;
    if (name === undefined) {
      continue;
    }
    const open = text.indexOf("(", at);
    const close = closingParen(text, open);
    const position = node === undefined ? lineColumn(text, at) : node.getSourceFile().getLineAndColumnAtPos(sourceOffset + at);
    const fallback = close !== undefined && hasTopLevelComma(text, at + match[0].length, close);
    sites.push(
      node === undefined ? { file, ...position, name, fallback } : { file, ...position, name, fallback, node, offset: sourceOffset + at - node.getStart() },
    );
  }
  return sites;
}

function arbitrarySites(text: string, file: string, node: Node, sourceOffset: number): CssVariableSite[] {
  const sites: CssVariableSite[] = [];
  for (const match of text.matchAll(ARBITRARY_VAR_RE)) {
    const name = match[1];
    const at = match.index;
    if (name === undefined) {
      continue;
    }
    const position = node.getSourceFile().getLineAndColumnAtPos(sourceOffset + at);
    sites.push({ file, ...position, name, fallback: false, node, offset: sourceOffset + at - node.getStart() });
  }
  return sites;
}

function cssInventory(
  root: string,
  cssHomes: readonly string[],
): { readonly definitions: Set<string>; readonly references: CssVariableSite[]; readonly files: number } {
  const definitions = new Set<string>();
  const references: CssVariableSite[] = [];
  let files = 0;
  for (const rel of cssHomes) {
    const abs = join(root, rel);
    if (statSync(abs, { throwIfNoEntry: false })?.isFile() !== true) {
      continue;
    }
    files += 1;
    const text = readFileSync(abs, "utf8");
    const parsed = parseCssStylesheet(text);
    const file = { path: rel, text, rules: parsed.rules, atRules: parsed.atRules, statements: parsed.statements };
    for (const definition of customPropertyDefinitions(file)) {
      definitions.add(definition.name);
    }
    references.push(...customPropertyReferences(file));
  }
  return { definitions, references, files };
}

function productSources(root: string, files: readonly SourceFile[]): SourceFile[] {
  return files.filter((source) => {
    const rel = repoRel(root, source.getFilePath());
    return (rel.startsWith("packages/ui/src/") || rel.startsWith("packages/client/src/")) && /\.(?:ts|tsx)$/u.test(rel);
  });
}

function isClassFragment(node: Node): boolean {
  return node.getAncestors().some((ancestor) => {
    if (Node.isJsxAttribute(ancestor)) {
      return ancestor.getNameNode().getText() === "className";
    }
    if (Node.isVariableDeclaration(ancestor)) {
      return /^[A-Z][A-Z0-9_]*$/u.test(ancestor.getName());
    }
    return Node.isCallExpression(ancestor) && /^(?:tv|cva)$/u.test(ancestor.getExpression().getText());
  });
}

function literalSites(node: Node, value: string, sourceStart: number, file: string): CssVariableSite[] {
  const references = varSites(value, file, node, sourceStart);
  return isClassFragment(node) ? [...references, ...arbitrarySites(value, file, node, sourceStart)] : references;
}

function hasCssPropertiesContract(node: Node): boolean {
  return node.getAncestors().some((ancestor) => {
    if (Node.isVariableDeclaration(ancestor)) {
      return ancestor.getTypeNode()?.getText() === "CSSProperties";
    }
    if (Node.isAsExpression(ancestor) || Node.isSatisfiesExpression(ancestor)) {
      return ancestor.getTypeNode()?.getText() === "CSSProperties";
    }
    return Node.isJsxAttribute(ancestor) && ancestor.getNameNode().getText() === "style";
  });
}

interface SourceInventoryState {
  readonly definitions: Set<string>;
  readonly definitionSites: CssVariableSite[];
  readonly references: CssVariableSite[];
}

function inventorySourceNode(node: Node, file: string, state: SourceInventoryState): void {
  if (Node.isPropertyAssignment(node)) {
    const nameNode = node.getNameNode();
    if (Node.isStringLiteral(nameNode) && CUSTOM_PROPERTY_NAME_RE.test(nameNode.getLiteralValue()) && hasCssPropertiesContract(node)) {
      const name = nameNode.getLiteralValue();
      const position = nameNode.getSourceFile().getLineAndColumnAtPos(nameNode.getStart());
      state.definitions.add(name);
      state.definitionSites.push({ file, ...position, name, fallback: false, node: nameNode, offset: 1 });
    }
  }
  if (Node.isStringLiteral(node) || Node.isNoSubstitutionTemplateLiteral(node)) {
    state.references.push(...literalSites(node, node.getLiteralValue(), node.getStart() + 1, file));
  }
  if (Node.isTemplateExpression(node)) {
    const head = node.getHead();
    if (isClassFragment(head)) {
      state.references.push(...arbitrarySites(head.getLiteralText(), file, head, head.getStart() + 1));
    }
    for (const span of node.getTemplateSpans()) {
      const literal = span.getLiteral();
      if (isClassFragment(literal)) {
        state.references.push(...arbitrarySites(literal.getLiteralText(), file, literal, literal.getStart() + 1));
      }
    }
  }
}

function sourceStringInventory(
  root: string,
  sources: readonly SourceFile[],
): { readonly definitions: Set<string>; readonly definitionSites: CssVariableSite[]; readonly references: CssVariableSite[] } {
  const definitions = new Set<string>();
  const definitionSites: CssVariableSite[] = [];
  const references: CssVariableSite[] = [];
  const state = { definitions, definitionSites, references };
  for (const source of sources) {
    const file = repoRel(root, source.getFilePath());
    for (const node of source.getDescendants()) {
      inventorySourceNode(node, file, state);
    }
  }
  return { definitions, definitionSites, references };
}

function uniqueSites(sites: readonly CssVariableSite[]): CssVariableSite[] {
  const byLocation = new Map<string, CssVariableSite>();
  for (const site of sites) {
    byLocation.set(`${site.file}:${site.line}:${site.column}:${site.name}`, site);
  }
  return [...byLocation.values()];
}

export function inventoryCssVariables(root: string, files: readonly SourceFile[], cssHomes: readonly string[]): CssVariableInventory {
  const css = cssInventory(root, cssHomes);
  const sources = productSources(root, files);
  const strings = sourceStringInventory(root, sources);
  const walk = walkStaticClassExpressions(sources);
  const references = [...css.references, ...strings.references];
  for (const candidate of walk.candidates) {
    for (const segment of candidate.segments) {
      const segmentText = candidate.value.slice(segment.valueStart, segment.valueEnd);
      const file = repoRel(root, segment.node.getSourceFile().getFilePath());
      references.push(...varSites(segmentText, file, segment.node, segment.sourceStart));
      references.push(...arbitrarySites(segmentText, file, segment.node, segment.sourceStart));
    }
  }
  const unsupportedPrefixes = walk.runtimePrefixes.flatMap((prefix) => {
    const segment = prefix.segments[0];
    if (segment === undefined || !DYNAMIC_CUSTOM_PROPERTY_TAIL_RE.test(prefix.prefix)) {
      return [];
    }
    const node = segment.node;
    const position = node.getSourceFile().getLineAndColumnAtPos(segment.sourceStart);
    return [
      {
        file: repoRel(root, node.getSourceFile().getFilePath()),
        ...position,
        name: "dynamic-custom-property",
        fallback: false,
        node,
        offset: segment.sourceStart - node.getStart(),
      },
    ];
  });
  return {
    sourceFiles: sources.length + css.files,
    cssDefinitions: css.definitions,
    runtimeDefinitions: strings.definitions,
    runtimeDefinitionSites: uniqueSites(strings.definitionSites),
    definitions: new Set([...css.definitions, ...strings.definitions]),
    references: uniqueSites(references),
    unsupported: uniqueSites(unsupportedPrefixes),
    classRoots: walk.roots,
  };
}

function walkFiles(root: string, include: (path: string) => boolean, skip: ReadonlySet<string> = new Set()): string[] {
  if (!existsSync(root)) {
    return [];
  }
  const out: string[] = [];
  const visit = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!skip.has(entry.name)) {
          visit(join(dir, entry.name));
        }
      } else {
        const path = join(dir, entry.name);
        if (include(path)) {
          out.push(path);
        }
      }
    }
  };
  visit(root);
  return out.sort((a, b) => a.localeCompare(b));
}

function jsonVersion(path: string): string | undefined {
  if (!existsSync(path)) {
    return;
  }
  const parsed = JSON.parse(readFileSync(path, "utf8")) as { readonly version?: string };
  return parsed.version;
}

export function readVendorContract(root: string): VendorContract {
  const mirrorRoot = join(root, "docs/vendor/base-ui");
  const mirrorFiles = walkFiles(mirrorRoot, (path) => path.endsWith(".md"));
  const packageRoot = join(root, "packages/ui/node_modules/@base-ui/react");
  const declarations = walkFiles(packageRoot, (path) => /CssVars\.d\.ts$/u.test(path), new Set(["docs"]));
  const version = jsonVersion(join(packageRoot, "package.json"));
  const index = existsSync(join(mirrorRoot, "INDEX.md")) ? readFileSync(join(mirrorRoot, "INDEX.md"), "utf8") : "";
  return readVendorCssContract({
    mirrorDocuments: mirrorFiles.map((path) => ({ path: repoRel(root, path), text: readFileSync(path, "utf8") })),
    mirrorIndexText: index,
    declarationFiles: declarations.map((path) => ({ path, text: readFileSync(path, "utf8") })),
    ...(version === undefined ? {} : { packageVersion: version }),
  });
}
