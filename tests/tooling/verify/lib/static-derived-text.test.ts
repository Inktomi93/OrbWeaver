// Exact intrinsic evaluation needs independent ordering and effect controls, not an expectation computed
// by the same reader. The policy-descriptor mirror separately proves both public text queries consume it.
import { Project } from "ts-morph";
import { staticDerivedText } from "../../../../tooling/src/verify/lib/static-derived-text.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

function read(source: string): string | undefined {
  const project = new Project({ useInMemoryFileSystem: true });
  const file = project.createSourceFile("/repo/probe.ts", `export {};\n${source}`);
  return staticDerivedText(file.getVariableDeclarationOrThrow("result").getInitializerOrThrow());
}

test("closed aliases and canonical global aliases preserve a complete string sequence", () => {
  expect(
    read(
      'const { keys, freeze } = Object; const values = freeze(keys({ b: "x", 2: "y", a: "z" })); const alias = values; const sep = "|" + ":"; const result = alias.join(sep);',
    ),
  ).toBe("2|:b|:a");
  expect(read('const values = ["left", "right"]; const alias = values; const result = alias.join("|");')).toBe("left|right");
  expect(read('const result = Object.freeze([]).join(",");')).toBe("");
});

test("freezing primitive elements makes later opaque consumers unable to change the sequence", () => {
  expect(
    read('declare function consume(value: unknown): void; const values = Object.freeze(["left", "right"]); consume(values); const result = values.join("|");'),
  ).toBe("left|right");
});

test.each([
  'let values = ["a", "b"]; const result = values.join(",");',
  'const values = ["a", "b"]; const alias = values; alias[0] = "changed"; const result = values.join(",");',
  'declare function mutate(value: unknown): void; const values = ["a", "b"]; const alias = values; mutate(alias); const result = values.join(",");',
  'const values = ["a", "b"]; const box = { values }; const result = values.join(",");',
  'const values = ["a", "b"]; function expose() { return values; } const result = values.join(",");',
  'Object.keys = () => ["changed"]; const result = Object.freeze(Object.keys({ a: "x" })).join(",");',
  'const freeze = Object.freeze; freeze = (value) => value; const result = freeze(["a"]).join(",");',
  'Array.prototype.join = () => "changed"; const result = Object.freeze(["a"]).join(",");',
  'const result = Object.freeze({ get a() { return "x"; } }).join(",");',
  'const result = Object.freeze(["a", ...dynamic]).join(",");',
  'const result = Object.freeze(["a"]).join({ toString() { return ","; } });',
])("refuses an effect or unsupported value before claiming exact text: %s", (source) => {
  expect(read(source)).toBeUndefined();
});
