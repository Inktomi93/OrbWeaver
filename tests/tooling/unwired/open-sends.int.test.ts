// A value handed into a slot that names no member leaves for whoever the slot leads to: a logger through a sink, a
// library, a downloaded file, a library that hands an object in and reads it back, or a library a module augmentation
// types. In the provider backends a value is a provider send only when it reaches a request; a parsed response and a
// logger field bag are not, and a literal element read of the parsed value is its read. Each case has a dead control.
import { expect, plantedTsconfig, test } from "@orb/testkit/tooling";
import { scanFields } from "../../../tooling/src/unwired/index.ts";

const WORLD = "packages/inference/tsconfig.json";

const LIBRARIES = {
  "node_modules/pino/package.json": '{ "name": "pino", "types": "index.d.ts" }',
  "node_modules/pino/index.d.ts": "export interface Logger { debug<T extends object>(obj: T, msg?: string): void }",
  "node_modules/render/package.json": '{ "name": "render", "types": "index.d.ts" }',
  "node_modules/render/index.d.ts": "export declare function render(value: unknown): string;",
  "node_modules/@types/mdast/package.json": '{ "name": "@types/mdast", "types": "index.d.ts" }',
  "node_modules/@types/mdast/index.d.ts": "export interface Root { type: string; children: unknown[] }",
  "node_modules/query/package.json": '{ "name": "query", "types": "index.d.ts" }',
  "node_modules/query/index.d.ts": "export interface Register {}",
  "node_modules/@ai-sdk/provider/package.json": '{ "name": "@ai-sdk/provider", "types": "index.d.ts" }',
  "node_modules/@ai-sdk/provider/index.d.ts": [
    "export type JSONObject = { [key: string]: unknown };",
    "export interface Model { doStream(options: { readonly providerOptions?: Record<string, JSONObject> }): Promise<void> }",
  ].join("\n"),
};

const OUTSIDE = [
  'import type { Logger } from "pino";',
  'import { render } from "render";',
  'import type { Root } from "mdast";',
  "interface Trace { readonly built: number }",
  "interface Entry { readonly event: string; readonly trace: Trace }",
  "interface LogRecord { readonly event: string; readonly [field: string]: unknown }",
  "const record = (entry: LogRecord, base: Logger): void => base.debug({ memory: true, ...entry }, entry.event);",
  "export const build = (base: Logger): void => {",
  "  const sink = { log: (entry: Entry): void => record(entry, base) };",
  '  sink.log({ event: "e", trace: { built: 1 } });',
  "};",
  "interface View { readonly shown: string }",
  'export const shown = (): string => render({ shown: "s" } satisfies View);',
  "interface Bundle { readonly formatVersion: number }",
  "const download = (payload: unknown): Blob => new Blob([JSON.stringify(payload)]);",
  "export const saved = (): Blob => download({ formatVersion: 1 } satisfies Bundle);",
  "interface Chip { type: string; data?: { hName: string } }",
  'const walk = (node: Chip): void => { node.data = { hName: "span" }; };',
  "export const plugin = () => (tree: Root): void => walk(tree as Chip);",
  "interface Dropped { readonly unread: string }",
  "const ignore = (value: unknown): void => { void value; };",
  'export const dropped = (): void => ignore({ unread: "u" } satisfies Dropped);',
  'declare module "query" {',
  "  interface Register { meta: Dropped }",
  "}",
].join("\n");

const BACKEND = [
  'import type { JSONObject, Model } from "@ai-sdk/provider";',
  "interface Routing { readonly order?: string; readonly [key: string]: unknown }",
  "interface Parsed { readonly order: string; readonly extra: string }",
  "interface Reply { readonly done: boolean; readonly tool_calls: string; readonly unread: string }",
  "type Json = Record<string, unknown>;",
  "interface Logger { emit(level: string, fields?: Readonly<Record<string, unknown>>): void }",
  "interface Sampling { readonly temperature: number }",
  "declare const parsed: Parsed;",
  "declare const reply: Reply;",
  "const routingOf = (): Routing => parsed;",
  "const parseLine = (): Json => reply;",
  'const finish = (line: Json): boolean => line["done"] === true && line["tool_calls"] !== undefined;',
  // A value reaches the request through a parameter's callers and a shorthand key; a Response reader's result does not.
  "interface Knobs { readonly topK: number }",
  "interface Answer { readonly code: string }",
  "declare const knobs: Knobs;",
  "declare const answer: Answer;",
  "const knobsOf = (): JSONObject => knobs;",
  "interface Call { readonly options: { readonly providerOptions?: Record<string, JSONObject> }; readonly translate: (res: Response) => Json }",
  "const stream = (model: Model, args: Call): Promise<void> => model.doStream({ ...args.options });",
  "export const run = async (model: Model, log: Logger, sampling: Sampling): Promise<boolean> => {",
  '  log.emit("info", { ...sampling });',
  "  await model.doStream({ providerOptions: { router: { provider: routingOf() } } });",
  "  const providerOptions = { router: knobsOf() };",
  "  await stream(model, { options: { providerOptions }, translate: (res: Response): Json => (res.ok ? answer : {}) });",
  "  return finish(parseLine());",
  "};",
].join("\n");

test("an open slot sends to the logger, library or file it leads to, and a backend value only to a request", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree({
    ...LIBRARIES,
    [WORLD]: plantedTsconfig(),
    "packages/inference/src/other/outside.ts": OUTSIDE,
    "packages/inference/src/backends/chat.ts": BACKEND,
  });
  const report = scanFields({ root, worlds: [WORLD], testWorlds: [], deliberate: [], log: () => undefined });
  const row = ({ home, member, verdict, sent }: (typeof report.unwired)[number]): string =>
    [`${home}.${member}`, verdict, ...sent.map((send) => send.split(" ").toSpliced(1, 1).join(" "))].join(" ");
  const found = new Set(report.unwired.map(row));
  for (const expected of [
    "Trace.built ask log pino",
    "View.shown ask dependency render",
    "Bundle.formatVersion ask file",
    "Chip.data.hName ask dependency mdast",
    "Register.meta ask dependency query",
    "Dropped.unread dead",
    "Parsed.extra ask provider",
    "Reply.unread dead",
    "Sampling.temperature ask log log.emit",
    "Knobs.topK ask provider",
    "Answer.code dead",
  ]) {
    expect(found).toContain(expected);
  }
  // The parsed reply is read through its literal element reads, so neither key is reported.
  expect([...found].filter((line) => line.startsWith("Reply.done") || line.startsWith("Reply.tool_calls"))).toEqual([]);
  expect(report.received).toEqual([]);
});
