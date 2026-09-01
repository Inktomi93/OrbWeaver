// The NARROW tuple-spread resolver — ONE home for "which string members does the `<CONST> = [...] as const`
// vocabulary tuple actually have", for the gates whose semantic denominator IS that tuple
// (`no-parallel-section-map`'s four vocabularies, `chrome-registry-completeness`'s zone axis).
//
// WHY IT EXISTS: a gate that reads only the DIRECT array elements silently loses every member that moved
// behind a composition edge, and the file scan stays healthy while the denominator shrinks — the #942 case is
// `CHROME_ZONES = [...RAIL_ZONES, "topbar.trail"]`, where a direct reader sees 1 of 4 zones and a parallel
// `rail.nav`/`rail.brand` map escapes (docs/reviews/stickler/2026-08-31-gate-member-discovery-rehome-audit.md).
// It resolves EXACTLY the shapes the source law sanctions — a string literal element (through any
// `as`/`satisfies`/paren wrapper) and a spread of an identifier bound to another such tuple, local or
// imported — and it FAILS LOUD (throws ⇒ a ToolError attributed to the calling gate, exit 2) on every other
// shape, on an unresolvable binding, on a composition cycle, and on a spread that resolves to zero members.
// It is deliberately NOT a general AST-graph helper: interface members and drizzle column objects are
// different semantics with their own resolvers (GATE-AUTHORING.md §4.6 blindness discipline).
import type { Node, Project, SourceFile, VariableDeclaration } from "ts-morph";
import { Node as TsNode } from "ts-morph";
import { readStringValue, unwrapExpression } from "./ast-read.ts";

/** How many characters of an unsupported expression the diagnostic quotes. */
const DIAGNOSTIC_PREVIEW_CHARS = 120;

/** A resolved vocabulary tuple: its members, and every declaration that contributed one. */
export interface TupleVocabulary {
  /** The member strings, in first-seen order across every contributing declaration. */
  readonly members: ReadonlySet<string>;
  /** `<repo-relative file>#<CONST>` per contributing declaration — the semantic SOURCE manifest, printed by
   *  the calling gate so a shrunken denominator cannot look clean. */
  readonly sources: readonly string[];
}

/** The repo-relative path of a source file, for the source manifest a gate prints. */
const REPO_ROOTS: readonly string[] = ["/packages/", "/tooling/", "/tests/", "/scripts/"];

function rel(sf: SourceFile): string {
  const path = sf.getFilePath();
  for (const root of REPO_ROOTS) {
    const idx = path.indexOf(root);
    if (idx !== -1) {
      return path.slice(idx + 1);
    }
  }
  return path;
}

/** The array literal a `<CONST> = [...] as const` declaration initializes, else undefined. */
function tupleArray(decl: VariableDeclaration): Node | undefined {
  const init = decl.getInitializer();
  if (init === undefined) {
    return;
  }
  const arr = unwrapExpression(init);
  return TsNode.isArrayLiteralExpression(arr) ? arr : undefined;
}

/** The declaration a spread identifier names: the same file's own const, or the one a named import points
 *  at. Undefined when nothing in reach binds it — the caller turns that into a loud refusal. */
function spreadSource(owner: SourceFile, localName: string): VariableDeclaration | undefined {
  const local = owner.getVariableDeclaration(localName);
  if (local !== undefined) {
    return local;
  }
  const imported = owner
    .getImportDeclarations()
    .flatMap((declaration) => declaration.getNamedImports().map((specifier) => ({ declaration, specifier })))
    .find(({ specifier }) => (specifier.getAliasNode()?.getText() ?? specifier.getName()) === localName);
  return imported === undefined ? undefined : imported.declaration.getModuleSpecifierSourceFile()?.getVariableDeclaration(imported.specifier.getName());
}

/** The mutable accumulator threaded through the recursive resolution. */
interface Collector {
  readonly tupleConst: string;
  readonly members: Set<string>;
  readonly sources: string[];
}

function collect(decl: VariableDeclaration, out: Collector, seen: ReadonlySet<string>): void {
  const tupleConst = out.tupleConst;
  const into = out.members;
  const sources = out.sources;
  const key = `${rel(decl.getSourceFile())}#${decl.getName()}`;
  if (seen.has(key)) {
    throw new Error(`tuple-read: composition cycle resolving "${tupleConst}" at ${key}`);
  }
  const arr = tupleArray(decl);
  if (arr === undefined || !TsNode.isArrayLiteralExpression(arr)) {
    throw new Error(`tuple-read: "${tupleConst}" source ${key} is not an array-literal tuple — the vocabulary cannot be established`);
  }
  sources.push(key);
  const nested: ReadonlySet<string> = new Set([...seen, key]);
  for (const element of arr.getElements()) {
    const value = readStringValue(element);
    if (value !== undefined) {
      into.add(value);
      continue;
    }
    if (!TsNode.isSpreadElement(element)) {
      throw new Error(`tuple-read: unsupported element in "${tupleConst}" at ${key}: ${element.getText().slice(0, DIAGNOSTIC_PREVIEW_CHARS)}`);
    }
    const spread = unwrapExpression(element.getExpression());
    if (!TsNode.isIdentifier(spread)) {
      throw new Error(`tuple-read: unsupported spread in "${tupleConst}" at ${key}: ${spread.getText().slice(0, DIAGNOSTIC_PREVIEW_CHARS)}`);
    }
    const source = spreadSource(decl.getSourceFile(), spread.getText());
    if (source === undefined) {
      throw new Error(`tuple-read: "${tupleConst}" at ${key} spreads "${spread.getText()}", which no local declaration or named import binds`);
    }
    const before = into.size;
    collect(source, out, nested);
    if (into.size === before) {
      throw new Error(`tuple-read: "${tupleConst}" at ${key} spreads "${spread.getText()}", which resolved to zero members`);
    }
  }
}

/** Every member of the `<CONST> = [...] as const` vocabulary tuple, project-wide and BY SYMBOL (never a
 *  path — path-keyed-gates-die-on-rename), resolving sanctioned spreads of local/imported sibling tuples.
 *
 *  An absent const yields an EMPTY vocabulary with no sources: a conformance mini-project legitimately
 *  declares only the tuples its example needs, so absence is the caller's blindness question to answer
 *  (§4.6), not this reader's. Every other failure — a non-tuple source, an unsupported element or spread, an
 *  unresolvable binding, a cycle, a spread resolving to nothing — THROWS, because each of them is a
 *  denominator this reader cannot establish and a silently smaller set is the defect it exists to kill. */
export function readTupleVocabulary(project: Project, tupleConst: string): TupleVocabulary {
  const out: Collector = { tupleConst, members: new Set<string>(), sources: [] };
  for (const sf of project.getSourceFiles()) {
    const decl = sf.getVariableDeclaration(tupleConst);
    if (decl !== undefined && decl.getInitializer() !== undefined) {
      collect(decl, out, new Set());
    }
  }
  return { members: out.members, sources: out.sources };
}
