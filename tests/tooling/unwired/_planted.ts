// What the unwired scan suites plant beside the testkit's `plantedTsconfig`: the libs a node-only tree builds with,
// the one package world a single-world tree holds, and a JSX namespace, since a planted tree has no node_modules.

import type { JudgedEntry } from "../../../tooling/src/unwired/index.ts";

/** The libs of a planted tree with no DOM. */
export const LIB = ["ESNext"];

/** The one package world every single-world tree plants. */
export const WORLD = "packages/a/tsconfig.json";

/** A minimal JSX namespace, so a planted `.tsx` file type-checks its elements' props. */
export const JSX_NAMESPACE = [
  "declare namespace JSX {",
  "  interface Element {}",
  "  interface IntrinsicElements { [name: string]: Record<string, unknown> }",
  "  interface ElementChildrenAttribute { children: {} }",
  "}",
].join("\n");

/** A minimal `z`: its object schemas keep their keys and infer a value type the way zod does. */
export const ZOD_STUB = [
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
].join("\n");

/** A judged case's items: one open, one done. A landed item has no file, and the procedures suite plants that case. */
export const OPEN_ITEM = 4101;
export const DONE_ITEM = 4102;
const workItem = (status: string): string => `---\nkind: work\nstatus: ${status}\nupdated: 2026-01-01\n---\n\n# A planted item\n`;
/** The docs/work files a judged case plants beside its tree. */
export const JUDGED_WORK: Readonly<Record<string, string>> = {
  [`docs/work/${String(OPEN_ITEM)}-a-planted-open-item.md`]: workItem("open"),
  [`docs/work/${String(DONE_ITEM)}-a-planted-done-item.md`]: workItem("done"),
};
const GONE_KEY = "planted:Gone.row";

interface ReportedRow {
  readonly key: string;
  readonly home: string;
  readonly member: string;
}
interface JudgedReport {
  readonly unwired: readonly ReportedRow[];
  readonly judged: readonly (ReportedRow & { readonly item: number })[];
  readonly staleJudged: readonly { readonly key: string; readonly stale: string }[];
}

/** A judged case's rows by `home.member`. */
interface JudgedOutcome {
  readonly judged: readonly string[];
  readonly unwired: readonly string[];
  readonly stale: readonly string[];
}

const named = (row: ReportedRow): string => `${row.home}.${row.member}`;

/** The judged list a case plants, from a first report's rows: `open` to the open item, `closed` to the done item, and
 *  a key no row has. */
export function plantJudged(report: { readonly unwired: readonly ReportedRow[] }, open: string, closed: string): readonly JudgedEntry[] {
  const keyOf = (name: string): string => report.unwired.find((row) => named(row) === name)?.key ?? `missing ${name}`;
  return [
    { key: keyOf(open), item: OPEN_ITEM, tie: "member" },
    { key: keyOf(closed), item: DONE_ITEM, tie: "home" },
    { key: GONE_KEY, item: OPEN_ITEM, tie: "member" },
  ];
}

/** Where a judged case's rows landed, by `home.member`: the judged rows with their items, which of `open` and `closed`
 *  still report as unwired, and the stale entries. */
export function judgedOutcome(report: JudgedReport, open: string, closed: string): JudgedOutcome {
  const names = new Map(report.judged.map((row) => [row.key, named(row)]));
  for (const row of report.unwired) {
    names.set(row.key, named(row));
  }
  return {
    judged: report.judged.map((row) => `${named(row)} ${String(row.item)}`),
    unwired: [open, closed].filter((name) => report.unwired.some((row) => named(row) === name)),
    stale: report.staleJudged.map(({ key, stale }) => `${stale} ${names.get(key) ?? key}`),
  };
}

/** What every judged case expects of {@link judgedOutcome}. */
export const judgedExpected = (open: string, closed: string): JudgedOutcome => ({
  judged: [`${open} ${String(OPEN_ITEM)}`],
  unwired: [closed],
  stale: [`item-closed ${closed}`, `row-gone ${GONE_KEY}`],
});
