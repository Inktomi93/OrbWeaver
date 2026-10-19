// @subject tooling/src/floor/code-facts/invocation-evidence-replay.ts
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { Node, SourceFile } from "ts-morph";
import { Project, SyntaxKind } from "ts-morph";
import { replayInvocationEvidence } from "../../../../tooling/src/floor/code-facts/invocation-evidence-replay.ts";
import type { InventoryInvocationEvidence, InventorySpan } from "../../../../tooling/src/floor/code-facts/semantic-inventory-contract.ts";
import { captureTypeObservations } from "../../../../tooling/src/floor/code-facts/type-observations.ts";
import { encodeTypeObservations } from "../../../../tooling/src/floor/code-facts/type-observations-codec.ts";
import { TYPE_OBSERVATION_PROFILE } from "../../../../tooling/src/floor/code-facts/type-observations-contract.ts";

const spanOf = (node: Node): InventorySpan => ({ file: node.getSourceFile().getFilePath(), start: node.getStart(), end: node.getEnd(), kind: node.getKind() });

function locate(project: Project, span: InventorySpan): Node {
  const source: SourceFile = project.getSourceFileOrThrow(span.file);
  let node: Node | undefined = source;
  while (node !== undefined && !(node.getStart() === span.start && node.getEnd() === span.end && node.getKind() === span.kind)) {
    node = node.getChildAtPos(span.start);
  }
  if (node === undefined) {
    throw new Error(`fixture span is not materializable: ${String(span.start)}-${String(span.end)}`);
  }
  return node;
}

test("type replay memoizes a verified node only inside one live lease and never memoizes a refused anchor", () => {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { strict: true } });
  const source = project.createSourceFile("/replay.ts", "declare const held: Promise<never>;");
  const node = source.getVariableDeclarationOrThrow("held");
  const facts = captureTypeObservations(
    { profile: TYPE_OBSERVATION_PROFILE, sources: [source], nodes: [], questions: [{ kind: "type-details", nodes: [node] }] },
    { anchor: source, admit: () => undefined },
  );
  const wire: InventoryInvocationEvidence = {
    query: { mode: "types", facets: [], arguments: [], node: spanOf(source) },
    callee: null,
    invocation: null,
    profiles: [],
    sources: [],
    typeObservations: encodeTypeObservations(facts, spanOf),
  };
  let replays = 0;
  let refuseAnchor = false;
  const replayNode = (span: InventorySpan): Node => {
    replays += 1;
    if (refuseAnchor && span.kind === SyntaxKind.SourceFile) {
      throw new Error("planted anchor refusal");
    }
    return locate(project, span);
  };
  const unused = (): never => {
    throw new Error("related-value replay is outside this control");
  };
  const lease = (): { readonly assertNode: (subject: Node) => void; readonly release: () => void } => {
    let open = true;
    const evidence = replayInvocationEvidence(wire, replayNode, { globals: new Map(), declarations: unused, computedName: unused }, () => {
      if (!open) {
        throw new Error("planted lease released");
      }
    });
    const types = evidence.typeObservations;
    if (types === undefined) {
      throw new Error("type observations were not replayed");
    }
    return {
      assertNode: types.assertNode,
      release: () => {
        open = false;
      },
    };
  };

  const first = lease();
  first.assertNode(node);
  const verified = replays;
  first.assertNode(node);
  expect(replays).toBe(verified);
  first.release();
  expect(() => first.assertNode(node)).toThrow("planted lease released");

  const second = lease();
  const fresh = replays;
  second.assertNode(node);
  expect(replays).toBeGreaterThan(fresh);

  const third = lease();
  refuseAnchor = true;
  expect(() => third.assertNode(node)).toThrow("planted anchor refusal");
  refuseAnchor = false;
  const refused = replays;
  third.assertNode(node);
  expect(replays).toBeGreaterThan(refused);
});
