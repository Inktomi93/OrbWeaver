// Target queries and the actual compaction binding the supplied-callable suites share.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { CallExpression, Project } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { readCallTargets } from "../../../../tooling/src/floor/code-facts/call-returns.ts";
import type { CallReturnObservations } from "../../../../tooling/src/floor/code-facts/reference-fact-contract.ts";

export function queriedTargets(call: CallExpression, observations: CallReturnObservations): ReturnType<typeof readCallTargets> {
  const program = observations.programs[0];
  return readCallTargets(call, program === undefined ? undefined : new Set(program.byCall.keys()), observations);
}

export async function actualCompactionBinding(project: Project, repoRoot: string): Promise<{ owned: string; binding: string; operations: string }> {
  const actual = project.createSourceFile("/actual-engine.ts", await readFile(join(repoRoot, "packages/server/src/domain/chat/engine/engine.ts"), "utf8"));
  const owned = actual.getFunctionOrThrow("createTurnEngine").getBodyOrThrow().asKindOrThrow(SyntaxKind.Block).getStatements()[0];
  const body = actual.getFunctionOrThrow("runPreTurnCompaction").getBodyOrThrow().asKindOrThrow(SyntaxKind.Block);
  const binding = body.getStatements()[0];
  if (!(Node.isVariableStatement(owned) && Node.isVariableStatement(binding))) {
    throw new Error("the actual owned record and compaction binding statements are unavailable");
  }
  const operations = ["has", "add", "delete"].map((member) => {
    const call = body
      .getDescendantsOfKind(SyntaxKind.CallExpression)
      .find((candidate) => candidate.getExpression().getText() === `compactionInFlight.${member}`);
    if (call === undefined) {
      throw new Error(`the actual compaction ${member} operation is unavailable`);
    }
    return `${call.getText()};`;
  });
  const source = { owned: owned.getText(), binding: binding.getText(), operations: operations.join("\n") };
  actual.forget();
  return source;
}

export function compactionTargetDescription(targets: ReturnType<typeof queriedTargets>): string {
  return JSON.stringify(
    targets.kind === "resolved" ? targets.kind : { kind: targets.kind, detail: targets.detail, node: targets.node.getText().slice(0, 240) },
  );
}
