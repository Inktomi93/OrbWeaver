// orb/ct-responder-reads-input judges the route maps of routeTrpc and defineTrpcRoutes: a responder answers the request it
// is given, or is a kit marker, or its procedure takes no input.
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

// The contextual typing routeTrpc gives a route value, over three procedures: one that takes a request, one that takes none.
const PRELUDE = `
interface Procs {
  "a.list": { input: { id: string }; output: readonly string[] };
  "a.ping": { input: void; output: string };
}
interface TrpcHoldMarker { readonly requested: Promise<void>; release(data: unknown): void }
interface TrpcErrorMarker { readonly code: string }
declare function trpcError(options?: { code?: string }): TrpcErrorMarker;
declare function trpcHold(): TrpcHoldMarker;
type Responder<P> = P extends { input: infer I; output: infer O }
  ? O | TrpcHoldMarker | TrpcErrorMarker | ((input: I extends void ? undefined : I) => O | TrpcHoldMarker | TrpcErrorMarker)
  : never;
type Routes<R> = { readonly [K in keyof R]: K extends keyof Procs ? Responder<Procs[K]> : never };
declare function routeTrpc<const R extends object>(page: unknown, routes: R & Routes<NoInfer<R>>): Promise<void>;
declare function defineTrpcRoutes<const R extends object>(routes: R & Routes<NoInfer<R>>): R;
declare const page: unknown;
`;

// A one-file program: the rule needs the contextual type of a route value, not the repo graph.
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

async function findings(body: string, header = ""): Promise<readonly Linter.LintMessage[]> {
  const fileName = join(ROOT, SPEC);
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

test.for([
  ["a fixed array for a procedure that takes a request", `await routeTrpc(page, { "a.list": ["x"] });`, 1],
  ["a responder that ignores the request", `await routeTrpc(page, { "a.list": () => ["x"] });`, 1],
  ["a responder whose parameter is never read", `await routeTrpc(page, { "a.list": (_request) => ["x"] });`, 1],
  ["fixed data handed over by name", `const rows = ["x"];\n await routeTrpc(page, { "a.list": rows });`, 1],
  ["the defineTrpcRoutes door", `defineTrpcRoutes({ "a.list": () => [] });`, 1],
  ["an unconditional trpcError value", `await routeTrpc(page, { "a.ping": trpcError() });`, 1],
  ["an unconditional trpcError from a responder", `await routeTrpc(page, { "a.ping": () => trpcError({ code: "NOT_FOUND" }) });`, 1],
  ["each fixed route of one map", `await routeTrpc(page, { "a.list": () => [], "a.ping": () => trpcError() });`, 2],
] as const)("native responder wall refuses: %s", async ([, body, count]) => {
  expect((await findings(body)).filter(({ ruleId }) => ruleId === RULE)).toHaveLength(count);
});

test.for([
  ["a responder that reads the request", `await routeTrpc(page, { "a.list": ({ id }) => [id] });`],
  ["a procedure that takes no request", `await routeTrpc(page, { "a.ping": () => "pong" });`],
  ["a failure that depends on the request", `await routeTrpc(page, { "a.list": ({ id }) => (id === "dead" ? trpcError() : ["y"]) });`],
  ["a counted failure on a procedure that takes no request", `let n = 0;\n await routeTrpc(page, { "a.ping": () => (n++ === 0 ? trpcError() : "pong") });`],
  ["a hold handed over by name", `const hold = trpcHold();\n await routeTrpc(page, { "a.list": hold });`],
  ["a responder function handed over by name", `const respond = (request: { id: string }) => [request.id];\n await routeTrpc(page, { "a.list": respond });`],
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
