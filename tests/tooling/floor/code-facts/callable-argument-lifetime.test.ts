// @subject tooling/src/floor/code-facts/value-carrier.ts
// @subject tooling/src/floor/code-facts/call-supplied.ts
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { observeCallReturns, readObservedCallableConsumers } from "@orb/tooling/floor/code-facts/call-returns";
import { Project, SyntaxKind } from "ts-morph";

const CASES = [
  { name: "inline arrow", body: "function run(make:()=>number){return make();} run(()=>1);", resolved: true },
  { name: "inline function expression", body: "function run(make:()=>number){return make();} run(function(){return 1;});", resolved: true },
  { name: "wrapped inline arrow", body: "function run(make:()=>number){return make();} run((()=>1));", resolved: true },
  {
    name: "finite actual alternatives",
    body: "declare const choose:boolean; function run(make:()=>number){return make();} run(choose?()=>1:()=>2);",
    resolved: true,
    alternatives: 2,
  },
  { name: "unavailable consumer", body: "declare function run(make:()=>number):number; run(()=>1);", resolved: false },
  {
    name: "opaque formal handoff",
    body: "declare function escape(make:()=>number):void; function run(make:()=>number){escape(make); return make();} run(()=>1);",
    resolved: false,
  },
  { name: "mutable formal", body: "function run(make:()=>number){make=()=>2; return make();} run(()=>1);", resolved: false },
  {
    name: "opaque actual alternative",
    body: "declare const choose:boolean; declare const foreign:()=>number; function run(make:()=>number){return make();} run(choose?()=>1:foreign);",
    resolved: false,
  },
] as const;

for (const scenario of CASES) {
  test(`callable argument lifetime: ${scenario.name}`, () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const source = project.createSourceFile("/repo/argument.ts", scenario.body);
    const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
    const owner = [...source.getDescendantsOfKind(SyntaxKind.ArrowFunction), ...source.getDescendantsOfKind(SyntaxKind.FunctionExpression)].find((fn) =>
      fn.getText().includes("1"),
    );
    const observed = observeCallReturns(calls, source.getDescendants(), { suppliedCallableTargets: true });
    const program = observed.programs[0];
    if (owner === undefined || program === undefined) {
      throw new Error("actual supplied callable or native program missing");
    }
    const consumers = readObservedCallableConsumers(owner, program);
    expect(consumers.kind).toBe(scenario.resolved ? "resolved" : "unresolved");
    const callers = consumers.kind === "resolved" ? consumers.value : [];
    expect(callers.map((consumer) => consumer.call.getText())).toEqual(scenario.resolved ? ["make()"] : []);
    expect(
      callers.every(
        (consumer) =>
          consumer.targets.kind === "resolved" &&
          consumer.targets.value.length === ("alternatives" in scenario ? scenario.alternatives : 1) &&
          consumer.targets.value.includes(owner),
      ),
    ).toBe(true);
  });
}

test("initial supplied capture retains proven finite record callees before owner demand", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  const source = project.createSourceFile(
    "/repo/finite.ts",
    'const actions={a:{read:()=>1},b:{read:()=>2}}; function run(key:"a"|"b"){const selected=actions[key]; return selected.read();}',
  );
  const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
  const invocation = calls.find((call) => call.getExpression().getText() === "selected.read");
  if (invocation === undefined) {
    throw new Error("finite actual invocation missing");
  }
  const observed = observeCallReturns(calls, source.getDescendants(), { suppliedCallableTargets: true });
  const captured = observed.programs[0]?.byCall.get(invocation.compilerNode)?.targets;
  expect(captured?.kind === "resolved" ? captured.value.map((target) => target.getText()).toSorted() : []).toEqual(["()=>1", "()=>2"]);
});
