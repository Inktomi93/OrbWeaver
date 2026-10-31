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
    { at: "relay(options.color)", kind: "unsupplied-prop", literal: null, calls: 1 },
    { at: "relay(options.size)", kind: "unsupplied-prop", literal: null, calls: 1 },
    { at: "tag(kind)", kind: "same-literal", literal: '"x"', calls: 2 },
  ]);
  expect(report.disagreements).toEqual([]);
});
