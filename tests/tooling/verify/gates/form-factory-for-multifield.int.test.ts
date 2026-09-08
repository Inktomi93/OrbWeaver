// The PERMANENT PIN for `form-factory-for-multifield` (tooling/src/verify/gates/form-factory-for-multifield.ts)
// — issue #620. The gate counted every controlled input a component WRITES, so a component that dispatches
// exactly ONE control out of an exhaustive `switch` was reported as an N-field hand-rolled form: B2's
// `KnobField` rendered one control from a 4-arm switch and the gate said "KnobField (4 fields)". The gate
// has no allowlist, so its only exits were "import a form factory" or "drop below 3 controls" — pressure
// toward an abstraction that did not fit (a knob set built DYNAMICALLY from server descriptors, against
// entity-form factories that want a fixed `defaultValues` shape).
//
// The rule is now MAX over mutually-exclusive branches, SUM over everything else — and the half that keeps
// this honest is the TRUE-POSITIVE side: `&&` guards and SIBLING conditionals still sum, because they all
// render together. Both directions are planted here.
import type { Node } from "ts-morph";
import { Project, SyntaxKind } from "ts-morph";
import { describe } from "vitest";
import type { Finding, GateRunCtx } from "../../../../tooling/src/verify/contract/gate.ts";
import { gate } from "../../../../tooling/src/verify/gates/form-factory-for-multifield.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const AT = "/repo/packages/client/src/features/x/probe.tsx";

/** Drive the gate's real `visitFile` over one virtual feature .tsx and return its findings. */
function run(source: string): readonly Finding[] {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { jsx: 4 } });
  const sf = project.createSourceFile(AT, source, { overwrite: true });
  const findings: Finding[] = [];
  const ctx: GateRunCtx = {
    root: "/repo",
    project,
    scope: { kind: "project" },
    files: [sf],
    checker: () => project.getTypeChecker(),
    // The gate reports through the NODE overload (`ctx.report(el, { token, offset })`), so the sink has to
    // accept both shapes; `token` is spread conditionally because exactOptionalPropertyTypes rejects an
    // explicit `undefined` for an optional property.
    report: ((arg: Node | Finding, atToken?: { readonly token: string; readonly offset: number }): void => {
      if ("file" in arg) {
        findings.push(arg);
        return;
      }
      findings.push({ file: AT, line: arg.getStartLineNumber(), column: 0, ...(atToken === undefined ? {} : { token: atToken.token }) });
    }) as GateRunCtx["report"],
    scan: () => undefined,
  };
  gate.visitFile?.(sf, ctx);
  return findings;
}

const tokens = (findings: readonly Finding[]): readonly (string | undefined)[] => findings.map((f) => f.token);

/** Wrap `body` as a component body. */
function component(body: string): string {
  return `export function Probe({ kind, a, b, c, flag }) {\n${body}\n}\n`;
}

const NUMBER_FIELD = "<NumberField value={v} onValueChange={set} />";
const SWITCH_CTL = "<Switch checked={v} onCheckedChange={set} />";
const SELECT_CTL = "<Select value={v} onValueChange={set} />";
const INPUT_CTL = "<Input value={v} onChange={set} />";

describe("form-factory-for-multifield — #620: exclusive arms collapse to their MAX", () => {
  test("the founding false positive: ONE control from a 4-arm exhaustive switch is NOT a 4-field form", () => {
    const src = component(
      `  switch (kind) {\n    case "number":\n      return ${NUMBER_FIELD};\n    case "toggle":\n      return ${SWITCH_CTL};\n    case "choice":\n      return ${SELECT_CTL};\n    default:\n      return ${INPUT_CTL};\n  }`,
    );
    expect(run(src)).toEqual([]);
  });

  test("an if/else pair is the same either/or — 4 written, at most 2 concurrent", () => {
    const src = component(`  if (flag) {\n    return (<div>${NUMBER_FIELD}${SWITCH_CTL}</div>);\n  }\n  return (<div>${SELECT_CTL}${INPUT_CTL}</div>);`);
    expect(run(src)).toEqual([]);
  });

  test("ONE conditional expression's two arms collapse — 4 written, at most 2 concurrent", () => {
    const src = component(`  return (<div>{flag ? <>${NUMBER_FIELD}${SWITCH_CTL}</> : <>${SELECT_CTL}${INPUT_CTL}</>}</div>);`);
    expect(run(src)).toEqual([]);
  });
});

describe("form-factory-for-multifield — #620: the TRUE-POSITIVE arm is not weakened", () => {
  test("`&&` guards SUM — three guarded fields all render together, so it is still a hand-rolled form", () => {
    const src = component(`  return (<div>{a && ${NUMBER_FIELD}}{b && ${SWITCH_CTL}}{c && ${SELECT_CTL}}</div>);`);
    expect(tokens(run(src))).toEqual(["Probe (3 fields)"]);
  });

  test("SIBLING conditionals SUM — they are not arms of one switch", () => {
    const src = component(`  return (<div>{a ? ${NUMBER_FIELD} : null}{b ? ${SWITCH_CTL} : null}{c ? ${SELECT_CTL} : null}</div>);`);
    expect(tokens(run(src))).toEqual(["Probe (3 fields)"]);
  });

  test("collapsing arms does not EXEMPT a component — one fat arm carrying 3 fields still fires", () => {
    const src = component(
      `  switch (kind) {\n    case "a":\n      return ${NUMBER_FIELD};\n    default:\n      return (<div>${SWITCH_CTL}${SELECT_CTL}${INPUT_CTL}</div>);\n  }`,
    );
    expect(tokens(run(src))).toEqual(["Probe (3 fields)"]);
  });

  test("an exclusive branch's MAX ADDS to the fields rendered beside it", () => {
    const src = component(`  return (<div>{flag ? ${NUMBER_FIELD} : ${SWITCH_CTL}}${SELECT_CTL}${INPUT_CTL}</div>);`);
    expect(tokens(run(src))).toEqual(["Probe (3 fields)"]);
  });

  test("the plain 3-field hand-roll — the shape the gate was minted for — still fires", () => {
    const src = component(`  return (<div>${NUMBER_FIELD}${SWITCH_CTL}${SELECT_CTL}</div>);`);
    expect(tokens(run(src))).toEqual(["Probe (3 fields)"]);
  });
});

describe("form-factory-for-multifield — #620: scope boundaries the collapse must respect", () => {
  test("a nested render callback is its OWN scope — its fields do not join the parent's count", () => {
    // `.map(item => <Input/>)` has always counted as its own component here (nearest enclosing function).
    const src = component(`  return (<div>{items.map((item) => (<div>${NUMBER_FIELD}${SWITCH_CTL}${SELECT_CTL}</div>))}${INPUT_CTL}</div>);`);
    // The callback itself carries 3 concurrent fields and fires; the outer Probe carries 1 and does not.
    expect(tokens(run(src))).toEqual(["<anonymous> (3 fields)"]);
  });

  test("a file importing an editor factory is exempt whatever the shape", () => {
    const src = `import { createSavedEntityForm } from "#forms/editor";\nconst use = createSavedEntityForm({});\n${component(`  return (<div>${NUMBER_FIELD}${SWITCH_CTL}${SELECT_CTL}</div>);`)}`;
    expect(run(src)).toEqual([]);
  });
});

describe("form-factory-for-multifield — the count is reachable through the real descriptor", () => {
  test("the gate still subscribes through visitFile and reports a component-named token", () => {
    // A guard against the pin drifting into testing a helper instead of the gate: the token shape the
    // report carries is part of the contract (the component name + concurrent count).
    const src = component(`  return (<div>${NUMBER_FIELD}${SWITCH_CTL}${SELECT_CTL}</div>);`);
    const finding = run(src)[0];
    expect(finding?.token).toBe("Probe (3 fields)");
    expect(gate.scanRoot?.("packages/client/src/features/x/probe.tsx")).toBe(true);
    expect(SyntaxKind.SwitchStatement).toBeDefined();
  });
});
