import type { Node as MorphNode, ts } from "ts-morph";
import type { AssignabilityChecker } from "../code-facts/assignability.ts";
import { readAssignabilityChecker, readNativeMutualAgreement, readNativeTypeRelation } from "../code-facts/assignability.ts";
import type {
  InventoryPartition,
  InventoryShape,
  InventoryShapePairResult,
  InventoryShapeQuery,
  InventorySpan,
} from "../code-facts/semantic-inventory-contract.ts";
import { directDerivationTargetKeys, typeQueryDerivationKeys } from "../code-facts/shape-derivation.ts";
import { resolvedShapeProperties } from "../code-facts/shape-fields.ts";
import { nativeCompilerSourceFiles } from "./ts-workspace.ts";

/** Capture native fields and origins; policy floors and copy judgments stay with consumers. */
export function extractShape(node: MorphNode, span: (node: MorphNode) => InventorySpan): InventoryShape {
  const fields = (mode: "copy" | "respell"): InventoryShape["copy"] => resolvedShapeProperties(node, mode)?.map((property) => property.getName()) ?? null;
  return {
    node: span(node),
    copy: fields("copy"),
    respell: fields("respell"),
    direct: [...directDerivationTargetKeys(node)],
    queries: [...typeQueryDerivationKeys(node)],
  };
}

/** Query exactly one native interpretation; no Program or Type escapes the worker. */
export function extractShapePairs(program: ts.Program, queries: readonly InventoryShapeQuery[]): InventoryPartition["pairs"] {
  const sources = nativeCompilerSourceFiles(program);
  const checker = readAssignabilityChecker({ compilerObject: program.getTypeChecker() });
  const nodeOf = (span: InventorySpan): MorphNode | undefined => {
    const source = sources.find((file) => file.getFilePath() === span.file);
    const leaf = source?.getDescendantAtPos(span.start);
    return [source, leaf, ...(leaf?.getAncestors() ?? [])].find(
      (node) => node?.getStart() === span.start && node.getEnd() === span.end && node.getKind() === span.kind,
    );
  };
  try {
    return queries.map((query) => {
      if (checker === undefined) {
        return { query, result: { kind: "unavailable", reason: "primitive-absent" } };
      }
      const left = nodeOf(query.left);
      const right = nodeOf(query.right);
      if (left === undefined || right === undefined) {
        return { query, result: { kind: "unavailable", reason: "node-absent" } };
      }
      return { query, result: readPairResult(checker, left, right, query) };
    });
  } finally {
    for (const source of sources) {
      source.forget();
    }
  }
}

function readPairResult(checker: AssignabilityChecker, left: MorphNode, right: MorphNode, query: InventoryShapeQuery): InventoryShapePairResult {
  const x = query.leftField === null ? left.getType() : left.getType().getProperty(query.leftField)?.getTypeAtLocation(left);
  const y = query.rightField === null ? right.getType() : right.getType().getProperty(query.rightField)?.getTypeAtLocation(right);
  if (query.projection === "mutual") {
    return {
      kind: "answer",
      values: [
        x !== undefined && y !== undefined && readNativeMutualAgreement({ checker, lenient: query.lenient }, { type: x, at: left }, { type: y, at: right }),
      ],
    };
  }
  const result = x === undefined || y === undefined ? undefined : readNativeTypeRelation(checker, x, y);
  return result === undefined
    ? { kind: "no-comparable" }
    : { kind: "answer", values: [result.leftToRight, result.rightToLeft, result.leftIsAny, result.rightIsAny] };
}
