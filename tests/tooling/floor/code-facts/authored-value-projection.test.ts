// Native capture must preserve provenance even when imported fields are not statically readable.
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { Node } from "ts-morph";
import { Project } from "ts-morph";
import type { NativeAuthoredValueProjection } from "../../../../tooling/src/floor/code-facts/authored-value-projection.ts";
import { captureAuthoredValueProjection } from "../../../../tooling/src/floor/code-facts/authored-value-projection.ts";
import { encodeAuthoredValueProjection, replayAuthoredValueProjection } from "../../../../tooling/src/floor/code-facts/authored-value-projection-codec.ts";
import type { InventorySpan } from "../../../../tooling/src/floor/code-facts/semantic-inventory-contract.ts";
import { authoredValueProjectionSchema } from "../../../../tooling/src/floor/code-facts/semantic-inventory-contract.ts";

function codec(): { readonly span: (node: Node) => InventorySpan; readonly replay: (span: InventorySpan) => Node } {
  const nodes = new Map<string, Node>();
  return {
    span: (node): InventorySpan => {
      const span = { file: node.getSourceFile().getFilePath(), start: node.getStart(), end: node.getEnd(), kind: node.getKind() };
      nodes.set(JSON.stringify(span), node);
      return span;
    },
    replay: (span): Node => {
      const node = nodes.get(JSON.stringify(span));
      if (node === undefined) {
        throw new Error("unadmitted authored test span");
      }
      return node;
    },
  };
}

function roundTrip(projection: NativeAuthoredValueProjection): NativeAuthoredValueProjection {
  const anchors = codec();
  const wire = encodeAuthoredValueProjection(projection, anchors.span);
  return replayAuthoredValueProjection(authoredValueProjectionSchema.parse(JSON.parse(JSON.stringify(wire))), anchors.replay);
}

test("an imported callable field refuses readability without erasing the imported root object's provenance", () => {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { strict: true } });
  project.createSourceFile("/pane.ts", "export function Pane():null{return null;}");
  const home = project.createSourceFile("/definition.ts", 'import {Pane} from "./pane.ts"; export const definition={id:"section",content:Pane};');
  project.createSourceFile("/barrel.ts", 'export {definition as seam} from "./definition.ts";');
  const use = project.createSourceFile("/consumer.ts", 'import {seam} from "./barrel.ts"; export const alias=seam;');
  const projection = captureAuthoredValueProjection(use.getVariableDeclarationOrThrow("alias").getInitializerOrThrow());
  expect(roundTrip(projection)).toEqual(projection);
  expect(projection.value).toMatchObject({ kind: "unresolved", reason: "unsupported" });
  expect(projection.composite.kind).toBe("resolved");
  if (projection.composite.kind !== "resolved") {
    throw new Error("authored root provenance was conflated with field readability");
  }
  expect(projection.composite.value).toBe(home.getVariableDeclarationOrThrow("definition").getInitializerOrThrow());
  expect(projection.composite.trace.declarations).toContain(home.getVariableDeclarationOrThrow("definition"));
});

test("ordered duplicate keys, nested tuples, anchors and numeric values remain authored data", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  const source = project.createSourceFile("/values.ts", 'export const data={same:-0,same:9007199254740991,nested:[null,true,"s",1e999]};');
  const root = source.getVariableDeclarationOrThrow("data").getInitializerOrThrow();
  const projection = captureAuthoredValueProjection(root);
  expect(roundTrip(projection)).toEqual(projection);
  if (projection.value.kind !== "resolved" || projection.value.value.kind !== "object") {
    throw new Error("authored data control did not resolve");
  }
  const properties = projection.value.value.properties;
  expect(properties.map(({ key }) => key)).toEqual(["same", "same", "nested"]);
  expect(properties.map(({ keyNode }) => keyNode.getText())).toEqual(["same", "same", "nested"]);
  expect(properties[0]?.value).toMatchObject({ kind: "scalar", value: -0 });
  expect(properties[1]?.value).toMatchObject({ kind: "scalar", value: 9_007_199_254_740_991 });
  const nested = properties[2]?.value;
  if (nested?.kind !== "tuple") {
    throw new Error("authored nested tuple did not resolve");
  }
  expect(nested.elements.map((element) => (element.kind === "scalar" ? element.value : element.kind))).toEqual([null, true, "s", Number.NaN]);
  expect(projection.value.value.node).toBe(root);
  expect(projection.composite).toMatchObject({ kind: "resolved", value: root });
});

test("mutated imported composites preserve the canonical write refusal rather than returning missing data", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  const source = project.createSourceFile("/mutated.ts", 'export const data={id:"section"};data.id="changed";export const alias=data;');
  const projection = captureAuthoredValueProjection(source.getVariableDeclarationOrThrow("alias").getInitializerOrThrow());
  expect(roundTrip(projection)).toEqual(projection);
  expect(projection.value).toMatchObject({ kind: "unresolved", reason: "write" });
  expect(projection.composite).toMatchObject({ kind: "unresolved", reason: "write" });
});

test("missing, cyclic and orphaned authored entry coverage refuses rather than becoming an unreadable canonical value", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  const source = project.createSourceFile("/coverage.ts", 'export const data={id:"section"};');
  const anchors = codec();
  const wire = encodeAuthoredValueProjection(
    captureAuthoredValueProjection(source.getVariableDeclarationOrThrow("data").getInitializerOrThrow()),
    anchors.span,
  );
  if (wire.value.kind !== "resolved") {
    throw new Error("authored coverage control did not resolve");
  }
  const tree = wire.value.value;
  const root = tree.entries[tree.root];
  const leaf = tree.entries[0];
  if (root?.kind !== "object" || leaf === undefined) {
    throw new Error("authored coverage control is missing its entries");
  }
  const cyclic = {
    ...wire,
    value: {
      ...wire.value,
      value: {
        ...tree,
        entries: tree.entries.map((entry, index) =>
          index === tree.root ? { ...root, properties: root.properties.map((property) => ({ ...property, value: tree.root })) } : entry,
        ),
      },
    },
  };
  const missing = { ...wire, value: { ...wire.value, value: { ...tree, entries: tree.entries.slice(0, -1) } } };
  const orphan = { ...wire, value: { ...wire.value, value: { ...tree, entries: [...tree.entries, leaf] } } };
  expect(() => replayAuthoredValueProjection(cyclic, anchors.replay)).toThrow("cyclic entry coverage");
  expect(() => replayAuthoredValueProjection(missing, anchors.replay)).toThrow("missing");
  expect(() => replayAuthoredValueProjection(orphan, anchors.replay)).toThrow("foreign entry coverage");
});
