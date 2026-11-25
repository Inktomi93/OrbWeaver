// A value handed into a slot that names no member leaves for whoever the slot leads to: a logger through a sink, a
// library that reads keys, a downloaded file, a library or an unseen caller that hands an object in and reads it back,
// or a library a module augmentation types. In the provider backends a value is a provider send only when it reaches a
// request; a parsed response and a logger field bag are not, and a literal element read of the parsed value is its read.
import { expect, test } from "@orb/testkit/tooling";
import type { FieldsReport } from "../../../tooling/src/unwired/index.ts";
import { fieldsScan, GRAPH_SOURCE, NODE_TYPES } from "./_planted.ts";

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
    // the helper's return goes where its caller hands it: the request the provider library takes
    "Parsed.zqExtra ask provider @ai-sdk/provider",
    "Reply.zqUnread ask unclassified",
    // a logger-named port nothing fills is no log line
    "Sampling.zqHeat ask unclassified",
    // the chase follows the value down its key path through the spread of `args.options` into the request
    "Knobs.zqTopK ask provider @ai-sdk/provider",
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

// Every zq row a report lists, observed or unwired, as `Home.member verdict destination receiver`.
const zqRows = (report: FieldsReport): readonly string[] =>
  [...report.observed, ...report.unwired]
    .filter(({ member }) => member.startsWith("zq"))
    .map(({ home, member, verdict, sent }) => [`${home}.${member}`, verdict, ...sent.map((send) => send.split(" ").toSpliced(1, 1).join(" "))].join(" "))
    .toSorted();

// A worker's log port: a line logged through a member a factory's closure fills posts the fields to the parent's
// listener, which logs them through a port whose members a pino logger fills. The chase crosses the door through the
// paired listener and goes on at the key it sent the data under: `zqCrossed` reaches pino; `zqAside` rides under a key
// the listener never reads, so no sink takes it; and `zqLone` goes through a door no listener pairs with, to the wire.
const WORKER_LOG = {
  [`${GRAPH_SOURCE}/line.ts`]: [
    'export type Level = "info" | "warn";',
    "export interface Log { info(fields: object, message: string): void; warn(fields: object, message: string): void }",
    "export interface Line { readonly level: Level; readonly fields: object; readonly message: string; readonly aside?: object }",
  ].join("\n"),
  [`${GRAPH_SOURCE}/child.ts`]: [
    '/// <reference types="node" />',
    'import { parentPort } from "worker_threads";',
    'import type { Level, Line, Log } from "./line.ts";',
    "const post = (message: Line): void => { parentPort?.postMessage(message); };",
    "const logAt = (level: Level) => (fields: object, message: string): void => post({ level, fields: { ...fields }, message });",
    'export const log: Log = { info: logAt("info"), warn: logAt("warn") };',
    "interface Crossed { readonly zqCrossed: number }",
    "interface Aside { readonly zqAside: number }",
    "const crossed: Crossed = { zqCrossed: 1 };",
    "const aside: Aside = { zqAside: 1 };",
    'log.info(crossed, "crossed");',
    'export const sideways = (): void => post({ level: "info", fields: {}, message: "aside", aside });',
  ].join("\n"),
  [`${GRAPH_SOURCE}/parent.ts`]: [
    '/// <reference types="node" />',
    'import { Worker } from "worker_threads";',
    'import type { Logger } from "pino";',
    'import type { Line, Log } from "./line.ts";',
    "declare const pino: Logger;",
    "const host: Log = { info: (fields, message) => pino.debug(fields, message), warn: (fields, message) => pino.debug(fields, message) };",
    "const onMessage = (message: Line): void => { host[message.level](message.fields, message.message); };",
    'const worker = new Worker(new URL("./child.ts", import.meta.url));',
    'worker.on("message", (message: Line) => { onMessage(message); });',
  ].join("\n"),
  [`${GRAPH_SOURCE}/lone.ts`]: [
    '/// <reference types="node" />',
    "interface Lone { readonly zqLone: number }",
    "const relay = (message: unknown): void => { process.send?.(message); };",
    "const lone: Lone = { zqLone: 1 };",
    "export const sent = (): void => relay({ fields: lone });",
  ].join("\n"),
};

test("a send chase crosses a message door through its paired listener, at the key it sent the data under", { timeout: 120_000 }, async ({ plantedTree }) => {
  const report = await fieldsScan(plantedTree, { ...LIBRARIES, ...NODE_TYPES, ...WORKER_LOG });
  expect(zqRows(report)).toEqual(["Aside.zqAside ask unclassified", "Crossed.zqCrossed ask log pino", "Lone.zqLone ask wire"]);
});

// The inference log chain as the tree writes it: a backend emits through `log[level]` on an injected log port, one
// filler of that port is a worker's per-level closures over a `post` that sends on a `MessagePort` parameter the
// worker's entry hands `parentPort`, and the host logs each `type: "log"` message through the same port.
const PORT_LOG = {
  [`${GRAPH_SOURCE}/port.ts`]: [
    "export interface PortLog {",
    "  readonly debug: (fields: Readonly<Record<string, unknown>>, message: string) => void;",
    "  readonly info: (fields: Readonly<Record<string, unknown>>, message: string) => void;",
    "}",
    "export type PortLevel = keyof PortLog;",
    "export type PortMessage =",
    '  | { readonly type: "reply"; readonly id: number }',
    '  | { readonly type: "log"; readonly level: PortLevel; readonly fields: Record<string, unknown>; readonly message: string };',
  ].join("\n"),
  [`${GRAPH_SOURCE}/globals.ts`]: [
    'import type * as threads from "worker_threads";',
    "declare global {",
    "  interface MessagePort extends threads.MessagePort {}",
    "}",
    "export {};",
  ].join("\n"),
  [`${GRAPH_SOURCE}/emitter.ts`]: [
    'import type { PortLevel, PortLog } from "./port.ts";',
    "export interface TurnLine { readonly zqTurn: string }",
    "export interface Emitter { readonly emit: (level: PortLevel, event: string, fields?: Readonly<Record<string, unknown>>) => void }",
    "export interface TurnLog { readonly turn: (entry: TurnLine) => void }",
    "const emitterOf = (log: PortLog): Emitter => {",
    '  const emit: Emitter["emit"] = (level, event, fields = {}) => {',
    "    log[level]({ provider: true, event, ...fields }, event);",
    "  };",
    "  return { emit };",
    "};",
    "export const createTurnLog = (log: PortLog): TurnLog => {",
    "  const base = emitterOf(log);",
    '  return { turn: (entry) => base.emit("info", "provider.turn", { ...entry }) };',
    "};",
  ].join("\n"),
  [`${GRAPH_SOURCE}/port-worker.ts`]: [
    '/// <reference types="node" />',
    'import { parentPort } from "worker_threads";',
    'import type { PortLevel, PortLog, PortMessage } from "./port.ts";',
    "async function main(port: MessagePort): Promise<void> {",
    "  const post = (message: PortMessage, transferList: unknown[] = []): void => {",
    "    port.postMessage(message, transferList);",
    "  };",
    "  const logAt =",
    "    (level: PortLevel) =>",
    "    (fields: Readonly<Record<string, unknown>>, message: string): void => {",
    '      post({ type: "log", level, fields: { ...fields }, message });',
    "    };",
    '  const log: PortLog = { debug: logAt("debug"), info: logAt("info") };',
    '  log.debug({}, "ready");',
    "}",
    "if (parentPort !== null) {",
    "  await main(parentPort);",
    "}",
  ].join("\n"),
  [`${GRAPH_SOURCE}/port-host.ts`]: [
    '/// <reference types="node" />',
    'import { Worker } from "worker_threads";',
    'import type { Logger } from "pino";',
    'import { createTurnLog } from "./emitter.ts";',
    'import type { PortLog, PortMessage } from "./port.ts";',
    "declare const pino: Logger;",
    "const host: PortLog = { debug: (fields, message) => pino.debug(fields, message), info: (fields, message) => pino.debug(fields, message) };",
    "const onMessage = (state: { readonly id: number }, message: PortMessage): void => {",
    '  if (message.type === "log") {',
    "    host[message.level](message.fields, message.message);",
    "    return;",
    "  }",
    "  void state;",
    "};",
    'const worker = new Worker(new URL("./port-worker.ts", import.meta.url));',
    "const state = { id: 1 };",
    'worker.on("message", (message: PortMessage) => {',
    "  onMessage(state, message);",
    "});",
    'export const turn = (): void => createTurnLog(host).turn({ zqTurn: "t" });',
  ].join("\n"),
};

test("a log line that one filler of its port posts to a worker's parent crosses that door and lands on the parent's logger", { timeout: 120_000 }, async ({
  plantedTree,
}) => {
  const report = await fieldsScan(plantedTree, { ...LIBRARIES, ...NODE_TYPES, ...PORT_LOG });
  expect(zqRows(report)).toEqual(["TurnLine.zqTurn ask log pino"]);
});

// The platform's `Object.entries` and `Object.fromEntries` move a value to an entry's slot 1 and back to a member, so a
// record rebuilt from its entries carries the value on to the console. A rebuild that keeps only the entries' keys
// drops the values.
test("a send chase follows a record through Object.entries and Object.fromEntries, and a rebuild of the keys alone drops it", { timeout: 120_000 }, async ({
  plantedTree,
}) => {
  const report = await fieldsScan(plantedTree, {
    ...NODE_TYPES,
    [`${GRAPH_SOURCE}/rebuild.ts`]: [
      '/// <reference types="node" />',
      "interface Kept { readonly zqKept: number }",
      "interface Keyed { readonly zqKeyed: number }",
      "const kept: Kept = { zqKept: 1 };",
      "const keyed: Keyed = { zqKeyed: 1 };",
      "const slices: Record<string, unknown> = { a: kept };",
      "const others: Record<string, unknown> = { b: keyed };",
      "const named = Object.entries(slices);",
      "export const evidence = (): void => console.log(Object.fromEntries(named.map(([name, slice]) => [name, slice])));",
      "export const names = (): void => console.log(Object.fromEntries(Object.entries(others).map(([name]) => [name, 0])));",
    ].join("\n"),
  });
  expect(zqRows(report)).toEqual(["Kept.zqKept ask log console", "Keyed.zqKeyed dead"]);
});
