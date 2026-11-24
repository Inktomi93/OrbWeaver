// A value handed into a slot that names no member leaves for whoever the slot leads to: a logger through a sink, a
// library that reads keys, a downloaded file, a library or an unseen caller that hands an object in and reads it back,
// or a library a module augmentation types. In the provider backends a value is a provider send only when it reaches a
// request; a parsed response and a logger field bag are not, and a literal element read of the parsed value is its read.
import { expect, test } from "@orb/testkit/tooling";
import type { FieldsReport } from "../../../tooling/src/unwired/index.ts";
import { fieldsScan, NODE_TYPES } from "./_planted.ts";

const LIBRARIES = {
  "node_modules/pino/package.json": '{ "name": "pino", "types": "index.d.ts" }',
  "node_modules/pino/index.d.ts": "export interface Logger { debug<T extends object>(obj: T, msg?: string): void }",
  "node_modules/render/package.json": '{ "name": "render", "types": "index.d.ts" }',
  "node_modules/render/index.d.ts": "export declare function render(value: Readonly<Record<string, unknown>>): string;",
  "node_modules/schema/package.json": '{ "name": "schema", "types": "index.d.ts" }',
  "node_modules/schema/index.d.ts": "export declare function parse(value: unknown): unknown;",
  "node_modules/hooks/package.json": '{ "name": "hooks", "types": "index.d.ts" }',
  "node_modules/hooks/index.d.ts": "export declare function useMemo<T>(make: () => T, deps?: readonly unknown[]): T;",
  "node_modules/@types/mdast/package.json": '{ "name": "@types/mdast", "types": "index.d.ts" }',
  "node_modules/@types/mdast/index.d.ts": "export interface Root { type: string; children: unknown[] }",
  "node_modules/query/package.json": '{ "name": "query", "types": "index.d.ts" }',
  "node_modules/query/index.d.ts": "export interface Register {}",
  // a graph tree builds with no DOM lib, so the fetch Response a backend's reader takes is a library's own
  "node_modules/fetchlib/package.json": '{ "name": "fetchlib", "types": "index.d.ts" }',
  "node_modules/fetchlib/index.d.ts": "export interface Response { readonly ok: boolean }",
  "node_modules/@ai-sdk/provider/package.json": '{ "name": "@ai-sdk/provider", "types": "index.d.ts" }',
  "node_modules/@ai-sdk/provider/index.d.ts": [
    "export type JSONObject = { [key: string]: unknown };",
    "export interface Model { doStream(options: { readonly providerOptions?: Record<string, JSONObject> }): Promise<void> }",
  ].join("\n"),
};

// Member names carry a zq prefix so the literal stage of a real-tree scan never matches this file.
const OUTSIDE = [
  '/// <reference types="node" />',
  'import type { Logger } from "pino";',
  'import { render } from "render";',
  'import { parse } from "schema";',
  'import { useMemo } from "hooks";',
  'import type { Root } from "mdast";',
  "interface Trace { readonly zqBuilt: number }",
  "interface Entry { readonly zqEvent: string; readonly zqTrace: Trace }",
  "interface LogRecord { readonly zqEvent: string; readonly [field: string]: unknown }",
  "const record = (entry: LogRecord, base: Logger): void => base.debug({ memory: true, ...entry }, entry.zqEvent);",
  "export const build = (base: Logger): void => {",
  "  const sink = { log: (entry: Entry): void => record(entry, base) };",
  '  sink.log({ zqEvent: "e", zqTrace: { zqBuilt: 1 } });',
  "};",
  // A plain typed value given straight to the library logger: the slot is the inferred type itself, with no open member.
  "interface Direct { readonly zqDirect: number }",
  "interface Bare { readonly zqBare: number }",
  "declare const direct: Direct;",
  "declare const bare: Bare;",
  "export const logged = (base: Logger): void => { base.debug({ ...direct }); base.debug(bare); };",
  "interface View { readonly zqShown: string }",
  'export const shown = (): string => render({ zqShown: "s" } satisfies View);',
  "interface Checked { readonly zqChecked: string }",
  'export const checked = (): unknown => parse({ zqChecked: "c" } satisfies Checked);',
  "interface Memo { readonly zqMemo: string }",
  "declare const memo: Memo;",
  "export const memoized = (): number => useMemo(() => 1, [memo]);",
  "interface Bundle { readonly zqSaved: number }",
  "const download = (payload: unknown): Blob => new Blob([JSON.stringify(payload)]);",
  "export const saved = (): Blob => download({ zqSaved: 1 } satisfies Bundle);",
  "interface Chip { type: string; data?: { zqTag: string } }",
  'const walk = (node: Chip): void => { node.data = { zqTag: "span" }; };',
  "export const plugin = () => (tree: Root): void => walk(tree as Chip);",
  "interface Dice { data?: { zqDiceTag: string } }",
  'const roll = (node: Dice): void => { node.data = { zqDiceTag: "d" }; };',
  "export function zqDicePlugin() { return (tree: unknown): void => roll(tree as Dice); }",
  "interface Dropped { readonly zqDropped: string }",
  "const ignore = (value: unknown): void => { void value; };",
  'export const dropped = (): void => ignore({ zqDropped: "u" } satisfies Dropped);',
  'declare module "query" {',
  "  interface Register { zqMeta: Dropped }",
  "}",
].join("\n");

const BACKEND = [
  'import type { JSONObject, Model } from "@ai-sdk/provider";',
  'import type { Response } from "fetchlib";',
  "interface Routing { readonly zqOrder?: string; readonly [key: string]: unknown }",
  "interface Parsed { readonly zqOrder: string; readonly zqExtra: string }",
  "interface Reply { readonly zqDone: boolean; readonly zqCalls: string; readonly zqUnread: string }",
  "type Json = Record<string, unknown>;",
  "interface Logger { emit(level: string, fields?: Readonly<Record<string, unknown>>): void }",
  "interface Sampling { readonly zqHeat: number }",
  "declare const parsed: Parsed;",
  "declare const reply: Reply;",
  "const routingOf = (): Routing => parsed;",
  "const parseLine = (): Json => reply;",
  'const finish = (line: Json): boolean => line["zqDone"] === true && line["zqCalls"] !== undefined;',
  // A value reaches the request through a parameter's callers, a shorthand key and a keyed write into a binding; a
  // Response reader's result does not.
  "interface Knobs { readonly zqTopK: number }",
  "interface Answer { readonly zqCode: string }",
  "interface Extras { readonly zqKeyed: number }",
  "declare const knobs: Knobs;",
  "declare const answer: Answer;",
  "declare const extras: Extras;",
  "const knobsOf = (): JSONObject => knobs;",
  "const extrasFor = (key: string): JSONObject => {",
  "  const out: JSONObject = {};",
  "  out[key] = extras as JSONObject[string];",
  "  return out;",
  "};",
  "interface Call { readonly options: { readonly providerOptions?: Record<string, JSONObject> }; readonly translate: (res: Response) => Json }",
  "const stream = (model: Model, args: Call): Promise<void> => model.doStream({ ...args.options });",
  "export const run = async (model: Model, log: Logger, sampling: Sampling): Promise<boolean> => {",
  '  log.emit("info", { ...sampling });',
  '  await model.doStream({ providerOptions: { router: { provider: routingOf() }, keyed: extrasFor("k") } });',
  "  const providerOptions = { router: knobsOf() };",
  "  await stream(model, { options: { providerOptions }, translate: (res: Response): Json => (res.ok ? answer : {}) });",
  "  return finish(parseLine());",
  "};",
].join("\n");

test("an open slot sends to the logger, library or file it leads to, and a backend value only to a request", { timeout: 120_000 }, async ({ plantedTree }) => {
  const report = await fieldsScan(plantedTree, {
    ...LIBRARIES,
    // Node declares the global Blob a downloaded file is built from, which OUTSIDE references
    ...NODE_TYPES,
    "packages/inference/src/other/outside.ts": OUTSIDE,
    "packages/inference/src/backends/chat.ts": BACKEND,
  });
  const row = ({ home, member, verdict, sent }: FieldsReport["unwired"][number]): string =>
    [`${home}.${member}`, verdict, ...sent.map((send) => send.split(" ").toSpliced(1, 1).join(" "))].join(" ");
  // a pino line is an observability sink, so its rows are observed rather than reported
  expect(report.observed.map(row).toSorted()).toEqual([
    "Bare.zqBare ask log pino",
    "Direct.zqDirect ask log pino",
    "Entry.zqTrace ask log pino",
    "Trace.zqBuilt ask log pino",
  ]);
  const found = new Set(report.unwired.map(row));
  for (const expected of [
    "View.zqShown ask dependency render",
    "Checked.zqChecked dead",
    "Memo.zqMemo dead",
    "Bundle.zqSaved ask file",
    "Chip.data.zqTag ask dependency mdast",
    "Dice.data.zqDiceTag ask unclassified caller of zqDicePlugin",
    "Dropped.zqDropped dead",
    "Parsed.zqExtra ask provider",
    "Reply.zqUnread ask unclassified",
    // a logger-named port nothing fills is no log line
    "Sampling.zqHeat ask unclassified",
    "Knobs.zqTopK ask provider",
    "Extras.zqKeyed ask provider",
    "Answer.zqCode ask unclassified",
  ]) {
    expect(found).toContain(expected);
  }
  // The parsed reply is read through its literal element reads, so neither key is reported; the augmentation's member
  // is read by the library it augments.
  expect([...found].filter((line) => /^(Reply\.zqDone|Reply\.zqCalls|Register\.zqMeta) /u.test(line))).toEqual([]);
  expect(report.received).toEqual([]);
});
