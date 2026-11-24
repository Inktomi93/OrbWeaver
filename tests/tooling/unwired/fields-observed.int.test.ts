// A member the product never reads and sends only to an observability sink is observed, never judged: a log line the
// checker resolves to a logging library through an in-tree port the composition root fills, a callee or receiver
// declared in the observability home, or a value published to the dev bridge. The sink is each send's resolved target:
// a logger-named function that writes a file, a console look-alike and a send from the observability home to the
// network stay findings.
import { expect, test } from "@orb/testkit/tooling";
import type { FieldsReport } from "../../../tooling/src/unwired/index.ts";
import { fieldsScan, libraryModule, NODE_TYPES } from "./_planted.ts";

const HOME = "packages/server/src/foundation/observability";

const LIBRARIES = {
  ...libraryModule(["export interface Logger { info(obj: object, msg?: string): void }"], "pino"),
  ...libraryModule(["export interface Context { json<T>(object: T): unknown }"], "hono"),
  ...NODE_TYPES,
};

// Member names carry a zq prefix so the literal stage of a real-tree scan never matches this file.
const PORTS = [
  'import type { Logger } from "pino";',
  "export interface InferenceLog { readonly info: (fields: Readonly<Record<string, unknown>>, message: string) => void }",
  "export interface Deps { readonly log: InferenceLog }",
  "export interface ProviderLogger { emit(level: keyof InferenceLog, event: string, fields?: Readonly<Record<string, unknown>>): void }",
  "export function providerLogger(log: InferenceLog): ProviderLogger {",
  '  const emit: ProviderLogger["emit"] = (level, event, fields = {}) => { log[level]({ provider: true, event, ...fields }, event); };',
  "  return { emit };",
  "}",
  "interface TurnLog { readonly zqTurnId: string; readonly zqTokens: number }",
  'export const runTurn = (deps: Deps): void => providerLogger(deps.log).emit("info", "turn", { zqTurnId: "t", zqTokens: 1 } satisfies TurnLog);',
  "export const compose = (logger: Logger): void => runTurn({ log: logger });",
  // A port the root fills with its own function, which keeps the value: no logging library takes it.
  "export interface Sink { readonly put: (fields: Readonly<Record<string, unknown>>) => void }",
  "interface Stashed { readonly zqStashed: string }",
  "const stash: unknown[] = [];",
  'const keep = (sink: Sink): void => sink.put({ zqStashed: "s" } satisfies Stashed);',
  "export const root = (): void => keep({ put: (fields) => { stash.push(fields); } });",
].join("\n");

const LOOKALIKES = [
  '/// <reference types="node" />',
  'import { writeFileSync } from "node:fs";',
  "interface Spilled { readonly zqSpilled: string }",
  'const logLine = (entry: Readonly<Record<string, unknown>>): void => writeFileSync("spill", JSON.stringify(entry));',
  'export const spill = (): void => logLine({ zqSpilled: "x" } satisfies Spilled);',
  // A module's own `console` shadows the platform's: its member is a signature no logging library fills.
  "declare const console: { log(value: Readonly<Record<string, unknown>>): void };",
  "interface Echoed { readonly zqEchoed: string }",
  'export const echo = (): void => console.log({ zqEchoed: "e" } satisfies Echoed);',
].join("\n");

const ROUTES = [
  '/// <reference types="node" />',
  'import type { Context } from "hono";',
  "interface Integrity { readonly zqOk: boolean }",
  "const probe = (): Integrity => ({ zqOk: true });",
  "export const route = (c: Context): unknown => c.json(probe());",
  "interface Beacon { readonly zqBeacon: string }",
  'export const beacon = (): Promise<unknown> => fetch("https://example.invalid", { body: JSON.stringify({ zqBeacon: "b" } satisfies Beacon) });',
].join("\n");

const RINGS = ["const ring: unknown[] = [];", "export const record = (entry: Readonly<Record<string, unknown>>): void => { ring.push(entry); };"].join("\n");

const DOMAIN = [
  'import { record } from "../foundation/observability/rings.ts";',
  "interface BuildTrace { readonly zqBlocks: number }",
  "export const build = (): void => record({ zqBlocks: 1 } satisfies BuildTrace);",
].join("\n");

const BRIDGE = [
  "export interface BusRecord { readonly zqType: string }",
  'const events: BusRecord[] = [{ zqType: "t" }];',
  "export interface Handle { readonly bus: () => readonly BusRecord[] }",
  "declare global { var __zqBridge: Handle | undefined }",
  "export const install = (): void => { globalThis.__zqBridge = { bus: () => events }; };",
].join("\n");

const line = ({ home, member, sent }: FieldsReport["unwired"][number]): string =>
  [`${home}.${member}`, ...sent.map((send) => send.split(" ").toSpliced(1, 1).join(" "))].join(" ");

test("a member sent only to a resolved observability sink is observed, and a look-alike sink stays a finding", { timeout: 120_000 }, async ({
  plantedTree,
}) => {
  const report = await fieldsScan(plantedTree, {
    ...LIBRARIES,
    "packages/inference/src/ports.ts": PORTS,
    "packages/a/src/lookalikes.ts": LOOKALIKES,
    [`${HOME}/routes.ts`]: ROUTES,
    [`${HOME}/rings.ts`]: RINGS,
    "packages/server/src/domain/build.ts": DOMAIN,
    "packages/a/src/bridge.ts": BRIDGE,
  });
  expect(report.observed.map(line).toSorted()).toEqual([
    "BuildTrace.zqBlocks observability record",
    "BusRecord.zqType observability dev bridge",
    "Integrity.zqOk observability c.json",
    "TurnLog.zqTokens log pino",
    "TurnLog.zqTurnId log pino",
  ]);
  const reported = new Set(report.unwired.map(line));
  for (const finding of ["Stashed.zqStashed unclassified", "Spilled.zqSpilled file", "Echoed.zqEchoed unclassified", "Beacon.zqBeacon wire"]) {
    expect(reported).toContain(finding);
  }
});
