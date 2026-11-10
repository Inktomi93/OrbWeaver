// Two optional keys supplied at separate constructions may represent alternatives. Unwired's joined writer
// credits retain hand-offs, while a spread, later mutation or external input leaves coexistence undecided.
import type { Identifier, Node, StringLiteral } from "@typescript/native/ast";
import {
  isFunctionDeclaration,
  isIdentifier,
  isInterfaceDeclaration,
  isMethodDeclaration,
  isMethodSignatureDeclaration,
  isParameterDeclaration,
  isPropertyDeclaration,
  isPropertySignatureDeclaration,
  isStringLiteral,
  isTypeAliasDeclaration,
  isVariableDeclaration,
  SyntaxKind,
} from "@typescript/native/ast";
import ts from "typescript";
import type { Site } from "./classify.ts";
import { nameAt, Sources, siteKey } from "./classify.ts";
import { fieldDeclarations } from "./fields.ts";
import type { NativeWorld } from "./native.ts";
import { declarationKeys } from "./native.ts";
import { constructionWrites, joinConstructionWrites } from "./occurrences.ts";
import type { ContextRecords } from "./optional-contexts.ts";
import type { ConstructionSite, OptionalInventory } from "./optional-inventory.ts";
import { OptionalEvidence } from "./optional-inventory.ts";
import { isProduction } from "./optional-population.ts";
import type { ReaderEvidence } from "./optional-readers.ts";
import { optionalUsage } from "./optional-readers.ts";

type OptionalField = Pick<ReturnType<typeof fieldDeclarations>[number], "keys" | "site" | "line" | "home" | "member">;

function enclosingName(node: Node): string {
  for (let at = node; at.kind !== SyntaxKind.SourceFile; at = at.parent) {
    if (
      isTypeAliasDeclaration(at) ||
      isFunctionDeclaration(at) ||
      isMethodDeclaration(at) ||
      isParameterDeclaration(at) ||
      isVariableDeclaration(at) ||
      isInterfaceDeclaration(at) ||
      isPropertySignatureDeclaration(at)
    ) {
      return at.name?.getText() ?? "<anonymous>";
    }
  }
  return "<anonymous>";
}

// Unlike the unwired member report, mutually exclusive fields matter in anonymous parameter and return
// types, union arms and intersections too. The same declaration key joins their writers across worlds.
function inlineFields(world: NativeWorld, home: ReadonlySet<string>, known: ReadonlySet<string>): OptionalField[] {
  const names: (Identifier | StringLiteral)[] = [];
  const visit = (node: Node): void => {
    if (
      (isPropertySignatureDeclaration(node) || isMethodSignatureDeclaration(node) || isPropertyDeclaration(node)) &&
      node.postfixToken?.kind === SyntaxKind.QuestionToken &&
      (isIdentifier(node.name) || isStringLiteral(node.name)) &&
      !known.has(siteKey(world.siteOf(node.name)))
    ) {
      names.push(node.name);
    }
    node.forEachChild(visit);
  };
  for (const source of world.files) {
    const file = world.siteOf(source).file;
    if (isProduction(file) && home.has(file)) {
      source.forEachChild(visit);
    }
  }
  const symbols = world.symbolsAt(names);
  return names.map((name, index) => {
    const site = world.siteOf(name);
    const symbol = symbols[index];
    return {
      keys: symbol === undefined ? [] : declarationKeys(symbol),
      site,
      line: name.getSourceFile().getLineAndCharacterOfPosition(site.position).line + 1,
      home: enclosingName(name.parent.parent),
      member: name.text,
    };
  });
}

interface ConstructionFacts {
  readonly fields: readonly OptionalField[];
  readonly properties: ReturnType<typeof constructionWrites>;
  readonly readers: readonly ReaderEvidence[];
  readonly contexts: ContextRecords;
}

export function optionalConstructionFacts(world: NativeWorld, home: ReadonlySet<string>, registry: Map<string, number>): ConstructionFacts {
  const fields: OptionalField[] = fieldDeclarations(world, true).filter((field) => field.optional && home.has(field.site.file));
  fields.push(...inlineFields(world, home, new Set(fields.map(({ site }) => siteKey(site)))));
  const files = world.files.filter((file) => home.has(world.siteOf(file).file));
  return { fields, properties: constructionWrites(world, home), ...optionalUsage(world, files, registry) };
}

interface Branch {
  readonly condition: number;
  readonly positive: boolean;
}

interface Writes {
  readonly sites: Map<string, ConstructionSite>;
  readonly unknown: Set<string>;
  readonly tests: Map<string, ConstructionSite>;
}

type Container = ts.ObjectLiteralExpression | ts.JsxAttributes;

const isContainer = (node: ts.Node | undefined): node is Container => node !== undefined && (ts.isObjectLiteralExpression(node) || ts.isJsxAttributes(node));

function closedSpread(node: ts.Expression): boolean {
  if (ts.isObjectLiteralExpression(node)) {
    return !uncertainKeys(node);
  }
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node)) {
    return closedSpread(node.expression);
  }
  if (ts.isConditionalExpression(node)) {
    return closedSpread(node.whenTrue) && closedSpread(node.whenFalse);
  }
  return ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken && closedSpread(node.right);
}

function uncertainKeys(node: Container): boolean {
  return node.properties.some((prop) =>
    ts.isSpreadAssignment(prop) || ts.isJsxSpreadAttribute(prop) ? !closedSpread(prop.expression) : ts.isComputedPropertyName(prop.name),
  );
}

function spreadBranch(node: ts.Node, parent: ts.Node): Branch | undefined {
  if (ts.isConditionalExpression(parent) && (parent.whenTrue === node || parent.whenFalse === node)) {
    return { condition: parent.condition.getStart(), positive: parent.whenTrue === node };
  }
  return ts.isBinaryExpression(parent) && node === parent.right && parent.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
    ? { condition: parent.left.getStart(), positive: true }
    : undefined;
}

// The object receiving a spread is the construction. Spreads in opposite arms of one conditional
// cannot coexist, while two independently guarded spreads can both contribute to the same object.
function construction(sources: Sources, site: Site): { readonly site: ConstructionSite; readonly uncertain: boolean } | undefined {
  const key = nameAt(sources.get(site.file), site.position);
  const start = key?.parent.parent;
  if (!isContainer(start)) {
    return;
  }
  let owner = start;
  const branches: Branch[] = [];
  for (let node: ts.Node = start; !ts.isSourceFile(node); node = node.parent) {
    const parent = node.parent;
    const branch = spreadBranch(node, parent);
    if (branch !== undefined) {
      branches.push(branch);
    } else if (ts.isSpreadAssignment(parent) || ts.isJsxSpreadAttribute(parent)) {
      if (isContainer(parent.parent)) {
        owner = parent.parent;
        node = parent;
      }
    } else if (!(ts.isParenthesizedExpression(parent) || ts.isAsExpression(parent) || ts.isSatisfiesExpression(parent))) {
      break;
    }
  }
  return { site: { file: site.file, position: owner.getStart(), branches }, uncertain: uncertainKeys(owner) };
}

function writesOf(sources: Sources, sites: readonly Site[]): Writes {
  const built = new Map<string, ConstructionSite>();
  const tests = new Map<string, ConstructionSite>();
  const unknown = new Set<string>();
  for (const site of sites) {
    const evidence = construction(sources, site);
    if (isProduction(site.file) && (evidence === undefined || evidence.uncertain)) {
      unknown.add(siteKey(site));
    }
    if (evidence !== undefined && (isProduction(site.file) || site.file.startsWith("tests/"))) {
      const population = isProduction(site.file) ? built : tests;
      population.set(siteKey(site), evidence.site);
    }
  }
  return { sites: built, tests, unknown };
}

function containsBranches(left: readonly Branch[], right: readonly Branch[]): boolean {
  return left.every((one) => right.some((two) => one.condition === two.condition && one.positive === two.positive));
}

// When one write's guards imply the other's, supplying the narrower field supplies both. Unrelated
// tests on nearby spreads might be correlated by a producer outside the expression.
function coSets(left: Iterable<ConstructionSite>, right: Iterable<ConstructionSite>): { proven: ConstructionSite[]; possible: ConstructionSite[] } {
  const byConstruction = Map.groupBy(right, siteKey);
  const proven: ConstructionSite[] = [];
  const possible: ConstructionSite[] = [];
  for (const one of left) {
    for (const two of byConstruction.get(siteKey(one)) ?? []) {
      if (containsBranches(one.branches, two.branches) || containsBranches(two.branches, one.branches)) {
        proven.push(one);
      } else if (!one.branches.some((a) => two.branches.some((b) => a.condition === b.condition && a.positive !== b.positive))) {
        possible.push(one);
      }
    }
  }
  return { proven, possible };
}

interface ObservedField {
  readonly field: OptionalField;
  readonly writes: Writes;
  readonly parent?: string | null;
}

interface GroupSource {
  readonly id: string;
  readonly context?: string;
  readonly unknown?: readonly (Site | string)[];
}

function alternatives(fields: readonly ObservedField[], readers: ReadonlyMap<string, ReaderEvidence[]>, group: GroupSource, output: OptionalEvidence): void {
  const before = output.pairs.length;
  const index = output.groups.length;
  for (const [at, { field, writes, parent }] of fields.entries()) {
    for (const sibling of fields.slice(at + 1)) {
      if (parent !== undefined && parent !== null && parent === sibling.parent) {
        continue;
      }
      const overlap = coSets(writes.sites.values(), sibling.writes.sites.values());
      if (overlap.proven.length > 0) {
        continue;
      }
      const evidence = field.keys
        .flatMap((key) => readers.get(key) ?? [])
        .filter((reader) => group.context === undefined || reader.context === group.context)
        .filter((reader) => reader.left.some((key) => sibling.field.keys.includes(key)) || reader.right.some((key) => sibling.field.keys.includes(key)));
      output.pairs.push({
        group: index,
        left: field.member,
        right: sibling.field.member,
        testCoSets: output.record(coSets(writes.tests.values(), sibling.writes.tests.values()).proven),
        possibleCoSets: output.record(overlap.possible),
        fallbackReaders: output.record(evidence.filter((reader) => reader.kind === "fallback").map((reader) => reader.site)),
        jointDomReads: output.record(evidence.filter((reader) => reader.kind === "dom").map((reader) => reader.site)),
      });
    }
  }
  const first = fields[0]?.field;
  if (output.pairs.length > before && first !== undefined) {
    output.groups.push({
      id: group.id,
      file: first.site.file,
      line: first.line,
      owner: first.home,
      unknownWrites: output.record(group.unknown ?? []),
      fields: fields.map(({ field, writes }) => ({
        name: field.member,
        line: field.line,
        writes: output.record(writes.sites.values()),
        testWrites: output.record(writes.tests.values()),
        unknownWrites: output.record(writes.unknown),
      })),
    });
  }
}

function contextualIds(parts: readonly ContextRecords[]): {
  readonly byId: ReadonlyMap<string, ContextRecords["identities"][number]>;
  readonly joined: (id: string) => string;
} {
  const identities = parts.flatMap((part) => part.identities);
  const byId = new Map(identities.map((identity) => [identity.id, identity]));
  const clashes = new Set<number>();
  for (const part of parts) {
    const seen = new Set<number>();
    for (const { stable } of part.identities) {
      if (stable === undefined) {
        continue;
      }
      if (seen.has(stable)) {
        clashes.add(stable);
      }
      seen.add(stable);
    }
  }
  const joined = (id: string): string => {
    const stable = byId.get(id)?.stable;
    return stable === undefined || clashes.has(stable) ? id : `shared:${stable}`;
  };
  return { byId, joined };
}

function contextualAlternatives(
  sources: Sources,
  parts: readonly ContextRecords[],
  readers: ReadonlyMap<string, ReaderEvidence[]>,
  output: OptionalEvidence,
): void {
  const { byId, joined } = contextualIds(parts);
  const unknown = Map.groupBy(
    parts.flatMap((part) => part.unknown),
    (entry) => joined(entry.id),
  );
  const owners = Map.groupBy(
    parts.flatMap((part) => part.writes),
    (entry) => joined(entry.id),
  );
  const normalized = new Map(
    [...readers].map(([key, refs]) => [key, refs.map((reader) => ({ ...reader, context: reader.context === undefined ? undefined : joined(reader.context) }))]),
  );
  for (const [id, observations] of owners) {
    const allowed = new Set(byId.get(observations[0]?.id ?? "")?.names);
    if (!observations.every((observation) => allowed.has(observation.field))) {
      throw new Error(`Inconsistent contextual field group: ${id}`);
    }
    const fields = [...Map.groupBy(observations, (entry) => entry.field)].flatMap(([name, entries]): ObservedField[] => {
      const first = entries[0];
      if (first === undefined) {
        return [];
      }
      const writes = writesOf(
        sources,
        entries.map((entry) => entry.writer),
      );
      if (writes.sites.size === 0) {
        return [];
      }
      return [
        {
          field: {
            keys: [...new Set(entries.flatMap((entry) => entry.keys))],
            home: first.owner,
            member: name,
            site: first.site,
            line: sources.line(first.site),
          },
          writes,
          parent: first.parent,
        },
      ];
    });
    const representative = observations
      .filter((entry) => isProduction(entry.writer.file))
      .sort((a, b) => a.writer.file.localeCompare(b.writer.file) || a.writer.position - b.writer.position)[0];
    if (representative !== undefined) {
      const uncertain: (Site | string)[] = (unknown.get(id) ?? []).map((entry) => entry.site);
      if (representative.localIdentity || (byId.get(representative.id)?.stable !== undefined && !id.startsWith("shared:"))) {
        uncertain.push("Context identity is local to its compiler world");
      }
      alternatives(fields, normalized, { id: `context:${siteKey(representative.writer)}`, context: id, unknown: uncertain }, output);
    }
  }
}

export function joinOptionalConstructions(root: string, facts: readonly ConstructionFacts[]): OptionalInventory {
  const sources = new Sources(root);
  const parts = facts.map((part) => part.properties);
  const direct = joinConstructionWrites(parts);
  const owners = new Map<string, ObservedField[]>();
  for (const field of facts.flatMap((part) => part.fields)) {
    const node = nameAt(sources.get(field.site.file), field.site.position);
    if (node === undefined || (ts.isPropertySignature(node.parent) && node.parent.type?.kind === ts.SyntaxKind.NeverKeyword)) {
      continue;
    }
    const writes = writesOf(
      sources,
      field.keys.flatMap((key) => direct.get(key) ?? []),
    );
    if (writes.sites.size > 0) {
      const owner = siteKey({ file: field.site.file, position: node.parent.parent.getStart() });
      owners.getOrInsert(owner, []).push({ field, writes });
    }
  }
  const readers = new Map<string, ReaderEvidence[]>();
  for (const reader of facts.flatMap((part) => part.readers)) {
    for (const key of [...reader.left, ...reader.right]) {
      readers.getOrInsert(key, []).push(reader);
    }
  }
  const output = new OptionalEvidence();
  for (const [key, fields] of owners) {
    alternatives(fields, readers, { id: `declaration:${key}` }, output);
  }
  contextualAlternatives(
    sources,
    facts.map((part) => part.contexts),
    readers,
    output,
  );
  return output.inventory();
}
