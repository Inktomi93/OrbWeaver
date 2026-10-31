// `pnpm unwired fields` reports dead data: a field production writes and never reads, an optional field it reads and
// never writes, and one it never names. Each read and write form the scan must see has a wired control beside it.
import { expect, plantedTsconfig, test } from "@orb/testkit/tooling";
import { scanFields } from "../../../tooling/src/unwired/index.ts";
import { LIB, WORLD } from "./_planted.ts";

const TREE = {
  [WORLD]: plantedTsconfig({ lib: LIB }),
  "packages/a/src/z.ts": [
    "export interface Schema<V> { readonly value?: V; optional(): Schema<V | undefined> }",
    "const schema = <V>(): Schema<V> => ({ optional: () => schema<V | undefined>() });",
    "export type Infer<S> = S extends { readonly shape: infer T } ? { [K in keyof T]: T[K] extends Schema<infer V> ? V : never } : never;",
    "export const z = {",
    "  object: <T>(shape: T): { readonly shape: T } => ({ shape }),",
    "  discriminatedUnion: <T>(key: string, options: T): { readonly shape: T } => ({ shape: options }),",
    "  lazy: <T>(make: () => T): T => make(),",
    "  string: (): Schema<string> => schema<string>(),",
    "};",
    "export type Checked<T> = { readonly shape: unknown } & { readonly checked?: T };",
  ].join("\n"),
  "packages/a/src/row.ts": [
    'import type { Checked, Infer } from "./z.ts";',
    'import { z } from "./z.ts";',
    "export interface Row {",
    "  id: string;",
    "  dead: number;",
    "  label?: string;",
    "  always?: boolean;",
    "  ghost?: string;",
    "  destructured: string;",
    "  indexed: number;",
    "}",
    "export interface Props {",
    "  tone?: string;",
    "}",
    "export function makeRow(): Row {",
    '  return { id: "a", dead: 1, label: "x", destructured: "d", indexed: 2 };',
    "}",
    "const row = makeRow();",
    "const { destructured } = row;",
    'export const shown = [row.id, row.label, row.always === true, destructured, row["indexed"]];',
    'export const view = (props: Props): string => props.tone ?? "plain";',
    "export const Settings = z.object({ theme: z.string(), extra: z.string().optional() });",
    'export const themed = (settings: Infer<typeof Settings>): string => settings.theme + (settings.extra ?? "");',
    "export interface Shown {",
    "  title: string;",
    "  note: string;",
    "}",
    "export const ShownSchema = z.object({ title: z.string(), note: z.string() }) satisfies Checked<Shown>;",
    'export const made: Shown = { title: "t", note: "n" };',
    "export const titled = (shown: Infer<typeof ShownSchema>): string => shown.title;",
    'export const themeOnly = (theme: string): Pick<Infer<typeof Settings>, "theme"> => ({ theme });',
  ].join("\n"),
  // Reads no name shows, and homes whose value comes from outside the tree: each is a control beside a found case.
  "packages/a/src/outside.ts": [
    'import type { Checked, Infer } from "./z.ts";',
    'import { z } from "./z.ts";',
    "export interface HostView {",
    "  readonly clip?: string;",
    "  readonly gone?: string;",
    "}",
    "const host = globalThis as unknown as HostView;",
    'export const clip = host.clip ?? "";',
    "export const Env = z.object({ port: z.string().optional() });",
    'export const port = (env: Infer<typeof Env>): string => env.port ?? "8080";',
    "export interface Copied {",
    "  readonly a: string;",
    "  readonly b: string;",
    "}",
    'const copied: Copied = { a: "a", b: "b" };',
    "export const copy = { ...copied };",
    "export interface Keyed {",
    "  readonly x: number;",
    "  readonly y: number;",
    "  readonly unkeyed: number;",
    "}",
    "const keyed: Keyed = { x: 1, y: 2, unkeyed: 3 };",
    'export const pick = (key: "x" | "y"): number => keyed[key];',
    "export interface Listed {",
    "  readonly p: string;",
    "  readonly q: string;",
    "}",
    'const listed: Listed = { p: "p", q: "q" };',
    "export const entries = Object.entries(listed);",
    'export type Health = { status: "ok"; at: string } | { status: "down"; at: string; reason: string; detail?: string };',
    'export const HealthSchema = z.discriminatedUnion("status", [',
    "  z.object({ status: z.string(), at: z.string() }),",
    "  z.object({ status: z.string(), at: z.string(), reason: z.string(), detail: z.string().optional() }),",
    "]) satisfies Checked<Health>;",
    'export const health = (shown: Health): string => (shown.status === "down" ? shown.reason : shown.at);',
    "export type Tree = { kind: string; leaf?: string };",
    "export const TreeSchema: Checked<Tree> = z.lazy(() => z.object({ kind: z.string(), leaf: z.string().optional() }));",
    "export const treeKind = (tree: Tree): string => tree.kind;",
  ].join("\n"),
  // Each level redeclares `title`; production reads only the leaf's. The base and middle declarations are read through
  // the leaf, while the unrelated `Stranger.title` beside them is not.
  "packages/a/src/inherit.ts": [
    "export interface BaseCfg { readonly title: string; readonly spare: string }",
    "export interface MidCfg extends BaseCfg { readonly title: string }",
    "export interface LeafCfg extends MidCfg { readonly title: string }",
    "export interface Stranger { readonly title: string }",
    'export const leaf: LeafCfg = { title: "t", spare: "s" };',
    "export const shownLeaf = leaf.title;",
  ].join("\n"),
  "tsconfig.json": plantedTsconfig({ lib: LIB, include: ["packages/*/src", "tests"] }),
  "tests/row.test.ts": 'import { makeRow } from "../packages/a/src/row.ts";\nexport const probed = makeRow().dead;',
};

test("the fields scan reports never-read, never-written and unreferenced fields, schema keys included", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(TREE);
  const report = scanFields({ root, worlds: [WORLD], testWorlds: ["tsconfig.json"], deliberate: [], log: () => undefined });
  const found = report.unwired.map(({ home, member, kind, origin, tests }) => ({ field: `${home}.${member}`, kind, origin, tests }));
  expect(found.toSorted((a, b) => a.field.localeCompare(b.field))).toEqual([
    { field: "BaseCfg.spare", kind: "never-read", origin: "type", tests: 0 },
    { field: "HealthSchema.detail", kind: "unreferenced", origin: "schema", tests: 0 },
    { field: "HostView.gone", kind: "unreferenced", origin: "type", tests: 0 },
    { field: "Keyed.unkeyed", kind: "never-read", origin: "type", tests: 0 },
    { field: "Row.always", kind: "never-written", origin: "type", tests: 0 },
    { field: "Row.dead", kind: "never-read", origin: "type", tests: 1 },
    { field: "Row.ghost", kind: "unreferenced", origin: "type", tests: 0 },
    { field: "Schema.value", kind: "unreferenced", origin: "type", tests: 0 },
    { field: "Settings.extra", kind: "never-written", origin: "schema", tests: 0 },
    { field: "Shown.note", kind: "never-read", origin: "type", tests: 0 },
    { field: "Stranger.title", kind: "unreferenced", origin: "type", tests: 0 },
    { field: "Tree.leaf", kind: "unreferenced", origin: "type", tests: 0 },
  ]);
  expect(report.disagreements).toEqual([]);
});

test("a field the deliberate list names leaves the unwired list with its reason", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(TREE);
  const reason = "read by an external consumer";
  const report = scanFields({
    root,
    worlds: [WORLD],
    testWorlds: [],
    deliberate: [{ file: "packages/a/src/row.ts", home: "Row", member: "dead", reason }],
    log: () => undefined,
  });
  expect(report.deliberate.map(({ member, reason: why }) => ({ member, why }))).toEqual([{ member: "dead", why: reason }]);
  expect(report.unwired.map(({ member }) => member)).not.toContain("dead");
});

// The client imports the router through `@orb/server`; with no declaration surface planted, only the scans' source
// bridge resolves it, so the client's read is the field's only read.
const BRIDGED = {
  "packages/server/tsconfig.json": plantedTsconfig({ lib: LIB }),
  "packages/server/src/index.ts": [
    "export interface View {",
    "  title: string;",
    "  shownNowhere: string;",
    "}",
    'export const view = (): View => ({ title: "t", shownNowhere: "s" });',
  ].join("\n"),
  "packages/client/tsconfig.json": plantedTsconfig({ lib: LIB }),
  "packages/client/src/page.ts": 'import type { View } from "@orb/server";\nexport const heading = (shown: View): string => shown.title;',
};

test("a wire field the client reads through @orb/server counts as read", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(BRIDGED);
  const report = scanFields({
    root,
    worlds: ["packages/client/tsconfig.json", "packages/server/tsconfig.json"],
    testWorlds: [],
    deliberate: [],
    log: () => undefined,
  });
  expect(report.unwired.map(({ home, member, kind }) => ({ field: `${home}.${member}`, kind }))).toEqual([{ field: "View.shownNowhere", kind: "never-read" }]);
  expect(report.disagreements).toEqual([]);
});
