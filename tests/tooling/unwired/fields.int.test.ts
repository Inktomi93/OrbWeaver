// `pnpm unwired fields` reports dead data from the graph's member rows: a field production writes and never reads, an
// optional field it reads and never writes, and one it never names. Each read and write form the query must see has a
// wired control beside it.
import { expect, plantedTsconfig, test } from "@orb/testkit/tooling";
import { fieldRows, fieldsScan, GRAPH_SOURCE, JUDGED_WORK, judgedExpected, judgedOutcome, LIB, plantedKnip, plantJudged, ZOD_MODULE } from "./_planted.ts";

const ROW = `${GRAPH_SOURCE}/row.ts`;
// A solution that adds the tree's tests to the merged program, and a knip config that keeps them out of the product.
const WITH_TESTS = {
  "tsconfig.json": JSON.stringify({ files: [], references: [{ path: "packages/a" }, { path: "tsconfig.outside.json" }] }),
  "tsconfig.outside.json": plantedTsconfig({ lib: LIB, include: ["tests"] }),
  "knip.ts": plantedKnip({
    workspaces: {
      "packages/a": { entry: ["src/**/*.ts!"], project: ["src/**/*.ts!"], ignoreIssues: { "src/**/*.ts": ["exports"] } },
      ".": { project: ["tests/**/*.ts"] },
    },
  }),
};

const TREE = {
  ...ZOD_MODULE,
  [ROW]: [
    'import { z } from "zod";',
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
    'export const themed = (settings: z.infer<typeof Settings>): string => settings.theme + (settings.extra ?? "");',
    "export interface Shown {",
    "  title: string;",
    "  note: string;",
    "}",
    "export const ShownSchema = z.object({ title: z.string(), note: z.string() }) satisfies z.ZodType<Shown>;",
    'export const made: Shown = { title: "t", note: "n" };',
    "export const titled = (shown: z.infer<typeof ShownSchema>): string => shown.title;",
    'export const themeOnly = (theme: string): Pick<z.infer<typeof Settings>, "theme"> => ({ theme });',
  ].join("\n"),
  // Reads no name shows, and homes whose value comes from outside the tree: each is a control beside a found case.
  [`${GRAPH_SOURCE}/outside.ts`]: [
    'import { z } from "zod";',
    "export interface HostView {",
    "  readonly clip?: string;",
    "  readonly gone?: string;",
    "}",
    "const host = globalThis as unknown as HostView;",
    'export const clip = host.clip ?? "";',
    "export const Env = z.object({ port: z.string().optional() });",
    'export const port = (env: z.infer<typeof Env>): string => env.port ?? "8080";',
    "export interface Copied {",
    "  readonly a: string;",
    "  readonly b: string;",
    "}",
    'const copied: Copied = { a: "a", b: "b" };',
    "const copy = { ...copied };",
    "export const shownCopy = copy.a;",
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
    "]) satisfies z.ZodType<Health>;",
    'export const health = (shown: Health): string => (shown.status === "down" ? shown.reason : shown.at);',
    "export type Tree = { kind: string; leaf?: string };",
    "export const TreeSchema: z.ZodType<Tree> = z.lazy(() => z.object({ kind: z.string(), leaf: z.string().optional() }));",
    "export const treeKind = (tree: Tree): string => tree.kind;",
  ].join("\n"),
  // Each level redeclares `title`; production reads only the leaf's. The base and middle declarations are read through
  // the leaf, while the unrelated `Stranger.title` beside them is not.
  [`${GRAPH_SOURCE}/inherit.ts`]: [
    "export interface BaseCfg { readonly title: string; readonly spare: string }",
    "export interface MidCfg extends BaseCfg { readonly title: string }",
    "export interface LeafCfg extends MidCfg { readonly title: string }",
    "export interface Stranger { readonly title: string }",
    'export const leaf: LeafCfg = { title: "t", spare: "s" };',
    "export const shownLeaf = leaf.title;",
  ].join("\n"),
  "tests/row.test.ts": 'import { makeRow } from "../packages/a/src/row.ts";\nexport const probed = makeRow().dead;',
  ...WITH_TESTS,
};

test("the fields query reports never-read, never-written and unreferenced fields, schema keys included", { timeout: 120_000 }, async ({ plantedTree }) => {
  const report = await fieldsScan(plantedTree, TREE);
  const found = report.unwired.map(({ home, member, kind, origin, tests }) => ({ field: `${home}.${member}`, kind, origin, tests }));
  expect(found.toSorted((a, b) => a.field.localeCompare(b.field))).toEqual([
    { field: "BaseCfg.spare", kind: "never-read", origin: "type", tests: 0 },
    { field: "Copied.b", kind: "never-read", origin: "type", tests: 0 },
    { field: "Health.detail", kind: "unreferenced", origin: "type", tests: 0 },
    { field: "HostView.gone", kind: "unreferenced", origin: "type", tests: 0 },
    { field: "Keyed.unkeyed", kind: "never-read", origin: "type", tests: 0 },
    { field: "Row.always", kind: "never-written", origin: "type", tests: 0 },
    { field: "Row.dead", kind: "never-read", origin: "type", tests: 1 },
    { field: "Row.ghost", kind: "unreferenced", origin: "type", tests: 0 },
    { field: "Settings.extra", kind: "never-written", origin: "schema", tests: 0 },
    { field: "Shown.note", kind: "never-read", origin: "type", tests: 0 },
    { field: "Stranger.title", kind: "unreferenced", origin: "type", tests: 0 },
    { field: "Tree.leaf", kind: "unreferenced", origin: "type", tests: 0 },
  ]);
  // A schema checked against a type, by `satisfies` or by its binding's annotation through `z.lazy`, keys nothing of its
  // own: each key is its type's member, judged there.
  expect(fieldRows(report.validated, "outside.ts")).toEqual([]);
});

test("a field the deliberate list names leaves the unwired list with its reason", { timeout: 120_000 }, async ({ plantedTree }) => {
  const reason = "read by an external consumer";
  const report = await fieldsScan(plantedTree, TREE, {}, { deliberate: [{ file: ROW, home: "Row", member: "dead", reason }], judged: [] });
  expect(report.deliberate.map(({ member, reason: why }) => ({ member, why }))).toEqual([{ member: "dead", why: reason }]);
  expect(report.unwired.map(({ member }) => member)).not.toContain("dead");
});

// A spread of an input whose type a parse builds hands its keys to the verb it calls; the verb's own optional member
// stays read-only only where nothing writes it.
const SPREAD = {
  ...ZOD_MODULE,
  [`${GRAPH_SOURCE}/audit.ts`]: [
    'import { z } from "zod";',
    "export const Input = z.object({ chatId: z.string(), title: z.string().optional() });",
    "export interface Params { readonly owner: string; readonly chatId: string; readonly title?: string | undefined }",
    'export const verb = (params: Params): string => params.owner + params.chatId + (params.title ?? "");',
    'export const route = (input: z.infer<typeof Input>): string => verb({ owner: "o", ...input });',
    'export const called = route({ chatId: "c" });',
    "export interface Card { readonly starred: boolean }",
    "export interface Detail extends Card { readonly starred: boolean }",
    "export const detail: Detail = { starred: true };",
    "export const card: Card = { starred: false };",
    "export const isStarred = card.starred;",
  ].join("\n"),
};

test("a spread hands a parsed input's keys on, and a read through a base type reads the member a subtype redeclares", { timeout: 120_000 }, async ({
  plantedTree,
}) => {
  const report = await fieldsScan(plantedTree, SPREAD);
  expect(fieldRows(report.unwired, "audit.ts")).toEqual(["Input.title never-written"]);
});

// `HostEnv` is parsed from outside the tree. A resolver spreads it and overrides `base`: that write reaches the home
// only through the spread link, so `host` is no default the tree chose. `Written.extra` beside it is the found case.
const LINK_WRITTEN = {
  ...ZOD_MODULE,
  [`${GRAPH_SOURCE}/env.ts`]: [
    'import { z } from "zod";',
    "export const HostEnv = z.object({ host: z.string().optional(), base: z.string().optional() });",
    "export interface Resolved { readonly host: string | undefined; readonly base: string }",
    'export const resolve = (val: z.infer<typeof HostEnv>): Resolved => ({ ...val, base: "x" });',
    'export const shown = (env: Resolved): string => (env.host ?? "") + env.base;',
    "export const Written = z.object({ name: z.string(), extra: z.string().optional() });",
    'export const written: z.infer<typeof Written> = { name: "n" };',
    'export const named = (row: z.infer<typeof Written>): string => row.name + (row.extra ?? "");',
  ].join("\n"),
};

test("a write that reaches a home only through a link does not mark the home written", { timeout: 120_000 }, async ({ plantedTree }) => {
  const report = await fieldsScan(plantedTree, LINK_WRITTEN);
  expect(fieldRows(report.unwired, "env.ts")).toEqual(["Written.extra never-written"]);
});

// Two options of a union name one key: each is its own field, judged on its own sites. `Lone.tag` is the control: one
// declaration keeps the bare key.
const OPTIONS = {
  ...ZOD_MODULE,
  [`${GRAPH_SOURCE}/options.ts`]: [
    'import { z } from "zod";',
    "export const Actor = z.discriminatedUnion('kind', [",
    "  z.object({ kind: z.string(), tag: z.string() }),",
    "  z.object({ kind: z.string(), tag: z.string(), name: z.string() }),",
    "]);",
    "export const Lone = z.object({ tag: z.string() });",
  ].join("\n"),
};

test("each union option's key is its own field", { timeout: 120_000 }, async ({ plantedTree }) => {
  const report = await fieldsScan(plantedTree, OPTIONS);
  const file = `${GRAPH_SOURCE}/options.ts:`;
  const keys = report.validated.flatMap(({ key }) => (key.startsWith(file) ? [key.slice(file.length)] : []));
  expect(keys.toSorted()).toEqual(["Actor.kind", "Actor.kind#2", "Actor.name", "Actor.tag", "Actor.tag#2", "Lone.tag"]);
});

// The client imports the server's view through `@orb/server`: the merged program resolves the bridge, so the client's
// read is the field's only read.
const BRIDGED = {
  "tsconfig.json": JSON.stringify({ files: [], references: [{ path: "packages/server" }, { path: "packages/client" }] }),
  "packages/server/tsconfig.json": plantedTsconfig({ lib: LIB }),
  "packages/server/package.json": JSON.stringify({ name: "@orb/server", exports: { ".": "./src/index.ts" } }),
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
  const report = await fieldsScan(plantedTree, BRIDGED);
  expect(report.unwired.map(({ home, member, kind }) => ({ field: `${home}.${member}`, kind }))).toEqual([{ field: "View.shownNowhere", kind: "never-read" }]);
});

// A row whose fix an open item owns reports apart, with its item; an entry whose item is done or whose row no longer
// reports is stale, and the done item's row reports as unwired again.
test("a judged row reports apart with its open item, and an entry for a done item or a gone row is stale", { timeout: 120_000 }, async ({ plantedTree }) => {
  const tree = { ...TREE, ...JUDGED_WORK };
  const judged = plantJudged(await fieldsScan(plantedTree, tree), "Row.ghost", "Row.dead");
  expect(judgedOutcome(await fieldsScan(plantedTree, tree, {}, { deliberate: [], judged }), "Row.ghost", "Row.dead")).toEqual(
    judgedExpected("Row.ghost", "Row.dead"),
  );
});

// The props shape of a primitive: its props type redeclares a member its library base declares and reads it, and no
// caller sets it, while the library's own calls and a sibling props type write the same name. Those writes build the
// base's or the sibling's value, so the member stays never-written.
const REDECLARED = {
  [`${GRAPH_SOURCE}/host.d.ts`]: [
    "interface HostAttributes { readonly className?: string; readonly id?: string }",
    "declare function host(attributes: HostAttributes): string;",
  ].join("\n"),
  [`${GRAPH_SOURCE}/box.ts`]: [
    'interface BoxPropsBase extends Omit<HostAttributes, "id"> { readonly label: string; readonly className?: string }',
    "export type BoxProps = BoxPropsBase & { readonly size?: number };",
    'export const box = ({ label, className, size }: BoxProps): string => host({ className: label + (className ?? "box") + String(size ?? 0) });',
    'export const plain = host({ className: "plain" });',
    'export const shown = box({ label: "l", size: 1 });',
    "interface Base { readonly tone?: string }",
    "interface QuietBase extends Base { readonly label: string; readonly tone?: string }",
    "interface LoudBase extends Base { readonly tone?: string }",
    "export type Quiet = QuietBase & { readonly size?: number };",
    "export type Loud = LoudBase & { readonly size?: number };",
    'export const quiet = ({ label, tone, size }: Quiet): string => label + (tone ?? "plain") + String(size ?? 0);',
    'export const loud = ({ tone, size }: Loud): string => (tone ?? "loud") + String(size ?? 0);',
    'export const shownQuiet = quiet({ label: "q", size: 1 });',
    'export const shownLoud = loud({ tone: "high", size: 2 });',
    'export const base: Base = { tone: "low" };',
  ].join("\n"),
};

test("a write through a base or sibling member never writes the member that redeclares it", { timeout: 120_000 }, async ({ plantedTree }) => {
  const report = await fieldsScan(plantedTree, REDECLARED);
  expect(fieldRows(report.unwired, "box.ts")).toEqual(["BoxPropsBase.className never-written", "QuietBase.tone never-written"]);
});
