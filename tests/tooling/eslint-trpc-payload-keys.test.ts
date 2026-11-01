// `orb/trpc-payload-declared-keys` refuses a tRPC call whose payload carries a key the procedure input does not
// declare: a typed value TypeScript admits structurally, which the strict input then refuses at the server.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { Linter } from "eslint";
import ts from "typescript";
import tseslint from "typescript-eslint";
import { trpcPayloadKeysRule } from "../../tooling/src/eslint/trpc-payload.ts";

const RULE = "orb/trpc-payload-declared-keys";
const FILE = "packages/client/src/features/probe/probe.ts";
const PROCEDURES = "packages/client/src/features/probe/procedures.ts";

const DECLARATIONS = [
  'export interface StartInput { readonly input: { readonly kind: string; readonly params: Record<string, unknown> }; readonly mode?: "bulk" | "singular"; readonly targetOwnerId?: string }',
  "export interface PatchInput { readonly chatId: string; readonly patch: { readonly name?: string; readonly tags?: readonly { readonly id: string }[] } }",
  "export declare const start: { mutate(input: StartInput): void; mutateAsync(input: StartInput): Promise<void> };",
  "export declare const patch: { mutate(input: PatchInput): void };",
  "export declare const list: { queryOptions(input: { readonly chatId: string } | typeof skip): unknown };",
  "export declare const skip: unique symbol;",
  "export interface MutationOptions<V> { readonly mutationKey: readonly unknown[]; readonly mutationFn?: (vars: V) => Promise<unknown> }",
  "export interface Trpc { readonly rule: { readonly test: { mutationOptions(): MutationOptions<{ readonly ruleId: string }> } } }",
  "export declare function createEntityMutation<V>(config: { readonly options: (trpc: Trpc) => MutationOptions<V> }): void;",
  "export declare function withProcedureInput<V, I>(base: MutationOptions<I>, input: (vars: V) => I): MutationOptions<V>;",
].join("\n");

const IMPORTS = 'import { createEntityMutation, list, patch, skip, start, withProcedureInput } from "./procedures.ts";';

function lint(root: string, source: string): readonly string[] {
  const options: ts.CompilerOptions = {
    strict: true,
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    allowImportingTsExtensions: true,
    noEmit: true,
    types: [],
  };
  mkdirSync(dirname(join(root, FILE)), { recursive: true });
  writeFileSync(join(root, PROCEDURES), DECLARATIONS);
  writeFileSync(join(root, FILE), `${IMPORTS}\n${source}`);
  const program = ts.createProgram({ rootNames: [join(root, PROCEDURES), join(root, FILE)], options });
  const found = new Linter({ cwd: root }).verify(
    `${IMPORTS}\n${source}`,
    {
      files: ["**/*.ts"],
      plugins: { orb: { rules: { "trpc-payload-declared-keys": trpcPayloadKeysRule } } },
      languageOptions: { parser: tseslint.parser, parserOptions: { programs: [program], project: false, projectService: false } },
      rules: { [RULE]: "error" },
    },
    { filename: join(root, FILE) },
  );
  expect(found.filter(({ fatal }) => fatal === true)).toEqual([]);
  return found.map(({ message }) => message);
}

test.for([
  {
    name: "a form value spread into the payload",
    source:
      'interface FormValues { readonly kind: string; readonly bulk: boolean; readonly targetOwnerId: string }\ndeclare const values: FormValues;\nconst scope = { input: { kind: values.kind, params: {} }, mode: "bulk" as const, ...values };\nstart.mutate(scope);',
    keys: ["`kind`", "`bulk`"],
  },
  {
    name: "a typed value passed whole",
    source:
      "declare const view: { readonly input: { readonly kind: string; readonly params: Record<string, unknown> }; readonly label: string };\nvoid start.mutateAsync(view);",
    keys: ["`label`"],
  },
  {
    name: "a nested field built from a view type",
    source: 'declare const draft: { readonly name: string; readonly preview: string };\npatch.mutate({ chatId: "c", patch: draft });',
    keys: ["`patch.preview`"],
  },
  {
    name: "an array element carrying a view key",
    source: 'declare const row: { readonly id: string; readonly label: string };\npatch.mutate({ chatId: "c", patch: { tags: [row] } });',
    keys: ["`patch.tags.label`"],
  },
  { name: "a fresh literal", source: 'start.mutate({ input: { kind: "index", params: {} }, mode: "singular" });', keys: [] },
  {
    name: "a value typed from the input",
    source: 'declare const scope: Pick<import("./procedures.ts").StartInput, "input" | "mode">;\nstart.mutate({ ...scope, targetOwnerId: "u" });',
    keys: [],
  },
  {
    name: "a view passed beside a skip token",
    source: "declare const view: { readonly chatId: string; readonly title: string } | null;\nlist.queryOptions(view === null ? skip : view);",
    keys: ["`title`"],
  },
  { name: "a conditional skip", source: "declare const chatId: string | null;\nlist.queryOptions(chatId === null ? skip : { chatId });", keys: [] },
  {
    name: "mutation variables carrying a cache scope key",
    source: "createEntityMutation<{ readonly ruleId: string; readonly chatId: string | null }>({ options: (trpc) => trpc.rule.test.mutationOptions() });",
    keys: ["`chatId`"],
  },
  {
    name: "mutation variables intersecting the input with a cache scope key",
    source: "createEntityMutation<{ readonly ruleId: string } & { readonly chatId: string | null }>({ options: (trpc) => trpc.rule.test.mutationOptions() });",
    keys: ["`chatId`"],
  },
  {
    name: "mutation variables that name their procedure input",
    source:
      "createEntityMutation<{ readonly ruleId: string; readonly chatId: string | null }>({ options: (trpc) => withProcedureInput(trpc.rule.test.mutationOptions(), (vars: { readonly ruleId: string; readonly chatId: string | null }) => ({ ruleId: vars.ruleId })) });",
    keys: [],
  },
  { name: "mutation variables equal to the input", source: "createEntityMutation({ options: (trpc) => trpc.rule.test.mutationOptions() });", keys: [] },
  {
    name: "an open params record",
    source: 'declare const params: { readonly force: boolean };\nstart.mutate({ input: { kind: "index", params } });',
    keys: [],
  },
])("the payload rule reports $name", ({ source, keys }, { scratch }) => {
  const messages = lint(scratch, source);
  expect(messages.length).toBe(keys.length === 0 ? 0 : 1);
  for (const key of keys) {
    expect(messages[0]).toContain(key);
  }
});
