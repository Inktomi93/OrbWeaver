// Visitor-fed service-contract and domain-test call reconciliation for contract verb coverage.
import type { CallExpression, InterfaceDeclaration, Node } from "ts-morph";
import { Node as MorphNode, SyntaxKind } from "ts-morph";
import type { InventoryInvocationPlan } from "../../floor/code-facts/semantic-inventory-contract.ts";
import type { TypeObservationReader } from "../../floor/code-facts/type-observations-contract.ts";
import type { NativeTypeSelector } from "../../floor/code-facts/type-projection-contract.ts";
import { nodeTypeSelector, typeProjectionFacet } from "../../floor/code-facts/type-projection-contract.ts";
import { LEGACY_TEST_ROOT } from "../../floor/testing/test-population.ts";
import { defineFact } from "../contract/fact.ts";
import { unwrapExpression } from "./ast-read.ts";
import { nativeTypeProjection, prepareNativeTypeProjection } from "./native-value-projection.ts";
import { typeObservationPlan, typeObservationReaders } from "./type-observation-context.ts";

const SERVICE_CONTRACT_RE = /\/packages\/server\/src\/domain\/(?<domain>[^/]+)\/contract\/service\.ts$/u;
// A legacy domain test (`LEGACY_TEST_ROOT`) still proves its verbs until the rebuilt suite replaces it.
const DOMAIN_TEST_RE = /\/tests\/(?:legacy\/)?server\/domain\/(?<domain>[^/]+)\//u;
const SERVICE_FACTORY_RE = /^create[A-Z].*Service$/u;
const SERVICE_CONTRACT_SUFFIX_RE = /\/contract\/service\.ts$/u;

// Verbs DECLARED on a *Service interface with zero test invocation anywhere — the W1i backlog. A new
// uncovered verb NOT on this list is RED.
//
// TWO-SIDED (tooling/src/verify/gates/GATE-AUTHORING.md §4.4/§4.8 — the header always claimed the bus-coverage ratchet precedent;
// this is the arm that makes it true): a row that suppressed nothing this run is RED, because a burn-down
// list that keeps rows after their tests land stops being a burn-down and starts being a permanent grant.
// Both ways it can go stale: the verb got its test, or the verb (or its whole domain contract) is gone.
// The arm self-guards on a REAL-TREE ANCHOR (tooling/src/verify/gates/GATE-AUTHORING.md §4.5): the server entrypoint.
/** `create` + PascalCase(verb) — the codebase's verb-factory name (verb-naming gate enforces it). */
function factoryName(verb: string): string {
  return `create${verb.charAt(0).toUpperCase()}${verb.slice(1)}`;
}

/** A verb is COVERED by an AST CallExpression through a service receiver, a binding destructured from a
 *  `create*` service bundle, or its exact `create<Verb>` factory. A same-named helper/declaration/comment is
 *  not evidence that the service boundary ran. */
function calledName(node: CallExpression): string | undefined {
  const expression = node.getExpression();
  if (MorphNode.isIdentifier(expression)) {
    return expression.getText();
  }
  if (MorphNode.isPropertyAccessExpression(expression)) {
    return expression.getName();
  }
  const argument = MorphNode.isElementAccessExpression(expression) ? expression.getArgumentExpression() : undefined;
  return argument !== undefined && MorphNode.isStringLiteral(argument) ? argument.getLiteralText() : undefined;
}

/** A bare identifier is a service invocation only when it was destructured from a runtime service factory.
 *  This is the bundle shape used by domain integration tests (`const { listChats } = createRead(...)`). */
function isFactoryBoundVerb(call: CallExpression, verb: string): boolean {
  if (!MorphNode.isIdentifier(call.getExpression())) {
    return false;
  }
  return call
    .getSourceFile()
    .getDescendantsOfKind(SyntaxKind.VariableDeclaration)
    .some((declaration) => {
      const name = declaration.getNameNode();
      const initializer = declaration.getInitializer();
      const factoryCall = initializer === undefined ? undefined : unwrapExpression(initializer);
      if (!(MorphNode.isObjectBindingPattern(name) && factoryCall !== undefined && MorphNode.isCallExpression(factoryCall))) {
        return false;
      }
      const factory = calledName(factoryCall);
      return factory?.startsWith("create") === true && name.getElements().some((element) => element.getName() === verb);
    });
}

function isServiceFactoryCall(call: CallExpression): boolean {
  const name = calledName(call);
  return name !== undefined && SERVICE_FACTORY_RE.test(name);
}

function typeComesFromService(reader: TypeObservationReader, selector: NativeTypeSelector, service: InterfaceDeclaration, seen = new Set<object>()): boolean {
  const reference = reader.select(selector);
  if (reference === null) {
    return false;
  }
  const type = reader.type(reference);
  if (seen.has(type.key)) {
    return false;
  }
  seen.add(type.key);
  const declarations = [type.aliasSymbol, type.symbol].flatMap((symbol) => (symbol === null ? [] : reader.symbolData(symbol).declarations));
  return (
    declarations.includes(service) ||
    [...reader.unions(selector), ...reader.intersections(selector)].some((member) => typeComesFromService(reader, member, service, seen))
  );
}

interface ServiceVerbRead {
  readonly reader: TypeObservationReader;
  readonly service: InterfaceDeclaration;
  readonly verb: string;
}

function typeVerbComesFromDomain(selector: NativeTypeSelector, context: ServiceVerbRead, seen = new Set<object>()): boolean {
  const { reader, service, verb } = context;
  const reference = reader.select(selector);
  if (reference === null) {
    return false;
  }
  const type = reader.type(reference);
  if (seen.has(type.key)) {
    return false;
  }
  seen.add(type.key);
  const domainRoot = service.getSourceFile().getFilePath().replace(SERVICE_CONTRACT_SUFFIX_RE, "/");
  const property = reader.propertySymbol(selector, verb);
  if (
    property !== null &&
    reader.symbolData(property).declarations.some((declaration) => {
      const path = declaration.getSourceFile().getFilePath();
      return path.startsWith(domainRoot) && (path.includes("/verbs/") || path.endsWith("/service.ts"));
    })
  ) {
    return true;
  }
  return [...reader.unions(selector), ...reader.intersections(selector)].some((member) => typeVerbComesFromDomain(member, context, seen));
}

function isDomainVerbBundleFactory(call: CallExpression, service: InterfaceDeclaration, verb: string, reader: TypeObservationReader): boolean {
  const name = calledName(call);
  if (name?.startsWith("create") !== true || reader.propertySymbol(nodeTypeSelector(call), verb) === null) {
    return false;
  }
  const callee = unwrapExpression(call.getExpression());
  const symbol = reader.symbol(callee);
  const declarations = symbol === null ? [] : reader.symbolData(reader.symbolData(symbol).canonical).declarations;
  const domainRoot = service.getSourceFile().getFilePath().replace(SERVICE_CONTRACT_SUFFIX_RE, "/");
  return declarations.some((declaration) => {
    const path = declaration.getSourceFile().getFilePath();
    return path.startsWith(domainRoot) && (path.includes("/verbs/") || path.endsWith("/service.ts"));
  });
}

function isAssembledServiceExpression(node: Node, context: ServiceVerbRead, seen = new Set<string>()): boolean {
  const { reader, service, verb } = context;
  const expression = unwrapExpression(node);
  if (typeComesFromService(reader, nodeTypeSelector(expression), service) || typeVerbComesFromDomain(nodeTypeSelector(expression), context)) {
    return true;
  }
  if (MorphNode.isCallExpression(expression)) {
    if (isServiceFactoryCall(expression) || isDomainVerbBundleFactory(expression, service, verb, reader)) {
      return true;
    }
    const helperName = calledName(expression);
    if (helperName === undefined) {
      return false;
    }
    const helper = expression.getSourceFile().getFunction(helperName);
    return (
      helper?.getDescendantsOfKind(SyntaxKind.ReturnStatement).some((statement) => {
        const returned = statement.getExpression();
        return returned !== undefined && isAssembledServiceExpression(returned, context, seen);
      }) === true
    );
  }
  if (!MorphNode.isIdentifier(expression)) {
    return false;
  }
  const name = expression.getText();
  const key = `${expression.getSourceFile().getFilePath()}:${name}`;
  if (seen.has(key)) {
    return false;
  }
  seen.add(key);
  const declaration = expression
    .getSourceFile()
    .getDescendantsOfKind(SyntaxKind.VariableDeclaration)
    .find((candidate) => candidate.getName() === name);
  const initializer = declaration?.getInitializer();
  return initializer !== undefined && isAssembledServiceExpression(initializer, context, seen);
}

function isAssembledServiceCall(call: CallExpression, service: InterfaceDeclaration, verb: string, reader: TypeObservationReader): boolean {
  const expression = unwrapExpression(call.getExpression());
  if (MorphNode.isPropertyAccessExpression(expression) || MorphNode.isElementAccessExpression(expression)) {
    return isAssembledServiceExpression(expression.getExpression(), { service, verb, reader });
  }
  return false;
}

function isCovered(
  calls: readonly CallExpression[],
  service: InterfaceDeclaration,
  verb: string,
  readers: ReadonlyMap<import("ts-morph").SourceFile, TypeObservationReader>,
): boolean {
  const factory = factoryName(verb);
  return calls.some((call) => {
    const name = calledName(call);
    if (name === factory) {
      return true;
    }
    if (name !== verb) {
      return false;
    }
    const reader = readers.get(call.getSourceFile());
    if (reader === undefined) {
      throw new Error("contract-verb test source has no native importing owner");
    }
    return isAssembledServiceCall(call, service, verb, reader) || isFactoryBoundVerb(call, verb);
  });
}

/** A member declaration is verb-shaped when it is a `MethodSignature`, or a `PropertySignature` whose type
 *  is a function type (`readonly send: (params) => Promise<…>`, the codebase's idiom). */
function isVerbDeclaration(declaration: Node): boolean {
  if (MorphNode.isMethodSignature(declaration)) {
    return true;
  }
  if (!MorphNode.isPropertySignature(declaration)) {
    return false;
  }
  const typeNode = declaration.getTypeNode();
  return typeNode !== undefined && MorphNode.isFunctionTypeNode(typeNode);
}

/** The interface a resolved member was DECLARED on — the provenance the diagnostic names, so an inherited
 *  verb points at the base contract that owns it instead of at the interface that merely composes it. */
function declaringInterfaceName(declaration: Node, fallback: string): string {
  const parent = declaration.getParent();
  return parent !== undefined && MorphNode.isInterfaceDeclaration(parent) ? parent.getName() : fallback;
}

/** Every `extends` clause of a service interface must RESOLVE. A base whose expression binds no interface
 *  declaration would silently contribute zero members — the exact shrunken-denominator failure this gate was
 *  repaired for (#943) — so it is a tool error instead. */
function assertHeritageResolves(iface: InterfaceDeclaration, reader: TypeObservationReader): void {
  for (const clause of iface.getExtends()) {
    const symbol = reader.symbol(clause.getExpression());
    const declarations = symbol === null ? [] : reader.symbolData(reader.symbolData(symbol).canonical).declarations;
    if (!declarations.some((declaration) => MorphNode.isInterfaceDeclaration(declaration))) {
      throw new Error(
        `contract-verb-presence: ${iface.getName()} in ${iface.getSourceFile().getFilePath()} extends "${clause.getText()}", which resolves to no interface declaration — its inherited verbs cannot be enumerated`,
      );
    }
  }
}

/** One resolved verb: its name, the interface whose obligations it joins, and where it was DECLARED. */
interface ResolvedVerb {
  readonly service: InterfaceDeclaration;
  readonly declaration: Node;
  readonly verb: string;
  readonly declaredIn: string;
  readonly inherited: boolean;
}

/** Every verb a `*Service` interface EXPOSES — the resolved type's properties, not the local declaration
 *  list, so an inherited base's verbs stay obligations (#943). A property that resolves to no declaration at
 *  all is unsupported composition, and refuses loudly rather than quietly leaving the denominator. */
function resolvedVerbs(iface: InterfaceDeclaration, reader: TypeObservationReader): ResolvedVerb[] {
  assertHeritageResolves(iface, reader);
  const verbs: ResolvedVerb[] = [];
  for (const property of reader.properties(nodeTypeSelector(iface), iface)) {
    const declarations = reader.symbolData(property.symbol).declarations;
    if (declarations.length === 0) {
      throw new Error(
        `contract-verb-presence: member "${property.name}" of ${iface.getName()} (${iface.getSourceFile().getFilePath()}) resolves to no declaration — its verb shape cannot be established`,
      );
    }
    const declaration = declarations[0];
    if (declaration === undefined || !isVerbDeclaration(declaration)) {
      continue;
    }
    const declaredIn = declaringInterfaceName(declaration, iface.getName());
    verbs.push({ service: iface, declaration, verb: property.name, declaredIn, inherited: declaredIn !== iface.getName() });
  }
  return verbs;
}

/** Every verb exposed by the domain's `*Service` interfaces (name ends exactly in `Service` — excludes
 *  `*ServiceDeps`, which is a DI bundle, not the verb surface). */
function serviceVerbs(
  interfaces: readonly InterfaceDeclaration[],
  readers: ReadonlyMap<import("ts-morph").SourceFile, TypeObservationReader>,
  exported: (iface: InterfaceDeclaration) => boolean,
): ResolvedVerb[] {
  const verbs: ResolvedVerb[] = [];
  for (const iface of interfaces) {
    if (iface.getName().endsWith("Service") && exported(iface)) {
      const reader = readers.get(iface.getSourceFile());
      if (reader === undefined) {
        throw new Error("service interface has no native importing owner");
      }
      verbs.push(...resolvedVerbs(iface, reader));
    }
  }
  return verbs;
}

interface ContractVerbCandidate {
  readonly node: Node;
  readonly subject: string;
  readonly verb: string;
  readonly declaredIn: string;
}

export interface ContractVerbPopulation {
  readonly candidates: readonly ContractVerbCandidate[];
  readonly services: number;
  readonly local: number;
  readonly inherited: number;
  readonly sources: number;
}

function reconcileContractVerbPresence(
  interfaces: readonly InterfaceDeclaration[],
  calls: readonly CallExpression[],
  readers: ReadonlyMap<import("ts-morph").SourceFile, TypeObservationReader>,
  exported: (iface: InterfaceDeclaration) => boolean,
): ContractVerbPopulation {
  const candidates: ContractVerbCandidate[] = [];
  const services = new Set<string>();
  let local = 0;
  let inherited = 0;
  const callsByDomain = Map.groupBy(calls, (call) => DOMAIN_TEST_RE.exec(call.getSourceFile().getFilePath())?.groups?.["domain"] ?? "");
  for (const [domain, domainInterfaces] of Map.groupBy(
    interfaces,
    (iface) => SERVICE_CONTRACT_RE.exec(iface.getSourceFile().getFilePath())?.groups?.["domain"] ?? "",
  )) {
    if (domain === "") {
      continue;
    }
    const corpus = callsByDomain.get(domain) ?? [];
    for (const { service, declaration, verb, declaredIn, inherited: isInherited } of serviceVerbs(domainInterfaces, readers, exported)) {
      services.add(`${domain}.${service.getName()}`);
      if (isInherited) {
        inherited += 1;
      } else {
        local += 1;
      }
      if (isCovered(corpus, service, verb, readers)) {
        continue;
      }
      candidates.push({ node: declaration, subject: `${domain}.${verb}`, verb, declaredIn });
    }
  }
  return { candidates, services: services.size, local, inherited, sources: interfaces.length + calls.length };
}

function assembledExpressionNominees(calls: readonly CallExpression[]): readonly Node[] {
  const pending: Node[] = calls.flatMap((call) => {
    const callee = unwrapExpression(call.getExpression());
    return MorphNode.isPropertyAccessExpression(callee) || MorphNode.isElementAccessExpression(callee) ? [callee.getExpression()] : [];
  });
  const seen = new Set<Node>();
  for (const value of pending) {
    const expression = unwrapExpression(value);
    if (seen.has(expression)) {
      continue;
    }
    seen.add(expression);
    if (MorphNode.isCallExpression(expression)) {
      seen.add(unwrapExpression(expression.getExpression()));
      const name = calledName(expression);
      const helper = name === undefined ? undefined : expression.getSourceFile().getFunction(name);
      pending.push(...(helper?.getDescendantsOfKind(SyntaxKind.ReturnStatement).flatMap((statement) => statement.getExpression() ?? []) ?? []));
    } else if (MorphNode.isIdentifier(expression)) {
      const declaration = expression
        .getSourceFile()
        .getDescendantsOfKind(SyntaxKind.VariableDeclaration)
        .find((candidate) => candidate.getName() === expression.getText());
      const initializer = declaration?.getInitializer();
      if (initializer !== undefined) {
        pending.push(initializer);
      }
    }
  }
  return [...seen];
}

export const contractVerbPresenceFact = defineFact({
  id: "contract-verb-presence",
  population: {
    in: ["@server", "@tests", "@legacy-tests"],
    under: ["packages/server/src/domain/**", "tests/server/domain/**", `${LEGACY_TEST_ROOT}/server/domain/**`],
  },
  analysis: "types",
  resources: [],
  create: (ctx) => {
    const interfaces: InterfaceDeclaration[] = [];
    const calls: CallExpression[] = [];
    let plan: InventoryInvocationPlan | undefined;
    return {
      prepare: (): void => {
        const services = interfaces.filter((iface) => SERVICE_CONTRACT_RE.test(iface.getSourceFile().getFilePath()) && iface.getName().endsWith("Service"));
        for (const iface of services) {
          prepareNativeTypeProjection(ctx, iface, { facets: ["declaration-export"], properties: [] });
        }
        const expressions = assembledExpressionNominees(calls);
        plan = typeObservationPlan(
          ctx.files,
          [],
          [
            { kind: "type-properties", nodes: services },
            { kind: "node-types", nodes: services.flatMap((iface) => iface.getExtends().map((clause) => clause.getExpression())) },
            { kind: "type-constituents", nodes: expressions, properties: [...new Set(calls.flatMap((call) => calledName(call) ?? []))] },
          ],
        );
        if (ctx.nativeTypes === undefined) {
          throw new Error("native contract-verb facts are unavailable");
        }
        ctx.nativeTypes.request({ kind: "invocation-evidence", nodes: ctx.files, plan });
      },
      visitors: [
        {
          kinds: [SyntaxKind.InterfaceDeclaration, SyntaxKind.CallExpression],
          visit: (node) => {
            if (MorphNode.isInterfaceDeclaration(node)) {
              interfaces.push(node);
            } else if (MorphNode.isCallExpression(node)) {
              calls.push(node);
            }
          },
        },
      ],
      finish: (): ContractVerbPopulation => {
        ctx.receipt({ kind: "population", source: "contract-verb-sources", members: ctx.files.length });
        if (plan === undefined || ctx.nativeTypes === undefined) {
          throw new Error("native contract-verb demand was not prepared");
        }
        const readers = typeObservationReaders(ctx.nativeTypes.invocationEvidence(ctx.files, plan));
        return reconcileContractVerbPresence(interfaces, calls, readers, (iface) =>
          typeProjectionFacet(nativeTypeProjection(ctx, iface, { facets: ["declaration-export"], properties: [] }), "declaration-export"),
        );
      },
    };
  },
});
