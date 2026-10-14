// Canonical test assembly ownership; callable and return identities stay with the shared floor readers.
import type { Node as MorphNode } from "ts-morph";
import { Node } from "ts-morph";
import { resolveModuleMemberOrigin } from "../../floor/code-facts/reference-fact.ts";
import type { ModuleMemberOrigin, UnresolvedReferenceFact } from "../../floor/code-facts/reference-fact-contract.ts";
import { resolveReturnTypeIdentityGraph, resolveReturnTypeIdentityOrigin } from "../../floor/code-facts/type-member-origin.ts";

export const SERVER_TEST_ASSEMBLY_HOME = "tests/support/node/server.ts";
const SERVICES = "/packages/server/src/entry/compose/services.ts";
const DOMAIN_SERVICE = /^(.*\/packages\/server\/src\/domain\/[^/]+)\/service\.ts$/u;

/** Whether a resolved value is the actual graph constructor, not another export at the same door. */
export function isServerAssemblyConstructor(origin: ModuleMemberOrigin): boolean {
  const canonical = origin.canonical;
  if (canonical.kind !== "project") {
    return false;
  }
  const declaration = canonical.declaration;
  const home = canonical.sourceFile.getFilePath().replaceAll("\\", "/");
  const domain = DOMAIN_SERVICE.exec(home);
  const root = home.endsWith(SERVICES) && canonical.exportedName === "createServices";
  if (!root && domain === null) {
    return false;
  }
  const name = Node.isFunctionDeclaration(declaration) || Node.isVariableDeclaration(declaration) ? declaration.getNameNode() : undefined;
  if (name === undefined) {
    return false;
  }
  const result = resolveReturnTypeIdentityOrigin(name);
  const contract = domain === null ? home : `${domain[1]}/contract/service.ts`;
  const direct =
    result.kind === "resolved" && result.value.declarations.some((item: MorphNode) => item.getSourceFile().getFilePath().replaceAll("\\", "/") === contract);
  if (root) {
    if (result.kind === "unresolved") {
      throw new Error(`test assembly return contract is unreadable: ${result.detail}`);
    }
    return direct && result.value.name === "ServicesResult";
  }
  if (direct) {
    return true;
  }
  const graph = resolveReturnTypeIdentityGraph(name, contract);
  if (graph.kind === "unresolved") {
    throw new Error(`test assembly returned data is unreadable: ${graph.detail}`);
  }
  return graph.value.some((identity) => identity.declarations.some((item) => item.getSourceFile().getFilePath().replaceAll("\\", "/") === contract));
}

/** A refused invocation stays governed only when its delivered trace retains a proven constructor initializer. */
export function hasAssemblyConstructorEvidence(origin: UnresolvedReferenceFact): boolean {
  return origin.trace.declarations.some((declaration) => {
    const initializer = Node.isVariableDeclaration(declaration) ? declaration.getInitializer() : undefined;
    if (initializer === undefined) {
      return false;
    }
    const known = resolveModuleMemberOrigin(initializer);
    return known.kind === "resolved" && isServerAssemblyConstructor(known.value);
  });
}
