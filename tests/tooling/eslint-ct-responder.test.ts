// orb/ct-responder-reads-input judges every route map the checker names for routeTrpc and defineTrpcRoutes, written in
// the call, bound to a variable, spread in, or typed as TrpcRoutes: a responder answers the request it is given, or is
// a kit marker, or its procedure takes no input.
import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { ESLint, Linter } from "eslint";
import ts from "typescript";
import tseslint from "typescript-eslint";
import { beforeAll } from "vitest";

const ROOT = join(import.meta.dirname, "../..");
const RULE = "orb/ct-responder-reads-input";
const SPEC = "tests/client/features/probe/route-probe.ct.tsx";
const eslint = new ESLint({ flags: ["unstable_native_nodejs_ts_config"], cwd: ROOT });

beforeAll(async () => {
  await eslint.calculateConfigForFile(join(ROOT, SPEC));
}, 120_000);

// The router record and the route-map types of the route helper, over two procedures: one takes a request, one takes none.
const PRELUDE = `
interface Procedure<I, O> { readonly _def: { readonly $types: { readonly input: I; readonly output: O } } }
type AppRouterRecord = { a: { list: Procedure<{ id: string }, readonly string[]>; ping: Procedure<void, string> } };
interface Outputs { "a.list": readonly string[]; "a.ping": string }
interface Inputs { "a.list": { id: string }; "a.ping": undefined }
type Path = keyof Outputs;
interface TrpcHoldMarker { readonly requested: Promise<void>; release(data: unknown): void }
interface TrpcErrorMarker { readonly code: string }
declare function trpcError(options?: { code?: string }): TrpcErrorMarker;
declare function trpcHold(): TrpcHoldMarker;
type Response<P extends Path> = Outputs[P] | TrpcHoldMarker | TrpcErrorMarker;
type Responder<P extends Path> = Response<P> | ((input: Inputs[P]) => Response<P>);
type TrpcRoutes<P extends Path = never> = [P] extends [never] ? { [K in Path]?: Responder<K> } : { [K in P]-?: Responder<K> };
type Routes<R> = { readonly [K in keyof R]: K extends Path ? Responder<K> : never };
declare function routeTrpc<const R extends object>(page: unknown, routes: R & Routes<NoInfer<R>>): Promise<void>;
declare function defineTrpcRoutes<const R extends object>(routes: R & Routes<NoInfer<R>>): R;
declare const page: unknown;
`;

// A one-file program: the rule needs the route types, not the repo graph.
function programFor(fileName: string, source: string): ts.Program {
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2024,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    jsx: ts.JsxEmit.Preserve,
    strict: true,
    skipLibCheck: true,
    types: [],
    noEmit: true,
  };
  const host = ts.createCompilerHost(options, true);
  const read = host.getSourceFile.bind(host);
  host.getSourceFile = (name, version, onError, create): ts.SourceFile | undefined =>
    name === fileName ? ts.createSourceFile(name, source, version, true) : read(name, version, onError, create);
  const exists = host.fileExists.bind(host);
  host.fileExists = (name): boolean => name === fileName || exists(name);
  const readFile = host.readFile.bind(host);
  host.readFile = (name): string | undefined => (name === fileName ? source : readFile(name));
  return ts.createProgram([fileName], options, host);
}

async function findings(body: string, header = "", spec = SPEC): Promise<readonly Linter.LintMessage[]> {
  const fileName = join(ROOT, spec);
  const source = `${header}${PRELUDE}\nexport async function probe(): Promise<void> {\n${body}\n}\n`;
  const config = await eslint.calculateConfigForFile(fileName);
  const found = new Linter({ cwd: ROOT }).verify(
    source,
    {
      files: ["**/*.{ts,tsx}"],
      plugins: config?.plugins ?? {},
      languageOptions: {
        parser: tseslint.parser,
        parserOptions: { project: false, projectService: false, programs: [programFor(fileName, source)], ecmaFeatures: { jsx: true } },
      },
      linterOptions: { reportUnusedDisableDirectives: "error" },
      rules: { [RULE]: config?.rules?.[RULE] ?? "off" },
    },
    { filename: fileName },
  );
  expect(
    found.filter(({ fatal }) => fatal === true),
    body,
  ).toEqual([]);
  return found;
}

const VALUE_CONTAINERS = [
  ["dot member", "input.id"],
  ["computed member", 'input["id"]'],
  ["optional member", "input?.id"],
  ["optional computed member", 'input?.["id"]'],
  ["array", "[input.id]"],
  ["object value", "({ id: input.id })"],
  ["computed object key", "({ [input.id]: true })"],
  ["array spread", "[...[input.id]]"],
  ["object spread", "({ ...{ id: input.id } })"],
  // biome-ignore lint/suspicious/noTemplateCurlyInString: The fixture is template-expression source for the parser.
  ["template", "`prefix${input.id}`"],
  ["unary", "+input.id"],
  ["unary typeof", "typeof input.id"],
  ["unary negation", "!input.id"],
  ["binary", '"prefix" + input.id'],
  ["logical left", 'input.id || "fallback"'],
  ["logical right", "enabled || input.id"],
  ["logical and", 'input.id && "value"'],
  ["nullish", 'input.id ?? "fallback"'],
  ["nullish right", "enabled ?? input.id"],
  ["conditional predicate", 'input.id ? "a" : "b"'],
  ["conditional consequent", 'enabled ? input.id : "b"'],
  ["conditional alternate", 'enabled ? "a" : input.id'],
  ["sequence result", "(0, input.id)"],
  ["await", "await input.id"],
  ["as", "(input.id as string)"],
  ["satisfies", "(input.id satisfies string)"],
  ["non-null", "input.id!"],
  ["instantiation", "input.select<string>"],
  ["type assertion", "(<string>input.id)"],
  ["JSX element", "<span>{input.id}</span>"],
  ["JSX fragment", "<>{input.id}</>"],
  ["JSX attribute", "<span title={input.id} />"],
  ["JSX spread attribute", "<Widget {...{ title: input.id }} />"],
  ["JSX spread child", "<span>{...input.id}</span>"],
] as const;

const VALUE_USES = [
  ["unused binding", (value: string): string => `const unused = ${value}; return ["x"];`, 1],
  ["discarded expression", (value: string): string => `${value}; return ["x"];`, 1],
  ["returned binding", (value: string): string => `const observed = ${value}; return [String(observed)];`, 0],
  ["helper observation", (value: string): string => `console.log(${value}); return ["x"];`, 0],
] as const;

test.for(VALUE_CONTAINERS.flatMap(([name, value]) => VALUE_USES.map(([use, body, count]) => ({ name, use, body: body(value), count }))))(
  "immediate value use: $name, $use",
  async ({ name, body, count }) => {
    const spec = name === "type assertion" ? SPEC.replace(".ct.tsx", ".test.ts") : SPEC;
    const source = `const enabled = true; await routeTrpc(page, { "a.list": async (input: { id: string; select: <T>() => T }) => { ${body} } });`;
    expect((await findings(source, "", spec)).filter(({ ruleId }) => ruleId === RULE)).toHaveLength(count);
  },
);

const BINDING_CONTAINERS = [
  ["array default", "const [observed = input.id] = [];"],
  ["object default", "const { value: observed = input.id } = {};"],
  ["computed destructuring key", "const { [input.id]: observed } = {};"],
] as const;
const BINDING_USES = [
  ["unused", 'return ["x"];', 1],
  ["returned", "return [String(observed)];", 0],
  ["helper observed", 'console.log(observed); return ["x"];', 0],
] as const;

test.for(BINDING_CONTAINERS.flatMap(([name, declaration]) => BINDING_USES.map(([use, statement, count]) => ({ name, use, declaration, statement, count }))))(
  "immediate binding value: $name, $use",
  async ({ declaration, statement, count }) => {
    const source = `await routeTrpc(page, { "a.list": input => { ${declaration} ${statement} } });`;
    expect((await findings(source)).filter(({ ruleId }) => ruleId === RULE)).toHaveLength(count);
  },
);

const OBSERVED_BRANCHES = [
  ["logical call", "input.id && console.log('observed')"],
  ["logical new", "input.id || new Error('observed')"],
  ["logical assignment", "input.id && (observed = true)"],
  ["logical update", "input.id && observed++"],
  ["conditional call", "input.id ? console.log('yes') : console.log('no')"],
  ["conditional nested call", "input.id ? [console.log('yes')] : []"],
  ["conditional new", "input.id ? new Error('yes') : null"],
  ["conditional assignment", "input.id ? (observed = true) : (observed = false)"],
  ["conditional update", "input.id ? observed++ : observed--"],
] as const;

test.for(OBSERVED_BRANCHES)("immediate branch observation: %s", async ([, expression]) => {
  const source = `let observed = 0; await routeTrpc(page, { "a.list": input => { const unused = ${expression}; return ["x"]; } });`;
  expect(await findings(source)).toEqual([]);
});

test.for([
  ["an unused conditional callback", "const unused = input.id ? () => console.log('yes') : () => console.log('no');", 1],
  ["an unused logical callback", "const unused = input.id && (() => console.log('yes'));", 1],
  ["a for initializer", "for (input.id; false;) {}", 1],
  ["a for update", "for (; false; input.id) {}", 1],
  ["an unused for declaration", "for (const unused = input.id; false;) {}", 1],
  ["a used for declaration", "for (const observed = input.id; observed;) { break; }", 0],
  ["a for test", "for (; input.id;) { break; }", 0],
  ["an if test", "if (input.id) console.log('yes');", 0],
  ["a switch discriminant", "switch (input.id) { case 'yes': break; }", 0],
  ["a while test", "while (input.id) { break; }", 0],
  ["a do-while test", "do { break; } while (input.id);", 0],
  ["iteration input", "for (const char of input.id) console.log(char);", 0],
  ["a thrown value", "throw input.id;", 0],
  ["a call argument", "console.log(input.id);", 0],
  ["an optional call", "input.id?.toLowerCase();", 0],
  ["a dynamic import", "void import(input.id);", 0],
  ["a call receiver", "input.id.toLowerCase();", 0],
  ["a new argument", "new Error(input.id);", 0],
  // biome-ignore lint/suspicious/noTemplateCurlyInString: The fixture is tagged-template source for the parser.
  ["a tagged template", "tag`value${input.id}`;", 0],
  ["an assignment", "observed = input.id;", 0],
  ["an update", "input.id++;", 0],
  ["a rest assignment", "[...input.values] = [];", 0],
  ["a deletion", "delete input.id;", 0],
] as const)("immediate observation role: %s", async ([, statement, count]) => {
  const source = `let observed; await routeTrpc(page, { "a.list": input => { ${statement} return ["x"]; } });`;
  expect((await findings(source)).filter(({ ruleId }) => ruleId === RULE)).toHaveLength(count);
});

test.for([
  ["unused arrow", "const unused = () => input.id;", 1],
  ["unused function expression", "const unused = function () { return input.id; };", 1],
  ["unused function declaration", "function unused() { return input.id; }", 1],
  ["unused effectful closure", "const unused = () => console.log(input.id);", 1],
  ["filter callback", 'const selected = ["x"].filter(value => value === input.id); return selected;', 0],
  ["block filter callback", 'const selected = ["x"].filter(value => { return value === input.id; }); return selected;', 0],
  ["direct invocation", "(() => console.log(input.id))();", 0],
  ["named invocation", "function observe() { console.log(input.id); } observe();", 0],
  ["returned local closure", "const make = () => () => input.id; console.log(make());", 0],
] as const)("deferred local value: %s", async ([, statement, count]) => {
  const source = `await routeTrpc(page, { "a.list": input => { ${statement} return ["x"]; } });`;
  expect((await findings(source)).filter(({ ruleId }) => ruleId === RULE)).toHaveLength(count);
});

test("a yielded input is observed outside the generator", async () => {
  expect(await findings('await routeTrpc(page, { "a.list": function* (input) { yield input.id; return ["x"]; } });')).toEqual([]);
});

test.for([
  [
    "a fixed responder factory",
    `const always = (rows: readonly string[]) => (_input: { id: string }) => rows; await routeTrpc(page, { "a.list": always(["x"]) });`,
    1,
  ],
  ["a named function ignoring input", `function answer(_input: { id: string }) { return ["x"]; } await routeTrpc(page, { "a.list": answer });`, 1],
  ["a discarded comma operand", `await routeTrpc(page, { "a.list": input => (input, ["x"]) });`, 1],
  ["a dead array initializer", `await routeTrpc(page, { "a.list": input => { const unused = [input.id]; return ["x"]; } });`, 1],
  ["a dead unary initializer", `await routeTrpc(page, { "a.list": input => { const unused = +input.id; return ["x"]; } });`, 1],
  ["a dead nested object initializer", `await routeTrpc(page, { "a.list": input => { const unused = { values: [+input.id] }; return ["x"]; } });`, 1],
  ["a dead binary initializer", `await routeTrpc(page, { "a.list": input => { const unused = "prefix" + input.id; return ["x"]; } });`, 1],
  ["a dead alias", `await routeTrpc(page, { "a.list": input => { const unused = input; return ["x"]; } });`, 1],
  ["a computed typed key", `const key = "a.list"; const reads: TrpcRoutes<"a.list"> = { [key]: ["x"] }; void reads;`, 1],
  ["a typed wrapper receiving an untyped map", `function wrap(reads: TrpcRoutes) { return reads; } const reads = { "a.list": ["x"] }; wrap(reads);`, 1],
  ["a fixed array for a procedure that takes a request", `await routeTrpc(page, { "a.list": ["x"] });`, 1],
  ["a responder that ignores the request", `await routeTrpc(page, { "a.list": () => ["x"] });`, 1],
  ["a responder whose parameter is never read", `await routeTrpc(page, { "a.list": (_request) => ["x"] });`, 1],
  ["a responder that only names its parameter with void", `await routeTrpc(page, { "a.list": (request) => {\n void request;\n return ["x"];\n } });`, 1],
  ["a responder that only names its parameter as a statement", `await routeTrpc(page, { "a.list": (request) => {\n request;\n return ["x"];\n } });`, 1],
  ["fixed data handed over by name", `const rows = ["x"];\n await routeTrpc(page, { "a.list": rows });`, 1],
  ["a map bound to a variable", `const reads = { "a.list": () => ["x"] };\n await routeTrpc(page, reads);`, 1],
  ["a map spread into the call", `const base = { "a.list": ["x"] };\n await routeTrpc(page, { ...base });`, 1],
  ["a map handed to defineTrpcRoutes by name", `const map = { "a.list": ["x"] };\n defineTrpcRoutes(map);`, 1],
  ["a map typed as TrpcRoutes with no call", `const reads: TrpcRoutes<"a.list"> = { "a.list": ["x"] };\n void reads;`, 1],
  ["a map returned as TrpcRoutes", `function reads(): TrpcRoutes<"a.list"> {\n return { "a.list": () => ["x"] };\n }\n void reads;`, 1],
  ["the defineTrpcRoutes door", `defineTrpcRoutes({ "a.list": () => [] });`, 1],
  ["an unconditional trpcError value", `await routeTrpc(page, { "a.ping": trpcError() });`, 1],
  ["an unconditional trpcError from a responder", `await routeTrpc(page, { "a.ping": () => trpcError({ code: "NOT_FOUND" }) });`, 1],
  ["a trpcError held in a const", `const refused = trpcError();\n await routeTrpc(page, { "a.ping": refused });`, 1],
  ["a trpcError held in a const and returned", `const refused = trpcError();\n await routeTrpc(page, { "a.ping": () => refused });`, 1],
  [
    "a refusal on both branches of a ternary",
    `await routeTrpc(page, { "a.list": ({ id }) => (id === "x" ? trpcError() : trpcError({ code: "NOT_FOUND" })) });`,
    1,
  ],
  ["each fixed route of one map", `await routeTrpc(page, { "a.list": () => [], "a.ping": () => trpcError() });`, 2],
] as const)("native responder wall refuses: %s", async ([, body, count]) => {
  expect((await findings(body)).filter(({ ruleId }) => ruleId === RULE)).toHaveLength(count);
});

test.for([
  ["a comma expression retaining the input", `await routeTrpc(page, { "a.list": input => (0, [input.id]) });`],
  ["a computed typed key reading input", `const key = "a.list"; const reads: TrpcRoutes<"a.list"> = { [key]: input => [input.id] }; void reads;`],
  [
    "a typed wrapper receiving a request-aware map",
    `function wrap(reads: TrpcRoutes) { return reads; } const reads = { "a.list": (input: { id: string }) => [input.id] }; wrap(reads);`,
  ],
  ["a named function reading input", `function answer(input: { id: string }) { return [input.id]; } await routeTrpc(page, { "a.list": answer });`],
  ["an observed computed key", `await routeTrpc(page, { "a.list": input => Object.keys({ [input.id]: true }) });`],
  ["a returned array alias", `await routeTrpc(page, { "a.list": input => { const rows = [input.id]; return rows; } });`],
  ["a returned unary composition", `await routeTrpc(page, { "a.list": input => [String(+input.id)] });`],
  [
    "an observed composed alias",
    `function observe(value: object): void { console.log(value); } await routeTrpc(page, { "a.list": input => { const value = { values: [+input.id] }; observe(value); return ["x"]; } });`,
  ],
  [
    "a helper receiving input",
    `function observe(input: { id: string }): void { console.log(input); } await routeTrpc(page, { "a.list": input => { observe(input); return ["x"]; } });`,
  ],
  ["a live alias", `await routeTrpc(page, { "a.list": input => { const alias = input; return [alias.id]; } });`],
  ["a request-aware factory", `const select = () => (input: { id: string }) => [input.id]; await routeTrpc(page, { "a.list": select() });`],
  ["a responder that reads the request", `await routeTrpc(page, { "a.list": ({ id }) => [id] });`],
  ["a procedure that takes no request", `await routeTrpc(page, { "a.ping": () => "pong" });`],
  ["a failure that depends on the request", `await routeTrpc(page, { "a.list": ({ id }) => (id === "dead" ? trpcError() : ["y"]) });`],
  ["a counted failure on a procedure that takes no request", `let n = 0;\n await routeTrpc(page, { "a.ping": () => (n++ === 0 ? trpcError() : "pong") });`],
  ["a hold handed over by name", `const hold = trpcHold();\n await routeTrpc(page, { "a.list": hold });`],
  ["a responder function handed over by name", `const respond = (request: { id: string }) => [request.id];\n await routeTrpc(page, { "a.list": respond });`],
  ["a map bound to a variable that reads the request", `const reads = { "a.list": ({ id }: { id: string }) => [id] };\n await routeTrpc(page, reads);`],
  ["a map spread into the call that reads the request", `const base = { "a.list": ({ id }: { id: string }) => [id] };\n await routeTrpc(page, { ...base });`],
  ["a typed map that reads the request", `const reads: TrpcRoutes<"a.list"> = { "a.list": ({ id }) => [id] };\n void reads;`],
  ["a refusal beside a hold", `const hold = trpcHold();\n await routeTrpc(page, { "a.list": ({ id }) => (id === "dead" ? trpcError() : hold) });`],
  ["an object that is not a route map", `const other = { "a.list": ["x"] };\n void other;`],
] as const)("native responder wall admits: %s", async ([, body]) => {
  expect(await findings(body)).toEqual([]);
});

test("a file header names the exception and its reason, and a stale one is refused", async () => {
  const header = `/* eslint-disable ${RULE} -- the subject is the route helper itself */\n`;
  expect(await findings(`await routeTrpc(page, { "a.list": ["x"] });`, header)).toEqual([]);
  expect(await findings(`await routeTrpc(page, { "a.list": ({ id }) => [id] });`, header)).toMatchObject([
    { ruleId: null, message: expect.stringContaining("Unused eslint-disable directive") },
  ]);
});
