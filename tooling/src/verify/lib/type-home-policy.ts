// Admitted declaration findings retain their policy identity, authority and authored-name coordinates.
import type { Node } from "ts-morph";
import { nativeTypeHomeDirectExport } from "../../floor/code-facts/type-home.ts";
import type { TypeHomeDeclarationClaim, TypeHomeDeclarationInput } from "../../floor/code-facts/type-home-contract.ts";
import { judgeTypeHomeDeclaration } from "../../floor/code-facts/type-home-declaration.ts";
import type { GatePolicyContext, GatePolicyFindingDetails } from "../contract/policy.ts";

/** Unqualified ownership cannot erase a current accusation; only successor equivalence may retire its owner. */
export function reportTypeHomeDeclaration(
  ctx: GatePolicyContext,
  node: Node,
  claim: TypeHomeDeclarationClaim,
  details: Required<Pick<GatePolicyFindingDetails, "message" | "fix">> & { readonly component?: TypeHomeDeclarationInput["component"] },
): void {
  const { component, ...finding } = details;
  const path = ctx.relativePath(node.getSourceFile());
  const judgment = judgeTypeHomeDeclaration(node, { path, claim, ...(component === undefined ? {} : { component }) });
  if (judgment.kind === "refused") {
    throw new Error(judgment.reason);
  }
  if (judgment.kind === "not-subject") {
    return;
  }
  if (judgment.ownership.kind === "component-owned") {
    return;
  }
  if (judgment.ownership.kind === "owned") {
    throw new Error("Type-home population admitted a sanctioned package contract home.");
  }
  for (const { name, plane } of judgment.shapes) {
    if (plane === "direct-export" && nativeTypeHomeDirectExport(path)) {
      continue;
    }
    ctx.report.node(name, { token: name.getText(), offset: 0, ...finding });
  }
}
