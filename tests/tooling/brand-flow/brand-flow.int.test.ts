// `pnpm brand-flow` over a planted tree: one case per class (mint, widen, re-narrow, missing, cross-brand), each with a
// control the scan must leave alone. The kit ids module is a stub at the real path; the scan reads brands from the checker.
import { expect, plantedTsconfig, test } from "@orb/testkit/tooling";
import { scanBrandFlow } from "../../../tooling/src/brand-flow/index.ts";
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
  "}",
].join("\n");

const TREE = {
  [WORLD]: plantedTsconfig({ lib: LIB, include: ["src", "../kit/src"] }),
  "packages/kit/src/ids/index.ts": IDS,
  "packages/a/src/flow.ts": FLOW,
};

const lineOf = (needle: string): number => FLOW.split("\n").findIndex((line) => line.includes(needle)) + 1;

test("the brand-flow scan reports each class with its slot, and leaves the controls alone", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(TREE);
  const report = scanBrandFlow({ root, worlds: [WORLD], log: () => undefined });
  const flow = <T extends { readonly file: string }>(sites: readonly T[]): T[] => sites.filter(({ file }) => file === "packages/a/src/flow.ts");

  const mints = flow(report.mints).map(({ line, via, mintClass, shape }) => ({ line, via, mintClass, shape }));
  expect(mints).toEqual([
    { line: lineOf('castId<ChatId>("chat_literal")'), via: "castId", mintClass: "literal", shape: null },
    { line: lineOf("castId<ChatId>(raw)"), via: "castId", mintClass: "raw", shape: "parameter" },
    { line: lineOf('c.req.param("chatId")'), via: "castId", mintClass: "raw", shape: "http-param" },
    { line: lineOf("castId<ChatId>(persona)"), via: "castId", mintClass: "rebrand", shape: null },
    { line: lineOf("castId<ChatId>(selected)"), via: "castId", mintClass: "raw", shape: "variable" },
    { line: lineOf("raw as ChatId"), via: "as", mintClass: "raw", shape: "parameter" },
    { line: lineOf('typeIdSchema("chat")'), via: "typeIdSchema", mintClass: "parsed", shape: null },
  ]);

  const widens = flow(report.widens).map(({ line, slot, layer }) => ({ line, slot: slot.name, layer }));
  expect(widens).toEqual(
    expect.arrayContaining([
      { line: lineOf("seen.set(chat, 1)"), slot: "set(key)", layer: "library" },
      { line: lineOf("port.open(chat)"), slot: "open(chatId)", layer: "port" },
      { line: lineOf("return chat;"), slot: "asText() return", layer: "local" },
      { line: lineOf("chat as string"), slot: "as string", layer: "local" },
      { line: lineOf('useState<string>("")') + 1, slot: "setSelected (useState<string> setter)", layer: "client-state" },
    ]),
  );
  // A brand slot and an interpolation are no widen.
  expect(flow(report.widens).some(({ line }) => line === lineOf("chat satisfies ChatId") || line === lineOf("return `chat"))).toBe(false);

  expect(flow(report.renarrows).map(({ line, how, proof }) => ({ line, how, proof }))).toEqual([
    { line: lineOf("castId<ChatId>(selected)"), how: "castId", proof: "slot-widened" },
    { line: lineOf("held === chat"), how: "compare", proof: "slot-widened" },
  ]);

  expect(
    flow(report.missing)
      .filter(({ owner }) => owner === "Row")
      .map(({ name, brand, match }) => ({ name, brand, match })),
  ).toEqual([
    { name: "chatId", brand: "ChatId", match: "exact" },
    { name: "anchorPersonaId", brand: "PersonaId", match: "suffix" },
  ]);
  expect(report.generic.map(({ name }) => name)).toContain("memberId");

  expect(flow(report.crossBrand).map(({ line, how }) => ({ line, how }))).toEqual(
    expect.arrayContaining([
      { line: lineOf("castId<ChatId>(persona)"), how: "rebrand" },
      { line: lineOf("openChatSlot(persona)"), how: "widen-into-named-slot" },
    ]),
  );
  expect(report.scanned.doubleCounted).toBe(0);
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
