// `pnpm unwired params`: optional parameters and optional props no production call or JSX element supplies, and
// parameters every production call passes the same literal. A callable whose value escapes is never judged.
import type { Expression, Identifier, Node, ParameterDeclaration } from "@typescript/native/ast";
import {
  isArrowFunction,
  isAsExpression,
  isClassDeclaration,
  isClassExpression,
  isFunctionDeclaration,
  isFunctionExpression,
  isIdentifier,
  isMethodDeclaration,
  isParenthesizedExpression,
  isSatisfiesExpression,
  isVariableDeclaration,
} from "@typescript/native/ast";
import type { NodeHandle } from "@typescript/native/sync";
import { SymbolFlags } from "@typescript/native/sync";
import type { CallShape, Site } from "./classify.ts";
import { callAt, isProductionFile, Sources, siteKey, valueUseAt } from "./classify.ts";
import { serviceReferences } from "./language-service.ts";
import { declarationKeys, hasFlag, homeFiles, NativeWorld } from "./native.ts";
import type { PropertyFacts, ReferenceIndex } from "./occurrences.ts";
import { joinFacts, propertyFacts, valueIndex } from "./occurrences.ts";
import type { ScanOptions } from "./scan.ts";
import { scanWorlds, sitesOf, sortDeliberate } from "./scan.ts";
import { typeMembers } from "./type-members.ts";
import { isProduction } from "./worlds.ts";

const PARAM_KINDS = ["unsupplied", "same-literal", "unsupplied-prop"] as const;
/** `unsupplied`: an optional parameter no production call passes. `same-literal`: every production call passes the
 *  same literal. `unsupplied-prop`: an optional property of a parameter's type no production call or JSX element sets. */
type ParamKind = (typeof PARAM_KINDS)[number];

interface UnwiredParam {
  readonly key: string;
  readonly file: string;
  readonly line: number;
  /** The callable: a function, or `Home.member` for a method of a named type or class. */
  readonly home: string;
  /** The parameter, or `parameter.prop` for an unsupplied prop. */
  readonly member: string;
  readonly kind: ParamKind;
  /** The literal every call passes, for `same-literal`. */
  readonly literal: string | null;
  readonly calls: number;
  /** Test calls that supply what production never does. */
  readonly tests: number;
}

export interface ParamsReport {
  readonly scanned: number;
  readonly unwired: readonly UnwiredParam[];
  readonly deliberate: readonly (UnwiredParam & { readonly reason: string })[];
  /** Findings engine one made that engine two's references do not reproduce. */
  readonly disagreements: readonly string[];
  readonly limits: readonly string[];
}

/** What the params scan cannot see, printed with every run. */
const PARAM_LIMITS: readonly string[] = [
  "A callable whose value escapes (handed on, stored in a registry or object, exported through a string-addressed table) is never judged: a call the scan cannot see may supply anything.",
  "A call through a computed name (obj[name](...)) or from outside the tree (a plugin guest, the published SDK, a script) is not seen; a callable only such a caller reaches reports its options unsupplied.",
  "A spread argument or a spread inside an argument object literal supplies every prop; a non-literal argument supplies every prop of its type.",
  "Engine one does not see a component reached through a dynamic import namespace (lazy(() => import(...).then((m) => m.X))); engine two does, so such a row lands as a disagreement, never a finding.",
  "Two callables of one name in different files are told apart by symbol; a same-named wrapper does not count its inner function's calls.",
  "A value supplied only from a JSON or scenario file is not a supply; a reference in a type position is neither a call nor an escape.",
];

// The minimum calls before an identical literal says more than "it has one caller".
const SAME_LITERAL_CALLS = 2;

interface Parameter {
  readonly name: string;
  readonly optional: boolean;
  readonly rest: boolean;
  /** Optional properties of its type that production declares. */
  readonly props: readonly string[];
}

interface Callable {
  readonly key: string;
  readonly site: Site;
  readonly line: number;
  readonly home: string;
  /** Reached as a value (a function) or as a property (a member of a type or class). */
  readonly reach: "value" | "property";
  readonly keys: readonly string[];
  readonly parameters: readonly Parameter[];
}

interface Written {
  readonly name: Identifier;
  readonly home: string;
  readonly reach: Callable["reach"];
  readonly parameters: readonly ParameterDeclaration[];
}

function unwrap(node: Expression | undefined): Expression | undefined {
  let at = node;
  while (at !== undefined && (isParenthesizedExpression(at) || isSatisfiesExpression(at) || isAsExpression(at))) {
    at = at.expression;
  }
  return at;
}

function writtenCallable(node: Node): Written | null {
  if (isFunctionDeclaration(node) && node.name !== undefined) {
    return { name: node.name, home: node.name.text, reach: "value", parameters: node.parameters };
  }
  if (isVariableDeclaration(node) && isIdentifier(node.name)) {
    const value = unwrap(node.initializer);
    if (value !== undefined && (isArrowFunction(value) || isFunctionExpression(value))) {
      return { name: node.name, home: node.name.text, reach: "value", parameters: value.parameters };
    }
  }
  const owner = node.parent;
  if (isMethodDeclaration(node) && isIdentifier(node.name) && (isClassDeclaration(owner) || isClassExpression(owner))) {
    return { name: node.name, home: `${owner.name?.text ?? "<class>"}.${node.name.text}`, reach: "property", parameters: node.parameters };
  }
  return null;
}

function written(world: NativeWorld): readonly Written[] {
  const found: Written[] = [];
  for (const file of world.files.filter((source) => isProduction(world.siteOf(source).file))) {
    const visit = (node: Node): void => {
      const callable = writtenCallable(node);
      if (callable !== null) {
        found.push(callable);
      }
      node.forEachChild(visit);
    };
    file.forEachChild(visit);
  }
  for (const member of typeMembers(world).filter((entry) => entry.callable && entry.parameters.length > 0)) {
    found.push({ name: member.name, home: `${member.home}.${member.member}`, reach: "property", parameters: member.parameters });
  }
  return found;
}

function declaredInProduction(world: NativeWorld, handle: NodeHandle): boolean {
  const file = world.fileOf(handle);
  return file !== null && isProduction(file);
}

// A destructured parameter has no name of its own; its position stands in.
const parameterName = (parameter: ParameterDeclaration, index: number): string => (isIdentifier(parameter.name) ? parameter.name.text : `#${index}`);

function callables(world: NativeWorld): readonly Callable[] {
  const found = written(world);
  const { checker } = world;
  const facts = world.batch(
    found.map(function* ({ name, parameters }) {
      const symbol = yield* checker.getSymbolAtLocation.gen(name);
      const props: string[][] = [];
      for (const parameter of parameters) {
        const type = yield* checker.getTypeAtLocation.gen(parameter);
        const members = yield* checker.getPropertiesOfType.gen(yield* checker.getNonNullableType.gen(type));
        props.push(
          members
            .filter((member) => hasFlag(member.flags, SymbolFlags.Optional) && member.declarations.some((handle) => declaredInProduction(world, handle)))
            .map((member) => member.name),
        );
      }
      return { symbol, props };
    }),
  );
  return found.map(({ name, home, reach, parameters }, at) => {
    const site = world.siteOf(name);
    const fact = facts[at];
    return {
      key: `${site.file}:${home}`,
      site,
      line: name.getSourceFile().getLineAndCharacterOfPosition(site.position).line + 1,
      home,
      reach,
      keys: fact?.symbol === undefined ? [] : declarationKeys(fact.symbol),
      parameters: parameters.map((parameter, index) => ({
        name: parameterName(parameter, index),
        optional: parameter.questionToken !== undefined || parameter.initializer !== undefined,
        rest: parameter.dotDotDotToken !== undefined,
        props: fact?.props[index] ?? [],
      })),
    };
  });
}

interface Calls {
  readonly production: readonly CallShape[];
  readonly tests: readonly CallShape[];
  /** Production references that hand the value on, so a call the scan cannot see may supply anything. */
  readonly escapes: number;
}

function callsOf(sources: Sources, callable: Callable, sites: Iterable<Site>): Calls {
  const production: CallShape[] = [];
  const tests: CallShape[] = [];
  let escapes = 0;
  for (const site of sites) {
    const source = sources.get(site.file);
    const use = valueUseAt(source, site.position);
    const call = use === "call" ? callAt(source, site.position) : null;
    if (call !== null) {
      (isProductionFile(site.file) ? production : tests).push(call);
    } else if (isProductionFile(site.file) && use !== "type" && !(use === "define" && callable.reach === "property")) {
      escapes++;
    }
  }
  return { production, tests, escapes };
}

const passes = (call: CallShape, index: number): boolean => call.arguments === null || call.arguments.length > index;

function setsProp(call: CallShape, index: number, prop: string): boolean {
  if (call.arguments === null) {
    return true;
  }
  const argument = call.arguments[index];
  return argument !== undefined && (argument.keys === null || argument.keys.includes(prop));
}

function sameLiteral(calls: readonly CallShape[], index: number): string | null {
  const literals = new Set(calls.map((call) => call.arguments?.[index]?.literal ?? null));
  const [only] = literals;
  return calls.length >= SAME_LITERAL_CALLS && literals.size === 1 && only !== undefined ? only : null;
}

function judge(callable: Callable, calls: Calls): readonly UnwiredParam[] {
  if (calls.escapes > 0 || calls.production.length === 0) {
    return [];
  }
  const { key, site, line, home } = callable;
  const finding = (member: string, kind: ParamKind, literal: string | null, supplying: number): UnwiredParam => ({
    key: `${key}:${member}:${kind}`,
    file: site.file,
    line,
    home,
    member,
    kind,
    literal,
    calls: calls.production.length,
    tests: supplying,
  });
  return callable.parameters.flatMap((parameter, index): UnwiredParam[] => {
    if (parameter.rest) {
      return [];
    }
    if (parameter.optional && !calls.production.some((call) => passes(call, index))) {
      return [finding(parameter.name, "unsupplied", null, calls.tests.filter((call) => passes(call, index)).length)];
    }
    const literal = sameLiteral(calls.production, index);
    const same = literal === null ? [] : [finding(parameter.name, "same-literal", literal, 0)];
    const props = parameter.props
      .filter((prop) => !calls.production.some((call) => setsProp(call, index, prop)))
      .map((prop) => finding(`${parameter.name}.${prop}`, "unsupplied-prop", null, calls.tests.filter((call) => setsProp(call, index, prop)).length));
    return [...same, ...props];
  });
}

interface Tallied {
  readonly callable: Callable;
  readonly sites: Map<string, Site>;
}

function addSites(entry: Tallied, references: ReferenceIndex): void {
  for (const reference of sitesOf(references, entry.callable.keys, entry.callable.site)) {
    entry.sites.set(siteKey(reference), reference);
  }
}

// Each file's value sites come from its home world, and a property site joins every world's links and flows at the end.
function engineOne(root: string, configs: readonly string[], log: (line: string) => void): ReadonlyMap<string, Tallied> {
  const tally = new Map<string, Tallied>();
  const homes = homeFiles(configs, NativeWorld.fileLists(root, configs));
  const facts: PropertyFacts[] = [];
  for (const config of configs) {
    using world = NativeWorld.open(root, config);
    const found = callables(world);
    const values = valueIndex(world, homes.get(config));
    for (const callable of found) {
      const entry = tally.get(callable.key) ?? { callable, sites: new Map() };
      if (callable.reach === "value") {
        addSites(entry, values);
      }
      tally.set(callable.key, entry);
    }
    facts.push(propertyFacts(world, homes.get(config)));
    log(`${config}: ${found.length} callables`);
  }
  const { index } = joinFacts(facts);
  for (const entry of tally.values()) {
    if (entry.callable.reach === "property") {
      addSites(entry, index);
    }
  }
  return tally;
}

/** Run both engines over the worlds of `root` for unsupplied and constant parameters. */
export function scanParams(options: ScanOptions): ParamsReport {
  const { worlds, testWorlds } = scanWorlds(options);
  const sources = new Sources(options.root);
  const tally = engineOne(options.root, [...worlds, ...testWorlds], options.log);
  const judged = [...tally.values()].flatMap(({ callable, sites }) => {
    const findings = judge(callable, callsOf(sources, callable, sites.values()));
    return findings.length === 0 ? [] : [{ callable, findings }];
  });
  const second = serviceReferences(
    options.root,
    [...worlds, ...testWorlds],
    judged.map(({ callable }) => callable.site),
    { log: options.log, crossCheck: options.crossCheck },
  );
  const findings: UnwiredParam[] = [];
  const disagreements: string[] = [];
  for (const { callable, findings: first } of judged) {
    const confirmed = new Set(judge(callable, callsOf(sources, callable, second.get(siteKey(callable.site)) ?? [])).map((finding) => finding.key));
    for (const finding of first) {
      if (confirmed.has(finding.key)) {
        findings.push(finding);
      } else {
        disagreements.push(finding.key);
      }
    }
  }
  return { scanned: tally.size, ...sortDeliberate(findings, options.deliberate), disagreements, limits: PARAM_LIMITS };
}
