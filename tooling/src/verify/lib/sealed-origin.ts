// One reader for "does this reference enter through a declaration that lives in THIS implementation home".
// A seal is a claim about where a symbol is DECLARED, never about how a consumer spelled it: an alias, a
// namespace member and a name-preserving re-export all resolve to the same canonical declaration, while a
// same-named export of another module resolves to a different one. Consumers pass an absolute-path INFIX
// because a canonical declaration is routinely OUTSIDE the consuming policy's population, where
// `ctx.relativePath` refuses by contract.

import { referenceResolutionServices, resolveModuleMemberOrigin } from "@orb/tooling/floor/code-facts/reference-fact";
import type { ModuleMemberOrigin, ReferenceFact } from "@orb/tooling/floor/code-facts/reference-fact-contract";
import type { Node as MorphNode } from "ts-morph";
import { Node } from "ts-morph";
import type { InventoryInvocationPlan } from "../../floor/code-facts/semantic-inventory-contract.ts";
import type { ModuleOriginServices, OriginReferenceServices } from "../contract/origin-verdict.ts";
import type { GatePolicyContext } from "../contract/policy.ts";
import type { SealedOriginVerdict } from "../contract/sealed-origin.ts";
import { invocationOriginServices, requiredInvocationFact } from "./native-invocation.ts";
import { classifyOriginRefusal } from "./origin-verdict.ts";

const REFERENCE_PLAN: InventoryInvocationPlan = { mode: "value", facets: ["module"], arguments: [] };

/** Register one syntactically possible reference before the shared native generation is sealed. */
export function prepareSealedReference(ctx: GatePolicyContext, node: MorphNode): void {
  if (ctx.nativeTypes === undefined) {
    throw new Error("native sealed-reference context is unavailable");
  }
  ctx.nativeTypes.request({ kind: "invocation-evidence", nodes: [node], plan: REFERENCE_PLAN });
}

/** Read the registered reference's canonical module, lexical and key facts after seal. */
export function sealedReferenceServices(ctx: GatePolicyContext, node: MorphNode): ModuleOriginServices {
  if (ctx.nativeTypes === undefined) {
    throw new Error("native sealed-reference context is unavailable");
  }
  return invocationOriginServices(requiredInvocationFact(ctx.nativeTypes.invocationEvidence([node], REFERENCE_PLAN), node));
}

/** Computed keys remain possible until native normalization; this predicate never resolves a binding. */
export function possibleSealedReference(node: MorphNode, names: ReadonlySet<string>): boolean {
  if (Node.isImportSpecifier(node) || Node.isPropertyAccessExpression(node)) {
    return names.has(node.getName());
  }
  return Node.isElementAccessExpression(node);
}

/** Report the actual member/key slice; transparent wrappers cannot become waiver-token punctuation. */
export function reportSealedReference(ctx: GatePolicyContext, node: MorphNode, name: string, message?: string): void {
  const member = referenceResolutionServices.unwrapExpression(node);
  const key = Node.isElementAccessExpression(member) ? member.getArgumentExpression() : undefined;
  let anchor = member;
  if (Node.isImportSpecifier(member) || Node.isPropertyAccessExpression(member)) {
    anchor = member.getNameNode();
  } else if (key !== undefined) {
    anchor = referenceResolutionServices.unwrapExpression(key);
  }
  const text = anchor.getText();
  const offset = (Node.isStringLiteral(anchor) || Node.isNoSubstitutionTemplateLiteral(anchor)) && anchor.getLiteralText() === name ? text.indexOf(name) : -1;
  ctx.report.node(anchor, { token: offset < 0 ? text : name, offset: Math.max(offset, 0), ...(message === undefined ? {} : { message }) });
}

export interface SealedHome {
  /** Absolute-path infix of the implementation home, e.g. `/packages/server/src/infra/providers/`. */
  readonly pathInfix: string;
  /** The exported names this home seals. */
  readonly exportedNames: ReadonlySet<string>;
}

function projectPath(origin: ModuleMemberOrigin): string | null {
  return origin.canonical.kind === "project" ? origin.canonical.sourceFile.getFilePath().replaceAll("\\", "/") : null;
}

/** Resolve one reference against a sealed implementation home. */
export function readSealedOrigin(
  node: MorphNode,
  home: SealedHome,
  readOrigin: (node: MorphNode) => ReferenceFact<ModuleMemberOrigin> = resolveModuleMemberOrigin,
): SealedOriginVerdict {
  const origin = readOrigin(node);
  if (origin.kind === "unresolved") {
    return { kind: "unresolved", fact: origin };
  }
  const path = projectPath(origin.value);
  const exportedName = origin.value.canonical.exportedName;
  const matches = path?.includes(home.pathInfix) ?? false;
  return matches && home.exportedNames.has(exportedName) ? { kind: "sealed", exportedName, origin: origin.value } : { kind: "foreign", origin: origin.value };
}

/** Does one candidate REPORT under a seal? `sealed` always does, `foreign` never does, and an `unresolved`
 *  verdict is SCOPED by the shared refusal classifier: a DECLARED import door with no reachable target is
 *  unreadable and reports (a seal an unreadable barrel can walk through is not a seal), while a member read
 *  that provably binds something else — a local object's key, a project interface's property — is simply not
 *  a subject. Conflating the two is how a seal acquires either permanent exemption rows or a silent green. */
export function sealedOriginReports(verdict: SealedOriginVerdict, anchor: MorphNode, declarations?: OriginReferenceServices["declarations"]): boolean {
  if (verdict.kind === "foreign") {
    return false;
  }
  return verdict.kind === "sealed" || classifyOriginRefusal(verdict.fact.reason, anchor, declarations) === "unreadable";
}

/** The authored door a resolved origin entered through — the external package name when the door is not a
 *  project file, else the specifier the consumer wrote. */
export function originModuleSpecifier(origin: ModuleMemberOrigin): string {
  return origin.canonical.kind === "external-door" ? origin.canonical.moduleSpecifier : origin.moduleSpecifier;
}
