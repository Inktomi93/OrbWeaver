// Shared value/provenance shapes and syntax-only module resolution for the static class-expression
// walker. Kept separate from evaluation so every tooling source stays below Core-Tooling-Law's hard cap.
import { posix } from "node:path";
import type { SourceFile } from "ts-morph";
import { Node } from "ts-morph";
import type { StaticClassSegment, StaticClassSourceIndex, StaticValue } from "../contract/static-class-expression.ts";

export type {
  Composer,
  RuntimeClassPrefix,
  StaticClassCandidate,
  StaticClassEvaluation,
  StaticClassSourceIndex,
  StaticClassWalk,
  StaticObjectPropertyEvaluation,
  StaticValue,
} from "../contract/static-class-expression.ts";

const WRAPPER_KINDS = new Set(["ParenthesizedExpression", "AsExpression", "SatisfiesExpression", "NonNullExpression", "TypeAssertionExpression"]);

export function unwrap(node: Node): Node {
  let current = node;
  while (WRAPPER_KINDS.has(current.getKindName()) && "getExpression" in current) {
    current = (current as Node & { getExpression: () => Node }).getExpression();
  }
  return current;
}

export function uniqueNodes(nodes: readonly Node[]): Node[] {
  return [...new Map(nodes.map((node) => [`${node.getSourceFile().getFilePath()}:${node.getStart()}:${node.getKind()}`, node])).values()];
}

export function staticClassSourceIndex(files: readonly SourceFile[]): StaticClassSourceIndex {
  return new Map(files.map((file) => [file.getFilePath(), file]));
}

export function importedSource(index: StaticClassSourceIndex, from: SourceFile, moduleName: string): SourceFile | undefined {
  if (!moduleName.startsWith(".")) {
    return;
  }
  const fromDir = posix.dirname(from.getFilePath());
  const raw = posix.normalize(posix.join(fromDir, moduleName));
  const candidates = new Set([raw, `${raw}.ts`, `${raw}.tsx`, `${raw}/index.ts`, `${raw}/index.tsx`]);
  if (/\.(?:[cm]?ts|tsx)$/u.test(raw)) {
    candidates.add(raw.replace(/\.(?:[cm]?ts|tsx)$/u, ".ts"));
    candidates.add(raw.replace(/\.(?:[cm]?ts|tsx)$/u, ".tsx"));
  }
  return [...candidates].map((candidate) => index.get(candidate)).find((source): source is SourceFile => source !== undefined);
}

function localImportDeclarations(source: SourceFile, name: string): Node[] {
  const found: Node[] = [];
  for (const declaration of source.getImportDeclarations()) {
    if (declaration.getDefaultImport()?.getText() === name) {
      const clause = declaration.getImportClause();
      if (clause !== undefined) {
        found.push(clause);
      }
    }
    const namespace = declaration.getNamespaceImport();
    if (namespace?.getText() === name) {
      found.push(namespace);
    }
    found.push(...declaration.getNamedImports().filter((specifier) => (specifier.getAliasNode()?.getText() ?? specifier.getNameNode().getText()) === name));
  }
  return found;
}

export function localDeclarations(source: SourceFile, name: string): Node[] {
  const found: Node[] = [...localImportDeclarations(source, name)];
  const variable = source.getVariableDeclaration(name);
  if (variable !== undefined) {
    found.push(variable);
  }
  const fn = source.getFunction(name);
  if (fn !== undefined) {
    found.push(fn);
  }
  return uniqueNodes(found);
}

function directExports(source: SourceFile, name: string): Node[] {
  const found: Node[] = [];
  if (name === "default") {
    found.push(...source.getExportAssignments());
    found.push(...source.getFunctions().filter((fn) => fn.isDefaultExport()));
  }
  for (const declaration of localDeclarations(source, name)) {
    const exportedVariable = Node.isVariableDeclaration(declaration) && declaration.getVariableStatement()?.isExported() === true;
    const exportedFunction = Node.isFunctionDeclaration(declaration) && declaration.isExported();
    if (exportedVariable || exportedFunction) {
      found.push(declaration);
    }
  }
  return found;
}

function reExports(index: StaticClassSourceIndex, source: SourceFile, name: string, seen: Set<string>): Node[] {
  const found: Node[] = [];
  for (const declaration of source.getExportDeclarations()) {
    const moduleName = declaration.getModuleSpecifierValue();
    const named = declaration.getNamedExports();
    if (named.length === 0 && moduleName !== undefined) {
      const target = importedSource(index, source, moduleName);
      if (target !== undefined) {
        found.push(...exportedDeclarations(index, target, name, seen));
      }
      continue;
    }
    found.push(...named.filter((specifier) => (specifier.getAliasNode()?.getText() ?? specifier.getNameNode().getText()) === name));
  }
  return found;
}

/** Syntax-owned export resolution avoids asking TypeScript to serialize large recursive public types. */
export function exportedDeclarations(index: StaticClassSourceIndex, source: SourceFile, name: string, seen: Set<string> = new Set()): Node[] {
  const key = `${source.getFilePath()}:${name}`;
  if (seen.has(key)) {
    return [];
  }
  seen.add(key);
  return uniqueNodes([...directExports(source, name), ...reExports(index, source, name, seen)]);
}

export function literalValue(node: Node): StaticValue | undefined {
  if (!(Node.isStringLiteral(node) || Node.isNoSubstitutionTemplateLiteral(node))) {
    return;
  }
  const value = node.getLiteralText();
  return {
    value,
    segments: value.length === 0 ? [] : [{ node, valueStart: 0, valueEnd: value.length, sourceStart: node.getStart() + 1 }],
  };
}

function shiftSegments(segments: readonly StaticClassSegment[], by: number): StaticClassSegment[] {
  return segments.map((segment) => ({ ...segment, valueStart: segment.valueStart + by, valueEnd: segment.valueEnd + by }));
}

export function combine(left: StaticValue, right: StaticValue): StaticValue {
  return { value: `${left.value}${right.value}`, segments: [...left.segments, ...shiftSegments(right.segments, left.value.length)] };
}

/** Preserve producer coordinates while applying a built-in string slice to a proven static value. */
export function sliceStaticValue(value: StaticValue, start: number, end: number): StaticValue {
  const segments = value.segments.flatMap((segment): StaticClassSegment[] => {
    const overlapStart = Math.max(segment.valueStart, start);
    const overlapEnd = Math.min(segment.valueEnd, end);
    if (overlapStart >= overlapEnd) {
      return [];
    }
    return [
      {
        node: segment.node,
        valueStart: overlapStart - start,
        valueEnd: overlapEnd - start,
        sourceStart: segment.sourceStart + overlapStart - segment.valueStart,
      },
    ];
  });
  return { value: value.value.slice(start, end), segments };
}

export function dedupeValues(values: readonly StaticValue[]): StaticValue[] {
  const seen = new Set<string>();
  const out: StaticValue[] = [];
  for (const value of values) {
    const anchor = value.segments[0];
    const key = `${value.value}|${anchor?.node.getSourceFile().getFilePath() ?? ""}:${anchor?.sourceStart ?? -1}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(value);
    }
  }
  return out;
}
