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
// different semantics with their own resolvers (tooling/src/verify/gates/GATE-AUTHORING.md §4.6 blindness discipline).
import type { Node, Project, SourceFile, VariableDeclaration } from "ts-morph";
import { Node as TsNode } from "ts-morph";
import { readStringValue, unwrapExpression } from "./ast-read.ts";

/** How many characters of an unsupported expression the diagnostic quotes. */
const DIAGNOSTIC_PREVIEW_CHARS = 120;

/** One resolved member, with the provenance a diagnostic needs: an imported member's node lives in the
 *  declaration that CONTRIBUTED it, not in the tuple that spread it in. Reached STRUCTURALLY through
 *  `TupleVocabulary.entries` — not exported by name, because no consumer has ever needed to spell it and an
 *  unused export beside a one-home claim is the dead-export archetype (tooling/src/verify/gates/GATE-AUTHORING.md §9). */
interface TupleMember {
  readonly value: string;
  /** The element expression itself — its own file and line. */
  readonly node: Node;
  /** `<repo-relative file>#<CONST>` of the declaration this member was written in. */
  readonly source: string;
}

/** A resolved vocabulary tuple: its members, and every declaration that contributed one. */
export interface TupleVocabulary {
  /** The member strings, in first-seen order across every contributing declaration. */
  readonly members: ReadonlySet<string>;
  /** The same members WITH declaring-node provenance, in resolution order. A consumer that reports at a
   *  member's site reads this; one that only asks "is X a member" reads `members`. */
  readonly entries: readonly TupleMember[];
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
  readonly entries: TupleMember[];
  readonly sources: string[];
}

/** Resolve ONE spread element into the accumulator. Every shape the source law does not sanction — a
 *  spread of a call, an identifier nothing binds, a cycle, a contribution of zero members — refuses here. */
function collectSpread(element: Node, owner: { readonly decl: VariableDeclaration; readonly key: string }, out: Collector, nested: ReadonlySet<string>): void {
  const key = owner.key;
  if (!TsNode.isSpreadElement(element)) {
    throw new Error(`tuple-read: unsupported element in "${out.tupleConst}" at ${key}: ${element.getText().slice(0, DIAGNOSTIC_PREVIEW_CHARS)}`);
  }
  const spread = unwrapExpression(element.getExpression());
  if (!TsNode.isIdentifier(spread)) {
    throw new Error(`tuple-read: unsupported spread in "${out.tupleConst}" at ${key}: ${spread.getText().slice(0, DIAGNOSTIC_PREVIEW_CHARS)}`);
  }
  const source = spreadSource(owner.decl.getSourceFile(), spread.getText());
  if (source === undefined) {
    throw new Error(`tuple-read: "${out.tupleConst}" at ${key} spreads "${spread.getText()}", which no local declaration or named import binds`);
  }
  const before = out.members.size;
  collect(source, out, nested);
  if (out.members.size === before) {
    throw new Error(`tuple-read: "${out.tupleConst}" at ${key} spreads "${spread.getText()}", which resolved to zero members`);
  }
}

function collect(decl: VariableDeclaration, out: Collector, seen: ReadonlySet<string>): void {
  const key = `${rel(decl.getSourceFile())}#${decl.getName()}`;
  if (seen.has(key)) {
    throw new Error(`tuple-read: composition cycle resolving "${out.tupleConst}" at ${key}`);
  }
  const arr = tupleArray(decl);
  if (arr === undefined || !TsNode.isArrayLiteralExpression(arr)) {
    throw new Error(`tuple-read: "${out.tupleConst}" source ${key} is not an array-literal tuple — the vocabulary cannot be established`);
  }
  out.sources.push(key);
  const nested: ReadonlySet<string> = new Set([...seen, key]);
  for (const element of arr.getElements()) {
    const value = readStringValue(element);
    if (value === undefined) {
      collectSpread(element, { decl, key }, out, nested);
      continue;
    }
    if (!out.members.has(value)) {
      out.entries.push({ value, node: element, source: key });
    }
    out.members.add(value);
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
  const out: Collector = { tupleConst, members: new Set<string>(), entries: [], sources: [] };
  for (const sf of project.getSourceFiles()) {
    const decl = sf.getVariableDeclaration(tupleConst);
    if (decl !== undefined && decl.getInitializer() !== undefined) {
      collect(decl, out, new Set());
    }
  }
  return { members: out.members, entries: out.entries, sources: out.sources };
}

/** The same resolution rooted at ONE declaration — for a gate that already located the tuple's home by its
 *  own path law and must not widen to a project-wide symbol search. Same sanctioned shapes, same refusals. */
export function readTupleDeclaration(decl: VariableDeclaration): TupleVocabulary {
  const out: Collector = { tupleConst: decl.getName(), members: new Set<string>(), entries: [], sources: [] };
  collect(decl, out, new Set());
  return { members: out.members, entries: out.entries, sources: out.sources };
}
