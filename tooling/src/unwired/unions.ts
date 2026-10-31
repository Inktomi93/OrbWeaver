// `pnpm unwired unions`: members of `as const` string tuples that no production literal builds into a slot of their
// type, with the `case` branches, equality checks and `Record` keys that test or key them. A tuple production
// enumerates (maps, spreads, indexes, hands on) can build any member, so it is listed and never judged.
import type { Expression, Identifier, Node, ObjectLiteralExpression, StringLiteral } from "@typescript/native/ast";
import {
  isArrayLiteralExpression,
  isAsExpression,
  isBinaryExpression,
  isCaseBlock,
  isCaseClause,
  isIdentifier,
  isMethodDeclaration,
  isObjectLiteralExpression,
  isParenthesizedExpression,
  isPropertyAssignment,
  isSatisfiesExpression,
  isShorthandPropertyAssignment,
  isStringLiteral,
  isSwitchStatement,
  isTypeReferenceNode,
  isVariableDeclaration,
} from "@typescript/native/ast";
import type { APIRequestGenerator, Type } from "@typescript/native/sync";
import ts from "typescript";
import type { LiteralRole, Site, ValueUse } from "./classify.ts";
import { isProductionFile, literalRoleAt, Sources, siteKey, valueUseAt } from "./classify.ts";
import { ServiceWorld, serviceReferences } from "./language-service.ts";
import { constituents, declarationKeys, NativeWorld } from "./native.ts";
import { valueIndex } from "./occurrences.ts";
import type { ScanOptions } from "./scan.ts";
import { scanWorlds, sitesOf, sortDeliberate } from "./scan.ts";
import { isProduction } from "./worlds.ts";

const UNION_KINDS = ["unbuilt", "parsed"] as const;
/** `unbuilt`: no production literal builds the member into a slot of its union. `parsed`: no production literal
 *  builds it either, but production narrows outside input into its tuple with `z.enum` or a membership test, so a
 *  model's structured output, a file, an env var or a platform name can still produce it. */
type UnionKind = (typeof UNION_KINDS)[number];

interface UnwiredUnionMember {
  readonly key: string;
  readonly kind: UnionKind;
  readonly file: string;
  readonly line: number;
  /** The tuple. */
  readonly home: string;
  /** The member's text. */
  readonly member: string;
  /** `case` clauses that branch on the member, `file:line`. */
  readonly cases: readonly string[];
  /** Equality and membership checks against the member. */
  readonly checks: readonly string[];
  /** Keys of `Record`-typed object literals the member names. */
  readonly keys: readonly string[];
}

export interface UnionsReport {
  readonly scanned: number;
  /** Tuples production enumerates, so no member is judged. */
  readonly enumerated: readonly string[];
  readonly unwired: readonly UnwiredUnionMember[];
  readonly deliberate: readonly (UnwiredUnionMember & { readonly reason: string })[];
  /** Members engine one found unbuilt that engine two finds built, or whose tuple engine two finds enumerated. */
  readonly disagreements: readonly string[];
}

interface Member {
  readonly text: string;
  readonly site: Site;
  readonly line: number;
}

interface Tuple {
  readonly key: string;
  readonly site: Site;
  readonly name: string;
  readonly keys: readonly string[];
  readonly members: readonly Member[];
}

// A literal or object key carrying a member's text, and whether the type it lands in holds that member.
interface LiteralSite {
  readonly site: Site;
  readonly text: string;
  readonly role: LiteralRole | "record-key";
  readonly holds: boolean;
}

const lineOf = (node: Node): number => node.getSourceFile().getLineAndCharacterOfPosition(node.getStart(node.getSourceFile())).line + 1;

function unwrap(node: Expression): Expression {
  let current = node;
  while (isParenthesizedExpression(current) || isSatisfiesExpression(current)) {
    current = current.expression;
  }
  return current;
}

const isConstAssertion = (node: Expression): node is Expression & { readonly expression: Expression } =>
  isAsExpression(node) && isTypeReferenceNode(node.type) && isIdentifier(node.type.typeName) && node.type.typeName.text === "const";

// `const NAME = ["a", "b"] as const`: every element a string literal.
function tupleOf(node: Node): { readonly name: Identifier; readonly elements: readonly StringLiteral[] } | null {
  if (!(isVariableDeclaration(node) && isIdentifier(node.name) && node.initializer !== undefined)) {
    return null;
  }
  const value = unwrap(node.initializer);
  const array = isConstAssertion(value) ? unwrap(value.expression) : null;
  if (array === null || !isArrayLiteralExpression(array) || array.elements.length === 0) {
    return null;
  }
  const elements = array.elements.filter(isStringLiteral);
  return elements.length === array.elements.length ? { name: node.name, elements } : null;
}

function eachProductionNode(world: NativeWorld, visit: (node: Node) => void): void {
  const step = (node: Node): void => {
    visit(node);
    node.forEachChild(step);
  };
  for (const file of world.files.filter((source) => isProduction(world.siteOf(source).file))) {
    file.forEachChild(step);
  }
}

function tuples(world: NativeWorld): readonly Tuple[] {
  const found: { readonly name: Identifier; readonly elements: readonly StringLiteral[] }[] = [];
  eachProductionNode(world, (node) => {
    const tuple = tupleOf(node);
    if (tuple !== null) {
      found.push(tuple);
    }
  });
  const symbols = world.symbolsAt(found.map(({ name }) => name));
  return found.map(({ name, elements }, index) => {
    const site = world.siteOf(name);
    const symbol = symbols[index];
    return {
      key: `${site.file}:${name.text}`,
      site,
      name: name.text,
      keys: symbol === undefined ? [] : declarationKeys(symbol),
      members: elements.map((element) => ({ text: element.text, site: world.siteOf(element), line: lineOf(element) })),
    };
  });
}

function* holdsText(type: Type | undefined, text: string): APIRequestGenerator<boolean> {
  if (type === undefined) {
    return false;
  }
  const members = yield* constituents(type);
  return members.some((member) => member.isStringLiteralType() && member.value === text);
}

function keyedLiteral(node: Node): ObjectLiteralExpression | null {
  const parent = node.parent;
  const keyed = (isPropertyAssignment(parent) || isShorthandPropertyAssignment(parent) || isMethodDeclaration(parent)) && parent.name === node;
  return keyed && isObjectLiteralExpression(parent.parent) ? parent.parent : null;
}

interface Found {
  readonly node: Identifier | StringLiteral;
  readonly site: Site;
}

// The literal's slot: the other operand of an equality, the switch expression of a `case`, else its contextual type.
function* slotHolds(world: NativeWorld, node: StringLiteral): APIRequestGenerator<boolean> {
  const { parent } = node;
  if (isBinaryExpression(parent)) {
    return yield* holdsText(yield* world.checker.getTypeAtLocation.gen(parent.left === node ? parent.right : parent.left), node.text);
  }
  const block = parent.parent;
  if (isCaseClause(parent) && isCaseBlock(block) && isSwitchStatement(block.parent)) {
    return yield* holdsText(yield* world.checker.getTypeAtLocation.gen(block.parent.expression), node.text);
  }
  return yield* holdsText(yield* world.checker.getContextualType.gen(node), node.text);
}

// A `Record<Union, …>` key: the literal's contextual type has the property, and no declaration writes it.
function* isRecordKey(world: NativeWorld, literal: ObjectLiteralExpression, text: string): APIRequestGenerator<boolean> {
  const type = yield* world.checker.getContextualType.gen(literal);
  const property = type === undefined ? undefined : yield* world.checker.getPropertyOfType.gen(type, text);
  return property !== undefined && property.declarations.length === 0;
}

// Literals and object keys that carry a member's text, outside the tuples themselves.
function literalSites(world: NativeWorld, sources: Sources, local: readonly Tuple[]): readonly LiteralSite[] {
  const texts = new Set(local.flatMap((tuple) => tuple.members.map((member) => member.text)));
  const own = new Set(local.flatMap((tuple) => tuple.members.map((member) => siteKey(member.site))));
  const keys: (Found & { readonly literal: ObjectLiteralExpression })[] = [];
  const values: (Found & { readonly node: StringLiteral; readonly role: LiteralRole })[] = [];
  eachProductionNode(world, (node) => {
    if (!((isIdentifier(node) || isStringLiteral(node)) && texts.has(node.text))) {
      return;
    }
    const site = world.siteOf(node);
    if (own.has(siteKey(site))) {
      return;
    }
    const literal = keyedLiteral(node);
    if (literal !== null) {
      keys.push({ node, site, literal });
    } else if (isStringLiteral(node)) {
      values.push({ node, site, role: literalRoleAt(sources.get(site.file), site.position) });
    }
  });
  const holds = world.batch([
    ...values.map(({ node, role }) => (role === "type" || role === "module" ? holdsText(undefined, node.text) : slotHolds(world, node))),
    ...keys.map(({ node, literal }) => isRecordKey(world, literal, node.text)),
  ]);
  return [
    ...values.map(({ node, site, role }, index) => ({ site, text: node.text, role, holds: holds[index] === true })),
    ...keys.map(({ node, site }, index) => ({ site, text: node.text, role: "record-key" as const, holds: holds[values.length + index] === true })),
  ];
}

function enumerates(sources: Sources, sites: Iterable<Site>): boolean {
  for (const site of sites) {
    const use = valueUseAt(sources.get(site.file), site.position);
    if (isProductionFile(site.file) && !(use === "type" || use === "test" || use === "parse")) {
      return true;
    }
  }
  return false;
}

const NARROWING_USES: ReadonlySet<ValueUse> = new Set<ValueUse>(["parse", "test"]);

const parses = (sources: Sources, sites: Iterable<Site>): boolean =>
  [...sites].some((site) => isProductionFile(site.file) && NARROWING_USES.has(valueUseAt(sources.get(site.file), site.position)));

function serviceHolds(world: ServiceWorld, node: ts.StringLiteral): boolean {
  const type = world.checker.getContextualType(node);
  if (type === undefined) {
    return false;
  }
  return (type.isUnion() ? type.types : [type]).some((member) => member.isStringLiteral() && member.value === node.text);
}

// Engine two's view of which texts production builds: a TypeScript 6 literal whose contextual type holds it.
function builtByService(world: ServiceWorld, sources: Sources, texts: ReadonlySet<string>, own: ReadonlySet<string>): ReadonlySet<string> {
  const built = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (ts.isStringLiteral(node) && texts.has(node.text) && !built.has(node.text)) {
      const site = world.siteOf(node);
      const constructs = !own.has(siteKey(site)) && literalRoleAt(sources.get(site.file), site.position) === "construct";
      if (constructs && serviceHolds(world, node)) {
        built.add(node.text);
      }
    }
    ts.forEachChild(node, visit);
  };
  for (const source of world.program.getSourceFiles()) {
    if (!source.isDeclarationFile && isProduction(world.siteOf(source).file)) {
      visit(source);
    }
  }
  return built;
}

interface FirstPass {
  readonly tuples: ReadonlyMap<string, { readonly tuple: Tuple; readonly references: ReadonlyMap<string, Site> }>;
  readonly literals: readonly LiteralSite[];
}

function engineOne(options: ScanOptions, worlds: readonly string[], sources: Sources): FirstPass {
  const found = new Map<string, { readonly tuple: Tuple; readonly references: Map<string, Site> }>();
  const literals = new Map<string, LiteralSite>();
  for (const config of worlds) {
    using world = NativeWorld.open(options.root, config);
    const local = tuples(world);
    for (const literal of literalSites(world, sources, local)) {
      const seen = literals.get(siteKey(literal.site));
      literals.set(siteKey(literal.site), seen?.holds === true ? seen : literal);
    }
    const index = valueIndex(world);
    for (const tuple of local) {
      const entry = found.get(tuple.key) ?? { tuple, references: new Map<string, Site>() };
      for (const site of sitesOf(index, tuple.keys, tuple.site)) {
        entry.references.set(siteKey(site), site);
      }
      found.set(tuple.key, entry);
    }
    options.log(`${config}: ${local.length} tuples`);
  }
  return { tuples: found, literals: [...literals.values()] };
}

/** Run both engines over the package worlds of `root` for string-union members nothing builds. */
export function scanUnions(options: ScanOptions): UnionsReport {
  const { worlds } = scanWorlds(options);
  const sources = new Sources(options.root);
  const first = engineOne(options, worlds, sources);
  const entries = [...first.tuples.values()];
  const enumerated = entries.filter(({ references }) => enumerates(sources, references.values())).map(({ tuple }) => tuple.key);
  const judged = entries.map(({ tuple }) => tuple).filter((tuple) => !enumerated.includes(tuple.key));
  const built = new Set(first.literals.filter((site) => site.role === "construct" && site.holds).map((site) => site.text));
  const candidates = judged.flatMap((tuple) => tuple.members.filter((member) => !built.has(member.text)).map((member) => ({ tuple, member })));
  const own = new Set(entries.flatMap(({ tuple }) => tuple.members.map((member) => siteKey(member.site))));
  const texts = new Set(candidates.map(({ member }) => member.text));
  const builtTwo = new Set(worlds.flatMap((config) => [...builtByService(ServiceWorld.open(options.root, config), sources, texts, own)]));
  const tupleSites = [...new Set(candidates.map(({ tuple }) => tuple))].map((tuple) => tuple.site);
  const referencesTwo = serviceReferences(options.root, worlds, tupleSites, { log: options.log });
  const located = (site: Site): string => `${site.file}:${sources.line(site)}`;
  const findings: UnwiredUnionMember[] = [];
  const disagreements: string[] = [];
  const parsed = new Set(entries.filter(({ references }) => parses(sources, references.values())).map(({ tuple }) => tuple.key));
  for (const { tuple, member } of candidates) {
    const key = `${tuple.key}.${member.text}`;
    const two = referencesTwo.get(siteKey(tuple.site)) ?? [];
    if (builtTwo.has(member.text) || enumerates(sources, two) || parses(sources, two) !== parsed.has(tuple.key)) {
      disagreements.push(key);
      continue;
    }
    const sites = first.literals.filter((site) => site.text === member.text && site.holds);
    const of = (role: LiteralSite["role"]): readonly string[] => sites.filter((site) => site.role === role).map((site) => located(site.site));
    findings.push({
      key,
      kind: parsed.has(tuple.key) ? "parsed" : "unbuilt",
      file: tuple.site.file,
      line: member.line,
      home: tuple.name,
      member: member.text,
      cases: of("case"),
      checks: of("compare"),
      keys: of("record-key"),
    });
  }
  return { scanned: entries.length, enumerated, ...sortDeliberate(findings, options.deliberate), disagreements };
}
