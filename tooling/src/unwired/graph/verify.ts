// A member bucket checked against the checker's own find-references: each reference to a flagged member is judged by
// roles.ts occurrenceRoles, and a product read the graph missed refutes the finding.
//
// - The check runs one way. Find-references sees no structural hop (a value spread into a slot), so a confirmed
//   finding is still the graph's claim, and a refuted one is a graph defect to fix.
// - Find-references joins a union's arms (every `summary` of a `{…} | {…}`): a read counts against a member only where
//   the checker resolves that occurrence to the member's own declaration, so a narrowed sibling arm's read is not its.
import type { Node, SourceFile, SyntaxKind } from "@typescript/native/ast";
import type { NativeWorld } from "../native.ts";
import { isProduction } from "../worlds.ts";
import type { Finding } from "./analyse.ts";
import type { DeclKey } from "./resolve.ts";
import { declKeyParts, Resolver } from "./resolve.ts";
import { occurrenceRoles, READS } from "./roles.ts";
import { declarationNameOf } from "./sites.ts";

export const VERDICTS = ["confirmed", "refuted", "unresolved"] as const;
export type Verdict = (typeof VERDICTS)[number];

/** One finding's verdict, its reference count, and the first product reads that refute it. */
export interface Verified {
  readonly label: string;
  readonly verdict: Verdict;
  readonly refs: number;
  readonly reads: readonly string[];
}

// How many refuting reads a verdict lists.
const SHOWN_READS = 3;

/** An even spread of `size` entries over a list, so a sample is not one file's members. */
export function evenSample<T>(entries: readonly T[], size: number | null): readonly T[] {
  const count = size === null ? entries.length : Math.min(size, entries.length);
  return Array.from({ length: count }, (_, at) => entries[Math.floor((at * entries.length) / count)]).filter((entry) => entry !== undefined);
}

/** Verify each finding of a member bucket against find-references in `world`. */
export function verifyFindings(world: NativeWorld, findings: readonly Finding[]): readonly Verified[] {
  const resolver = new Resolver(world);
  const names = findings.map(({ key }) => (key === null ? undefined : nameOf(world, key as DeclKey)));
  const groups = world.batch(names.map((name) => (name === undefined ? noReferences() : world.referencedSymbolsOf(name))));
  const handles = groups.map((entries) => entries.flatMap(({ references }) => references));
  const nodes = world.batch(handles.flat().map((handle) => handle.resolve.gen()));
  const occurrences = handles.map(() => [] as Node[]);
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
    list.filter((node) => isProduction(world.fileOfSource(node.getSourceFile())) && occurrenceRoles(node).some((role) => READS.has(role))),
  );
  const owners = resolver.declarations(world.symbolsAt(reads.flat()));
  let y = 0;
  return findings.map((finding, x) => {
    const own = reads[x] ?? [];
    const mine = own.filter((_, z) => (owners[y + z] ?? []).includes(finding.key as DeclKey));
    y += own.length;
    return {
      label: finding.label,
      verdict: verdictOf(names[x] !== undefined, mine.length > 0),
      refs: occurrences[x]?.length ?? 0,
      reads: mine.slice(0, SHOWN_READS).map((node) => `${world.fileOfSource(node.getSourceFile())}:${String(lineOf(node))}`),
    };
  });
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

// The name node of the declaration a key names, found by its span in its file.
function nameOf(world: NativeWorld, key: DeclKey): Node | undefined {
  const { file, pos, end, kind } = declKeyParts(key);
  const source = world.source(file);
  const node = source === undefined ? undefined : nodeAt(source, { pos, end, kind });
  return node === undefined ? undefined : declarationNameOf(node);
}

function nodeAt(source: SourceFile, { pos, end, kind }: { readonly pos: number; readonly end: number; readonly kind: SyntaxKind }): Node | undefined {
  let found: Node | undefined;
  const visit = (node: Node): void => {
    if (found !== undefined || node.pos > pos || node.end < end) {
      return;
    }
    if (node.pos === pos && node.end === end && node.kind === kind) {
      found = node;
      return;
    }
    node.forEachChild(visit);
  };
  source.forEachChild(visit);
  return found;
}

function insideOwnName(node: Node, own: Node | undefined): boolean {
  return own !== undefined && node.pos >= own.pos && node.end <= own.end && node.getSourceFile().fileName === own.getSourceFile().fileName;
}

const lineOf = (node: Node): number => node.getSourceFile().getLineAndCharacterOfPosition(node.getStart(node.getSourceFile())).line + 1;
