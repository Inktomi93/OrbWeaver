// `pnpm brand-flow` over a planted tree: one case per class (mint, widen, re-narrow, missing, cross-brand), each with a
// control the scan must leave alone. The kit ids module is a stub at the real path; the scan reads brands from the checker.

import { join } from "node:path";
import { nonEmpty } from "@orb/testkit/iso";
import { expect, plantedTsconfig, test } from "@orb/testkit/tooling";
import { Linter } from "eslint";
import tseslint from "typescript-eslint";
import { scanBrandFlow } from "../../../tooling/src/brand-flow/index.ts";
import { optionalAlternativesRule } from "../../../tooling/src/eslint/optional-alternatives.ts";
import { JSX_NAMESPACE, LIB, WORLD } from "../unwired/_planted.ts";

const IDS = [
  "declare const brand: unique symbol;",
  "export type Branded<B extends string> = string & { readonly [brand]: B };",
  'export type ChatId = Branded<"ChatId">;',
  'export type PersonaId = Branded<"PersonaId">;',
  "export function castId<T extends Branded<string>>(raw: string): T {",
  "  return raw as T;",
  "}",
  "export interface Schema<T> { readonly parse: (value: string) => T }",
  "export declare function typeIdSchema(prefix: string): Schema<ChatId>;",
].join("\n");

const FLOW = [
  'import type { SdkReply } from "provider-sdk";',
  'import type { ChatId, PersonaId } from "../../kit/src/ids/index.ts";',
  'import { castId, typeIdSchema } from "../../kit/src/ids/index.ts";',
  "declare function useState<S>(initial: S): [S, (next: S) => void];",
  // mint: a literal, a parse schema, a raw parameter, a route param, a rebrand, an `as`
  'export const LITERAL = castId<ChatId>("chat_literal");',
  'export const SCHEMA = typeIdSchema("chat");',
  "export function fromParameter(raw: string): ChatId {",
  "  return castId<ChatId>(raw);",
  "}",
  "export function fromRoute(c: { req: { param: (name: string) => string } }): ChatId {",
  '  return castId<ChatId>(c.req.param("chatId"));',
  "}",
  "export function rebranded(persona: PersonaId): ChatId {",
  "  return castId<ChatId>(persona);",
  "}",
  "export function asBrand(raw: string): ChatId {",
  "  return raw as ChatId;",
  "}",
  // widen: a collection key, a port slot, a return, a cast to string; a brand slot and a template are controls
  "export function keyed(chat: ChatId): Map<string, number> {",
  "  const seen = new Map<string, number>();",
  "  seen.set(chat, 1);",
  "  return seen;",
  "}",
  "export interface RoomPort { readonly open: (chatId: string) => void }",
  "export function openRoom(port: RoomPort, chat: ChatId): void {",
  "  port.open(chat);",
  "}",
  "export function asText(chat: ChatId): string {",
  "  return chat;",
  "}",
  "export function stripped(chat: ChatId): string {",
  "  return chat as string;",
  "}",
  "export function openBranded(chat: ChatId): ChatId {",
  "  return chat satisfies ChatId;",
  "}",
  "export function display(chat: ChatId): number {",
  // biome-ignore lint/suspicious/noTemplateCurlyInString: planted source text, not a template of this file
  "  return `chat ${chat}`.length;",
  "}",
  // re-narrow: widened into state, cast back; and compared back
  "export function laundered(chat: ChatId): ChatId {",
  '  const [selected, setSelected] = useState<string>("");',
  "  setSelected(chat);",
  "  return castId<ChatId>(selected);",
  "}",
  "export function comparedBack(chat: ChatId): boolean {",
  "  const [held] = useState<string>(chat);",
  "  return held === chat;",
  "}",
  // cross-brand: a persona handed to a slot named for a chat
  "export function openChatSlot(chatId: string): string {",
  "  return chatId;",
  "}",
  "export function wrongKind(persona: PersonaId): string {",
  "  return openChatSlot(persona);",
  "}",
  // missing: an exact stem, a trailing-word stem, and a generic id with no brand
  "export interface Row {",
  "  readonly chatId: string;",
  "  readonly anchorPersonaId: string;",
  "  readonly memberId: string;",
  "  readonly typed: ChatId;",
  // the name measured against the type: a brand the name reads right, one it reads as another brand, one no name claims
  "  readonly ownerChatId: ChatId;",
  "  readonly personaId: ChatId;",
  "  readonly widgetId: ChatId;",
  // a brand only its declaration names, and a lookalike declared through a local generic that is no kit brand
  "  readonly gadgetId: string;",
  "  readonly fakeId: string;",
  "}",
  // the type over the name: a lookalike the code hands another brand, and a renamed string a persona flows into
  "export interface Reply {",
  "  readonly messageId: string;",
  "}",
  "export function reply(chat: ChatId): Reply {",
  "  return { messageId: chat };",
  "}",
  "export function renamed(persona: PersonaId): ChatId {",
  "  const key: string = persona;",
  "  return castId<ChatId>(key);",
  "}",
  // a production slot only a test hands a brand: the test is no evidence of what production holds there
  "export function openPersona(personaId: string): string {",
  "  return personaId;",
  "}",
  // a library's own handle under a brand's name, alone and beside the program's own values
  "export interface Echo {",
  "  readonly messageId: string;",
  "}",
  "export function echo(sdk: SdkReply): Echo {",
  "  return { messageId: sdk.messageId };",
  "}",
  "export interface Mixed {",
  "  readonly messageId: string;",
  "}",
  "export function mixed(sdk: SdkReply, raw: string): Mixed[] {",
  "  return [{ messageId: sdk.messageId }, { messageId: raw }];",
  "}",
  "export interface Tagged {",
  "  readonly messageId: string;",
  "}",
  "export function tagged(sdk: SdkReply): Tagged[] {",
  '  return [{ messageId: sdk.messageId }, { messageId: "m" }];',
  "}",
].join("\n");

const GADGET = ['import type { Branded } from "../../kit/src/ids/index.ts";', 'export type GadgetId = Branded<"GadgetId">;'].join("\n");
const FAKE = ["type Branded<T extends string> = string & { readonly fake: T };", 'export type FakeId = Branded<"FakeId">;'].join("\n");
const PROBE = [
  'import type { ChatId } from "../../kit/src/ids/index.ts";',
  'import { openPersona } from "../src/flow.ts";',
  "export function probe(chat: ChatId): string {",
  "  return openPersona(chat);",
  "}",
].join("\n");
const PROVIDER_SDK = "export interface SdkReply {\n  readonly messageId: string;\n}";

const TREE = {
  [WORLD]: plantedTsconfig({
    lib: LIB,
    include: ["src", "test", "../kit/src"],
    paths: { "provider-sdk": ["../../node_modules/provider-sdk/index.d.ts"] },
  }),
  "packages/kit/src/ids/index.ts": IDS,
  "packages/a/src/flow.ts": FLOW,
  "packages/a/src/gadget.ts": GADGET,
  "packages/a/src/fake.ts": FAKE,
  "packages/a/test/probe.ts": PROBE,
  "node_modules/provider-sdk/index.d.ts": PROVIDER_SDK,
};

const lineOf = (needle: string): number => FLOW.split("\n").findIndex((line) => line.includes(needle)) + 1;

// Every site in FLOW where the brand that flows in, or the declared brand, is not the brand the name stands for.
const BRAND_DISAGREEMENTS = [
  { line: lineOf("openChatSlot(chatId: string)"), kind: "declaration", name: "chatId", typed: ["PersonaId"], named: "ChatId" },
  { line: lineOf("readonly messageId: string"), kind: "declaration", name: "messageId", typed: ["ChatId"], named: "MessageId" },
  { line: lineOf("export interface Echo") + 1, kind: "declaration", name: "messageId", typed: [], named: "MessageId" },
  { line: lineOf("castId<ChatId>(selected)"), kind: "mint-operand", name: "selected", typed: ["ChatId"], named: null },
  { line: lineOf("castId<ChatId>(key)"), kind: "mint-operand", name: "key", typed: ["PersonaId"], named: null },
  { line: lineOf("held === chat"), kind: "compare-operand", name: "held", typed: ["ChatId"], named: null },
  { line: lineOf("readonly personaId: ChatId"), kind: "branded-declaration", name: "personaId", typed: ["ChatId"], named: "PersonaId" },
];

const flow = <T extends { readonly file: string }>(sites: readonly T[]): T[] => sites.filter(({ file }) => file === "packages/a/src/flow.ts");
const scanFlow = async (plantedTree: (files: Record<string, string>) => Promise<string>): Promise<ReturnType<typeof scanBrandFlow>> =>
  scanBrandFlow({ root: await plantedTree(TREE), worlds: [WORLD], log: () => undefined });
const SCAN = { timeout: 120_000 };

test("the brand-flow scan reports each mint with its class and shape", SCAN, async ({ plantedTree }) => {
  const report = await scanFlow(plantedTree);
  expect(flow(report.mints).map(({ line, via, mintClass, shape }) => ({ line, via, mintClass, shape }))).toEqual([
    { line: lineOf('castId<ChatId>("chat_literal")'), via: "castId", mintClass: "literal", shape: null },
    { line: lineOf("castId<ChatId>(raw)"), via: "castId", mintClass: "raw", shape: "parameter" },
    { line: lineOf('c.req.param("chatId")'), via: "castId", mintClass: "raw", shape: "http-param" },
    { line: lineOf("castId<ChatId>(persona)"), via: "castId", mintClass: "rebrand", shape: null },
    { line: lineOf("castId<ChatId>(selected)"), via: "castId", mintClass: "raw", shape: "variable" },
    { line: lineOf("castId<ChatId>(key)"), via: "castId", mintClass: "raw", shape: "variable" },
    { line: lineOf("raw as ChatId"), via: "as", mintClass: "raw", shape: "parameter" },
    { line: lineOf('typeIdSchema("chat")'), via: "typeIdSchema", mintClass: "parsed", shape: null },
  ]);
  expect(report.scanned.doubleCounted).toBe(0);
});

test("the brand-flow scan reports each widen with its slot and layer, and no brand slot or interpolation", SCAN, async ({ plantedTree }) => {
  const report = await scanFlow(plantedTree);
  expect(flow(report.widens).map(({ line, slot, layer }) => ({ line, slot: slot.name, layer }))).toEqual(
    expect.arrayContaining([
      { line: lineOf("seen.set(chat, 1)"), slot: "set(key)", layer: "library" },
      { line: lineOf("port.open(chat)"), slot: "open(chatId)", layer: "port" },
      { line: lineOf("return chat;"), slot: "asText() return", layer: "local" },
      { line: lineOf("chat as string"), slot: "as string", layer: "local" },
      { line: lineOf('useState<string>("")') + 1, slot: "setSelected (useState<string> setter)", layer: "client-state" },
    ]),
  );
  expect(nonEmpty(flow(report.widens)).some(({ line }) => line === lineOf("chat satisfies ChatId") || line === lineOf("return `chat"))).toBe(false);
});

test("the brand-flow scan joins each re-narrow to its widen", SCAN, async ({ plantedTree }) => {
  const report = await scanFlow(plantedTree);
  expect(flow(report.renarrows).map(({ line, how, proof }) => ({ line, how, proof }))).toEqual([
    { line: lineOf("castId<ChatId>(selected)"), how: "castId", proof: "slot-widened" },
    { line: lineOf("castId<ChatId>(key)"), how: "castId", proof: "slot-widened" },
    { line: lineOf("held === chat"), how: "compare", proof: "slot-widened" },
  ]);
});

test("the brand-flow scan names a missing brand by name, including a brand only its declaration names", SCAN, async ({ plantedTree }) => {
  const report = await scanFlow(plantedTree);
  expect(
    flow(report.missing)
      .filter(({ owner }) => owner === "Row")
      .map(({ name, brand, match }) => ({ name, brand, match })),
  ).toEqual([
    { name: "chatId", brand: "ChatId", match: "exact" },
    { name: "anchorPersonaId", brand: "PersonaId", match: "suffix" },
    { name: "gadgetId", brand: "GadgetId", match: "exact" },
  ]);
  // A lookalike declared through a local generic named `Branded` declares no brand.
  expect(report.generic.map(({ name }) => name)).toEqual(expect.arrayContaining(["memberId", "fakeId"]));
  expect(report.generic.map(({ name }) => name)).not.toContain("gadgetId");
});

test("the brand-flow scan reads a missing brand from what flows in before the name", SCAN, async ({ plantedTree }) => {
  const report = await scanFlow(plantedTree);
  const missing = flow(report.missing).map(({ owner, name, brand, match, provenance }) => ({ owner, name, brand, match, provenance }));
  expect(missing).toEqual(
    expect.arrayContaining([
      { owner: "Reply", name: "messageId", brand: "ChatId", match: "type", provenance: "measured" },
      // Only a test hands this production slot a brand, so its name answers.
      expect.objectContaining({ name: "personaId", brand: "PersonaId", match: "exact" }),
    ]),
  );
  expect(missing.filter(({ name }) => name === "personaId")).toHaveLength(1);
});

test("the brand-flow scan clears a library's handle only where library values are all that fill it", SCAN, async ({ plantedTree }) => {
  const report = await scanFlow(plantedTree);
  const owners = flow(report.missing)
    .filter(({ name }) => name === "messageId")
    .map(({ owner, brand, match }) => ({ owner, brand, match }));
  expect(owners).toEqual(
    expect.arrayContaining([
      { owner: "Mixed", brand: "MessageId", match: "exact" },
      { owner: "Tagged", brand: "MessageId", match: "exact" },
    ]),
  );
  expect(owners.map(({ owner }) => owner)).not.toContain("Echo");
});

test("the brand-flow scan reports each cross-brand flow", SCAN, async ({ plantedTree }) => {
  const report = await scanFlow(plantedTree);
  expect(flow(report.crossBrand).map(({ line, how }) => ({ line, how }))).toEqual(
    expect.arrayContaining([
      { line: lineOf("castId<ChatId>(persona)"), how: "rebrand" },
      { line: lineOf("openChatSlot(persona)"), how: "widen-into-named-slot" },
      { line: lineOf("castId<ChatId>(key)"), how: "fed-other-brand" },
    ]),
  );
});

test("the brand-flow scan lists every site where the type and the name answer differently", SCAN, async ({ plantedTree }) => {
  const answers = (await scanFlow(plantedTree)).brandAnswers;
  expect(flow(answers.disagreements).map(({ line, kind, name, typed, named }) => ({ line, kind, name, typed, named: named?.brand ?? null }))).toEqual(
    BRAND_DISAGREEMENTS,
  );
  expect({ agree: answers.agree, unnamed: answers.unnamed }).toEqual({ agree: 1, unnamed: 1 });
});

// A zod-like input shape in a contract: its `typeIdSchema` field takes `string` on the input side by design, its
// `z.string()` field is a real plain slot, and an array element has no declaration the scan can read.
const CONTRACT = [
  'import { typeIdSchema } from "../../kit/src/ids/index.ts";',
  "declare const z: { readonly string: () => string };",
  'const chatId = typeIdSchema("chat");',
  "export const shape = { chatId, note: z.string() };",
  "export type Input = { [K in keyof typeof shape]: string };",
].join("\n");

const WIRE_USE = [
  'import type { Input } from "../../contracts/src/inputs.ts";',
  'import type { ChatId } from "../../kit/src/ids/index.ts";',
  "export function send(value: Input): Input {",
  "  return value;",
  "}",
  "export function call(chat: ChatId): Input {",
  "  return send({ chatId: chat, note: chat });",
  "}",
  "export function listed(chat: ChatId): string[] {",
  "  return [chat];",
  "}",
  'import type { Service } from "./contract/service.ts";',
  "export function open(service: Service, chat: ChatId): void {",
  "  service.open(chat);",
  "}",
].join("\n");

// A module's own contract directory is a contract layer whatever the package.
const SERVICE = "export interface Service {\n  readonly open: (id: string) => void;\n}";

// A kind, status and role field typed string, set, tested and switched on with literals; a field typed as a literal union
// is no candidate.
const JOBS = [
  "export interface Job {",
  "  readonly status: string;",
  "  readonly kind: string;",
  '  readonly role: "a" | "b";',
  "}",
  'export const queued: Job = { status: "queued", kind: "build", role: "a" };',
  "export function finished(job: Job): number {",
  '  return job.status === "done" ? 1 : 0;',
  "}",
  "export function failed(job: Job): void {",
  "  switch (job.status) {",
  '    case "failed":',
  "      break;",
  "    default:",
  "      break;",
  "  }",
  "}",
].join("\n");

// A component prop takes a brand as a string, and its React `key` is a cache key the scan leaves alone.
const ROW = [
  'import type { ChatId } from "../../kit/src/ids/index.ts";',
  "declare function Row(props: { readonly seed: string }): JSX.Element;",
  "export function view(chat: ChatId): JSX.Element {",
  "  return <Row key={chat} seed={chat} />;",
  "}",
].join("\n");

const WIRE_TREE = {
  [WORLD]: plantedTsconfig({ lib: LIB, jsx: "preserve", include: ["src", "../kit/src", "../contracts/src"] }),
  "packages/a/src/jsx.d.ts": JSX_NAMESPACE,
  "packages/a/src/row.tsx": ROW,
  "packages/kit/src/ids/index.ts": IDS,
  "packages/contracts/src/inputs.ts": CONTRACT,
  "packages/a/src/wire-use.ts": WIRE_USE,
  "packages/a/src/jobs.ts": JOBS,
  "packages/a/src/contract/service.ts": SERVICE,
};

test("a brand handed to a brand schema field is no contract defect, and a closed vocabulary lists its values", { timeout: 120_000 }, async ({
  plantedTree,
}) => {
  const root = await plantedTree(WIRE_TREE);
  const report = scanBrandFlow({ root, worlds: [WORLD], log: () => undefined });
  const use = report.widens.filter(({ file }) => file === "packages/a/src/wire-use.ts");
  expect(use.map(({ slot, layer }) => ({ slot: slot.name, declared: slot.declared, layer }))).toEqual(
    expect.arrayContaining([
      { slot: "{…}.chatId", declared: "brand-schema", layer: "schema-input" },
      { slot: "{…}.note", declared: "plain", layer: "contract" },
      { slot: "[…] element", declared: "unknown", layer: "unknown" },
      { slot: "open(id)", declared: "plain", layer: "contract" },
    ]),
  );
  expect(report.widens.filter(({ file }) => file === "packages/a/src/row.tsx").map(({ slot }) => slot.name)).toEqual(["<Row seed>"]);
  const jobs = report.vocabularies.filter(({ file }) => file === "packages/a/src/jobs.ts");
  expect(jobs.map(({ name, values, assigned, compared, cased }) => ({ name, values, assigned, compared, cased }))).toEqual([
    { name: "status", values: ["done", "failed", "queued"], assigned: 1, compared: 1, cased: 1 },
    { name: "kind", values: ["build"], assigned: 1, compared: 0, cased: 0 },
  ]);
});

// The construction report is the reference graph's (tests/tooling/unwired/graph-optional-pairs.int.test.ts); the rule
// proves a pair at a fallback from the receiver's own initializer, and leaves the co-set control alone.
test("the optional-alternatives rule flags a fallback over fields its receiver's initializer sets apart", { timeout: 120_000 }, async ({ plantedTree }) => {
  const file = "packages/a/src/choice.tsx";
  const source = [
    "export interface Input { readonly file?: string; readonly url?: string; quiet?: boolean }",
    "declare const fileMode: boolean;",
    'const input: Input = fileMode ? { file: "f", quiet: true } : { url: "u", quiet: true };',
    "export const selected = input.file ?? input.url;",
    "interface WithFallback { primary?: string; backup?: string }",
    'const fallback: WithFallback = fileMode ? { primary: "f", backup: "b" } : { backup: "b" };',
    "export const value = fallback.primary ?? fallback.backup;",
    "interface Ancestor { readonly path?: string }",
    "interface Inherited extends Ancestor { readonly address?: string }",
    'const derived: Inherited = fileMode ? { path: "p" } : { address: "u" };',
    "export const derivedValue = derived.path ?? derived.address;",
    "interface Addresses<T> { readonly inline: T; readonly remote: T }",
    "type Choice<T> = Partial<Addresses<T>>;",
    'const text: Choice<string> = fileMode ? { inline: "s" } : { remote: "r" };',
    "const numbers: Choice<number> = { inline: 1, remote: 2 };",
    "export const mappedValue = text.inline ?? text.remote;",
    "export const numbersValue = numbers.inline ?? numbers.remote;",
    "interface WidgetInput extends Ancestor { readonly title?: string }",
    "function Widget({ path, title }: WidgetInput) { return <span>{path ?? title}</span>; }",
    'export const widget = fileMode ? <Widget path="p" /> : <Widget title="t" />;',
    'import { z } from "zod";',
    "const firstSchema = z.object({ shared: z.string(), onlyFirst: z.string() });",
    "const secondSchema = z.object({ shared: z.number(), onlySecond: z.boolean() });",
    'export const first: Partial<z.output<typeof firstSchema>> = fileMode ? { shared: "x" } : { onlyFirst: "y" };',
    "export const second: Partial<z.output<typeof secondSchema>> = fileMode ? { shared: 1 } : { onlySecond: true };",
  ].join("\n");
  const root = await plantedTree({
    ...TREE,
    [WORLD]: plantedTsconfig({
      lib: LIB,
      jsx: "preserve",
      include: ["src", "../kit/src"],
      paths: { zod: [join(import.meta.dirname, "../../../node_modules/zod/index.d.ts")] },
    }),
    "packages/a/src/jsx.d.ts": JSX_NAMESPACE,
    [file]: source,
  });
  const rule = "orb/no-optional-alternatives";
  const messages = new Linter({ cwd: root }).verify(
    source,
    {
      files: ["**/*.tsx"],
      plugins: { orb: { rules: { "no-optional-alternatives": optionalAlternativesRule } } },
      languageOptions: { parser: tseslint.parser, parserOptions: { tsconfigRootDir: root, project: [WORLD] } },
      rules: { [rule]: "error" },
    },
    { filename: join(root, file) },
  );
  expect(messages.map(({ ruleId, line }) => [ruleId, line])).toEqual([
    [rule, 4],
    [rule, 11],
    [rule, 16],
    [rule, 19],
  ]);
});

// The author tsconfigs' programs say which files are plugin author source and which are the SDK's declarations, so an
// author file counts wherever its tsconfig puts it. The bundle at the conventional path is the control, and a stray
// file the author programs do not hold is no author source.
test("plugin author and SDK sources are the files the author tsconfigs' programs hold, wherever they sit", { timeout: 120_000 }, async ({ plantedTree }) => {
  const author = "packages/showcase-plugins/tsconfig.author-main.json";
  const writer = (input: string, first: string, second: string): string =>
    [
      `import type { ${input} } from "../../../a/src/choice.ts";`,
      "declare const fileMode: boolean;",
      `const input: ${input} = fileMode ? { ${first}: "a" } : { ${second}: "b" };`,
      `export const selected = input.${first} ?? input.${second};`,
    ].join("\n");
  const root = await plantedTree({
    [WORLD]: plantedTsconfig({ lib: LIB, include: ["src", "tools"] }),
    [author]: plantedTsconfig({ lib: LIB, include: ["bundles/*/main.ts", "plugins/*/main.ts", "../plugin-sdk/main.d.ts"] }),
    "packages/plugin-sdk/package.json": JSON.stringify({ name: "@orb/plugin-sdk", files: ["main.d.ts"] }),
    "packages/plugin-sdk/main.d.ts": "export declare const sdkVersion: string;",
    "packages/a/src/choice.ts": [
      "export interface ByFile { readonly file?: string; readonly url?: string }",
      "export interface ByPath { readonly path?: string; readonly href?: string }",
    ].join("\n"),
    // A file of a package's own, outside src and outside every author program: no product or plugin source.
    "packages/a/tools/stray.ts": "export const stray = 1;",
    "packages/showcase-plugins/bundles/demo/main.ts": writer("ByFile", "file", "url"),
    "packages/showcase-plugins/plugins/other/main.ts": writer("ByPath", "path", "href"),
  });
  const report = scanBrandFlow({ root, worlds: [WORLD, author], log: () => undefined });
  const { production, optionalProduction } = report.scanned;
  // The two author entries and the SDK declaration; the stray tool file is neither.
  expect(optionalProduction - production).toBe(3);
});
