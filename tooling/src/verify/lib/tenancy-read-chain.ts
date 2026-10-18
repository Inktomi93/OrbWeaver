// The lexical shape of one direct Drizzle read chain: its calls, filters and consumption, never callable provenance (D328).
import { literalMemberAccess } from "@orb/tooling/floor/code-facts/reference-fact";
import { unwrapTarget } from "@orb/tooling/floor/code-facts/reference-fact-alias";
import type { CallExpression, Node } from "ts-morph";
import { Node as N, SyntaxKind } from "ts-morph";
import type { ReadAnchor } from "../contract/tenancy.ts";

export const JOINS = new Set(["innerJoin", "leftJoin", "rightJoin", "fullJoin", "crossJoin"]);
const FINISHES = new Set(["all", "get", "execute", "run"]);

// Only import-bound table expressions reach the shared resolver; local factories and aliases stay unknown.
export function imported(node: Node): boolean {
  const value = unwrapTarget(node);
  if (N.isIdentifier(value)) {
    return value.getSymbol()?.getDeclarations().some(N.isImportSpecifier) === true;
  }
  const member = literalMemberAccess(value);
  return member !== undefined && N.isIdentifier(member.receiver) && member.receiver.getSymbol()?.getDeclarations().some(N.isNamespaceImport) === true;
}

export function callsAround(anchor: CallExpression): readonly CallExpression[] {
  const before: CallExpression[] = [];
  let current: Node = anchor;
  for (;;) {
    const member = N.isCallExpression(current) ? literalMemberAccess(current.getExpression()) : undefined;
    if (member === undefined || !N.isCallExpression(member.receiver)) {
      break;
    }
    before.unshift(member.receiver);
    current = member.receiver;
  }
  const after: CallExpression[] = [];
  current = anchor;
  for (;;) {
    const access = current.getParent();
    const call = access?.getParent();
    if (access === undefined || !N.isCallExpression(call) || literalMemberAccess(access)?.receiver !== current || call.getExpression() !== access) {
      break;
    }
    after.push(call);
    current = call;
  }
  return [...before, anchor, ...after];
}

export function predicateColumns(step: CallExpression): readonly Node[] {
  const name = literalMemberAccess(step.getExpression())?.name;
  if (name !== "where" && !JOINS.has(name ?? "")) {
    return [];
  }
  return step
    .getArguments()
    .flatMap((argument) => [
      argument,
      ...argument.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression),
      ...argument.getDescendantsOfKind(SyntaxKind.ElementAccessExpression),
    ])
    .filter((candidate) => {
      const access = literalMemberAccess(candidate);
      return access !== undefined && imported(access.receiver);
    });
}

function consumed(top: CallExpression, method: string | undefined): boolean {
  const parent = top.getParent();
  if (N.isAwaitExpression(parent) || FINISHES.has(method ?? "")) {
    return true;
  }
  const fn = top.getFirstAncestor((node) => N.isFunctionLikeDeclaration(node));
  if (!((N.isFunctionDeclaration(fn) || N.isArrowFunction(fn) || N.isFunctionExpression(fn) || N.isMethodDeclaration(fn)) && fn.isAsync())) {
    return false;
  }
  return N.isReturnStatement(parent) || parent === fn;
}

export function statementGap(calls: readonly CallExpression[]): string | undefined {
  const methods = calls.map((call) => literalMemberAccess(call.getExpression())?.name);
  if (!(methods.includes("select") || methods.includes("selectDistinct"))) {
    return "read chain has no direct SELECT root";
  }
  if (methods.includes("$dynamic") || methods.filter((method) => method === "where").length > 1) {
    return "dynamic or repeated WHERE is outside direct analysis";
  }
  const top = calls.at(-1);
  return top === undefined || !consumed(top, methods.at(-1)) ? "builder is stored, returned editable, or handed to another consumer" : undefined;
}

export function filterArguments(call: CallExpression, anchor: ReadAnchor): readonly Node[] {
  const name = literalMemberAccess(call.getExpression())?.name;
  const filters = name === "where" || name === "innerJoin" || (call === anchor.call && anchor.kind === "join");
  const argument = call.getArguments()[JOINS.has(name ?? "") ? 1 : 0];
  return filters && argument !== undefined ? [argument] : [];
}
