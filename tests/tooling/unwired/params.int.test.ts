// `pnpm unwired params` reports optional parameters and props no production call supplies, and parameters every call
// passes the same literal. A callable whose value escapes, a single caller and a spread argument are controls.
import { expect, plantedTsconfig, test } from "@orb/testkit/tooling";
import { scanParams } from "../../../tooling/src/unwired/index.ts";
import { JSX_NAMESPACE, LIB, WORLD } from "./_planted.ts";

const TREE = {
  [WORLD]: plantedTsconfig({ lib: LIB, jsx: "preserve" }),
  "packages/a/src/jsx.d.ts": JSX_NAMESPACE,
  "packages/a/src/calls.ts": [
    'export function greet(name: string, loud?: boolean, prefix = "hi"): string {',
    '  return prefix + name + (loud === true ? "!" : "");',
    "}",
    "export function tag(kind: string, count: number): string {",
    "  return kind.repeat(count);",
    "}",
    "export function once(kind: string): string {",
    "  return kind;",
    "}",
    "export function escaped(limit?: number): number {",
    "  return limit ?? 0;",
    "}",
    "export interface Options {",
    "  color?: string;",
    "  size?: number;",
    "}",
    "export function paint(options: Options): string {",
    '  return (options.color ?? "") + String(options.size ?? 0);',
    "}",
    "export function relay(options: Options): string {",
    "  return paint(options);",
    "}",
    "export interface Port {",
    "  send(message: string, retries?: number): void;",
    "}",
    "export const port: Port = { send: () => undefined };",
    'port.send("first");',
    'port.send("second");',
    'export const lines = [greet("a"), greet("b", true), tag("x", 1), tag("x", 2), once("y"), paint({ color: "red" }), relay({})];',
    "export const handlers = [escaped];",
  ].join("\n"),
  "packages/a/src/badge.tsx": [
    "export function Badge(props: { label: string; tone?: string; size?: number }): JSX.Element {",
    "  return <span>{props.label}{props.tone}{props.size}</span>;",
    "}",
    'export const shown = <Badge label="x" tone="loud" />;',
  ].join("\n"),
};

test("the params scan reports unsupplied parameters, constant literals and unset props", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(TREE);
  const report = scanParams({ root, worlds: [WORLD], testWorlds: [], deliberate: [], log: () => undefined });
  const found = report.unwired.map(({ home, member, kind, literal, calls }) => ({ at: `${home}(${member})`, kind, literal, calls }));
  expect(found.toSorted((a, b) => a.at.localeCompare(b.at))).toEqual([
    { at: "Badge(props.size)", kind: "unsupplied-prop", literal: null, calls: 1 },
    { at: "greet(prefix)", kind: "unsupplied", literal: null, calls: 2 },
    { at: "Port.send(retries)", kind: "unsupplied", literal: null, calls: 2 },
    { at: "relay(options.size)", kind: "unsupplied-prop", literal: null, calls: 1 },
    { at: "tag(kind)", kind: "same-literal", literal: '"x"', calls: 2 },
  ]);
  expect(report.disagreements).toEqual([]);
});

// One file per false-positive class of the params review, each beside a twin the scan must still report. A finding is
// `home(member)`, so a fix that hides the twin fails as surely as one that leaves the false positive.
const SUPPLY_TREE = {
  [WORLD]: plantedTsconfig({ lib: LIB }),
  // A spread of a conditional literal supplies every prop it may carry. The restated inline options type is a separate
  // home, so its instruction, supplied only through the other declaration, still reports.
  "packages/a/src/conditional-spread.ts": [
    "export interface RerankOptions {",
    "  instruction?: string;",
    "  signal: string;",
    "}",
    "export interface Roles {",
    "  rerank(query: string, opts: { instruction?: string; signal: string }): number;",
    "}",
    "export interface Reranker {",
    "  rerank(query: string, opts: RerankOptions): number;",
    "}",
    'export const roles: Roles = { rerank: (query, opts) => query.length + (opts.instruction ?? "").length };',
    'export const reranker: Reranker = { rerank: (query, opts) => query.length - (opts.instruction ?? "").length };',
    "export function pick(aware: boolean): number {",
    '  return reranker.rerank("q", { ...(aware ? { instruction: "pick" } : {}), signal: "s" }) + reranker.rerank("r", { signal: "s" });',
    "}",
    'export const searched = [roles.rerank("a", { signal: "s" }), roles.rerank("b", { signal: "s" })];',
  ].join("\n"),
  // A field the executor adds in a spread on its way to the backend is supplied; one nothing adds is not.
  "packages/a/src/pipeline-spread.ts": [
    "export interface Accounting {",
    "  record(count: number): void;",
    "}",
    "export interface EmbedRequest {",
    "  readonly signal: string;",
    "  readonly accounting?: Accounting;",
    "  readonly dimensions?: number;",
    "}",
    "export interface Backend {",
    "  readonly embed?: (req: EmbedRequest) => number;",
    "}",
    "export interface Executor {",
    "  readonly embed: (req: EmbedRequest) => number;",
    "}",
    "function runTask<Req extends { readonly signal: string }, Res>(args: { readonly backend: Backend; readonly pick: (backend: Backend) => ((req: Req) => Res) | undefined; readonly req: Req }): Res {",
    "  const run = args.pick(args.backend);",
    "  if (run === undefined) {",
    '    throw new Error("no backend");',
    "  }",
    "  return run(args.req);",
    "}",
    "export function executor(backend: Backend, accounting: Accounting): Executor {",
    "  return { embed: (req) => runTask({ backend, pick: (b) => b.embed, req: { ...req, accounting } }) };",
    "}",
    "export const backend: Backend = {",
    "  embed: (req) => {",
    "    req.accounting?.record(1);",
    "    return req.dimensions ?? 0;",
    "  },",
    "};",
    'export const embedded = executor(backend, { record: () => undefined }).embed({ signal: "s" });',
  ].join("\n"),
  // An args type two callees share: a prop the sibling's caller sets is supplied; one nobody sets is not.
  "packages/a/src/shared-args.ts": [
    "export interface ScriptArgs {",
    "  readonly text: string;",
    "  readonly applyReplace?: (subject: string) => string;",
    "  readonly passLength?: number;",
    "}",
    "export function runScripts(args: ScriptArgs): string {",
    "  return (args.applyReplace ?? ((subject: string) => subject))(args.text) + String(args.passLength ?? 0);",
    "}",
    "export function displayScripts(args: ScriptArgs): string {",
    "  return runScripts({ ...args, text: args.text.trim() });",
    "}",
    "export function instrumented(text: string): string {",
    "  return runScripts({ text, applyReplace: (subject) => subject.toUpperCase() });",
    "}",
    'export type KindRead = Parameters<Runtime["modelTasks"]>[1];',
    "export interface Runtime {",
    "  modelTasks(row: string, read: { cachedFacts?: boolean; listWhenCold?: boolean; staleAfter?: number }): readonly string[];",
    "}",
    "export function everywhereTasks(runtime: Runtime, row: string, read: KindRead = {}): readonly string[] {",
    "  return runtime.modelTasks(row, read);",
    "}",
    "export function listed(runtime: Runtime): readonly string[] {",
    '  return [...runtime.modelTasks("a", { cachedFacts: true, listWhenCold: true }), ...everywhereTasks(runtime, "b", { cachedFacts: true }), ...everywhereTasks(runtime, "c")];',
    "}",
    'export const shown = [displayScripts({ text: "a" }), instrumented("b")];',
  ].join("\n"),
  // A hook pair shares one options type, yet only the Y hook's caller passes options: the X parameter is unsupplied.
  "packages/a/src/shared-hook-options.ts": [
    "export interface FadeOptions {",
    "  readonly sizedByCaller?: boolean;",
    "}",
    "function fade(target: string, horizontal: boolean, options: FadeOptions): string {",
    "  return target + String(horizontal) + String(options.sizedByCaller ?? false);",
    "}",
    "export function fadeX(target: string, options: FadeOptions = {}): string {",
    "  return fade(target, true, options);",
    "}",
    "export function fadeY(target: string, options: FadeOptions = {}): string {",
    "  return fade(target, false, options);",
    "}",
    'export const faded = [fadeX("strip"), fadeY("rail", { sizedByCaller: true }), fadeY("home")];',
  ].join("\n"),
  // A field the callee adds to its argument before sending it on is supplied; a field nothing adds is not.
  "packages/a/src/callee-body.ts": [
    'export type Message = { readonly kind: "response"; readonly id: string; readonly refusal?: string; readonly retried?: number } | { readonly kind: "log"; readonly line: string };',
    "export const sent: Message[] = [];",
    "function post(message: Message): void {",
    "  sent.push(message);",
    "}",
    'function completeCommand(response: Extract<Message, { readonly kind: "response" }>, refusal: string | undefined): void {',
    "  post(refusal === undefined ? response : { ...response, refusal });",
    "}",
    "export function settle(id: string, refusal: string | undefined): void {",
    '  completeCommand({ kind: "response", id }, refusal);',
    '  completeCommand({ kind: "response", id: "second" }, undefined);',
    "}",
  ].join("\n"),
  // A structural view of a platform object: its single-literal parameter is the platform's, not a caller's choice.
  "packages/a/src/platform-view.ts": [
    "export interface MediaListView {",
    "  readonly matches: boolean;",
    '  readonly addEventListener: (type: "change", listener: () => void) => void;',
    "}",
    "export interface Bus {",
    "  emit(event: string, listener: () => void): void;",
    "}",
    "declare const matchMedia: (query: string) => MediaListView;",
    "export function watch(query: string, bus: Bus, listener: () => void): boolean {",
    "  const list = matchMedia(query);",
    '  list.addEventListener("change", listener);',
    '  matchMedia("(hover: none)").addEventListener("change", listener);',
    '  bus.emit("change", listener);',
    '  bus.emit("change", () => undefined);',
    "  return list.matches;",
    "}",
  ].join("\n"),
  // Findings the review judged true: a comment or a doc link naming the prop supplies nothing, and a same-named
  // field another type carries is a different declaration.
  "packages/a/src/true-findings.ts": [
    "export interface RevokeParams {",
    "  readonly credentialId: string;",
    "  readonly reason?: string;",
    "}",
    "export interface Credentials {",
    "  markRevokedByUser(params: RevokeParams): string;",
    "}",
    'export const credentials: Credentials = { markRevokedByUser: (params) => params.credentialId + (params.reason ?? "revoked") };',
    "/** Revoke one credential; {@link RevokeParams.reason} is recorded in the audit line. */",
    "export function revoke(credentialId: string): string {",
    '  // Callers may pass { reason: "user" } to say why.',
    "  return credentials.markRevokedByUser({ credentialId });",
    "}",
    "export interface Usage {",
    "  readonly servedModel?: string;",
    "  readonly tokens: number;",
    "}",
    "export interface CapabilityLog {",
    "  readonly model: string;",
    "  readonly servedModel?: string;",
    "}",
    "export interface ProviderLogger {",
    "  capability(entry: CapabilityLog): string;",
    "}",
    "export const logger: ProviderLogger = { capability: (entry) => entry.servedModel ?? entry.model };",
    "export function emitTurnReceipts(usage: Usage): string {",
    '  return logger.capability({ model: "m" }) + String(usage.tokens);',
    "}",
    'export const receipts = emitTurnReceipts({ servedModel: "served", tokens: 1 });',
  ].join("\n"),
};

test("the params scan credits spread, shared-type and callee-body supplies and keeps each unsupplied twin", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(SUPPLY_TREE);
  const report = scanParams({ root, worlds: [WORLD], testWorlds: [], deliberate: [], log: () => undefined });
  const inFile = (file: string): readonly string[] =>
    report.unwired
      .filter((finding) => finding.file === `packages/a/src/${file}.ts`)
      .map(({ home, member, kind }) => `${kind} ${home}(${member})`)
      .toSorted();
  expect.soft(inFile("conditional-spread")).toEqual(["unsupplied-prop Roles.rerank(opts.instruction)"]);
  expect.soft(inFile("pipeline-spread")).toEqual(["unsupplied-prop Executor.embed(req.dimensions)"]);
  expect.soft(inFile("shared-args")).toEqual(["unsupplied-prop displayScripts(args.passLength)", "unsupplied-prop everywhereTasks(read.staleAfter)"]);
  expect.soft(inFile("shared-hook-options")).toEqual(["unsupplied fadeX(options)"]);
  expect.soft(inFile("callee-body")).toEqual(["unsupplied-prop completeCommand(response.retried)"]);
  expect.soft(inFile("platform-view")).toEqual(["same-literal Bus.emit(event)"]);
  expect
    .soft(inFile("true-findings"))
    .toEqual(["unsupplied-prop Credentials.markRevokedByUser(params.reason)", "unsupplied-prop ProviderLogger.capability(entry.servedModel)"]);
  expect(report.disagreements).toEqual([]);
});
