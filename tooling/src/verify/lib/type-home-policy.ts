// Admitted declaration findings retain their policy identity, authority and authored-name coordinates.
import type { Node } from "ts-morph";
import type { TypeHomeDeclarationClaim } from "../../floor/code-facts/type-home-contract.ts";
import { judgeTypeHomeDeclaration } from "../../floor/code-facts/type-home-declaration.ts";
import type { GatePolicyContext, GatePolicyFindingDetails } from "../contract/policy.ts";

/** Unqualified ownership cannot erase a current accusation; only successor equivalence may retire its owner. */
export function reportTypeHomeDeclaration(
  ctx: GatePolicyContext,
  node: Node,
  claim: TypeHomeDeclarationClaim,
  details: Required<Pick<GatePolicyFindingDetails, "message" | "fix">>,
): void {
  const judgment = judgeTypeHomeDeclaration(node, { path: ctx.relativePath(node.getSourceFile()), claim });
  if (judgment.kind === "refused") {
    throw new Error(judgment.reason);
  }
  if (judgment.kind === "not-subject") {
    return;
  }
  if (judgment.ownership.kind === "owned") {
    throw new Error("Type-home population admitted a sanctioned package contract home.");
  }
  for (const { name } of judgment.shapes) {
    ctx.report.node(name, { token: name.getText(), offset: 0, ...details });
  }
}
