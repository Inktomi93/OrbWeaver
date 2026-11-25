// Message doors: a value sent through a Node or DOM message door pairs with the receivers its link names, so only the
// members a receiver reads by name are read; an unpaired send stays sent-only and an unpaired receiver is reported. A
// local function or class spelled like a door is no door.
import { expect, plantedTsconfig, test } from "@orb/testkit/tooling";
import { GRAPH_SOURCE, graphScan, labelsIn, libraryModule, NODE_TYPES, WORLD } from "./_planted.ts";

const NODE = '/// <reference types="node" />';
const DOM_LIB = ["ESNext", "DOM"];
const entries = (files: Readonly<Record<string, string>>): { readonly entries: readonly string[] } => ({
  entries: Object.keys(files).filter((file) => file.startsWith(GRAPH_SOURCE)),
});
const sentAndWritten = (
  scan: Awaited<ReturnType<typeof graphScan>>,
  file: string,
): { readonly sent: readonly string[]; readonly written: readonly string[] } => ({
  sent: labelsIn(scan, "member-sent-only", file),
  written: labelsIn(scan, "member-write-only", file),
});

// the merged program takes its libs from the browser world
const DOM_WORLDS = {
  "tsconfig.world-browser.json": plantedTsconfig({ lib: DOM_LIB, include: [] }),
  [WORLD]: plantedTsconfig({ lib: DOM_LIB, include: ["../*/src"] }),
};

const PARENT = `${GRAPH_SOURCE}/parent.ts`;
const CHILD = `${GRAPH_SOURCE}/child.ts`;
const SHAPES = `${GRAPH_SOURCE}/shapes.ts`;
const SHAPES_SOURCE = [
  "export interface Sent { wanted: number; spare: number }",
  "export interface Got { wanted: number }",
  "export interface Back { reply: number; extra: number }",
  "export interface BackView { reply: number }",
  "export interface Seed { seed: number; unused: number }",
  "export interface SeedView { seed: number }",
].join("\n");

test("a worker's message, reply and data pair with the listeners and data reads of the module it loads", { timeout: 120_000 }, async ({ plantedTree }) => {
  const files = {
    ...NODE_TYPES,
    [SHAPES]: SHAPES_SOURCE,
    [PARENT]: [
      NODE,
      'import { Worker } from "worker_threads";',
      'import type { BackView, Seed, Sent } from "./shapes.ts";',
      "const seed: Seed = { seed: 1, unused: 2 };",
      'const worker = new Worker(new URL("./child.ts", import.meta.url), { workerData: seed });',
      "const sent: Sent = { wanted: 1, spare: 2 };",
      "worker.postMessage(sent);",
      'worker.on("message", (value: BackView) => { void value.reply; });',
    ].join("\n"),
    [CHILD]: [
      NODE,
      'import { parentPort, workerData } from "worker_threads";',
      'import type { Back, Got, SeedView } from "./shapes.ts";',
      "const data = workerData as SeedView;",
      "void data.seed;",
      'parentPort?.on("message", (value: unknown) => { const got = value as Got; void got.wanted; });',
      "const back: Back = { reply: 1, extra: 2 };",
      "parentPort?.postMessage(back);",
    ].join("\n"),
  };
  const scan = await graphScan(plantedTree, files, entries(files));
  expect(sentAndWritten(scan, SHAPES)).toEqual({ sent: [], written: ["Sent.spare", "Back.extra", "Seed.unused"] });
  expect(scan.analysis["message-receiver-unpaired"]).toEqual([]);
});

test("a child process's message pairs with the process listener of the module it runs, and back", { timeout: 120_000 }, async ({ plantedTree }) => {
  const files = {
    ...NODE_TYPES,
    [SHAPES]: SHAPES_SOURCE,
    [PARENT]: [
      NODE,
      'import { spawn } from "child_process";',
      'import type { BackView, Sent } from "./shapes.ts";',
      'const child = spawn("node", [String(new URL("./child.ts", import.meta.url))]);',
      "const sent: Sent = { wanted: 1, spare: 2 };",
      "child.send(sent);",
      'child.on("message", (value: BackView) => { void value.reply; });',
    ].join("\n"),
    [CHILD]: [
      NODE,
      'import type { Back, Got } from "./shapes.ts";',
      "const read = (value: unknown): void => { void (value as Got).wanted; };",
      'process.on("message", (value: unknown) => read(value));',
      "const back: Back = { reply: 1, extra: 2 };",
      "process.send?.(back);",
    ].join("\n"),
  };
  const scan = await graphScan(plantedTree, files, entries(files));
  expect(sentAndWritten(scan, SHAPES)).toEqual({ sent: [], written: ["Sent.spare", "Back.extra"] });
});

test("an emitter pairs by its declaration and event; a computed event stays sent; a diagnostics channel pairs by name", { timeout: 120_000 }, async ({
  plantedTree,
}) => {
  const files = {
    ...NODE_TYPES,
    [SHAPES]: SHAPES_SOURCE,
    [PARENT]: [
      NODE,
      'import { EventEmitter } from "events";',
      'import { channel, subscribe } from "diagnostics_channel";',
      'import type { Back, BackView, Got, Sent } from "./shapes.ts";',
      "const bus = new EventEmitter();",
      "const sent: Sent = { wanted: 1, spare: 2 };",
      'bus.emit("tick", sent);',
      'bus.on("tick", (value: Got) => { void value.wanted; });',
      "export const eventOf = (name: string): string => name;",
      "const back: Back = { reply: 1, extra: 2 };",
      'bus.emit(eventOf("tock"), back);',
      'const published = channel("orb:tick");',
      "published.publish(back);",
      'subscribe("orb:tick", (value: unknown) => { void (value as BackView).reply; });',
    ].join("\n"),
  };
  const scan = await graphScan(plantedTree, files, entries(files));
  expect(sentAndWritten(scan, SHAPES)).toEqual({ sent: ["Back.extra"], written: ["Sent.spare"] });
});

test("a broadcast channel pairs by its name; a listener reads the event's data", { timeout: 120_000 }, async ({ plantedTree }) => {
  const files = {
    // the merged program takes its libs from the browser world
    "tsconfig.world-browser.json": plantedTsconfig({ lib: DOM_LIB, include: [] }),
    [WORLD]: plantedTsconfig({ lib: DOM_LIB, include: ["../*/src"] }),
    [SHAPES]: SHAPES_SOURCE,
    [PARENT]: [
      'import type { Got, Sent } from "./shapes.ts";',
      'const NAME = "orb";',
      "const outbound = new BroadcastChannel(NAME);",
      "const sent: Sent = { wanted: 1, spare: 2 };",
      "outbound.postMessage(sent);",
      'new BroadcastChannel("orb").addEventListener("message", (event: MessageEvent<Got>) => { void event.data.wanted; });',
    ].join("\n"),
  };
  const scan = await graphScan(plantedTree, files, entries(files));
  expect(sentAndWritten(scan, SHAPES)).toEqual({ sent: [], written: ["Sent.spare"] });
});

test("an AsyncLocalStorage store fills the instance's type argument instead of escaping", { timeout: 120_000 }, async ({ plantedTree }) => {
  const files = {
    ...NODE_TYPES,
    [SHAPES]: SHAPES_SOURCE,
    [PARENT]: [
      NODE,
      'import { AsyncLocalStorage } from "async_hooks";',
      'import type { Seed } from "./shapes.ts";',
      "const scope = new AsyncLocalStorage<Seed>();",
      "const seed: Seed = { seed: 1, unused: 2 };",
      "scope.run(seed, () => { void scope.getStore()?.seed; });",
    ].join("\n"),
  };
  const scan = await graphScan(plantedTree, files, entries(files));
  expect(labelsIn(scan, "member-sent-only", SHAPES)).toEqual([]);
  expect(labelsIn(scan, "member-write-only", SHAPES)).toContain("Seed.unused");
});

test("a receiver no send reaches is reported; a local class spelled like a door is no door", { timeout: 120_000 }, async ({ plantedTree }) => {
  const Lonely = `${GRAPH_SOURCE}/lonely.ts`;
  const Lookalike = `${GRAPH_SOURCE}/lookalike.ts`;
  const files = {
    ...NODE_TYPES,
    [SHAPES]: SHAPES_SOURCE,
    [Lonely]: [
      NODE,
      'import type { MessagePort } from "worker_threads";',
      'import type { Got } from "./shapes.ts";',
      'export const listen = (port: MessagePort): void => { port.on("message", (value: Got) => { void value.wanted; }); };',
    ].join("\n"),
    ...libraryModule(['export declare class Worker { postMessage(value: unknown): void; on(event: "message", listener: (value: unknown) => void): void }']),
    [Lookalike]: [
      'import { Worker as LibraryWorker } from "lib";',
      'import type { Got, Sent } from "./shapes.ts";',
      'new LibraryWorker().on("message", (value: unknown) => { void (value as Got).wanted; });',
      "class Worker { postMessage(value: Sent): void { void value; } on(event: string, listener: (value: Got) => void): void { void event; void listener; } }",
      "const sent: Sent = { wanted: 1, spare: 2 };",
      "export const worker = new Worker();",
      "worker.postMessage(sent);",
      'worker.on("message", (value: Got) => { void value.wanted; });',
      "export function postMessage(value: Sent): void { void value.wanted; }",
      "postMessage(sent);",
    ].join("\n"),
  };
  const scan = await graphScan(plantedTree, files, entries(files));
  expect(scan.analysis["message-receiver-unpaired"].map(({ label }) => label)).toEqual([`${Lonely}:4 worker`]);
});

// Node's Worker takes `on` from the events module's InternalEventEmitter, so the listener is the door of the type it is
// called on: a Worker's is the worker door, and a stream's, from the same interface, is none.
test("an inherited listener is the door of the library type it is called on, and a non-door library emitter's is no door", { timeout: 120_000 }, async ({
  plantedTree,
}) => {
  const Inherited = `${GRAPH_SOURCE}/inherited.ts`;
  const files = {
    ...NODE_TYPES,
    [SHAPES]: SHAPES_SOURCE,
    [Inherited]: [
      NODE,
      'import { Worker } from "node:worker_threads";',
      'import type { Readable } from "stream";',
      'import type { Got } from "./shapes.ts";',
      "export const listen = (worker: Worker, stream: Readable): void => {",
      '  worker.on("message", (value: Got) => { void value.wanted; });',
      '  stream.on("message", (value: Got) => { void value.wanted; });',
      "};",
    ].join("\n"),
  };
  const scan = await graphScan(plantedTree, files, entries(files));
  expect(scan.analysis["message-receiver-unpaired"].map(({ label }) => label)).toEqual([`${Inherited}:6 worker`]);
});

test("a broadcast channel set into a variable after its start links by the name it was opened with", { timeout: 120_000 }, async ({ plantedTree }) => {
  const files = {
    [SHAPES]: SHAPES_SOURCE,
    [PARENT]: [
      'import type { Got, Sent } from "./shapes.ts";',
      "let channel: BroadcastChannel | null = null;",
      'const openChannel = (): BroadcastChannel => { const opened = new BroadcastChannel("orb:session"); channel = opened; return channel; };',
      'openChannel().addEventListener("message", (event: MessageEvent<Got>) => { void event.data.wanted; });',
      "const sent: Sent = { wanted: 1, spare: 2 };",
      "openChannel().postMessage(sent);",
      'const other = new BroadcastChannel("orb:other");',
      'other.addEventListener("message", (event: MessageEvent<Got>) => { void event.data.wanted; });',
    ].join("\n"),
  };
  const scan = await graphScan(plantedTree, { ...files, ...DOM_WORLDS }, entries(files));
  expect({ ...sentAndWritten(scan, SHAPES), unpaired: scan.analysis["message-receiver-unpaired"].map(({ label }) => label) }).toEqual({
    sent: [],
    written: ["Sent.spare"],
    unpaired: [`${PARENT}:8 broadcast`],
  });
});

test("a window listener takes what any window posts to it; an untyped receiver reads by name", { timeout: 120_000 }, async ({ plantedTree }) => {
  const files = {
    [SHAPES]: SHAPES_SOURCE,
    [PARENT]: [
      'import type { Sent } from "./shapes.ts";',
      "declare const frame: HTMLIFrameElement;",
      'window.addEventListener("message", (event) => { void event.data.wanted; });',
      "const sent: Sent = { wanted: 1, spare: 2 };",
      'frame.contentWindow?.postMessage(sent, "*");',
    ].join("\n"),
  };
  const scan = await graphScan(plantedTree, { ...files, ...DOM_WORLDS }, entries(files));
  expect({ ...sentAndWritten(scan, SHAPES), unpaired: scan.analysis["message-receiver-unpaired"] }).toEqual({
    sent: ["Sent.spare"],
    written: [],
    unpaired: [],
  });
});

test("an emitter event of another name and a worker module the parent does not load pair with nothing", { timeout: 120_000 }, async ({ plantedTree }) => {
  const files = {
    ...NODE_TYPES,
    [SHAPES]: SHAPES_SOURCE,
    [PARENT]: [
      NODE,
      'import { EventEmitter } from "events";',
      'import { Worker } from "worker_threads";',
      'import type { Got, Sent } from "./shapes.ts";',
      "const bus = new EventEmitter();",
      "const sent: Sent = { wanted: 1, spare: 2 };",
      'bus.emit("tick", sent);',
      'bus.on("tock", (value: Got) => { void value.wanted; });',
      'const worker = new Worker(new URL("./elsewhere.ts", import.meta.url));',
      "worker.postMessage(sent);",
    ].join("\n"),
    [CHILD]: [
      NODE,
      'import { parentPort } from "worker_threads";',
      'import type { Got } from "./shapes.ts";',
      'parentPort?.on("message", (value: Got) => { void value.wanted; });',
    ].join("\n"),
  };
  const scan = await graphScan(plantedTree, files, entries(files));
  expect({ ...sentAndWritten(scan, SHAPES), unpaired: scan.analysis["message-receiver-unpaired"].map(({ label }) => label) }).toEqual({
    sent: ["Sent.wanted", "Sent.spare"],
    written: [],
    unpaired: [`${CHILD}:4 worker`, `${PARENT}:8 emitter`],
  });
});
