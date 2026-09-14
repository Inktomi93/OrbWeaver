// Visitor-fed service-contract and domain-test call reconciliation for contract verb coverage.
import type { CallExpression, InterfaceDeclaration, Node, Type } from "ts-morph";
import { Node as MorphNode, SyntaxKind } from "ts-morph";
import { defineFact } from "../contract/fact.ts";
import { unwrapExpression } from "./ast-read.ts";

const SERVICE_CONTRACT_RE = /\/packages\/server\/src\/domain\/(?<domain>[^/]+)\/contract\/service\.ts$/u;
const DOMAIN_TEST_RE = /\/tests\/server\/domain\/(?<domain>[^/]+)\//u;
const SERVICE_FACTORY_RE = /^create[A-Z].*Service$/u;
const SERVICE_CONTRACT_SUFFIX_RE = /\/contract\/service\.ts$/u;

// Verbs DECLARED on a *Service interface with zero test invocation anywhere — the W1i backlog. A new
// uncovered verb NOT on this list is RED.
//
// TWO-SIDED (GATE-AUTHORING.md §4.4/§4.8 — the header always claimed the bus-coverage ratchet precedent;
// this is the arm that makes it true): a row that suppressed nothing this run is RED, because a burn-down
// list that keeps rows after their tests land stops being a burn-down and starts being a permanent grant.
// Both ways it can go stale: the verb got its test, or the verb (or its whole domain contract) is gone.
// The arm self-guards on a REAL-TREE ANCHOR (GATE-AUTHORING.md §4.5): the server entrypoint.
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

function typeComesFromService(type: Type, service: InterfaceDeclaration): boolean {
  const declarations = [type.getAliasSymbol(), type.getSymbol()].flatMap((symbol) => symbol?.getDeclarations() ?? []);
  if (declarations.includes(service)) {
    return true;
  }
  return [...type.getUnionTypes(), ...type.getIntersectionTypes()].some((member) => typeComesFromService(member, service));
}

function typeVerbComesFromDomain(type: Type, service: InterfaceDeclaration, verb: string): boolean {
  const domainRoot = service.getSourceFile().getFilePath().replace(SERVICE_CONTRACT_SUFFIX_RE, "/");
  const property = type.getProperty(verb);
  if (
    property?.getDeclarations().some((declaration) => {
      const path = declaration.getSourceFile().getFilePath();
      return path.startsWith(domainRoot) && (path.includes("/verbs/") || path.endsWith("/service.ts"));
    }) === true
  ) {
    return true;
  }
  return [...type.getUnionTypes(), ...type.getIntersectionTypes()].some((member) => typeVerbComesFromDomain(member, service, verb));
}

function isDomainVerbBundleFactory(call: CallExpression, service: InterfaceDeclaration, verb: string): boolean {
  const name = calledName(call);
  if (name?.startsWith("create") !== true || call.getType().getProperty(verb) === undefined) {
    return false;
  }
  const callee = unwrapExpression(call.getExpression());
  const symbol = callee.getSymbol();
  const declarations = (symbol?.getAliasedSymbol() ?? symbol)?.getDeclarations() ?? [];
  const domainRoot = service.getSourceFile().getFilePath().replace(SERVICE_CONTRACT_SUFFIX_RE, "/");
  return declarations.some((declaration) => {
    const path = declaration.getSourceFile().getFilePath();
    return path.startsWith(domainRoot) && (path.includes("/verbs/") || path.endsWith("/service.ts"));
  });
}

function isAssembledServiceExpression(node: Node, service: InterfaceDeclaration, verb: string, seen = new Set<string>()): boolean {
  const expression = unwrapExpression(node);
  if (typeComesFromService(expression.getType(), service) || typeVerbComesFromDomain(expression.getType(), service, verb)) {
    return true;
  }
  if (MorphNode.isCallExpression(expression)) {
    if (isServiceFactoryCall(expression) || isDomainVerbBundleFactory(expression, service, verb)) {
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
        return returned !== undefined && isAssembledServiceExpression(returned, service, verb, seen);
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
  return initializer !== undefined && isAssembledServiceExpression(initializer, service, verb, seen);
}

function isAssembledServiceCall(call: CallExpression, service: InterfaceDeclaration, verb: string): boolean {
  const expression = unwrapExpression(call.getExpression());
  if (MorphNode.isPropertyAccessExpression(expression) || MorphNode.isElementAccessExpression(expression)) {
    return isAssembledServiceExpression(expression.getExpression(), service, verb);
  }
  return false;
}

function isCovered(calls: readonly CallExpression[], service: InterfaceDeclaration, verb: string): boolean {
  const factory = factoryName(verb);
  return calls.some((call) => {
    const name = calledName(call);
    if (name === factory) {
      return true;
    }
    return name === verb && (isAssembledServiceCall(call, service, verb) || isFactoryBoundVerb(call, verb));
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
function assertHeritageResolves(iface: InterfaceDeclaration): void {
  for (const clause of iface.getExtends()) {
    const symbol = clause.getExpression().getSymbol();
    const declarations = (symbol?.getAliasedSymbol() ?? symbol)?.getDeclarations() ?? [];
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
function resolvedVerbs(iface: InterfaceDeclaration): ResolvedVerb[] {
  assertHeritageResolves(iface);
  const verbs: ResolvedVerb[] = [];
  for (const property of iface.getType().getProperties()) {
    const declarations = property.getDeclarations();
    if (declarations.length === 0) {
      throw new Error(
        `contract-verb-presence: member "${property.getName()}" of ${iface.getName()} (${iface.getSourceFile().getFilePath()}) resolves to no declaration — its verb shape cannot be established`,
      );
    }
    const declaration = declarations[0];
    if (declaration === undefined || !isVerbDeclaration(declaration)) {
      continue;
    }
    const declaredIn = declaringInterfaceName(declaration, iface.getName());
    verbs.push({ service: iface, declaration, verb: property.getName(), declaredIn, inherited: declaredIn !== iface.getName() });
  }
  return verbs;
}

/** Every verb exposed by the domain's `*Service` interfaces (name ends exactly in `Service` — excludes
 *  `*ServiceDeps`, which is a DI bundle, not the verb surface). */
function serviceVerbs(interfaces: readonly InterfaceDeclaration[]): ResolvedVerb[] {
  const verbs: ResolvedVerb[] = [];
  for (const iface of interfaces) {
    if (iface.isExported() && iface.getName().endsWith("Service")) {
      verbs.push(...resolvedVerbs(iface));
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

function reconcileContractVerbPresence(interfaces: readonly InterfaceDeclaration[], calls: readonly CallExpression[]): ContractVerbPopulation {
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
    for (const { service, declaration, verb, declaredIn, inherited: isInherited } of serviceVerbs(domainInterfaces)) {
      services.add(`${domain}.${service.getName()}`);
      if (isInherited) {
        inherited += 1;
      } else {
        local += 1;
      }
      if (isCovered(corpus, service, verb)) {
        continue;
      }
      candidates.push({ node: declaration, subject: `${domain}.${verb}`, verb, declaredIn });
    }
  }
  return { candidates, services: services.size, local, inherited, sources: interfaces.length + calls.length };
}

export const contractVerbPresenceFact = defineFact({
  id: "contract-verb-presence",
  population: { in: ["@server", "@tests"], under: ["packages/server/src/domain/**", "tests/server/domain/**"] },
  analysis: "types",
  resources: [],
  create: (ctx) => {
    const interfaces: InterfaceDeclaration[] = [];
    const calls: CallExpression[] = [];
    return {
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
        return reconcileContractVerbPresence(interfaces, calls);
      },
    };
  },
});
