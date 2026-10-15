// Admitted declaration findings retain their policy identity, authority and authored-name coordinates.
import type { Node } from "ts-morph";
import { nativeTypeHomeDirectExport, UI_TOKEN_AUTHORING_CONTRACT_HOME } from "../../floor/code-facts/type-home.ts";
import type { TypeHomeDeclarationClaim, TypeHomeDeclarationInput } from "../../floor/code-facts/type-home-contract.ts";
import { judgeTypeHomeDeclaration } from "../../floor/code-facts/type-home-declaration.ts";
import type { GatePolicyContext, GatePolicyFindingDetails } from "../contract/policy.ts";

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
  for (const { name, plane } of judgment.shapes) {
    if (plane === "direct-export" && nativeTypeHomeDirectExport(path)) {
      continue;
    }
    ctx.report.node(name, { token: name.getText(), offset: 0, ...detailsForHome });
  }
}
