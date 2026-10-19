// Fixture path judgments consume raw facts from the original importing capture; proofs retain direct reads.

import type { Identifier, Node } from "ts-morph";
import {
  readMemberReference,
  readMemberReferenceWithName,
  referenceResolutionServices,
  resolveGlobalMemberOrigin,
  resolveModuleMemberOrigin,
  resolveStableExpression,
} from "../../floor/code-facts/reference-fact.ts";
import { resolved, unresolved } from "../../floor/code-facts/type-member-origin-core.ts";
import { ClosureBoundError } from "../../floor/code-facts/type-observations-contract.ts";
import type { FixturePathNativeRead } from "../contract/fixture-path-origin.ts";
import type { GlobalOriginServices } from "../contract/origin-verdict.ts";
import { requiredInvocationFact } from "./native-invocation.ts";

function assertCurrent(node: Node, read: FixturePathNativeRead | undefined): void {
  if (read !== undefined) {
    if (read.evidence.typeObservations === undefined) {
      throw new Error("native fixture provenance type owner is unavailable");
    }
    read.evidence.typeObservations.assertNode(node);
    const declaration = read.types.closureFrontier(node);
    if (declaration !== undefined) {
      throw new ClosureBoundError(node, declaration);
    }
  }
}

export function fixtureDeclaration(node: Identifier, read?: FixturePathNativeRead): ReturnType<typeof referenceResolutionServices.declarationOf> {
  assertCurrent(node, read);
  if (read === undefined) {
    return referenceResolutionServices.declarationOf(node);
  }
  const declarations = read.evidence.declarations(node);
  const declaration = declarations[0];
  return declarations.length === 1 && declaration !== undefined
    ? resolved(declaration, declaration, [declaration])
    : unresolved(declarations.length === 0 ? "missing" : "ambiguous", node, `the lexical binding ${node.getText()} has ${declarations.length} declarations`);
}

export function fixtureSymbol(node: Identifier, read?: FixturePathNativeRead): object | undefined {
  assertCurrent(node, read);
  if (read === undefined) {
    return node.getSymbol()?.compilerSymbol;
  }
  const symbol = read.types.symbol(node);
  return symbol === null ? undefined : read.types.symbolData(symbol).key;
}

export function fixtureStable(node: Node, read?: FixturePathNativeRead): ReturnType<typeof resolveStableExpression> {
  assertCurrent(node, read);
  return read === undefined ? resolveStableExpression(node) : requiredInvocationFact(read.evidence.stableValues, node);
}

export function fixtureModule(node: Node, read?: FixturePathNativeRead): ReturnType<typeof resolveModuleMemberOrigin> {
  assertCurrent(node, read);
  return read === undefined ? resolveModuleMemberOrigin(node) : requiredInvocationFact(read.evidence.modules, node);
}

export function fixtureGlobal(node: Node, read?: FixturePathNativeRead): ReturnType<typeof resolveGlobalMemberOrigin> {
  assertCurrent(node, read);
  return read === undefined ? resolveGlobalMemberOrigin(node) : requiredInvocationFact(read.evidence.globals, node);
}

export function fixtureMember(node: Node, read?: FixturePathNativeRead): ReturnType<typeof readMemberReference> {
  assertCurrent(node, read);
  return read === undefined ? readMemberReference(node) : readMemberReferenceWithName(node, read.evidence.computedName);
}

export function fixtureOriginServices(read: FixturePathNativeRead): GlobalOriginServices {
  return {
    declarations: read.evidence.declarations,
    readComputedName: read.evidence.computedName,
    moduleOrigin: (node) => fixtureModule(node, read),
    globalOrigin: (node) => fixtureGlobal(node, read),
  };
}
