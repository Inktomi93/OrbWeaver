// The typed arms of `orb/no-raw-id`: a field, parameter or variable whose id name stands for a brand but is declared
// `string`, and a plain-string `useState` fed a brand. The brand table comes from the planted program's own aliases.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { Linter } from "eslint";
import ts from "typescript";
import tseslint from "typescript-eslint";
import { rawIdRule } from "../../tooling/src/eslint/raw-id.ts";

const RULE = "orb/no-raw-id";
const FILE = "packages/server/src/domain/probe/verbs/probe.ts";
const KIT = "packages/kit/src/ids/index.ts";
const CONTRACT = "packages/contracts/src/probe.ts";

const KIT_SOURCE = [
  "declare const brand: unique symbol;",
  "export type Branded<B extends string> = string & { readonly [brand]: B };",
  "export type TypeIdOf<P extends string> = Branded<P>;",
  'export type ChatId = TypeIdOf<"chat">;',
  'export type ChatTurnId = TypeIdOf<"chat_turn">;',
  'export type UserId = Branded<"UserId">;',
  'export type CharacterId = TypeIdOf<"character">;',
  "export type SandboxWireId<Id extends Branded<string>> = Id extends string ? string : never;",
  "export function castId<T extends Branded<string>>(raw: string): T {",
  "  return raw as T;",
  "}",
].join("\n");

// Brands a package declares beside its schema, which only the program can name.
const CONTRACT_SOURCE = [
  `import type { Branded } from "${relative(dirname(CONTRACT), KIT)}";`,
  'export type ProviderId = Branded<"ProviderId">;',
  'export type AgentSdkSessionId = Branded<"AgentSdkSessionId">;',
  "export type WidgetId = string;",
  'type LocalProbeId = Branded<"LocalProbeId">;',
  "export const local: LocalProbeId | null = null;",
].join("\n");

const preamble = (file: string): string => {
  const from = (target: string): string => relative(dirname(file), target);
  return [
    `import type { ChatId, SandboxWireId } from "${from(KIT)}";`,
    "declare const raw: string;",
    "declare const id: ChatId;",
    "declare function useState<S>(initial: S): [S, (next: S) => void];",
    "declare function useState<S = undefined>(): [S | undefined, (next: S | undefined) => void];",
    "export type Keep = SandboxWireId<ChatId>;",
    "export const seen = [raw, id];",
  ].join("\n");
};

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
  const text = `${preamble(FILE)}\n${source}`;
  for (const [path, body] of [
    [KIT, KIT_SOURCE],
    [CONTRACT, CONTRACT_SOURCE],
    [FILE, text],
  ] as const) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), body);
  }
  const program = ts.createProgram({ rootNames: [KIT, CONTRACT, FILE].map((path) => join(root, path)), options });
  const found = new Linter({ cwd: root }).verify(
    text,
    {
      files: ["**/*.ts"],
      plugins: { orb: { rules: { "no-raw-id": rawIdRule } } },
      languageOptions: { parser: tseslint.parser, parserOptions: { programs: [program], project: false, projectService: false } },
      rules: { [RULE]: "error" },
    },
    { filename: join(root, FILE) },
  );
  expect(found.filter(({ fatal }) => fatal === true)).toEqual([]);
  return found.map(({ message }) => message);
}

test.for([
  { name: "an interface field", source: "export interface Row { readonly chatId: string }", found: "ChatId" },
  { name: "an optional nullable field", source: "export interface Row { chatId?: string | null }", found: "ChatId" },
  { name: "a readonly list field", source: "export interface Row { readonly chatIds: readonly string[] }", found: "ChatId" },
  { name: "a generic list field", source: "export interface Row { readonly chatIds: ReadonlySet<string> }", found: "ChatId" },
  { name: "a type literal field", source: "export type Row = { readonly chatId: string };", found: "ChatId" },
  { name: "a parameter", source: "export function open(chatId: string): string {\n  return chatId;\n}", found: "ChatId" },
  { name: "a function type parameter", source: "export type Open = (chatId: string) => void;", found: "ChatId" },
  { name: "a class field", source: "export class Holder {\n  chatId: string = raw;\n}", found: "ChatId" },
  { name: "an annotated variable", source: "export const chatId: string = raw;", found: "ChatId" },
  { name: "an owner is a user", source: "export interface Row { readonly ownerId: string }", found: "UserId" },
  { name: "a qualified name keeps its brand", source: "export interface Row { readonly speakerCharacterId: string }", found: "CharacterId" },
  { name: "a brand declared beside its schema", source: "export interface Row { readonly providerId: string }", found: "ProviderId" },
  {
    name: "a stem that leaves off the brand's qualifier",
    source: "export interface Row { readonly sdkSessionId: string }",
    found: "AgentSdkSessionId",
  },
  {
    name: "a state annotated as a string and set to a brand",
    source: 'const [a, setA] = useState<string>("");\nsetA(id);\nexport const b = a;',
    found: "useState",
  },
  { name: "a nullable state seeded with a brand", source: "const [a] = useState<string | null>(id);\nexport const b = a;", found: "useState" },
  { name: "an inferred string state set to a brand", source: 'const [a, setA] = useState("");\nsetA(id);\nexport const b = a;', found: "useState" },
  { name: "a brand its module keeps private", source: "export interface Row { readonly localProbeId: string }", found: "LocalProbeId" },
  // Controls: the shapes the rule must leave alone.
  { name: "a branded field", source: "export interface Row { readonly chatId: ChatId }", found: null },
  { name: "a sandbox wire id", source: "export interface Row { readonly chatId: SandboxWireId<ChatId> }", found: null },
  { name: "a one-word stem is not the qualified brand", source: "export interface Row { readonly turnId: string }", found: null },
  { name: "an id with no brand", source: "export interface Row { readonly surfaceId: string }", found: null },
  { name: "an exported plain alias is no brand", source: "export interface Row { readonly widgetId: string }", found: null },
  { name: "a union with another type", source: "export interface Row { readonly chatId: string | number }", found: null },
  { name: "an unannotated binding takes its source's type", source: "export const { chatId } = { chatId: raw };", found: null },
  { name: "a branded state", source: "const [a, setA] = useState<ChatId | null>(null);\nsetA(id);\nexport const b = a;", found: null },
  { name: "a string state fed strings", source: 'const [a, setA] = useState<string>("");\nsetA(raw);\nexport const b = a;', found: null },
])("the raw-id rule reports $name", ({ source, found }, { scratch }) => {
  const messages = lint(scratch, source);
  expect(messages).toHaveLength(found === null ? 0 : 1);
  expect(messages.every((message) => message.includes(found ?? ""))).toBe(true);
});
