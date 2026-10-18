// D328: canonical EveryOwner authority is a static nominal admission, never caller authentication.
import type { AsExpression, Node } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import { enclosingFn } from "../../floor/code-facts/function-context.ts";
import { resolveTypeIdentityChain } from "../../floor/code-facts/type-member-origin.ts";

const EVERY_OWNER_HOME = "/packages/contracts/src/workloads/execution.ts";
const RUNNER_HOME = "/packages/server/src/domain/workloads/engine/runner.ts";
const ESTIMATE_HOME = "/packages/server/src/domain/workloads/verbs/estimate-model-calls.ts";

const EVERY_OWNER_AUTHORITIES = ["EveryOwnerRun", "EveryOwnerEstimate"] as const;
type EveryOwnerAuthority = (typeof EVERY_OWNER_AUTHORITIES)[number];

/** Named aliases resolve through the canonical floor; nullable and structural lookalikes are not authority. */
function everyOwnerAuthority(node: Node): EveryOwnerAuthority | undefined {
  const origin = resolveTypeIdentityChain(node);
  return origin.kind === "unresolved"
    ? undefined
    : EVERY_OWNER_AUTHORITIES.find((name) =>
        origin.value.some(
          (identity) =>
            identity.name === name && identity.declarations.every((declaration) => declaration.getSourceFile().getFilePath().endsWith(EVERY_OWNER_HOME)),
        ),
      );
}

/** Assertion targets can carry authority inside a scope, array or data member; direct read admission remains separate. */
function assertionAuthorities(assertion: AsExpression): readonly EveryOwnerAuthority[] {
  const annotation = assertion.getTypeNode();
  if (annotation === undefined) {
    return [];
  }
  const references = [annotation, ...annotation.getDescendantsOfKind(SyntaxKind.TypeReference)];
  const origins = references.flatMap((reference) => {
    const chain = resolveTypeIdentityChain(reference);
    return chain.kind === "resolved" ? chain.value : [];
  });
  return EVERY_OWNER_AUTHORITIES.filter((authority) =>
    origins.some(
      (origin) =>
        (origin.name === authority || origin.name === (authority === "EveryOwnerRun" ? "WorkloadRunScope" : "WorkloadEstimateScope")) &&
        origin.declarations.every((declaration) => declaration.getSourceFile().getFilePath().endsWith(EVERY_OWNER_HOME)),
    ),
  );
}

/** A token in an optional, defaulted or union parameter does not prove that this invocation holds it. */
export function hasEveryOwnerAuthority(node: Node): boolean {
  const fn = enclosingFn(node);
  if (
    fn === undefined ||
    !(
      fn.isKind(SyntaxKind.FunctionDeclaration) ||
      fn.isKind(SyntaxKind.ArrowFunction) ||
      fn.isKind(SyntaxKind.FunctionExpression) ||
      fn.isKind(SyntaxKind.MethodDeclaration)
    )
  ) {
    return false;
  }
  return fn
    .getParameters()
    .some((parameter) => !parameter.hasQuestionToken() && parameter.getInitializer() === undefined && everyOwnerAuthority(parameter) !== undefined);
}

/** These casts are the nominal boundary, never a caller-accessible mint. */
function authorizedAuthorityMint(assertion: AsExpression, authority: EveryOwnerAuthority): boolean {
  const fn = enclosingFn(assertion);
  const choice = assertion.getFirstAncestorByKind(SyntaxKind.ConditionalExpression);
  if (
    fn === undefined ||
    !fn.isKind(SyntaxKind.FunctionDeclaration) ||
    choice === undefined ||
    assertion.getStart() < choice.getWhenTrue().getStart() ||
    assertion.getEnd() > choice.getWhenTrue().getEnd()
  ) {
    return false;
  }
  const path = assertion.getSourceFile().getFilePath();
  const condition = choice.getCondition().getText();
  const admitted = {
    [EVERY_OWNER_AUTHORITIES[0]]: path.endsWith(RUNNER_HOME) && fn.getName() === "buildRunContext" && condition === "row.ownerId === null",
    [EVERY_OWNER_AUTHORITIES[1]]:
      path.endsWith(ESTIMATE_HOME) &&
      ((fn.getName() === "estimateModelCalls" && condition === "ownerId === null") ||
        (fn.getName() === "estimateRetryModelCalls" && condition === "original.ownerId === null")),
  } satisfies Record<EveryOwnerAuthority, boolean>;
  return admitted[authority];
}

/** Only directly named canonical token/scope assertions participate; arbitrary data-type inference is not claimed. */
export function hasUnauthorizedEveryOwnerMint(assertion: AsExpression): boolean {
  return assertionAuthorities(assertion).some((authority) => !authorizedAuthorityMint(assertion, authority));
}
