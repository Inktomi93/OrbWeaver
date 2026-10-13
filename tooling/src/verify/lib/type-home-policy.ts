// Type-home policy reporting over canonical declaration facts; the wire arm additionally owns its name vocabulary.
import type { Node } from "ts-morph";
import { inlineShapeNames } from "../../floor/code-facts/shape-declaration.ts";
import type { GatePolicyContext } from "../contract/policy.ts";

const WIRE_SHAPE_SUFFIXES = ["View", "Result", "Summary", "Row", "Input", "Request", "Response", "Wire"] as const;

function reportNames(ctx: GatePolicyContext, names: readonly Node[], message: string, fix: string): void {
  for (const name of names) {
    ctx.report.node(name, { token: name.getText(), offset: 0, message, fix });
  }
}

/** Report an exported shape at its authored name, the exact coordinate its waiver must identify. */
export function reportExportedShapes(ctx: GatePolicyContext, node: Node, message: string, fix: string): void {
  reportNames(ctx, inlineShapeNames(node), message, fix);
}

/** Report only wire-vocabulary names; the consumer proves the declaration is plain data first. */
export function reportExportedWireShapes(ctx: GatePolicyContext, node: Node, message: string, fix: string): void {
  const names = inlineShapeNames(node).filter((name) => {
    const text = name.getText();
    return WIRE_SHAPE_SUFFIXES.some((suffix) => text.endsWith(suffix) && text.length > suffix.length);
  });
  reportNames(ctx, names, message, fix);
}
