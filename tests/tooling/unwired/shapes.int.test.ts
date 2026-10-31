// `pnpm unwired shapes` reports a shape restated in a second file, a synonym alias, a re-export of a re-export and a
// renamed re-export. Different members, a derived Pick and same names with different types are controls.
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
    "export interface Labeled {",
    "  id: string;",
    "  name: number;",
    "}",
  ].join("\n"),
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
