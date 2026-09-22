// Shared shape discovery and exact structural analysis for the respell command.

import type { Project } from "ts-morph";
import { Node } from "ts-morph";
import type { SourceCorpus } from "../../_shared/ts-workspace.ts";
import { coLocatedSemanticNodes } from "../../_shared/ts-workspace.ts";
import type { Hit } from "../contract/types.ts";
import { hitOf } from "./emit.ts";
import { declKey } from "./keys.ts";
import { exitToolError } from "./ledger.ts";
import { TEST_FILE_RE } from "./root.ts";
import { ownExports } from "./scope.ts";

/** How many properties a shape needs before an exact structural match means anything. */
export const RESPELL_PROPERTY_FLOOR = 3;

/** One field's name and report-only display type; the checker decides identity. */
export interface FieldPair {
  readonly name: string;
  readonly type: string;
}

export interface ShapeEntry {
  readonly name: string;
  readonly decl: Node;
  readonly signature: string;
  readonly fields: readonly FieldPair[];
}

/** The compiler checker's mutual-assignability primitive. It is a TS INTERNAL, so it is resolved once and
 *  its ABSENCE is a tool error (exit 2), never a silent zero — a lens that quietly stops comparing is worse
 *  than no lens. (Present on TS 5.x/TS7's checker object; re-verify on a TypeScript bump.) */
export interface AssignabilityChecker {
  isTypeAssignableTo: (source: unknown, target: unknown) => boolean;
}

export function assignabilityChecker(project: Pick<Project, "getTypeChecker">): AssignabilityChecker {
  const compiler = project.getTypeChecker().compilerObject as unknown as Partial<AssignabilityChecker>;
  if (typeof compiler.isTypeAssignableTo !== "function") {
    exitToolError(
      "ast respell: this TypeScript build exposes no `checker.isTypeAssignableTo` (a TS internal this lens depends on) — the comparison cannot run. Re-verify the API after a TypeScript bump; tooling/src/ast/lib/respell-shapes.ts.",
    );
  }
  return { isTypeAssignableTo: compiler.isTypeAssignableTo.bind(compiler) };
}

/** MUTUALLY assignable = the same shape, whatever the two spell their fields' types as. Assignability (not
 *  type TEXT) is the comparison because a text signature is ALIAS-SENSITIVE: `CharacterId` and
 *  `TypeIdOf<"character">` print differently and are the same type, so a text lens reports a clean zero on a
 *  literal re-spell (measured — the first cut of this lens missed a planted twin for exactly that reason). */
export function mutuallyAssignable(checker: AssignabilityChecker, a: Node, b: Node): boolean {
  const colocated = coLocatedSemanticNodes(a, b);
  if (colocated.length === 0) {
    if (a.getProject() !== b.getProject()) {
      exitToolError("ast respell: compared declarations share no native compiler program");
    }
    const ta = a.getType().compilerType;
    const tb = b.getType().compilerType;
    return checker.isTypeAssignableTo(ta, tb) && checker.isTypeAssignableTo(tb, ta);
  }
  const answers = new Set(
    colocated.map(({ project, left, right }) => {
      const effectiveChecker = assignabilityChecker(project);
      const ta = left.getType().compilerType;
      const tb = right.getType().compilerType;
      return effectiveChecker.isTypeAssignableTo(ta, tb) && effectiveChecker.isTypeAssignableTo(tb, ta);
    }),
  );
  if (answers.size !== 1) {
    exitToolError("ast respell: native compiler programs disagree about declaration assignability");
  }
  return answers.has(true);
}

/** The sorted PROPERTY-NAME signature of a declaration's type — the cheap prefilter that keeps the O(n²)
 *  assignability probe off every unrelated pair. Undefined when it is not an object shape with at least
 *  {@link RESPELL_PROPERTY_FLOOR} properties (a union/primitive/function type has no signature here). */
function shapeFields(decl: Node): FieldPair[] | undefined {
  const type = decl.getType();
  if (type.isUnion() || type.isIntersection()) {
    return;
  }
  if (!type.isObject() || type.isArray() || type.isTuple() || type.getCallSignatures().length > 0) {
    return;
  }
  const props = Node.isClassDeclaration(decl)
    ? [
        ...decl.getProperties().filter((property) => !property.isStatic()),
        ...decl
          .getConstructors()
          .flatMap((ctor) => ctor.getParameters())
          .filter((parameter) => parameter.isParameterProperty()),
      ].flatMap((member) => {
        const symbol = member.getSymbol();
        return symbol === undefined ? [] : [symbol];
      })
    : type.getProperties();
  if (props.length < RESPELL_PROPERTY_FLOOR) {
    return;
  }
  return props.map((prop) => ({ name: prop.getName(), type: prop.getTypeAtLocation(decl).getText() }));
}

/** Every exported declaration of the files under `prefix` that HAS a shape signature. */
export function shapesUnder(project: SourceCorpus, prefix: string): ShapeEntry[] {
  const out: ShapeEntry[] = [];
  for (const sf of project.getSourceFiles()) {
    const fp = sf.getFilePath();
    if (!fp.includes(prefix) || TEST_FILE_RE.test(fp)) {
      continue;
    }
    for (const { name, decl } of ownExports(sf)) {
      const fields = shapeFields(decl);
      if (fields !== undefined) {
        const signature = fields
          .map((field) => field.name)
          .sort((left, right) => left.localeCompare(right))
          .join("|");
        out.push({ name, decl, signature, fields });
      }
    }
  }
  return out;
}

const DOMAIN_CONTRACT_DIR_RE = /\/packages\/server\/src\/domain\/(?<domain>[^/]+)\/contract\//u;

/** Domain dirs under `packages/server/src/domain/` that have a `contract/`, filtered by an optional arg. */
export function domainsWithContracts(project: SourceCorpus, arg: string): string[] {
  const found = new Set<string>();
  for (const sf of project.getSourceFiles()) {
    const domain = DOMAIN_CONTRACT_DIR_RE.exec(sf.getFilePath())?.groups?.["domain"];
    if (domain !== undefined && (arg === "" || domain === arg)) {
      found.add(domain);
    }
  }
  return [...found].sort();
}

/** Origin declarations named by a bare alias (`type X = Y`), resolved through import/re-export hops. */
function bareAliasTargetKeys(decl: Node): Set<string> {
  const keys = new Set<string>();
  if (!Node.isTypeAliasDeclaration(decl)) {
    return keys;
  }
  const typeNode = decl.getTypeNode();
  if (typeNode === undefined || !Node.isTypeReference(typeNode) || typeNode.getTypeArguments().length > 0) {
    return keys;
  }
  const entity = typeNode.getTypeName();
  const identifier = Node.isQualifiedName(entity) ? entity.getRight() : entity;
  const symbol = identifier.getSymbol();
  if (symbol === undefined) {
    return keys;
  }
  for (const declaration of (symbol.getAliasedSymbol() ?? symbol).getDeclarations()) {
    keys.add(declKey(declaration));
  }
  return keys;
}

/** Contracts declarations named directly by `extends`; inherited fields are already derived. */
function heritageTargetKeys(decl: Node): Set<string> {
  const keys = new Set<string>();
  let heritage = Node.isInterfaceDeclaration(decl) ? decl.getExtends() : [];
  if (Node.isClassDeclaration(decl)) {
    const clause = decl.getExtends();
    heritage = clause === undefined ? [] : [clause];
  }
  for (const clause of heritage) {
    const symbol = clause.getExpression().getSymbol();
    for (const declaration of (symbol?.getAliasedSymbol() ?? symbol)?.getDeclarations() ?? []) {
      keys.add(declKey(declaration));
    }
  }
  return keys;
}

export function directDerivationTargetKeys(decl: Node): Set<string> {
  return new Set([...bareAliasTargetKeys(decl), ...heritageTargetKeys(decl)]);
}

/** Shared `typeof value` provenance through a generic derive (`z.infer`, `ReturnType`, and equivalents). */
function typeQueryDerivationKeys(decl: Node): Set<string> {
  const keys = new Set<string>();
  if (!Node.isTypeAliasDeclaration(decl)) {
    return keys;
  }
  const typeNode = decl.getTypeNode();
  if (typeNode === undefined || !Node.isTypeReference(typeNode)) {
    return keys;
  }
  const [argument] = typeNode.getTypeArguments();
  if (argument === undefined || typeNode.getTypeArguments().length !== 1 || !Node.isTypeQuery(argument)) {
    return keys;
  }
  const genericSymbol = typeNode.getTypeName().getSymbol();
  const genericKeys = ((genericSymbol?.getAliasedSymbol() ?? genericSymbol)?.getDeclarations() ?? []).map(declKey);
  const operandSymbol = argument.getExprName().getSymbol();
  const operandKeys = ((operandSymbol?.getAliasedSymbol() ?? operandSymbol)?.getDeclarations() ?? []).map(declKey);
  for (const genericKey of genericKeys) {
    for (const operandKey of operandKeys) {
      keys.add(`${genericKey}\0${operandKey}`);
    }
  }
  return keys;
}

function overlaps(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  return [...left].some((key) => right.has(key));
}

/** ONE domain's structural twins, excluding aliases with the same direct target or resolved generic
 *  `typeof` provenance because those already derive from the shared declaration. */
export function respellHitsFor(project: SourceCorpus, checker: AssignabilityChecker, domain: string): Hit[] {
  const contractsShapes = shapesUnder(project, `/packages/contracts/src/${domain}/`);
  if (contractsShapes.length === 0) {
    return [];
  }
  const bySignature = new Map<string, ShapeEntry[]>();
  for (const shape of contractsShapes) {
    bySignature.set(shape.signature, [...(bySignature.get(shape.signature) ?? []), shape]);
  }
  const hits: Hit[] = [];
  for (const domainShape of shapesUnder(project, `/packages/server/src/domain/${domain}/contract/`)) {
    const derivedFrom = directDerivationTargetKeys(domainShape.decl);
    const domainOrigins = typeQueryDerivationKeys(domainShape.decl);
    for (const twin of bySignature.get(domainShape.signature) ?? []) {
      if (
        derivedFrom.has(declKey(twin.decl)) ||
        overlaps(domainOrigins, typeQueryDerivationKeys(twin.decl)) ||
        !mutuallyAssignable(checker, domainShape.decl, twin.decl)
      ) {
        continue;
      }
      const hit = hitOf(domainShape.decl, domainShape.name === twin.name ? "respell-same-name" : "respell-renamed");
      hit.text = `${domainShape.name}  ≡  @orb/contracts/${domain}::${twin.name}`;
      hits.push(hit);
    }
  }
  return hits;
}
