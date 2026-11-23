// `pnpm unwired params` reports optional parameters and props no production call supplies, and parameters every call
// passes the same literal. A callable whose value escapes, a single caller and a spread argument are controls.
import { expect, test } from "@orb/testkit/tooling";
import type { JudgedEntry } from "../../../tooling/src/unwired/index.ts";
import { paramsGraph } from "../../../tooling/src/unwired/index.ts";
import { graphTree, JSX_NAMESPACE, JUDGED_WORK, judgedExpected, judgedOutcome, plantJudged } from "./_planted.ts";

const scanParams = (root: string, judged: readonly JudgedEntry[] = []): ReturnType<typeof paramsGraph> =>
  paramsGraph({ root, deliberate: [], judged }, () => undefined);

const TREE = {
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
    "export type Greeter = typeof greet;",
    "/** Built from {@link greet}. */",
    'export const greeting = greet("c");',
    "export function pair(head: string, tail?: number): string {",
    "  return head + String(tail);",
    "}",
    'const both: [string, number] = ["x", 1];',
    "export const paired = [pair(...both), pair(...both)];",
    "export function listed(limit?: number): number {",
    "  return limit ?? 0;",
    "}",
    "export const table = { listed };",
    "listed();",
  ].join("\n"),
  // A re-export forwards a callable and a type query names it: neither hands its value on.
  "packages/a/src/door.ts": 'export { greet } from "./calls.ts";',
  // A call through the interface is the interface member's; the class method's own calls never pass `flush`.
  "packages/a/src/sinks.ts": [
    "export interface Sink {",
    "  put(line: string, flush?: boolean): void;",
    "}",
    "export class FileSink implements Sink {",
    "  put(line: string, flush?: boolean): void {",
    "    void line;",
    "    void flush;",
    "  }",
    "}",
    "const sink: Sink = new FileSink();",
    'sink.put("a", true);',
    'sink.put("b", true);',
    'new FileSink().put("c");',
    'new FileSink().put("d");',
  ].join("\n"),
  "packages/a/src/badge.tsx": [
    "export function Badge(props: { label: string; tone?: string; size?: number }): JSX.Element {",
    "  return <span>{props.label}{props.tone}{props.size}</span>;",
    "}",
    'export const shown = <Badge label="x" tone="loud" />;',
  ].join("\n"),
};

test("the params scan reports unsupplied parameters, constant literals and unset props", { timeout: 120_000 }, async ({ plantedTree }) => {
  const report = await scanParams(await plantedTree(graphTree(TREE, { jsx: true })));
  const found = report.unwired.map(({ home, member, kind, literal, calls }) => ({ at: `${home}(${member})`, kind, literal, calls }));
  expect(found.toSorted((a, b) => a.at.localeCompare(b.at))).toEqual([
    { at: "Badge(props.size)", kind: "unsupplied-prop", literal: null, calls: 1 },
    { at: "FileSink.put(flush)", kind: "unsupplied", literal: null, calls: 2 },
    { at: "greet(prefix)", kind: "unsupplied", literal: null, calls: 3 },
    { at: "Port.send(retries)", kind: "unsupplied", literal: null, calls: 2 },
    { at: "relay(options.size)", kind: "unsupplied-prop", literal: null, calls: 1 },
    { at: "Sink.put(flush)", kind: "same-literal", literal: "true", calls: 2 },
    { at: "tag(kind)", kind: "same-literal", literal: '"x"', calls: 2 },
  ]);
});

// One file per false-positive class of the params review, each beside a twin the scan must still report. A finding is
// `home(member)`, so a fix that hides the twin fails as surely as one that leaves the false positive.
const SUPPLY_TREE = {
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
  // A callee filling its own default, a relay of the prop's own value and a constant nothing passes supply nothing; a
  // constant passed by name to its callable does.
  "packages/a/src/self-default.ts": [
    "export interface ColorOpts {",
    "  readonly color?: string;",
    "  readonly size?: number;",
    "}",
    "export function paint(options: ColorOpts): string {",
    '  const filled: ColorOpts = { ...options, color: options.color ?? "red" };',
    '  return (filled.color ?? "") + String(options.size ?? 0);',
    "}",
    "export interface ToneOpts {",
    "  readonly tone?: string;",
    "  readonly size?: number;",
    "}",
    "function inner(options: ToneOpts): string {",
    '  return (options.tone ?? "") + String(options.size ?? 0);',
    "}",
    "export function shade(options: ToneOpts): string {",
    '  return inner({ ...options, tone: options.tone ?? "flat" });',
    "}",
    "export interface ModeOpts {",
    "  readonly mode?: string;",
    "  readonly size?: number;",
    "}",
    'export const PRESET: ModeOpts = { mode: "fast" };',
    'export const LOUD: ModeOpts = { mode: "loud" };',
    "export function run(options: ModeOpts): string {",
    '  return (options.mode ?? "slow") + String(options.size ?? 0);',
    "}",
    "export function go(options: ModeOpts): string {",
    '  return (options.mode ?? "slow") + String(options.size ?? 0);',
    "}",
    "export const out = [paint({}), paint({ size: 1 }), shade({ size: 1 }), run({ size: 2 }), run({}), go(LOUD), go({ size: 1 }), PRESET.mode];",
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
    "export interface BaseOpts {",
    "  readonly label?: string;",
    "}",
    "export interface WideOpts extends BaseOpts {",
    "  readonly label?: string;",
    "  readonly size: number;",
    "}",
    "export function base(opts: BaseOpts): string {",
    '  return opts.label ?? "";',
    "}",
    "export function wide(opts: WideOpts): string {",
    '  return (opts.label ?? "") + String(opts.size);',
    "}",
    'export const labels = [base({}), wide({ label: "w", size: 1 })];',
    "export interface Internal {",
    "  readonly id: string;",
    "  readonly stamp?: number;",
    "}",
    "export interface Wire {",
    "  readonly id: string;",
    "  readonly stamp?: string;",
    "}",
    "function send(wire: Wire): string {",
    '  return wire.id + (wire.stamp ?? "");',
    "}",
    "export function take(internal: Internal): string {",
    '  return internal.id + String(internal.stamp ?? 0) + send({ ...internal, stamp: "x" });',
    "}",
    'export const taken = [take({ id: "a" }), take({ id: "b" })];',
  ].join("\n"),
};

test("the params scan credits spread, shared-type and callee-body supplies and keeps each unsupplied twin", { timeout: 120_000 }, async ({ plantedTree }) => {
  const report = await scanParams(await plantedTree(graphTree(SUPPLY_TREE)));
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
  expect
    .soft(inFile("self-default"))
    .toEqual(["unsupplied-prop paint(options.color)", "unsupplied-prop run(options.mode)", "unsupplied-prop shade(options.tone)"]);
  expect.soft(inFile("platform-view")).toEqual(["same-literal Bus.emit(event)"]);
  expect
    .soft(inFile("true-findings"))
    .toEqual([
      "unsupplied-prop Credentials.markRevokedByUser(params.reason)",
      "unsupplied-prop ProviderLogger.capability(entry.servedModel)",
      "unsupplied-prop base(opts.label)",
      "unsupplied-prop take(internal.stamp)",
    ]);
});

// A row whose fix an open item owns reports apart, with its item; an entry whose item is done or whose row no longer
// reports is stale, and the done item's row reports as unwired again.
test("a judged row reports apart with its open item, and an entry for a done item or a gone row is stale", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree({ ...graphTree(TREE, { jsx: true }), ...JUDGED_WORK });
  const judged = plantJudged(await scanParams(root), "greet.prefix", "tag.kind");
  expect(judgedOutcome(await scanParams(root, judged), "greet.prefix", "tag.kind")).toEqual(judgedExpected("greet.prefix", "tag.kind"));
});

// A component reached only through a dynamic import's namespace, as `lazy(() => import(...).then((m) => ({ default: m.X })))`,
// escapes into the loader, so its props are never judged, whatever its other callers pass. `Shown`, rendered by name
// only, is the judged twin.
const LAZY_TREE = {
  "packages/a/src/jsx.d.ts": JSX_NAMESPACE,
  "packages/a/src/editor.tsx": [
    "export interface EditorProps { readonly value: string; readonly readOnly?: boolean }",
    'export function Editor(props: EditorProps): JSX.Element { return <div>{props.value}{props.readOnly === true ? "ro" : ""}</div>; }',
    "export interface ShownProps { readonly value: string; readonly muted?: boolean }",
    'export function Shown(props: ShownProps): JSX.Element { return <div>{props.value}{props.muted === true ? "m" : ""}</div>; }',
  ].join("\n"),
  "packages/a/src/lazy-page.tsx": [
    "const lazy = <T,>(load: () => Promise<{ readonly default: T }>): (() => Promise<T>) => async () => (await load()).default;",
    'export const loadEditor = lazy(() => import("./editor.tsx").then((m) => ({ default: m.Editor })));',
  ].join("\n"),
  "packages/a/src/page.tsx": ['import { Editor, Shown } from "./editor.tsx";', 'export const page = [<Shown value="s" />, <Editor value="e" />];'].join("\n"),
};

test("a component a dynamic import's namespace hands on escapes, and its rendered twin is judged", { timeout: 120_000 }, async ({ plantedTree }) => {
  const report = await scanParams(await plantedTree(graphTree(LAZY_TREE, { jsx: true })));
  expect(report.unwired.map(({ home, member, kind }) => `${kind} ${home}(${member})`)).toEqual(["unsupplied-prop Shown(props.muted)"]);
});

// Every product write of a prop is judged, so the order the walk meets them in decides nothing: a local store of the
// request (no supply) before or after the executor's generic-slot construction (a supply) gives one verdict.
const STASH =
  "export function stash(req: EmbedRequest, accounting: Accounting): EmbedRequest {\n  const copy: EmbedRequest = { ...req, accounting };\n  return copy;\n}";
test.for(["before", "after"])(
  "a store of the prop %s the supplying construction leaves the verdict alone",
  { timeout: 120_000 },
  async (order, { plantedTree }) => {
    const pipeline = SUPPLY_TREE["packages/a/src/pipeline-spread.ts"];
    const at = pipeline.indexOf("export function executor");
    const planted = order === "before" ? `${pipeline.slice(0, at)}${STASH}\n${pipeline.slice(at)}` : `${pipeline}\n${STASH}`;
    const report = await scanParams(await plantedTree(graphTree({ "packages/a/src/pipeline-spread.ts": planted })));
    expect(report.unwired.map(({ home, member, kind }) => `${kind} ${home}(${member})`)).toEqual(["unsupplied-prop Executor.embed(req.dimensions)"]);
  },
);
