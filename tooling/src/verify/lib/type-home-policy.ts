// Admitted declaration findings retain their policy identity, authority and authored-name coordinates.
import { Node } from "ts-morph";
import { nativeTypeHomeAdmission, serverTypeApiHome, UI_TOKEN_AUTHORING_CONTRACT_HOME } from "../../floor/code-facts/type-home.ts";
import type { TypeHomeDeclarationClaim, TypeHomeDeclarationInput } from "../../floor/code-facts/type-home-contract.ts";
import { judgeTypeHomeDeclaration } from "../../floor/code-facts/type-home-declaration.ts";
import type { GatePolicyContext, GatePolicyFindingDetails } from "../contract/policy.ts";

// Native lint owns every plane in its admitted population; concrete transport API homes still owe schema placement.
function declarationHasSuccessorHome(node: Node, path: string): boolean {
  return nativeTypeHomeAdmission(path) || (!Node.isVariableStatement(node) && serverTypeApiHome(path));
}

/** Unqualified ownership cannot erase a current accusation; only successor equivalence may retire its owner. */
export function reportTypeHomeDeclaration(
  ctx: GatePolicyContext,
  node: Node,
  claim: TypeHomeDeclarationClaim,
  details: Required<Pick<GatePolicyFindingDetails, "message" | "fix">> & {
    readonly component?: TypeHomeDeclarationInput["component"];
    readonly generated?: TypeHomeDeclarationInput["generated"];
  },
): void {
  const { component, generated, ...finding } = details;
  const path = ctx.relativePath(node.getSourceFile());
  if (declarationHasSuccessorHome(node, path)) {
    return;
  }
  const judgment = judgeTypeHomeDeclaration(node, {
    path,
    claim,
    ...(component === undefined ? {} : { component }),
    ...(generated === undefined ? {} : { generated }),
  });
  if (judgment.kind === "refused") {
    throw new Error(judgment.reason);
  }
  if (judgment.kind === "not-subject") {
    return;
  }
  if (judgment.ownership.kind === "component-owned" || judgment.ownership.kind === "generated-owned") {
    return;
  }
  if (judgment.ownership.kind === "owned") {
    throw new Error("Type-home population admitted a sanctioned package contract home.");
  }
  const detailsForHome =
    judgment.ownership.kind === "misplaced" && judgment.ownership.home === UI_TOKEN_AUTHORING_CONTRACT_HOME
      ? {
          message: "UI token-authoring declaration outside its Node contract home.",
          fix: `Move the declaration to ${UI_TOKEN_AUTHORING_CONTRACT_HOME} and preserve supported type exports through type-only reexports.`,
        }
      : finding;
  for (const { name } of judgment.shapes) {
    ctx.report.node(name, { token: name.getText(), offset: 0, ...detailsForHome });
  }
}
