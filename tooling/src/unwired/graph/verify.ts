// A member bucket checked against the checker's own find-references: each reference to a flagged member is judged by
// roles.ts occurrenceRoles, and a product read the graph missed refutes the finding.
//
// - The check runs one way. Find-references sees no structural hop (a value spread into a slot), so a confirmed
//   finding is still the graph's claim, and a refuted one is a graph defect to fix.
// - Find-references joins a union's arms (every `summary` of a `{…} | {…}`): a read counts against a member only where
//   the checker resolves that occurrence to the member's own declaration, so a narrowed sibling arm's read is not its.
import type { Node } from "@typescript/native/ast";
import { isSourceFile, SyntaxKind } from "@typescript/native/ast";
import type { NativeWorld } from "../native.ts";
import type { Finding } from "./analyse.ts";
import { declaredNameOf } from "./declared.ts";
import { Resolver } from "./resolve.ts";
import { occurrenceRoles, READS } from "./roles.ts";
import { isDeclKey } from "./sites.ts";
import { productReader } from "./state.ts";

export const VERDICTS = ["confirmed", "refuted", "unresolved"] as const;
export type Verdict = (typeof VERDICTS)[number];

/** One finding's verdict, its reference count, and the first product reads that refute it. */
export interface Verified {
  readonly label: string;
  readonly verdict: Verdict;
  readonly refs: number;
  readonly reads: readonly string[];
  /** Under `--trace=verify-chain`: each shown read's syntax kinds from the name up to its file. */
  readonly chains?: readonly string[];
}

// How many refuting reads a verdict lists.
const SHOWN_READS = 3;

/** An even spread of `size` entries over a list, so a sample is not one file's members. */
export function evenSample<T>(entries: readonly T[], size: number | null): readonly T[] {
  const count = size === null ? entries.length : Math.min(size, entries.length);
  return Array.from({ length: count }, (_, at) => entries[Math.floor((at * entries.length) / count)]).filter((entry) => entry !== undefined);
}

/** One finding's find-references answer: its declaration's name (undefined when no declaration sits at its key), every
 *  occurrence besides that name, and the product reads among them the checker resolves to the finding's own
 *  declaration. */
export interface FindingReferences {
  readonly finding: Finding;
  readonly name: Node | undefined;
  readonly occurrences: readonly Node[];
  readonly reads: readonly Node[];
}

/** Find-references for each finding, every handle resolved in one batch. */
export function referencesOf(world: NativeWorld, findings: readonly Finding[]): readonly FindingReferences[] {
  const resolver = new Resolver(world);
  const names = findings.map(({ key }) => (key !== null && isDeclKey(key) ? declaredNameOf(world, key) : undefined));
  const groups = world.batch(names.map((name) => (name === undefined ? noReferences() : world.referencedSymbolsOf(name))));
  const handles = groups.map((entries) => entries.flatMap(({ references }) => references));
  const nodes = world.batch(handles.flat().map((handle) => handle.resolve.gen()));
  const occurrences = handles.map((): Node[] => []);
  let at = 0;
  for (const [x, list] of handles.entries()) {
    for (const node of nodes.slice(at, at + list.length)) {
      if (node !== undefined && !insideOwnName(node, names[x])) {
        occurrences[x]?.push(node);
      }
    }
    at += list.length;
  }
  const reads = occurrences.map((list) =>
    list.filter((node) => productReader(world.fileOfSource(node.getSourceFile())) && occurrenceRoles(node).some((role) => READS.has(role))),
  );
  const owners = resolver.declarations(world.symbolsAt(reads.flat()));
  let y = 0;
  return findings.map((finding, x) => {
    const own = reads[x] ?? [];
    const { key } = finding;
    const mine = key !== null && isDeclKey(key) ? own.filter((_, z) => (owners[y + z] ?? []).includes(key)) : [];
    y += own.length;
    return { finding, name: names[x], occurrences: occurrences[x] ?? [], reads: mine };
  });
}

/** Verify each finding of a member bucket against find-references in `world`. */
export function verifyFindings(world: NativeWorld, findings: readonly Finding[], chains = false): readonly Verified[] {
  return referencesOf(world, findings).map(({ finding, name, occurrences, reads }) => {
    const shown = reads.slice(0, SHOWN_READS);
    return {
      label: finding.label,
      verdict: verdictOf(name !== undefined, reads.length > 0),
      refs: occurrences.length,
      reads: shown.map((node) => `${world.fileOfSource(node.getSourceFile())}:${String(lineOf(node))}`),
      ...(chains ? { chains: shown.map(chainOf) } : {}),
    };
  });
}

// A node's syntax kinds up to its source file, as `Identifier<PropertyAccessExpression<…`.
function chainOf(node: Node): string {
  const kinds = [SyntaxKind[node.kind]];
  for (let at = node; !isSourceFile(at); at = at.parent) {
    kinds.push(SyntaxKind[at.parent.kind]);
  }
  return kinds.join("<");
}

function verdictOf(resolved: boolean, read: boolean): Verdict {
  if (!resolved) {
    return "unresolved";
  }
  return read ? "refuted" : "confirmed";
}

function* noReferences(): ReturnType<NativeWorld["referencedSymbolsOf"]> {
  yield* [];
  return [];
}

function insideOwnName(node: Node, own: Node | undefined): boolean {
  return own !== undefined && node.pos >= own.pos && node.end <= own.end && node.getSourceFile().fileName === own.getSourceFile().fileName;
}

const lineOf = (node: Node): number => node.getSourceFile().getLineAndCharacterOfPosition(node.getStart(node.getSourceFile())).line + 1;
