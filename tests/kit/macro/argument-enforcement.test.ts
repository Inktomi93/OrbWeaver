import type { MacroDiagnostic, MacroMetadata, ProcessMacroOptions } from "@orb/kit/macro";
import { createDefaultRegistry, processMacros } from "@orb/kit/macro";
import { expect, test } from "@orb/testkit/node/fixtures.ts";

const OPTIONS = { char: "Alice", user: "Bob", persona: "Hero", scenario: "A quest", env: {} };

interface RenderResult {
  readonly output: string;
  readonly diagnostics: MacroDiagnostic[];
}

interface RegisteredExtension {
  readonly calls: string[][];
  readonly render: (text: string, options?: Partial<ProcessMacroOptions>) => RenderResult;
}

function extension(metadata: Partial<MacroMetadata> = {}): RegisteredExtension {
  const registry = createDefaultRegistry();
  const calls: string[][] = [];
  registry.register(
    "typed",
    (args) => {
      calls.push([...args]);
      return args.join("|");
    },
    {
      metadata: {
        name: "typed",
        description: "Typed extension",
        category: "system",
        args: [
          { name: "label", type: "string", optional: false },
          { name: "count", type: "number", optional: false },
          { name: "loud", type: "boolean", optional: true },
        ],
        returnType: "string",
        aliases: [],
        variadic: false,
        ...metadata,
      },
    },
  );
  function render(text: string, options: Partial<ProcessMacroOptions> = {}): RenderResult {
    const diagnostics: MacroDiagnostic[] = [];
    const output = processMacros(text, { ...OPTIONS, ...options, diagnostics }, registry);
    return { output, diagnostics };
  }
  return { render, calls };
}

test.for(["3", "1e3", "-1.5", ""])("valid numeric text %s reaches the registered handler", (count) => {
  const { render, calls } = extension();
  expect(render(`{{typed::hi::${count}::OFF}}`, { strictArgs: true })).toEqual({ output: `hi|${count}|OFF`, diagnostics: [] });
  expect(calls).toEqual([["hi", count, "OFF"]]);
});

test.for(["true", "false", "on", "OFF", "0", "1", ""])("boolean vocabulary %s reaches the registered handler", (value) => {
  const { render, calls } = extension();
  const argument = value === "" ? "{{noop}}" : value;
  expect(render(`{{typed::hi::3::${argument}}}`, { strictArgs: true })).toEqual({ output: `hi|3|${value}`, diagnostics: [] });
  expect(calls).toEqual([["hi", "3", value]]);
});

test("optional absence and delayed arguments retain their declared delivery semantics", () => {
  const { render, calls } = extension();
  expect(render("{{typed::hi::3}}", { strictArgs: true })).toEqual({ output: "hi|3", diagnostics: [] });
  expect(render("{{?typed::hi::{{roll::1d6}}}}", { strictArgs: true })).toEqual({ output: "hi|{{roll::1d6}}", diagnostics: [] });
  expect(calls).toEqual([
    ["hi", "3"],
    ["hi", "{{roll::1d6}}"],
  ]);
});

test.for([
  { call: "{{typed::hi::soon}}", output: "hi|soon", code: "bad-arg-type", message: '{{typed}} arg #2 (count) expects number, got "soon"' },
  { call: "{{typed::hi::Infinity}}", output: "hi|Infinity", code: "bad-arg-type", message: '{{typed}} arg #2 (count) expects number, got "Infinity"' },
  { call: "{{typed::hi::3::maybe}}", output: "hi|3|maybe", code: "bad-arg-type", message: '{{typed}} arg #3 (loud) expects boolean, got "maybe"' },
  { call: "{{typed::hi}}", output: "hi", code: "bad-arity", message: "{{typed}} expects at least 2 argument(s), got 1" },
  { call: "{{typed::hi::3::true::1}}", output: "hi|3|true|1", code: "bad-arity", message: "{{typed}} takes at most 3 argument(s), got 4" },
])("strict refuses and lenient invokes $call with positional diagnostics", ({ call, output, code, message }) => {
  const { render, calls } = extension();
  const text = `line one\n[${call}]`;
  const span = { offset: 10, line: 2, col: 2, length: call.length };
  expect(render(text, { strictArgs: true })).toEqual({ output: "line one\n[]", diagnostics: [{ code, message, span, severity: "error" }] });
  expect(calls).toEqual([]);
  const lenient = render(text);
  expect(lenient.diagnostics).toEqual([{ code, message, span, severity: "warning" }]);
  expect(calls).toHaveLength(1);
  expect(lenient.output).toBe(`line one\n[${output}]`);
});

test("optional defaults and per-macro strictness reach the evaluator under a lenient context", () => {
  const { render, calls } = extension({
    strict: true,
    args: [
      { name: "count", type: "number", optional: false },
      { name: "loud", type: "boolean", optional: true, default: "off" },
    ],
  });
  expect(render("{{typed::5}}")).toEqual({ output: "5|off", diagnostics: [] });
  expect(calls).toEqual([["5", "off"]]);
  expect(render("{{typed::5::on}}")).toEqual({ output: "5|on", diagnostics: [] });
  expect(calls).toEqual([
    ["5", "off"],
    ["5", "on"],
  ]);
  const refused = render("[{{typed::soon}}]");
  expect(refused.output).toBe("[]");
  expect(refused.diagnostics).toMatchObject([{ severity: "error", code: "bad-arg-type" }]);
  expect(calls).toEqual([
    ["5", "off"],
    ["5", "on"],
  ]);
});

test("variadic list bounds enforce both ends and validate the tail type", () => {
  const { render, calls } = extension({ args: [{ name: "option", type: "number", optional: true }], variadic: true, list: { min: 2, max: 3 } });
  expect(render("{{typed::1::2}}", { strictArgs: true })).toEqual({ output: "1|2", diagnostics: [] });
  expect(render("{{typed::1::2::3}}", { strictArgs: true })).toEqual({ output: "1|2|3", diagnostics: [] });
  for (const { call, output, code } of [
    { call: "{{typed::1}}", output: "1", code: "bad-arity" },
    { call: "{{typed::1::2::3::4}}", output: "1|2|3|4", code: "bad-arity" },
    { call: "{{typed::1::2::soon}}", output: "1|2|soon", code: "bad-arg-type" },
  ]) {
    const strict = render(call, { strictArgs: true });
    expect(strict.output).toBe("");
    expect(strict.diagnostics).toMatchObject([{ severity: "error", code }]);
    const lenient = render(call);
    expect(lenient.output).toBe(output);
    expect(lenient.diagnostics).toMatchObject([{ severity: "warning", code }]);
  }
  expect(calls).toEqual([["1", "2"], ["1", "2", "3"], ["1"], ["1", "2", "3", "4"], ["1", "2", "soon"]]);
});

test("scoped blocks exempt their body slot but still enforce explicit arity", () => {
  const registry = createDefaultRegistry();
  const diagnostics: MacroDiagnostic[] = [];
  const options = { ...OPTIONS, strictArgs: true, diagnostics, random: () => 0, env: { mood: "grim" } };
  expect(processMacros("{{char}}body{{/char}}|{{roll}}2d1{{/roll}}", options, registry)).toBe("Alice|2");
  expect(diagnostics).toEqual([]);
  expect(processMacros("[{{getvar::mood::extra}}body{{/getvar}}]", options, registry)).toBe("[]");
  expect(diagnostics).toMatchObject([{ severity: "error", code: "bad-arity" }]);
});

test("builtin list admission and non-variadic reads preserve lenient rendering", () => {
  const registry = createDefaultRegistry();
  const diagnostics: MacroDiagnostic[] = [];
  const options = { ...OPTIONS, diagnostics, random: () => 0, env: { mood: "grim" } };
  expect(processMacros("{{pick::a::b::c::d}}|{{getvar::mood}}", { ...options, strictArgs: true }, registry)).toBe("a|grim");
  expect(diagnostics).toEqual([]);
  expect(processMacros("{{getvar::mood::extra}}|{{pick}}", options, registry)).toBe("grim|");
  expect(diagnostics).toMatchObject([
    { severity: "warning", code: "bad-arity" },
    { severity: "warning", code: "bad-arity" },
  ]);
});
