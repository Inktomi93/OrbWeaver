import { expect, test } from "@orb/testkit/tooling";
import { worldOf } from "@orb/tooling/mutation-run";

const HOMES = new Map([
  ["packages/kit/tsconfig.json", new Set(["packages/kit/src/a.ts", "packages/kit/src/b.ts"])],
  ["packages/server/tsconfig.json", new Set(["packages/server/src/c.ts"])],
]);

test("files of one world run against that world's config", () => {
  expect(worldOf(["packages/kit/src/a.ts", "packages/kit/src/b.ts"], HOMES)).toBe("packages/kit/tsconfig.json");
});

test("files of two worlds refuse, naming both", () => {
  expect(() => worldOf(["packages/kit/src/a.ts", "packages/server/src/c.ts"], HOMES)).toThrow(
    "one compiler world per run: these files span packages/kit/tsconfig.json and packages/server/tsconfig.json",
  );
});

test("a file no world holds refuses by name", () => {
  expect(() => worldOf(["packages/kit/src/ghost.ts"], HOMES)).toThrow("packages/kit/src/ghost.ts");
});
