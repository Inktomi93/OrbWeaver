// @subject tooling/src/floor/code-facts/value-carrier.ts
import { runInNewContext } from "node:vm";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { Project, SyntaxKind } from "ts-morph";
import { observeCallReturns } from "../../../../tooling/src/floor/code-facts/call-returns.ts";
import { beginReferencePass, endReferencePass } from "../../../../tooling/src/floor/code-facts/reference-fact.ts";
import { readAuthoredCallableSources, readAuthoredValueSources } from "../../../../tooling/src/floor/code-facts/value-carrier.ts";

test("prototype setters are not own data while computed and shorthand prototype-named slots are", () => {
  const code =
    'const setter={__proto__:1};const quoted={"__proto__":1};const computed={["__proto__"]:2};const __proto__=3;const shorthand={__proto__};const other={"__proto__":1,value:4};';
  expect(runInNewContext(`${code};[setter,quoted,computed,shorthand].map(value=>({own:Object.hasOwn(value,"__proto__"),keys:Object.keys(value)}));`)).toEqual([
    { own: false, keys: [] },
    { own: false, keys: [] },
    { own: true, keys: ["__proto__"] },
    { own: true, keys: ["__proto__"] },
  ]);
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, types: [] } });
  const source = project.createSourceFile("/prototype-property.ts", code);
  const projections = ["setter", "quoted", "computed", "shorthand"].map((name) =>
    readAuthoredValueSources(source.getVariableDeclarationOrThrow(name).getInitializerOrThrow(), ["__proto__"]),
  );
  expect(
    projections.map((fact) =>
      fact.kind === "resolved" ? fact.value.map((leaf) => ({ value: leaf.value.getText(), present: leaf.present, path: leaf.path })) : fact.reason,
    ),
  ).toEqual(["unsupported", "unsupported", [{ value: "2", present: true, path: [] }], [{ value: "3", present: true, path: [] }]]);
  const unrelated = readAuthoredValueSources(source.getVariableDeclarationOrThrow("other").getInitializerOrThrow(), ["value"]);
  expect(
    unrelated.kind === "resolved" ? unrelated.value.map((leaf) => ({ value: leaf.value.getText(), present: leaf.present, path: leaf.path })) : unrelated.detail,
  ).toEqual([{ value: "4", present: true, path: [] }]);
});

for (const scenario of [
  { name: "double-quoted key", object: '{"single-user":1}', key: "single-user", expected: "1" },
  { name: "single-quoted key", object: "{'single-user':2}", key: "single-user", expected: "2" },
  { name: "escaped key", object: '{"single\\u002duser":3}', key: "single-user", expected: "3" },
  { name: "later computed spelling", object: '{"single-user":1,["single-user"]:4}', key: "single-user", expected: "4" },
  { name: "later quoted spelling", object: '{["single-user"]:1,"single-user":5}', key: "single-user", expected: "5" },
  { name: "quoted spread overwrite", object: '{"single-user":1,...{"single-user":6}}', key: "single-user", expected: "6" },
] as const) {
  test(`own property projection decodes ${scenario.name}`, () => {
    const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, types: [] } });
    const source = project.createSourceFile("/quoted-data.ts", `const selected=${scenario.object};`);
    const object = source.getVariableDeclarationOrThrow("selected").getInitializerOrThrow();
    const fact = readAuthoredValueSources(object, [scenario.key]);
    expect(
      fact.kind === "resolved" ? fact.value.map((leaf) => ({ value: leaf.value.getText(), present: leaf.present, path: leaf.path })) : fact.detail,
    ).toEqual([{ value: scenario.expected, present: true, path: [] }]);
  });
}

for (const receiver of [
  '{get "single-user"(){this.run=()=>2;return undefined;},run:()=>1}',
  '{"__proto__":{get "single-user"(){this.run=()=>2;return undefined;}},run:()=>1}',
] as const) {
  test(`quoted sibling descriptor cannot hide a selected callable mutation: ${receiver}`, () => {
    const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, types: [] } });
    const source = project.createSourceFile(
      "/quoted-sibling.ts",
      `function consume(ctx){void ctx["single-user"];return ctx.run();}const selected=${receiver};consume(selected);`,
    );
    const call = source.getFunctionOrThrow("consume").getFirstDescendantByKindOrThrow(SyntaxKind.CallExpression);
    beginReferencePass();
    try {
      const captured = observeCallReturns(source.getDescendantsOfKind(SyntaxKind.CallExpression), source.getDescendants(), { suppliedCallableTargets: true });
      expect(readAuthoredCallableSources(call.getExpression(), undefined, captured).kind).toBe("unresolved");
    } finally {
      endReferencePass();
    }
  });
}

test("quoted projection retains absence and refuses a quoted accessor instead of assuming data", () => {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, types: [] } });
  const source = project.createSourceFile("/quoted-accessor.ts", 'const selected={"single-user":1,get "forward-header"(){return 2;}};');
  const object = source.getVariableDeclarationOrThrow("selected").getInitializerOrThrow();
  const absent = readAuthoredValueSources(object, ["outside"]);
  expect(absent.kind === "resolved" ? absent.value.map((leaf) => ({ value: leaf.value, present: leaf.present, path: leaf.path })) : absent.detail).toEqual([
    { value: object, present: false, path: ["outside"] },
  ]);
  expect(readAuthoredValueSources(object, ["forward-header"])).toMatchObject({ kind: "unresolved", reason: "unsupported" });
});

for (const scenario of [
  { name: "ordinary own callable", object: '{"single-user":()=>1}', before: "", key: '"single-user"', resolved: true },
  { name: "quoted getter", object: '{get "single-user"(){return ()=>1;}}', before: "", key: '"single-user"', resolved: false },
  { name: "selected slot write", object: '{"single-user":()=>1}', before: 'selected["single-user"]=()=>2;', key: '"single-user"', resolved: false },
  { name: "escaped receiver", object: '{"single-user":()=>1}', before: "escape(selected);", key: '"single-user"', resolved: false },
  { name: "unknown runtime key", object: '{"single-user":()=>1}', before: "", key: "unknownKey", resolved: false },
] as const) {
  test(`quoted callable qualification preserves ${scenario.name}`, () => {
    const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, types: [] } });
    const source = project.createSourceFile(
      "/quoted-callable.ts",
      `declare function escape(value:object):void;declare const unknownKey:string;const selected=${scenario.object};${scenario.before}selected[${scenario.key}]();`,
    );
    const call = source.getDescendantsOfKind(SyntaxKind.CallExpression).at(-1);
    if (call === undefined) {
      throw new Error("the actual quoted callable invocation is missing");
    }
    beginReferencePass();
    try {
      const captured = observeCallReturns(source.getDescendantsOfKind(SyntaxKind.CallExpression), source.getDescendants(), { suppliedCallableTargets: true });
      const first = readAuthoredCallableSources(call.getExpression(), undefined, captured);
      expect(first.kind, first.kind === "unresolved" ? first.detail : scenario.name).toBe(scenario.resolved ? "resolved" : "unresolved");
      const expected = source.getFirstDescendantByKindOrThrow(SyntaxKind.ArrowFunction);
      expect(first.kind === "resolved" ? first.value.map((leaf) => ({ value: leaf.value, present: leaf.present, path: leaf.path })) : undefined).toEqual(
        scenario.resolved ? [{ value: expected, present: true, path: [] }] : undefined,
      );
    } finally {
      endReferencePass();
    }
  });
}
