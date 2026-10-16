// @subject tooling/src/floor/code-facts/value-observation.ts
// @subject tooling/src/floor/code-facts/value-observation-codec.ts
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { Node } from "ts-morph";
import { Project, SyntaxKind } from "ts-morph";
import { readIndexedCallParameters } from "../../../../tooling/src/floor/code-facts/drizzle-column-reads.ts";
import type { InventorySpan } from "../../../../tooling/src/floor/code-facts/semantic-inventory-contract.ts";
import { spanSchema } from "../../../../tooling/src/floor/code-facts/semantic-inventory-contract.ts";
import { captureTypeProjection } from "../../../../tooling/src/floor/code-facts/type-projection.ts";
import type { NativeTypeVocabulary } from "../../../../tooling/src/floor/code-facts/type-projection-contract.ts";
import { typeProjectionFacet } from "../../../../tooling/src/floor/code-facts/type-projection-contract.ts";
import { captureColumnRowObservation, captureStoredValueObservation } from "../../../../tooling/src/floor/code-facts/value-observation.ts";
import {
  columnRowObservationSchema,
  mapColumnRowObservation,
  mapStoredValueObservation,
  storedValueObservationSchema,
} from "../../../../tooling/src/floor/code-facts/value-observation-codec.ts";
import { scaledBudget } from "../../_load-budget.ts";

function span(node: Node): InventorySpan {
  return { file: node.getSourceFile().getFilePath(), start: node.getStart(), end: node.getEnd(), kind: node.getKind() };
}

test(
  "native vocabulary preserves whole union arms, alias-first names, primitive exclusions and complete properties",
  () => {
    const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { strict: true } });
    const source = project.createSourceFile(
      "/vocabulary.ts",
      `interface Named { readonly [key:string]:unknown; fixed:string }
interface SQL { getSQL():void; queryChunks:readonly unknown[] }
type Alias=Named;
declare const named:Alias;declare const sql:SQL;declare const opaque:unknown;declare const loose:any;
declare const value:string|number|boolean|null|undefined|{left:1}|{right:2}|readonly string[]|readonly [1,2];`,
    );
    const read = (name: string): NativeTypeVocabulary =>
      typeProjectionFacet(
        captureTypeProjection(source.getVariableDeclarationOrThrow(name).getNameNode(), { facets: ["vocabulary"], properties: [] }),
        "vocabulary",
      );
    expect(read("named")).toMatchObject({ properties: ["fixed"], arms: [{ stringIndex: true, symbolName: "Named", properties: ["fixed"] }] });
    expect(read("sql").arms[0]).toMatchObject({ symbolName: "SQL", properties: ["getSQL", "queryChunks"] });
    expect(read("opaque").arms[0]?.unknown).toBe(true);
    expect(read("loose").arms[0]?.any).toBe(true);
    const arms = read("value").arms;
    for (const flag of ["string", "number", "null", "undefined", "array", "tuple"] as const) {
      expect(
        arms.some((arm) => arm[flag]),
        flag,
      ).toBe(true);
    }
    expect(arms.filter((arm) => arm.literal)).toHaveLength(2);
    expect(arms.every((arm) => !arm.boolean)).toBe(true);
    expect(arms.filter((arm) => arm.properties.includes("left") || arm.properties.includes("right")).map((arm) => arm.properties)).toEqual([
      ["left"],
      ["right"],
    ]);
    expect(() =>
      typeProjectionFacet(
        captureTypeProjection(source.getVariableDeclarationOrThrow("value").getNameNode(), { facets: ["properties"], properties: ["left"] }),
        "vocabulary",
      ),
    ).toThrow("unavailable");
  },
  scaledBudget(30_000),
);

test(
  "stored-value and row observations roundtrip canonical structure and helper indices without fabricated Types",
  () => {
    const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { strict: true } });
    const source = project.createSourceFile(
      "/observations.ts",
      `declare const table:{$inferSelect:{kind:"schema";value:{[key:string]:unknown}}};
const prefix={first:1};function make(){return {...prefix,last:2};}const value=true?make():{other:3};
function helper(skip:number,blob:{[key:string]:unknown},key:string){const nested=(blob:{[key:string]:unknown},key:string)=>blob[key];return blob[key];}
function read(row:typeof table.$inferSelect){const {value:blob}=row;helper(0,blob,"first");return blob;}
function ambiguous(row:typeof table.$inferSelect|Partial<typeof table.$inferSelect>){const {value:blob}=row;return blob;}`,
    );
    const shape = captureStoredValueObservation(source.getVariableDeclarationOrThrow("value").getInitializerOrThrow());
    expect(shape).toMatchObject({
      kind: "choice",
      values: [
        {
          kind: "call",
          values: [
            {
              kind: "object",
              members: [
                { kind: "spread", value: { kind: "binding", values: [{ kind: "object", members: [{ kind: "named", name: "first" }] }] } },
                { kind: "named", name: "last" },
              ],
            },
          ],
        },
        { kind: "object", members: [{ kind: "named", name: "other" }] },
      ],
    });
    const wire = storedValueObservationSchema(spanSchema).parse(mapStoredValueObservation(shape, span));
    expect(storedValueObservationSchema(spanSchema).safeParse({ ...wire, type: undefined }).success).toBe(false);
    const replay = (anchor: InventorySpan): Node => {
      const leaf = source.getDescendantAtPos(anchor.start);
      const node = [source, leaf, ...(leaf?.getAncestors() ?? [])].find(
        (candidate) => candidate?.getStart() === anchor.start && candidate.getEnd() === anchor.end && candidate.getKind() === anchor.kind,
      );
      if (node === undefined) {
        throw new Error("canonical observation span unavailable");
      }
      return node;
    };
    expect(mapStoredValueObservation(wire, replay)).toEqual(shape);
    const read = source.getFunctionOrThrow("read");
    const returned = read.getDescendantsOfKind(SyntaxKind.ReturnStatement)[0]?.getExpression();
    if (returned === undefined) {
      throw new Error("row control missing");
    }
    const row = captureColumnRowObservation(returned);
    expect(row).toMatchObject({ kind: "resolved", column: { property: "value", ambiguous: false } });
    expect(row.kind === "resolved" ? row.declarations : []).toEqual([source.getVariableDeclarationOrThrow("table")]);
    expect(mapColumnRowObservation(columnRowObservationSchema(spanSchema).parse(mapColumnRowObservation(row, span)), replay)).toEqual(row);
    const ambiguous = source.getFunctionOrThrow("ambiguous").getDescendantsOfKind(SyntaxKind.ReturnStatement)[0]?.getExpression();
    if (ambiguous === undefined) {
      throw new Error("refusal control missing");
    }
    expect(captureColumnRowObservation(ambiguous)).toMatchObject({
      kind: "refused",
      column: { property: "value" },
      message: expect.stringContaining("cannot prove schema-row origin"),
    });
    const call = read.getDescendantsOfKind(SyntaxKind.CallExpression)[0];
    if (call === undefined) {
      throw new Error("indexed control missing");
    }
    expect(readIndexedCallParameters(call).map(({ receiverIndex, keyIndex, node }) => ({ receiverIndex, keyIndex, text: node.getText() }))).toEqual([
      { receiverIndex: 1, keyIndex: 2, text: "blob[key]" },
    ]);
  },
  scaledBudget(30_000),
);
