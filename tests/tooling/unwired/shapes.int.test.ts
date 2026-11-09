// `pnpm unwired shapes` reports a shape restated in a second file, a synonym alias, a re-export of a re-export and a
// renamed re-export. Different members, a derived Pick, a type indexed out of another, a result computed from another
// type's member, same names with different types and props that match only by their library base are controls.
import { expect, plantedTsconfig, test } from "@orb/testkit/tooling";
import { scanShapes } from "../../../tooling/src/unwired/index.ts";
import { LIB, WORLD } from "./_planted.ts";

const TREE = {
  [WORLD]: plantedTsconfig({ lib: LIB }),
  "packages/a/src/user.ts": ["export interface User {", "  id: string;", "  name: string;", "}", "export type Alias = User;"].join("\n"),
  "packages/a/src/person.ts": [
    "export interface Person {",
    "  id: string;",
    "  name: string;",
    "}",
    "export interface Account {",
    "  id: string;",
    "  name: string;",
    "  email: string;",
    "}",
    'export type Picked = Pick<Account, "id" | "name">;',
    "export interface Box {",
    "  item: { id: string; name: string };",
    "}",
    'export type Item = Box["item"];',
    "export interface Labeled {",
    "  id: string;",
    "  name: number;",
    "}",
  ].join("\n"),
  // Two library components with the same props, each wrapped with one prop of its own: a match by the library's shape.
  "packages/a/src/library.d.ts": ["interface DialogTitleBase { id: string; label: string }", "interface PopoverTitleBase { id: string; label: string }"].join(
    "\n",
  ),
  "packages/a/src/dialog.ts": "export interface DialogTitleProps extends DialogTitleBase {\n  className?: string;\n}",
  "packages/a/src/popover.ts": "export interface PopoverTitleProps extends PopoverTitleBase {\n  className?: string;\n}",
  // A result type computed through another named type's member is derived from that type, not a second home.
  "packages/a/src/service.ts": "export interface Service {\n  bounds(): Promise<{ id: string; name: string }>;\n}",
  "packages/a/src/bounds.ts": 'import type { Service } from "./service.ts";\nexport type Bounds = Awaited<ReturnType<Service["bounds"]>>;',
  "packages/a/src/index.ts": 'export { User } from "./user.ts";',
  "packages/a/src/door.ts": 'export { User } from "./index.ts";\nexport { User as Member } from "./user.ts";',
};

test("the shapes scan reports restated shapes, synonyms, re-export chains and renamed re-exports", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(TREE);
  const report = scanShapes({ root, worlds: [WORLD], testWorlds: [], deliberate: [], log: () => undefined });
  const found = report.unwired.map(({ kind, file, home, member, at }) => ({ kind, file, home, member, at }));
  expect(found.toSorted((a, b) => `${a.kind}${a.file}`.localeCompare(`${b.kind}${b.file}`))).toEqual([
    { kind: "reexport-chain", file: "packages/a/src/door.ts", home: "User", member: "User", at: ["packages/a/src/door.ts", "packages/a/src/index.ts"] },
    { kind: "renamed-reexport", file: "packages/a/src/door.ts", home: "Member", member: "User", at: ["packages/a/src/door.ts"] },
    { kind: "restated", file: "packages/a/src/user.ts", home: "User", member: "Person", at: ["packages/a/src/person.ts:1"] },
    { kind: "synonym", file: "packages/a/src/user.ts", home: "Alias", member: "User", at: ["packages/a/src/user.ts"] },
  ]);
  expect(report.disagreements).toEqual([]);
});
