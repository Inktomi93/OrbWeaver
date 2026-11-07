// Area E: local maps of tone, label or size copied across files, found by their key set.
import ts from "typescript";
import type { Source } from "../eslint/index.ts";
import { lineOf } from "../eslint/index.ts";

interface MapCopy {
  readonly name: string;
  readonly at: string;
  readonly section: string;
  readonly entries: Readonly<Record<string, string>>;
}

export interface DuplicateGroup {
  readonly keys: readonly string[];
  readonly copies: readonly MapCopy[];
  /** Every copy maps the keys to the same values. */
  readonly identical: boolean;
}

const MAP_NAME = /(?:TONE|TONES|LABEL|LABELS|WORD|WORDS|SIZE|SIZES|VARIANT|VARIANTS|COPY|BADGE|BADGES|INK)S?$/u;
const MIN_KEYS = 2;

function valueText(sf: ts.SourceFile, node: ts.Expression): string | null {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return JSON.stringify(node.text);
  }
  return ts.isNumericLiteral(node) || ts.isIdentifier(node) || ts.isPropertyAccessExpression(node) ? node.getText(sf) : null;
}

const sortedEntries = (entries: Readonly<Record<string, string>>): readonly (readonly [string, string])[] =>
  Object.entries(entries).sort(([a], [b]) => a.localeCompare(b));

function entriesOf(sf: ts.SourceFile, init: ts.ObjectLiteralExpression): Record<string, string> {
  const entries: Record<string, string> = {};
  for (const property of init.properties) {
    const value = ts.isPropertyAssignment(property) ? valueText(sf, property.initializer) : null;
    if (value !== null) {
      entries[property.name?.getText(sf).replace(/^["']|["']$/gu, "") ?? ""] = value;
    }
  }
  return entries;
}

function mapDeclarations(sf: ts.SourceFile): readonly (readonly [ts.VariableDeclaration, string, ts.ObjectLiteralExpression])[] {
  return sf.statements.filter(ts.isVariableStatement).flatMap((statement) =>
    statement.declarationList.declarations.flatMap((declaration) => {
      const init = declaration.initializer;
      return ts.isIdentifier(declaration.name) && MAP_NAME.test(declaration.name.text) && init !== undefined && ts.isObjectLiteralExpression(init)
        ? [[declaration, declaration.name.text, init] as const]
        : [];
    }),
  );
}

function mapsIn(source: Source, sf: ts.SourceFile): readonly MapCopy[] {
  return mapDeclarations(sf).flatMap(([declaration, name, init]) => {
    const entries = entriesOf(sf, init);
    return Object.keys(entries).length >= MIN_KEYS ? [{ name, at: `${source.path}:${lineOf(sf, declaration)}`, section: source.section, entries }] : [];
  });
}

/** Groups of two or more files that each declare a map over the same keys. */
export function findDuplicateMaps(sources: readonly Source[]): readonly DuplicateGroup[] {
  const byKeys = new Map<string, MapCopy[]>();
  for (const source of sources) {
    if (source.sf === null || source.layer !== "client") {
      continue;
    }
    for (const copy of mapsIn(source, source.sf)) {
      const key = Object.keys(copy.entries).sort().join("|");
      byKeys.set(key, [...(byKeys.get(key) ?? []), copy]);
    }
  }
  const groups: DuplicateGroup[] = [];
  for (const [key, copies] of byKeys) {
    if (new Set(copies.map((copy) => copy.at.split(":")[0])).size < MIN_KEYS) {
      continue;
    }
    const first = JSON.stringify(sortedEntries(copies[0]?.entries ?? {}));
    groups.push({ keys: key.split("|"), copies, identical: copies.every((copy) => JSON.stringify(sortedEntries(copy.entries)) === first) });
  }
  return groups.sort((a, b) => b.copies.length - a.copies.length);
}
