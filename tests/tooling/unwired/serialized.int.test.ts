// Where a serialization's string goes decides what it does with the value (tooling/src/unwired/open-sends.ts header):
// each case's holder `Box_<case>` has one member `m`, and its only use is a `JSON.stringify` of a value of it. A case
// whose string reaches a read leaves no row; any other leaves `m` never-read with the destination its row names. Each
// destination's case sits beside a twin that spells the same name but resolves to the tree's own declaration, so a fix
// that decides by the name fails the twin.
import { expect, test } from "@orb/testkit/tooling";
import type { SendDestination } from "../../../tooling/src/unwired/boundaries.ts";
import { CHASE_STOPPED } from "../../../tooling/src/unwired/open-sends.ts";
import { fieldsScan, GRAPH_SOURCE, graphScan, libraryModule, NODE_TYPES } from "./_planted.ts";

const FILE = `${GRAPH_SOURCE}/serialized.ts`;

const DRIZZLE = libraryModule(["export declare function sql(parts: TemplateStringsArray, ...values: unknown[]): unknown;"], "drizzle-orm");
const PINO = libraryModule(["export interface Logger { info(text: string): void }", "export declare const base: Logger;"], "pino");
const LIBRARY = libraryModule([
  "export declare const logger: { info(text: string): void };",
  "export declare function encode(text: string): string;",
  "export declare function writeFileSync(path: string, data: string): void;",
]);

// biome-ignore lint/suspicious/noTemplateCurlyInString: the planted source's own template substitution, not this file's.
const SUBSTITUTED = "${JSON.stringify(v)}";

const HEAD = [
  '/// <reference types="node" />',
  'import { createHash } from "node:crypto";',
  'import { writeFileSync } from "node:fs";',
  'import { sql } from "drizzle-orm";',
  'import { encode, logger, writeFileSync as libraryWrite } from "lib";',
  'import { base } from "pino";',
  "const seen = new Map<string, number>();",
  "class KeyMap { get(key: string): number { return key.length; } }",
  'const digest = (text: string): string => createHash("sha256").update(text).digest("hex");',
  'function hashKey(text: string): void { writeFileSync("k", text); }',
  'const log = (text: string): void => { writeFileSync("l", text); };',
  "class Channel { send(text: string): void { void text; } }",
  "interface Envelope { readonly body: string }",
  "class FailError extends Error {}",
  "class ParseError { constructor(message: string) { void message; } }",
];

// Each case's use of its value `v`, and the destination its row names: null where the string reaches a read.
const CASES: Readonly<Record<string, { readonly use: string; readonly sent: SendDestination | null }>> = {
  mapKey: { use: "seen.get(JSON.stringify(v));", sent: null },
  setKey: { use: "new Set<string>().add(JSON.stringify(v));", sent: null },
  lookalikeMap: { use: "new KeyMap().get(JSON.stringify(v));", sent: "unclassified" },
  hash: { use: 'createHash("sha256").update(JSON.stringify(v));', sent: null },
  hashingHelper: { use: "digest(JSON.stringify(v));", sent: null },
  hashNamed: { use: "hashKey(JSON.stringify(v));", sent: "file" },
  console: { use: "console.log(JSON.stringify(v));", sent: "log" },
  logNamed: { use: "log(JSON.stringify(v));", sent: "file" },
  file: { use: 'writeFileSync("out", JSON.stringify(v));', sent: "file" },
  libraryFile: { use: 'libraryWrite("out", JSON.stringify(v));', sent: "dependency" },
  socket: { use: "new WebSocket().send(JSON.stringify(v));", sent: "wire" },
  lookalikeSocket: { use: "new Channel().send(JSON.stringify(v));", sent: "unclassified" },
  requestBody: { use: 'void fetch("/x", { body: JSON.stringify(v) });', sent: "wire" },
  ownBody: { use: "const envelope: Envelope = { body: JSON.stringify(v) }; void envelope;", sent: "unclassified" },
  sqlTag: { use: `void sql\`${SUBSTITUTED}\`;`, sent: "stored" },
  ownSqlTag: {
    use: `const sql = (parts: TemplateStringsArray, ...values: unknown[]): string => parts.join(""); void sql\`${SUBSTITUTED}\`;`,
    sent: "unclassified",
  },
  response: { use: "void new Response(JSON.stringify(v));", sent: "http" },
  ownResponse: { use: "class Response { constructor(text: string) { void text; } } void new Response(JSON.stringify(v));", sent: "unclassified" },
  blob: { use: "void new Blob([JSON.stringify(v)]);", sent: "file" },
  ownBlob: { use: "class Blob { constructor(parts: readonly string[]) { void parts; } } void new Blob([JSON.stringify(v)]);", sent: "unclassified" },
  error: { use: "void new Error(JSON.stringify(v));", sent: "error" },
  errorSubclass: { use: "void new FailError(JSON.stringify(v));", sent: "error" },
  errorNamed: { use: "void new ParseError(JSON.stringify(v));", sent: "unclassified" },
  keyNamedBinding: { use: "const cacheKey = JSON.stringify(v); console.log(cacheKey);", sent: "log" },
  keyBinding: { use: "const label = JSON.stringify(v); seen.has(label);", sent: null },
  compared: { use: 'void (JSON.stringify(v) === "x");', sent: null },
  // a logger-named member of a library that is no logging package takes the string as any library does
  libraryLogger: { use: "logger.info(JSON.stringify(v));", sent: "dependency" },
  loggingLibrary: { use: "base.info(JSON.stringify(v));", sent: "log" },
  library: { use: "encode(JSON.stringify(v));", sent: "dependency" },
};

const planted = Object.entries(CASES).flatMap(([name, { use }]) => [
  `export interface Box_${name} { readonly m: string }`,
  `export function use_${name}(): void {`,
  `  const v: Box_${name} = { m: "x" };`,
  `  ${use}`,
  "}",
]);

test("a serialization's string is judged by the declaration it reaches, never by a name", { timeout: 120_000 }, async ({ plantedTree }) => {
  const report = await fieldsScan(plantedTree, { ...NODE_TYPES, ...DRIZZLE, ...LIBRARY, ...PINO, [FILE]: [...HEAD, ...planted].join("\n") });
  // a row sent only to a log line is observed rather than reported; its destination is still the one its row names
  const rows = new Map(
    [...report.unwired, ...report.observed].filter(({ file }) => file === FILE).map(({ home, sent }) => [home, sent[0]?.split(" ")[0] ?? "none"]),
  );
  const found = Object.fromEntries(Object.keys(CASES).map((name) => [name, rows.get(`Box_${name}`) ?? null]));
  expect(found).toEqual(Object.fromEntries(Object.entries(CASES).map(([name, { sent }]) => [name, sent])));
});

// A string handed down four helpers before a map key takes it passes the depth bound: it is unclassified and counted,
// never credited as the key it would reach. The same key two helpers down reads the value.
test("a serialization chase the depth bound stops is unclassified and counted", { timeout: 120_000 }, async ({ plantedTree }) => {
  const chain = [
    "const seen = new Map<string, number>();",
    "const d = (text: string): void => { seen.get(text); };",
    "const c = (text: string): void => { d(text); };",
    "const b = (text: string): void => { c(text); };",
    "const a = (text: string): void => { b(text); };",
    "export interface Far { readonly m: string }",
    "export interface Near { readonly m: string }",
    'export const far = (): void => { const v: Far = { m: "x" }; a(JSON.stringify(v)); };',
    'export const near = (): void => { const v: Near = { m: "x" }; c(JSON.stringify(v)); };',
  ].join("\n");
  const report = await fieldsScan(plantedTree, { [FILE]: chain });
  expect(report.unwired.filter(({ file }) => file === FILE).map(({ home, sent }) => `${home} ${sent[0]?.split(" ")[0] ?? "none"}`)).toEqual([
    "Far unclassified",
  ]);
  const scan = await graphScan(plantedTree, { [FILE]: chain });
  expect(scan.counts.find(({ name }) => name === CHASE_STOPPED)?.count).toBe(1);
});
